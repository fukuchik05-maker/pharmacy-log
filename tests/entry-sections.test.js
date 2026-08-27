var assert = require("assert");
var h = require("./helper.js");
var test = h.test;
var S = require("../src/model/entry-sections.js");

test("DEFAULT_ON has every section except wardRx", function () {
  var all = Object.keys(S.SECTION_FIELDS);
  assert.deepStrictEqual(
    S.DEFAULT_ON.slice().sort(),
    all.filter(function (k) { return k !== "wardRx"; }).sort()
  );
});

test("payloadFromSections keeps only checked sections' keys", function () {
  var raw = {
    rxOpCnt: 1, rxOpDose: 2, rxInjCnt: 3, rxInjDose: 4, counsel: 5,
    winjData: [{ ward: "かりゆし", cnt: 0, dose: 0 }],
    wardRx: [{ name: "かりゆし" }],
    doctorChanges: [{ doctor: "A", cnt: 0 }],
    premixes: [{ drug: "X", cnt: 0 }],
    packerData: { tab: {}, san: {} },
    checklist: ["項目A"],
    inquiries: [{ type: "用量" }], mrVisits: [], contacts: [], drugs: [],
    shortages: [], meetings: [], trainings: [],
    notes: "メモ"
  };
  var out = S.payloadFromSections(raw, ["gairai", "meisai", "notes"]);
  assert.deepStrictEqual(Object.keys(out).sort(), [
    "contacts", "counsel", "drugs", "inquiries", "meetings", "mrVisits",
    "notes", "rxInjCnt", "rxInjDose", "rxOpCnt", "rxOpDose", "shortages", "trainings"
  ].sort());
  assert.strictEqual(out.rxOpCnt, 1);
  assert.strictEqual(out.notes, "メモ");
  assert.strictEqual(out.wardRx, undefined);
  assert.strictEqual(out.checklist, undefined);
});

test("payloadFromSections with wardRx section includes wardRx only", function () {
  var raw = { wardRx: [{ name: "かりゆし" }], notes: "x" };
  var out = S.payloadFromSections(raw, ["wardRx"]);
  assert.deepStrictEqual(Object.keys(out), ["wardRx"]);
});

test("wardRxTotals computes per-ward totals", function () {
  var rows = [{
    name: "かりゆし",
    teiki: { cnt: 3, dose: 18 }, rinji: { cnt: 9, dose: 9 },
    taiin: { cnt: 0, dose: 0 }, meds: { cnt: 1, dose: 4 }, ippoka: { cnt: 0, dose: 0 }
  }];
  var out = S.wardRxTotals(rows);
  assert.deepStrictEqual(out[0].total, { cnt: 13, dose: 31 });
  assert.strictEqual(rows[0].total, undefined); // 元配列は変更しない
});

test("sectionLabelsOf lists sections present in the payload, in declared order", function () {
  var labels = S.sectionLabelsOf({ rxOpCnt: 0, inquiries: [], notes: "" });
  assert.deepStrictEqual(labels, ["外来", "明細", "その他"]);
});

h.summary();
