var assert = require("assert");
var h = require("./helper.js");
var test = h.test;
var DM = require("../src/app/draft-merge.js");
var DailyLog = require("../src/model/daily-log.js");

test("new day: partial payload sits on an emptyLog base", function () {
  var out = DM.mergeDraftIntoLog(null, {
    date: "2026-08-26", author: "山田",
    payload: { rxOpCnt: 5, rxOpDose: 12, notes: "テスト" }
  });
  assert.strictEqual(out.date, "2026-08-26");
  assert.strictEqual(out.author, "山田");
  assert.strictEqual(out.rxOpCnt, 5);
  assert.strictEqual(out.rxOpDose, 12);
  assert.strictEqual(out.notes, "テスト");
  assert.strictEqual(out.rxInjCnt, 0);
  assert.strictEqual(out.wardRx.length, 5);
  assert.deepStrictEqual(out.wardRx[0].teiki, { cnt: 0, dose: 0 });
  assert.strictEqual(out._meta.source, "mobile");
  assert.ok(typeof out._meta.mobileEntryAt === "string");
});

test("existing day without wardRx in payload: existing wardRx is kept", function () {
  var existing = DailyLog.emptyLog("2026-08-26");
  existing.wardRx[0].teiki = { cnt: 9, dose: 40 };
  existing.counsel = 3;
  existing._meta = { source: "csv", csvIngestedAt: "2026-08-26T01:00:00.000Z" };

  var out = DM.mergeDraftIntoLog(existing, {
    date: "2026-08-26", author: "佐藤",
    payload: { rxOpCnt: 7 }
  });
  assert.deepStrictEqual(out.wardRx[0].teiki, { cnt: 9, dose: 40 });
  assert.strictEqual(out.counsel, 3);
  assert.strictEqual(out.rxOpCnt, 7);
  assert.strictEqual(out.author, "佐藤");
  assert.strictEqual(out._meta.source, "mobile");
  assert.strictEqual(out._meta.csvIngestedAt, "2026-08-26T01:00:00.000Z");
});

test("existing day with wardRx in payload: wardRx is overwritten", function () {
  var existing = DailyLog.emptyLog("2026-08-26");
  existing.wardRx[0].teiki = { cnt: 9, dose: 40 };

  var newWardRx = DailyLog.emptyLog("2026-08-26").wardRx;
  newWardRx[0].teiki = { cnt: 3, dose: 0 };
  newWardRx[0].total = { cnt: 3, dose: 0 };

  var out = DM.mergeDraftIntoLog(existing, {
    date: "2026-08-26", author: "山田",
    payload: { wardRx: newWardRx }
  });
  assert.deepStrictEqual(out.wardRx[0].teiki, { cnt: 3, dose: 0 });
  assert.deepStrictEqual(out.wardRx[0].total, { cnt: 3, dose: 0 });
});

test("empty author does not clobber an existing author", function () {
  var existing = DailyLog.emptyLog("2026-08-26");
  existing.author = "既存者";
  var out = DM.mergeDraftIntoLog(existing, { date: "2026-08-26", author: "", payload: { notes: "x" } });
  assert.strictEqual(out.author, "既存者");
});

h.summary();
