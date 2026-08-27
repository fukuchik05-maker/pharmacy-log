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

  var api = {
    SECTION_FIELDS: SECTION_FIELDS,
    SECTION_TITLES: SECTION_TITLES,
    DEFAULT_ON: DEFAULT_ON,
    payloadFromSections: payloadFromSections,
    wardRxTotals: wardRxTotals,
    sectionLabelsOf: sectionLabelsOf
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.EntrySections = api;
  }
})(typeof window !== "undefined" ? window : this);
