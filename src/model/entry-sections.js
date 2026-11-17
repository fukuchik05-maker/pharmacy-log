(function (root) {
  "use strict";

  var SECTION_FIELDS = {
    gairai: ["rxOpCnt", "rxOpDose", "rxInjCnt", "rxInjDose", "counsel"],
    winj: ["winjData"],
    wardRx: ["wardRx"],
    doctorChanges: ["doctorChanges"],
    premixes: ["premixes"],
    packer: ["packerData"],
    checklist: ["checklist"],
    meisai: ["inquiries", "mrVisits", "contacts", "drugs", "shortages", "meetings", "trainings"],
    notes: ["notes"]
  };

  var SECTION_TITLES = {
    gairai: "外来", winj: "病棟別注射", wardRx: "病棟別処方箋", doctorChanges: "処方変更",
    premixes: "予製", packer: "分包機", checklist: "チェックリスト", meisai: "明細", notes: "その他"
  };

  var DEFAULT_ON = Object.keys(SECTION_FIELDS).filter(function (k) { return k !== "wardRx"; });

  function payloadFromSections(rawValues, checkedKeys) {
    var out = {};
    (checkedKeys || []).forEach(function (sec) {
      (SECTION_FIELDS[sec] || []).forEach(function (field) {
        if (Object.prototype.hasOwnProperty.call(rawValues, field)) {
          out[field] = rawValues[field];
        }
      });
    });
    return out;
  }

  function pair(p) {
    return { cnt: (p && p.cnt) || 0, dose: (p && p.dose) || 0 };
  }

  function wardRxTotals(rows) {
    return (rows || []).map(function (row) {
      var kinds = ["teiki", "rinji", "taiin", "meds", "ippoka"];
      var cnt = 0, dose = 0;
      kinds.forEach(function (k) {
        var p = pair(row[k]);
        cnt += p.cnt;
        dose += p.dose;
      });
      var copy = {};
      Object.keys(row).forEach(function (k) { copy[k] = row[k]; });
      copy.total = { cnt: cnt, dose: dose };
      return copy;
    });
  }

  function sectionLabelsOf(payload) {
    return Object.keys(SECTION_FIELDS).filter(function (sec) {
      return SECTION_FIELDS[sec].some(function (f) {
        return Object.prototype.hasOwnProperty.call(payload || {}, f);
      });
    }).map(function (sec) { return SECTION_TITLES[sec]; });
  }

  // ISO文字列(UTC保存)を端末のローカル時刻の HH:MM にする。offsetMinutes はテスト用(日本=540)。
  // slice(11,16) だとUTCのまま出てしまい、日本では9時間遅れて見える。
  function formatLocalTime(iso, offsetMinutes) {
    if (!iso) return "";
    var d = new Date(iso);
    if (isNaN(d.getTime())) return "";
    var p = function (n) { return n < 10 ? "0" + n : "" + n; };
    if (typeof offsetMinutes === "number") {
      var s = new Date(d.getTime() + offsetMinutes * 60000);
      return p(s.getUTCHours()) + ":" + p(s.getUTCMinutes());
    }
    return p(d.getHours()) + ":" + p(d.getMinutes());
  }

  var api = {
    SECTION_FIELDS: SECTION_FIELDS,
    SECTION_TITLES: SECTION_TITLES,
    DEFAULT_ON: DEFAULT_ON,
    payloadFromSections: payloadFromSections,
    wardRxTotals: wardRxTotals,
    sectionLabelsOf: sectionLabelsOf,
    formatLocalTime: formatLocalTime
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.EntrySections = api;
  }
})(typeof window !== "undefined" ? window : this);
