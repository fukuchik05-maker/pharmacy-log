var assert = require("assert");
var h = require("./helper.js");
var test = h.test;
var DeptReport = require("../src/model/dept-report.js");

// 2025年度(2025-04〜2026-03): 4月に2日分、5月に1日分の合成データで検証する。
var day1 = {
  date: "2025-04-10",
  rxOpCnt: 5, rxOpDose: 8, rxInjCnt: 1, rxInjDose: 2, counsel: 3,
  winjData: [{ ward: "かりゆし", cnt: 2, dose: 4 }],
  wardRx: [{
    name: "かりゆし",
    teiki: { cnt: 10, dose: 20 }, rinji: { cnt: 2, dose: 3 }, taiin: { cnt: 1, dose: 1 },
    meds: { cnt: 0, dose: 0 }, ippoka: { cnt: 0, dose: 0 }, total: { cnt: 13, dose: 24 }
  }]
};

var day2 = {
  date: "2025-04-15",
  rxOpCnt: 3, rxOpDose: 4, rxInjCnt: 0, rxInjDose: 0, counsel: 1,
  winjData: [{ ward: "かりゆし", cnt: 1, dose: 1 }],
  wardRx: [{
    name: "かりゆし",
    teiki: { cnt: 5, dose: 9 }, rinji: { cnt: 0, dose: 0 }, taiin: { cnt: 0, dose: 0 },
    meds: { cnt: 2, dose: 8 }, ippoka: { cnt: 1, dose: 4 }, total: { cnt: 5, dose: 9 }
  }]
};

var day3 = {
  date: "2025-05-01",
  rxOpCnt: 2, rxOpDose: 2, rxInjCnt: 1, rxInjDose: 1, counsel: 0
};

var report = DeptReport.compute([day1, day2, day3], 2025);

function monthRow(m) {
  return report.months.filter(function (r) { return r.month === m; })[0];
}
function monthAvgRow(m) {
  return report.monthAverages.filter(function (r) { return r.month === m; })[0];
}

test("buckets entries into their fiscal-year month, in April-to-March order", function () {
  assert.strictEqual(report.months.length, 12);
  assert.deepStrictEqual(report.months.map(function (r) { return r.month; }),
    [4, 5, 6, 7, 8, 9, 10, 11, 12, 1, 2, 3]);
  assert.strictEqual(monthRow(4).days, 2);
  assert.strictEqual(monthRow(5).days, 1);
  assert.strictEqual(monthRow(6).days, 0);
});

test("sums wardRx counts and doses for a month with entries", function () {
  var april = monthRow(4);
  assert.strictEqual(april.teikiCnt, 15);
  assert.strictEqual(april.teikiDose, 29);
  assert.strictEqual(april.rinjiCnt, 2);
  assert.strictEqual(april.rinjiDose, 3);
  assert.strictEqual(april.taiinCnt, 1);
  assert.strictEqual(april.taiinDose, 1);
  assert.strictEqual(april.totalCnt, 18);
  assert.strictEqual(april.totalDose, 33);
});

test("sums outpatient, ward-injection and counseling totals for a month", function () {
  var april = monthRow(4);
  assert.strictEqual(april.winjCnt, 3);
  assert.strictEqual(april.winjDose, 5);
  assert.strictEqual(april.opCnt, 8);
  assert.strictEqual(april.opDose, 12);
  assert.strictEqual(april.injCnt, 1);
  assert.strictEqual(april.injDose, 2);
  assert.strictEqual(april.counsel, 4);
});

test("limits wardMeds/ippoka totals to the four carried-medication wards", function () {
  var april = monthRow(4);
  assert.strictEqual(april.wardMedsCnt, 2);
  assert.strictEqual(april.ippokaCnt, 1);
});

test("computes fiscal-year totals across all twelve months", function () {
  assert.strictEqual(report.totals.days, 3);
  assert.strictEqual(report.totals.teikiCnt, 15);
  assert.strictEqual(report.totals.opCnt, 10);
  assert.strictEqual(report.totals.injCnt, 2);
  assert.strictEqual(report.totals.wardMedsCnt, 2);
});

test("computes fiscal-year averages using total days across the year", function () {
  assert.strictEqual(report.averages.teikiCnt, 15 / 3);
  assert.strictEqual(report.averages.opCnt, 10 / 3);
  assert.strictEqual(report.averages.injCnt, 2 / 3);
});

test("computes per-month averages using that month's own day count", function () {
  var aprilAvg = monthAvgRow(4);
  assert.strictEqual(aprilAvg.teikiCnt, 15 / 2);
  assert.strictEqual(aprilAvg.opCnt, 8 / 2);
  var mayAvg = monthAvgRow(5);
  assert.strictEqual(mayAvg.teikiCnt, 0);
  assert.strictEqual(mayAvg.opCnt, 2);
});

test("returns null averages for a month with no entries", function () {
  var juneAvg = monthAvgRow(6);
  assert.strictEqual(juneAvg.teikiCnt, null);
  assert.strictEqual(juneAvg.opCnt, null);
});

h.summary();
