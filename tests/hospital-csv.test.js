var assert = require("assert");
var fs = require("fs");
var path = require("path");
var h = require("./helper.js");
var test = h.test;
var HospitalCsv = require("../src/parse/hospital-csv.js");

function fixture(name) {
  return fs.readFileSync(path.join(__dirname, "fixtures", name));
}

test("decodes Shift-JIS content", function () {
  var text = HospitalCsv.decode(fixture("hospital-sample.csv"));
  assert.ok(text.indexOf("かりゆし") >= 0);
  assert.ok(text.indexOf("入院定期") >= 0);
});

test("parses every ward in the fixed order", function () {
  var result = HospitalCsv.parse(fixture("hospital-sample.csv"));
  assert.deepStrictEqual(result.errors, []);
  assert.strictEqual(result.wardRx.length, 5);
  assert.deepStrictEqual(
    result.wardRx.map(function (r) { return r.name; }),
    ["かりゆし", "ゆいゆい", "うりずん北", "うりずん南", "はいさい"]
  );
});

test("maps each column heading to the right key", function () {
  var rows = HospitalCsv.parse(fixture("hospital-sample.csv")).wardRx;
  assert.deepStrictEqual(rows[0].teiki, { cnt: 1, dose: 2 });
  assert.deepStrictEqual(rows[0].rinji, { cnt: 3, dose: 4 });
  assert.deepStrictEqual(rows[0].total, { cnt: 4, dose: 6 });
  assert.deepStrictEqual(rows[2].meds, { cnt: 7, dose: 8 });
  assert.deepStrictEqual(rows[4].taiin, { cnt: 9, dose: 10 });
  assert.deepStrictEqual(rows[4].ippoka, { cnt: 11, dose: 12 });
});

test("excludes the grand total row from the ward list", function () {
  var rows = HospitalCsv.parse(fixture("hospital-sample.csv")).wardRx;
  var names = rows.map(function (r) { return r.name; });
  assert.strictEqual(names.indexOf("■合計■"), -1);
});

test("reports an error when a ward is missing", function () {
  var text = [
    "病棟,入院定期,,■合計■,",
    ",処方箋枚数,調剤件数,処方箋枚数,調剤件数",
    "かりゆし,1,2,1,2"
  ].join("\r\n");
  var result = HospitalCsv.parse(Buffer.from(text, "utf8"));
  assert.ok(result.errors.length > 0);
  assert.ok(result.errors[0].message.indexOf("ゆいゆい") >= 0);
});

test("reports an error for a non-numeric cell", function () {
  var result = HospitalCsv.parse(fixture("hospital-bad-number.csv"));
  assert.ok(result.errors.length > 0);
  assert.ok(result.errors[0].message.indexOf("数値") >= 0);
});

h.summary();
