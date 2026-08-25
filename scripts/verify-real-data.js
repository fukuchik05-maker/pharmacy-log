"use strict";

var fs = require("fs");
var path = require("path");
var AccumCsv = require("../src/parse/accum-csv.js");
var HospitalCsv = require("../src/parse/hospital-csv.js");
var DailyLog = require("../src/model/daily-log.js");

var DATA_DIR = process.argv[2];

if (!DATA_DIR) {
  console.error("使い方: node scripts/verify-real-data.js <業務日誌フォルダのパス>");
  process.exit(2);
}

var failures = 0;

function check(label, condition, detail) {
  if (condition) {
    console.log("OK: " + label);
  } else {
    failures++;
    console.error("FAIL: " + label + (detail ? " -- " + detail : ""));
  }
}

// --- 蓄積CSV ---
var accumFile = fs.readdirSync(DATA_DIR)
  .filter(function (name) { return /^pharmacy_accum_.*\.csv$/.test(name); })
  .sort()
  .pop();

if (!accumFile) {
  console.error("蓄積CSVが見つかりません: " + DATA_DIR);
  process.exit(2);
}

var accumText = fs.readFileSync(path.join(DATA_DIR, accumFile), "utf8");
var accum = AccumCsv.parse(accumText);

console.log("--- 蓄積CSV: " + accumFile + " ---");
check("1件以上のレコードを読み取れた", accum.logs.length > 0, accum.logs.length + "件");
console.log("    読み取り件数: " + accum.logs.length + " (" +
  accum.logs[0].date + " 〜 " + accum.logs[accum.logs.length - 1].date + ")");

check("日付が昇順である", accum.logs.every(function (log, i) {
  return i === 0 || accum.logs[i - 1].date <= log.date;
}));

check("マスタ4種をすべて読み取れた",
  accum.masters.members.length > 0 &&
  accum.masters.doctors.length > 0 &&
  accum.masters.premixes.length > 0 &&
  Object.keys(accum.masters.checklist).length > 0);

var invalid = [];
accum.logs.forEach(function (log) {
  var errors = DailyLog.validate(log);
  if (errors.length) invalid.push({ date: log.date, errors: errors });
});
check("全レコードが検証を通過する", invalid.length === 0,
  invalid.slice(0, 3).map(function (item) {
    return item.date + ": " + item.errors[0].field + " " + item.errors[0].message;
  }).join(" / "));

// wardMeds が wardRx から復元できることを、元CSVの値と突き合わせて確認する
var rawRows = accumText.replace(/^﻿/, "").split(/\r?\n/)
  .filter(function (line) { return line.trim() !== "" && line.charAt(0) !== "#"; });
var rawHeader = AccumCsv.splitCsvLine(rawRows[0]);
var wardMedsIndex = rawHeader.indexOf("wardMeds");
var dateIndex = rawHeader.indexOf("date");
var byDate = {};
accum.logs.forEach(function (log) { byDate[log.date] = log; });

var compared = 0;
var mismatched = [];
for (var i = 1; i < rawRows.length; i++) {
  var cells = AccumCsv.splitCsvLine(rawRows[i]);
  var date = cells[dateIndex];
  var log = byDate[date];
  if (!log) continue;
  var original;
  try { original = JSON.parse(cells[wardMedsIndex]); } catch (e) { continue; }
  var derived = DailyLog.wardMedsFrom(log.wardRx);
  var derivedByWard = {};
  derived.forEach(function (row) { derivedByWard[row.ward] = row; });
  original.forEach(function (row) {
    var mine = derivedByWard[row.ward];
    compared++;
    if (!mine || mine.cnt !== row.cnt || mine.dose !== row.dose ||
        mine.ipCnt !== row.ipCnt || mine.ipDose !== row.ipDose) {
      mismatched.push(date + "/" + row.ward);
    }
  });
}
check("wardMeds を wardRx から完全に復元できる (" + compared + "件比較)",
  mismatched.length === 0, mismatched.slice(0, 5).join(", "));

// --- 病院システムCSV ---
var dailyFiles = fs.readdirSync(DATA_DIR).filter(function (name) {
  return /^\d{4}\.csv$/.test(name);
});

console.log("--- 病院システムCSV ---");
if (dailyFiles.length === 0) {
  console.log("SKIP: MMDD.csv 形式のファイルが見つかりません");
} else {
  dailyFiles.forEach(function (name) {
    var result = HospitalCsv.parse(fs.readFileSync(path.join(DATA_DIR, name)));
    check(name + " をエラーなく読み取れる", result.errors.length === 0,
      JSON.stringify(result.errors.slice(0, 2)));
    check(name + " の病棟数が5である", result.wardRx.length === 5);
    var totalRow = result.wardRx.reduce(function (sum, row) {
      return sum + row.total.cnt;
    }, 0);
    check(name + " の合計枚数が正の値である", totalRow > 0, "合計 " + totalRow);
  });
}

console.log("");
if (failures > 0) {
  console.error("検証失敗: " + failures + " 件");
  process.exit(1);
}
console.log("すべての検証を通過しました");
