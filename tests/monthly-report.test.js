var assert = require("assert");
var h = require("./helper.js");
var test = h.test;
var MonthlyReport = require("../src/model/monthly-report.js");

// 2026年8月: 8/1=土, 8/3=月, 8/4=火, 8/10=月。3日分の合成データで検証する。
var day1 = {
  date: "2026-08-03", author: "田中",
  rxOpCnt: 10, rxOpDose: 20, rxInjCnt: 2, rxInjDose: 3, counsel: 1,
  winjData: [{ ward: "かりゆし", cnt: 2, dose: 3 }],
  wardRx: [{
    name: "かりゆし",
    teiki: { cnt: 5, dose: 9 }, rinji: { cnt: 1, dose: 1 }, taiin: { cnt: 0, dose: 0 },
    meds: { cnt: 2, dose: 8 }, ippoka: { cnt: 1, dose: 4 }, total: { cnt: 6, dose: 10 }
  }],
  inquiries: [
    { type: "用法", doctor: "佐藤", memo: "m1", changed: true },
    { type: "用量", doctor: "", memo: "m2", changed: false }
  ],
  doctorChanges: [{ doctor: "佐藤", cnt: 3 }],
  shortages: [{ name: "薬A", qty: 5 }],
  premixes: [{ drug: "予製X", cnt: 2 }],
  packerData: { tab: { "分包紙": 1, "インク": 0, "清掃": true }, san: { "分包紙": 0, "インク": 2, "清掃": false } },
  meetings: [{ type: "感染" }],
  mrVisits: [{ company: "東和", memo: "訪問1" }],
  contacts: [{ from: "医師", memo: "問い合わせ1" }],
  trainings: [{ theme: "研修A", lecturer: "講師1", count: 5 }]
};

var day2 = {
  date: "2026-08-04", author: "田中",
  rxOpCnt: 8, rxOpDose: 15, rxInjCnt: 1, rxInjDose: 1, counsel: 0,
  winjData: [{ ward: "かりゆし", cnt: 1, dose: 1 }],
  wardRx: [{
    name: "かりゆし",
    teiki: { cnt: 3, dose: 5 }, rinji: { cnt: 0, dose: 0 }, taiin: { cnt: 1, dose: 1 },
    meds: { cnt: 0, dose: 0 }, ippoka: { cnt: 0, dose: 0 }, total: { cnt: 4, dose: 6 }
  }],
  inquiries: [{ type: "用法", doctor: "佐藤", memo: "m3", changed: false }],
  premixes: [{ drug: "予製X", cnt: 1 }],
  contacts: [{ from: "病棟", memo: "問い合わせ2" }]
};

var day3 = {
  date: "2026-08-10", author: "鈴木",
  rxOpCnt: 5, rxOpDose: 5, rxInjCnt: 0, rxInjDose: 0, counsel: 2
};

var report = MonthlyReport.compute([day1, day2, day3], { y: 2026, m: 8 });

test("computes rx totals across the month", function () {
  assert.strictEqual(report.dayCount, 3);
  assert.deepStrictEqual(report.rx, {
    opCnt: 23, opDose: 40, injCnt: 3, injDose: 4, winjCnt: 3, winjDose: 4, counsel: 3
  });
});

test("computes wardMeds totals for the four carried-medication wards, excluding うりずん南", function () {
  assert.strictEqual(report.wardMeds.list.length, 4);
  assert.deepStrictEqual(report.wardMeds.list.map(function (w) { return w.ward; }),
    ["かりゆし", "ゆいゆい", "うりずん北", "はいさい"]);
  var kariyushi = report.wardMeds.list[0];
  assert.deepStrictEqual(kariyushi, { ward: "かりゆし", cnt: 2, dose: 8, ipCnt: 1, ipDose: 4 });
  assert.strictEqual(report.wardMeds.totalCnt, 2);
  assert.strictEqual(report.wardMeds.totalIpCnt, 1);
});

test("computes wardRx cnt-only totals per ward and the grand total", function () {
  assert.strictEqual(report.wardRx.list.length, 5);
  var kariyushi = report.wardRx.list.filter(function (w) { return w.ward === "かりゆし"; })[0];
  assert.deepStrictEqual(kariyushi, { ward: "かりゆし", teiki: 8, rinji: 1, taiin: 1, meds: 2, total: 10 });
  assert.deepStrictEqual(report.wardRx.total, { teiki: 8, rinji: 1, taiin: 1, meds: 2, total: 10 });
});

test("computes average teiki and wardRx per day", function () {
  assert.strictEqual(report.avgTeikiPerDay, 8 / 3);
  assert.strictEqual(report.avgWardRxPerDay, 10 / 3);
});

