var assert = require("assert");
var fs = require("fs");
var path = require("path");
var h = require("./helper.js");
var test = h.test;
var AccumCsv = require("../src/parse/accum-csv.js");

function fixtureText() {
  return fs.readFileSync(path.join(__dirname, "fixtures", "accum-sample.csv"), "utf8");
}

test("reads every data row and skips comment lines", function () {
  var result = AccumCsv.parse(fixtureText());
  assert.strictEqual(result.logs.length, 2);
  assert.strictEqual(result.logs[0].date, "2026-04-01");
  assert.strictEqual(result.logs[1].date, "2026-04-02");
});

test("converts numeric columns to numbers", function () {
  var log = AccumCsv.parse(fixtureText()).logs[0];
  assert.strictEqual(log.rxOpCnt, 1);
  assert.strictEqual(log.rxOpDose, 2);
  assert.strictEqual(log.rxInjCnt, 3);
  assert.strictEqual(log.rxInjDose, 4);
  assert.strictEqual(log.counsel, 5);
});

test("expands JSON columns into objects", function () {
  var log = AccumCsv.parse(fixtureText()).logs[0];
  assert.strictEqual(log.inquiries.length, 1);
  assert.strictEqual(log.inquiries[0].type, "用量");
  assert.strictEqual(log.inquiries[0].changed, true);
  assert.strictEqual(log.doctorChanges[0].cnt, 2);
  assert.strictEqual(log.packerData.tab["分包紙"], 1);
  assert.strictEqual(log.packerData.tab["清掃"], true);
});

test("normalises wardRx to all five wards", function () {
  var log = AccumCsv.parse(fixtureText()).logs[0];
  assert.strictEqual(log.wardRx.length, 5);
  assert.deepStrictEqual(log.wardRx[0].teiki, { cnt: 1, dose: 2 });
  assert.deepStrictEqual(log.wardRx[3].teiki, { cnt: 0, dose: 0 });
});

test("drops the derived wardMeds column", function () {
  var log = AccumCsv.parse(fixtureText()).logs[0];
  assert.strictEqual(log.wardMeds, undefined);
});

test("reads the master lists from the trailing comment lines", function () {
  var masters = AccumCsv.parse(fixtureText()).masters;
  assert.deepStrictEqual(masters.members, ["検査 太郎", "検査 花子"]);
  assert.deepStrictEqual(masters.premixes, ["テスト薬A", "テスト薬B"]);
  assert.deepStrictEqual(masters.doctors, ["検査 医師"]);
  assert.deepStrictEqual(masters.checklist["検査 太郎"], ["項目A", "項目B"]);
});

test("tolerates an empty packerData object", function () {
  var log = AccumCsv.parse(fixtureText()).logs[1];
  assert.strictEqual(log.packerData.tab["分包紙"], 0);
  assert.strictEqual(log.packerData.san["清掃"], false);
});

h.summary();
