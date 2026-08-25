var assert = require("assert");
var h = require("./helper.js");
var test = h.test;
var Filename = require("../src/parse/filename.js");

var AUG_25 = new Date(2026, 7, 25);

test("parses a hospital csv name", function () {
  assert.deepStrictEqual(Filename.parse("0824.csv", AUG_25), { date: "2026-08-24", kind: "csv" });
});

test("parses an excel template name", function () {
  assert.deepStrictEqual(Filename.parse("0824.xlsx", AUG_25), { date: "2026-08-24", kind: "xlsx" });
});

test("ignores surrounding path and letter case", function () {
  assert.deepStrictEqual(Filename.parse("/取込待ち/0824.CSV", AUG_25), { date: "2026-08-24", kind: "csv" });
});

test("picks the nearest year across a year boundary", function () {
  var jan5 = new Date(2027, 0, 5);
  assert.deepStrictEqual(Filename.parse("1230.csv", jan5), { date: "2026-12-30", kind: "csv" });
  assert.deepStrictEqual(Filename.parse("0104.csv", jan5), { date: "2027-01-04", kind: "csv" });
  var dec28 = new Date(2026, 11, 28);
  assert.deepStrictEqual(Filename.parse("0102.csv", dec28), { date: "2027-01-02", kind: "csv" });
});

test("rejects names that are not MMDD", function () {
  assert.strictEqual(Filename.parse("2026-08-24.csv", AUG_25), null);
  assert.strictEqual(Filename.parse("082.csv", AUG_25), null);
  assert.strictEqual(Filename.parse("メモ.csv", AUG_25), null);
  assert.strictEqual(Filename.parse("0824.txt", AUG_25), null);
});

test("rejects an impossible calendar date", function () {
  assert.strictEqual(Filename.parse("1332.csv", AUG_25), null);
  assert.strictEqual(Filename.parse("0230.csv", AUG_25), null);
});

h.summary();
