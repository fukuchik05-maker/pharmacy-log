(function (root) {
  "use strict";

  var HospitalCsv = (typeof require !== "undefined")
    ? require("../parse/hospital-csv.js")
    : root.HospitalCsv;
  var Filename = (typeof require !== "undefined")
    ? require("../parse/filename.js")
    : root.Filename;

  // 病院システムの日次CSV(バイト列)とファイル名から、取込対象日と
  // 病棟別処方箋データ(wardRx)を組み立てる。Firestore には触れない純粋関数。
  function buildInspection(fileName, bytes, today) {
    var resolved = Filename.parse(fileName, today);
    if (!resolved || resolved.kind !== "csv") {
      throw new Error("ファイル名から日付を判定できません。0824.csv の形式にしてください");
    }
    var parsed = HospitalCsv.parse(bytes);
    return { date: resolved.date, wardRx: parsed.wardRx, errors: parsed.errors };
  }

  var api = { buildInspection: buildInspection };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.HospitalImportCore = api;
  }
})(typeof window !== "undefined" ? window : this);
