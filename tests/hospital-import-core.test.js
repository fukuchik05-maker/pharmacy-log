var assert = require("assert");
var fs = require("fs");
var path = require("path");
var h = require("./helper.js");
var test = h.test;
var Core = require("../src/app/hospital-import-core.js");

var AUG_25 = new Date(2026, 7, 25);

function fixture(name) {
  return fs.readFileSync(path.join(__dirname, "fixtures", name));
}

test("builds date and wardRx from a valid hospital CSV", function () {
  var result = Core.buildInspection("0824.csv", fixture("hospital-sample.csv"), AUG_25);
  assert.strictEqual(result.date, "2026-08-24");
  assert.deepStrictEqual(result.errors, []);
  assert.strictEqual(result.wardRx.length, 5);
  assert.deepStrictEqual(result.wardRx[0].teiki, { cnt: 1, dose: 2 });
  assert.deepStrictEqual(result.wardRx[0].name, "かりゆし");
});

test("throws when the file name is not MMDD.csv", function () {
  assert.throws(function () {
    Core.buildInspection("メモ.csv", fixture("hospital-sample.csv"), AUG_25);
  }, /日付を判定できません/);
});

test("throws for an .xlsx name", function () {
  assert.throws(function () {
    Core.buildInspection("0824.xlsx", fixture("hospital-sample.csv"), AUG_25);
  }, /日付を判定できません/);
});

test("passes parser errors through when a ward row is missing", function () {
  var text = [
    "病棟,入院定期,,■合計■,",
    ",処方箋枚数,調剤件数,処方箋枚数,調剤件数",
    "かりゆし,1,2,1,2"
  ].join("\r\n");
  var result = Core.buildInspection("0824.csv", Buffer.from(text, "utf8"), AUG_25);
  assert.ok(result.errors.length > 0);
  assert.ok(result.errors.some(function (e) { return e.message.indexOf("ゆいゆい") >= 0; }));
});

test("passes parser errors through for a non-numeric cell", function () {
  var result = Core.buildInspection("0824.csv", fixture("hospital-bad-number.csv"), AUG_25);
  assert.ok(result.errors.length > 0);
  assert.ok(result.errors.some(function (e) { return e.message.indexOf("数値") >= 0; }));
});

h.summary();
