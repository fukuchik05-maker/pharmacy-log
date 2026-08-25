var assert = require("assert");
var h = require("./helper.js");
var test = h.test;
var Month = require("../src/model/month.js");

test("daysOf returns every day of the month", function () {
  var days = Month.daysOf(2026, 8);
  assert.strictEqual(days.length, 31);
  assert.strictEqual(days[0].date, "2026-08-01");
  assert.strictEqual(days[30].date, "2026-08-31");
  var feb = Month.daysOf(2026, 2);
  assert.strictEqual(feb.length, 28);
});

test("daysOf marks weekends", function () {
  // 2026-08-01 は土曜日
  var days = Month.daysOf(2026, 8);
  assert.strictEqual(days[0].dow, 6);
  assert.strictEqual(days[0].dowLabel, "土");
  assert.strictEqual(days[0].isWeekend, true);
  assert.strictEqual(days[1].dowLabel, "日");
  assert.strictEqual(days[1].isWeekend, true);
  assert.strictEqual(days[2].dowLabel, "月");
  assert.strictEqual(days[2].isWeekend, false);
});

test("daysOf marks public holidays", function () {
  var days = Month.daysOf(2026, 8);
  var aug11 = days.filter(function (d) { return d.date === "2026-08-11"; })[0];
  assert.strictEqual(aug11.holiday, "山の日");
  var aug12 = days.filter(function (d) { return d.date === "2026-08-12"; })[0];
  assert.strictEqual(aug12.holiday, null);
});

test("shift moves across year boundaries", function () {
  assert.deepStrictEqual(Month.shift({ y: 2026, m: 8 }, 1), { y: 2026, m: 9 });
  assert.deepStrictEqual(Month.shift({ y: 2026, m: 12 }, 1), { y: 2027, m: 1 });
  assert.deepStrictEqual(Month.shift({ y: 2026, m: 1 }, -1), { y: 2025, m: 12 });
});

test("label and key format the month", function () {
  assert.strictEqual(Month.label({ y: 2026, m: 8 }), "2026年8月");
  assert.deepStrictEqual(Month.key({ y: 2026, m: 8 }), { from: "2026-08-01", to: "2026-08-31" });
  assert.deepStrictEqual(Month.key({ y: 2026, m: 2 }), { from: "2026-02-01", to: "2026-02-28" });
});

test("missingDays reports weekdays without a record", function () {
  var days = Month.daysOf(2026, 8);
  var logs = {};
  days.forEach(function (d) {
    // 平日はすべて記録済み、ただし 8/7 だけ欠けている状態を作る
    if (!d.isWeekend && !d.holiday && d.date !== "2026-08-07") logs[d.date] = true;
  });
  assert.deepStrictEqual(Month.missingDays(days, logs), ["2026-08-07"]);
});

test("missingDays ignores weekends and holidays", function () {
  var days = Month.daysOf(2026, 8);
  // 記録が1件も無い場合でも、土日と山の日は欠損として挙げない
  var missing = Month.missingDays(days, {});
  assert.strictEqual(missing.indexOf("2026-08-01"), -1); // 土
  assert.strictEqual(missing.indexOf("2026-08-02"), -1); // 日
  assert.strictEqual(missing.indexOf("2026-08-11"), -1); // 山の日
  assert.ok(missing.indexOf("2026-08-07") >= 0);         // 平日
});

test("missingDays with until never reports days after the cutoff", function () {
  var days = Month.daysOf(2026, 8);
  // 記録が1件も無い場合でも、until より後の平日は欠損として挙げない
  var missing = Month.missingDays(days, {}, "2026-08-10");
  assert.strictEqual(missing.indexOf("2026-08-11"), -1); // until より後（山の日でもある）
  assert.strictEqual(missing.indexOf("2026-08-12"), -1); // until より後の平日
  assert.strictEqual(missing.indexOf("2026-08-31"), -1); // 月末、until より後
  assert.ok(missing.indexOf("2026-08-10") >= 0);         // until 当日の平日は対象
  assert.ok(missing.indexOf("2026-08-07") >= 0);         // until より前の平日も対象
});

test("missingDays without until behaves as before (backward compatible)", function () {
  var days = Month.daysOf(2026, 8);
  var logs = {};
  days.forEach(function (d) {
    if (!d.isWeekend && !d.holiday && d.date !== "2026-08-07") logs[d.date] = true;
  });
  assert.deepStrictEqual(Month.missingDays(days, logs), ["2026-08-07"]);
});

h.summary();