test("computes inquiries totals, by-type, by-doctor and change rate", function () {
  assert.strictEqual(report.inquiries.total, 3);
  assert.strictEqual(report.inquiries.changed, 1);
  assert.strictEqual(report.inquiries.changeRate, 33);
  var byType = {};
  report.inquiries.byType.forEach(function (t) { byType[t.type] = t.count; });
  assert.strictEqual(byType["用法"], 2);
  assert.strictEqual(byType["用量"], 1);
  assert.strictEqual(report.inquiries.byDoctor.length, 1);
  assert.deepStrictEqual(report.inquiries.byDoctor[0], { doctor: "佐藤", count: 2, changed: 1 });
});

test("counts inquiries with no doctor selected separately", function () {
  assert.strictEqual(report.inquiries.unassigned, 1);
  assert.strictEqual(report.inquiries.unassignedChanged, 0);
});

test("computes doctor changes from daily input", function () {
  assert.deepStrictEqual(report.doctorChanges.list, [{ doctor: "佐藤", count: 3 }]);
  assert.strictEqual(report.doctorChanges.total, 3);
});

test("computes shortages by drug", function () {
  assert.deepStrictEqual(report.shortages.list, [{ name: "薬A", qty: 5 }]);
  assert.strictEqual(report.shortages.total, 1);
});

test("computes premixes by drug, sorted by count", function () {
  assert.deepStrictEqual(report.premixes.list, [{ drug: "予製X", cnt: 3 }]);
});

test("builds day-of-week breakdown using local dates", function () {
  // 8/3, 8/10 は月曜(dow=1)、8/4 は火曜(dow=2)
  assert.deepStrictEqual(report.dow[1], { inj: 2, winj: 2, teiki: 5, rinji: 1, taiin: 0, wardTotal: 6, days: 2 });
  assert.deepStrictEqual(report.dow[2], { inj: 1, winj: 1, teiki: 3, rinji: 0, taiin: 1, wardTotal: 4, days: 1 });
  assert.strictEqual(report.dow[0].days, 0);
});

test("groups entries into weeks, leaving empty weeks as null", function () {
  // 2026-08-01は土曜(月初の曜日=6)。8/3,8/4は第2週(添字1)、8/10は第3週(添字2)。第1週(添字0)は空。
  assert.strictEqual(report.weeks.length, 3);
  assert.strictEqual(report.weeks[0], null);
  assert.strictEqual(report.weeks[1].length, 2);
  assert.strictEqual(report.weeks[1][0].date, "2026-08-03");
  assert.strictEqual(report.weeks[2].length, 1);
  assert.strictEqual(report.weeks[2][0].date, "2026-08-10");
});

test("computes packer maintenance totals", function () {
  assert.deepStrictEqual(report.packer, {
    tab: { "分包紙": 1, "インク": 0, "清掃": 1 },
    san: { "分包紙": 0, "インク": 2, "清掃": 0 }
  });
});

test("computes meetings, MR visits, contacts and trainings", function () {
  assert.deepStrictEqual(report.meetings.list, [{ type: "感染", dates: ["2026-08-03"] }]);
  assert.strictEqual(report.meetings.total, 1);
  assert.deepStrictEqual(report.mrVisits, [{ company: "東和", memo: "訪問1", date: "2026-08-03" }]);
  var byFrom = {};
  report.contacts.list.forEach(function (c) { byFrom[c.from] = c.count; });
  assert.strictEqual(byFrom["医師"], 1);
  assert.strictEqual(byFrom["病棟"], 1);
  assert.strictEqual(report.contacts.total, 2);
  assert.deepStrictEqual(report.trainings.list,
    [{ date: "2026-08-03", theme: "研修A", lecturer: "講師1", count: 5 }]);
  assert.strictEqual(report.trainings.totalPeople, 5);
});

test("computes author breakdown sorted by day count", function () {
  assert.deepStrictEqual(report.authors[0], { author: "田中", count: 2, dates: ["2026-08-03", "2026-08-04"] });
  assert.deepStrictEqual(report.authors[1], { author: "鈴木", count: 1, dates: ["2026-08-10"] });
});

test("computes the daily bar-chart percentages relative to the month's max", function () {
  assert.strictEqual(report.dailyOp.length, 3);
  var byDate = {};
  report.dailyOp.forEach(function (d) { byDate[d.date] = d; });
  assert.strictEqual(byDate["2026-08-03"].total, 12);
  assert.strictEqual(byDate["2026-08-03"].pct, 100);
  assert.strictEqual(byDate["2026-08-04"].pct, 75);
  assert.strictEqual(byDate["2026-08-10"].pct, 42);
});

test("returns zeroed totals for a month with no entries", function () {
  var empty = MonthlyReport.compute([], { y: 2026, m: 8 });
  assert.strictEqual(empty.dayCount, 0);
  assert.strictEqual(empty.rx.opCnt, 0);
  assert.strictEqual(empty.avgTeikiPerDay, 0);
  assert.deepStrictEqual(empty.weeks, []);
  assert.deepStrictEqual(empty.authors, []);
});

h.summary();
