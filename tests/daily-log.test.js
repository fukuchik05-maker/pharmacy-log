var assert = require("assert");
var h = require("./helper.js");
var test = h.test;
var DailyLog = require("../src/model/daily-log.js");

test("emptyLog returns every field initialised", function () {
  var log = DailyLog.emptyLog("2026-08-24");
  assert.strictEqual(log.date, "2026-08-24");
  assert.strictEqual(log.author, "");
  assert.strictEqual(log.rxOpCnt, 0);
  assert.strictEqual(log.counsel, 0);
  assert.strictEqual(log.notes, "");
  assert.deepStrictEqual(log.inquiries, []);
  assert.strictEqual(log.wardRx.length, 5);
  assert.strictEqual(log.wardRx[0].name, "かりゆし");
  assert.strictEqual(log.wardRx[0].teiki.cnt, 0);
  assert.strictEqual(log.wardRx[4].name, "はいさい");
  assert.strictEqual(log.winjData.length, 5);
  assert.strictEqual(log.packerData.tab["分包紙"], 0);
  assert.strictEqual(log.packerData.san["清掃"], false);
  assert.strictEqual(log.submissions.diNews, false);
  assert.strictEqual(log.submissions.notices, 0);
});

test("normalize fills in missing fields but keeps supplied ones", function () {
  var log = DailyLog.normalize({ date: "2026-08-24", counsel: 3, notes: "特記事項" });
  assert.strictEqual(log.counsel, 3);
  assert.strictEqual(log.notes, "特記事項");
  assert.strictEqual(log.rxOpCnt, 0);
  assert.deepStrictEqual(log.mrVisits, []);
});

test("normalize does not share nested objects between records", function () {
  var a = DailyLog.normalize({ date: "2026-08-24" });
  var b = DailyLog.normalize({ date: "2026-08-25" });
  a.wardRx[0].teiki.cnt = 99;
  a.inquiries.push({ type: "用量" });
  assert.strictEqual(b.wardRx[0].teiki.cnt, 0);
  assert.strictEqual(b.inquiries.length, 0);
});

test("validate accepts a well-formed record", function () {
  assert.deepStrictEqual(DailyLog.validate(DailyLog.emptyLog("2026-08-24")), []);
});

test("validate rejects a malformed date", function () {
  var log = DailyLog.emptyLog("2026-08-24");
  log.date = "8/24";
  var errors = DailyLog.validate(log);
  assert.strictEqual(errors.length, 1);
  assert.strictEqual(errors[0].field, "date");
});

test("validate rejects negative and non-numeric counts", function () {
  var log = DailyLog.emptyLog("2026-08-24");
  log.rxOpCnt = -1;
  log.counsel = "３件";
  var fields = DailyLog.validate(log).map(function (e) { return e.field; });
  assert.ok(fields.indexOf("rxOpCnt") >= 0);
  assert.ok(fields.indexOf("counsel") >= 0);
});

test("validate rejects an unknown inquiry type", function () {
  var log = DailyLog.emptyLog("2026-08-24");
  log.inquiries.push({ type: "存在しない区分", memo: "x", changed: false });
  var errors = DailyLog.validate(log);
  assert.strictEqual(errors.length, 1);
  assert.ok(errors[0].message.indexOf("存在しない区分") >= 0);
});

test("wardMedsFrom derives carried-in drug figures from wardRx", function () {
  var log = DailyLog.emptyLog("2026-08-24");
  log.wardRx[4].meds = { cnt: 1, dose: 4 };
  log.wardRx[4].ippoka = { cnt: 2, dose: 5 };
  var meds = DailyLog.wardMedsFrom(log.wardRx);
  assert.strictEqual(meds.length, 5);
  assert.deepStrictEqual(meds[4], { ward: "はいさい", cnt: 1, dose: 4, ipCnt: 2, ipDose: 5 });
  assert.deepStrictEqual(meds[0], { ward: "かりゆし", cnt: 0, dose: 0, ipCnt: 0, ipDose: 0 });
});

h.summary();
