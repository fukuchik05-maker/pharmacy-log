(function (root) {
  "use strict";

  var WARDS = ["かりゆし", "ゆいゆい", "うりずん北", "うりずん南", "はいさい"];
  var RX_KINDS = ["teiki", "rinji", "taiin", "meds", "ippoka", "total"];
  var INQ_TYPES = ["用法", "用量", "日数", "相互作用", "重複", "禁忌", "漏れ", "その他"];
  var DRUG_TYPES = ["adopt", "remove", "expire", "return", "maintenance"];
  var MEETING_TYPES = ["電子カルテ", "感染", "部門長", "倫理", "医薬品", "褥瘡", "医療安全"];
  var CONTACT_FROM = ["医師", "病棟", "その他"];
  var PACKER_UNITS = ["tab", "san"];

  var NUMBER_FIELDS = ["rxOpCnt", "rxOpDose", "rxInjCnt", "rxInjDose", "counsel"];
  var LIST_FIELDS = [
    "inquiries", "mrVisits", "contacts", "drugs",
    "shortages", "meetings", "trainings", "premixes",
    "doctorChanges", "checklist"
  ];

  var DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

  function emptyPair() {
    return { cnt: 0, dose: 0 };
  }

  function emptyWardRx() {
    return WARDS.map(function (name) {
      var row = { name: name };
      RX_KINDS.forEach(function (kind) {
        row[kind] = emptyPair();
      });
      return row;
    });
  }

  function emptyWinj() {
    return WARDS.map(function (name) {
      return { ward: name, cnt: 0, dose: 0 };
    });
  }

  function emptyPacker() {
    var packer = {};
    PACKER_UNITS.forEach(function (unit) {
      packer[unit] = { "分包紙": 0, "インク": 0, "清掃": false };
    });
    return packer;
  }

  function emptyLog(date) {
    var log = {
      date: date || "",
      author: "",
      wardRx: emptyWardRx(),
      winjData: emptyWinj(),
      packerData: emptyPacker(),
      submissions: { diNews: false, notices: 0, other: "" },
      notes: ""
    };
    NUMBER_FIELDS.forEach(function (field) {
      log[field] = 0;
    });
    LIST_FIELDS.forEach(function (field) {
      log[field] = [];
    });
    return log;
  }

  function mergeWardRx(incoming) {
    var byName = {};
    incoming.forEach(function (row) {
      if (row && row.name) byName[row.name] = row;
    });
    return WARDS.map(function (name) {
      var row = { name: name };
      var found = byName[name];
      RX_KINDS.forEach(function (kind) {
        var pair = found && found[kind] ? found[kind] : null;
        row[kind] = {
          cnt: pair && pair.cnt !== undefined ? pair.cnt : 0,
          dose: pair && pair.dose !== undefined ? pair.dose : 0
        };
      });
      return row;
    });
  }

  function mergeWinj(incoming) {
    var byWard = {};
    incoming.forEach(function (row) {
      if (row && row.ward) byWard[row.ward] = row;
    });
    return WARDS.map(function (name) {
      var found = byWard[name];
      return {
        ward: name,
        cnt: found && found.cnt !== undefined ? found.cnt : 0,
        dose: found && found.dose !== undefined ? found.dose : 0
      };
    });
  }

  function normalize(partial) {
    var source = partial || {};
    var log = emptyLog(source.date || "");

    if (typeof source.author === "string") log.author = source.author;
    if (typeof source.notes === "string") log.notes = source.notes;

    NUMBER_FIELDS.forEach(function (field) {
      if (source[field] !== undefined && source[field] !== null) {
        log[field] = source[field];
      }
    });

    LIST_FIELDS.forEach(function (field) {
      if (Array.isArray(source[field])) {
        log[field] = source[field].slice();
      }
    });

    if (Array.isArray(source.wardRx)) {
      log.wardRx = mergeWardRx(source.wardRx);
    }
    if (Array.isArray(source.winjData)) {
      log.winjData = mergeWinj(source.winjData);
    }
    if (source.packerData) {
      PACKER_UNITS.forEach(function (unit) {
        var incoming = source.packerData[unit];
        if (!incoming) return;
        if (incoming["分包紙"] !== undefined) log.packerData[unit]["分包紙"] = incoming["分包紙"];
        if (incoming["インク"] !== undefined) log.packerData[unit]["インク"] = incoming["インク"];
        if (incoming["清掃"] !== undefined) log.packerData[unit]["清掃"] = !!incoming["清掃"];
      });
    }
    if (source.submissions) {
      if (source.submissions.diNews !== undefined) log.submissions.diNews = !!source.submissions.diNews;
      if (source.submissions.notices !== undefined) log.submissions.notices = source.submissions.notices;
      if (typeof source.submissions.other === "string") log.submissions.other = source.submissions.other;
    }
    return log;
  }

  function isCount(value) {
    return typeof value === "number" && isFinite(value) && value >= 0;
  }

  function validate(record) {
    var errors = [];

    if (!record || typeof record !== "object") {
      return [{ field: "(record)", message: "レコードがオブジェクトではありません" }];
    }
    if (!DATE_RE.test(record.date || "")) {
      errors.push({ field: "date", message: "日付は YYYY-MM-DD 形式である必要があります: " + record.date });
    }

    NUMBER_FIELDS.forEach(function (field) {
      if (!isCount(record[field])) {
        errors.push({ field: field, message: "0以上の数値である必要があります: " + record[field] });
      }
    });

    (record.wardRx || []).forEach(function (row) {
      RX_KINDS.forEach(function (kind) {
        var pair = row[kind] || {};
        if (!isCount(pair.cnt) || !isCount(pair.dose)) {
          errors.push({
            field: "wardRx." + row.name + "." + kind,
            message: "枚数・件数は0以上の数値である必要があります"
          });
        }
      });
    });

    (record.inquiries || []).forEach(function (item, index) {
      if (INQ_TYPES.indexOf(item.type) < 0) {
        errors.push({
          field: "inquiries[" + index + "].type",
          message: "疑義照会の区分が不正です: " + item.type
        });
      }
    });

    (record.drugs || []).forEach(function (item, index) {
      if (DRUG_TYPES.indexOf(item.type) < 0) {
        errors.push({
          field: "drugs[" + index + "].type",
          message: "薬品管理の区分が不正です: " + item.type
        });
      }
    });

    (record.meetings || []).forEach(function (item, index) {
      if (MEETING_TYPES.indexOf(item.type) < 0) {
        errors.push({
          field: "meetings[" + index + "].type",
          message: "会議の種別が不正です: " + item.type
        });
      }
    });

    (record.contacts || []).forEach(function (item, index) {
      if (CONTACT_FROM.indexOf(item.from) < 0) {
        errors.push({
          field: "contacts[" + index + "].from",
          message: "問い合わせ元が不正です: " + item.from
        });
      }
    });

    return errors;
  }

  function wardMedsFrom(wardRx) {
    var byName = {};
    (wardRx || []).forEach(function (row) {
      if (row && row.name) byName[row.name] = row;
    });
    return WARDS.map(function (name) {
      var row = byName[name] || {};
      var meds = row.meds || emptyPair();
      var ippoka = row.ippoka || emptyPair();
      return {
        ward: name,
        cnt: meds.cnt || 0,
        dose: meds.dose || 0,
        ipCnt: ippoka.cnt || 0,
        ipDose: ippoka.dose || 0
      };
    });
  }

  var api = {
    WARDS: WARDS,
    RX_KINDS: RX_KINDS,
    INQ_TYPES: INQ_TYPES,
    DRUG_TYPES: DRUG_TYPES,
    MEETING_TYPES: MEETING_TYPES,
    CONTACT_FROM: CONTACT_FROM,
    PACKER_UNITS: PACKER_UNITS,
    emptyLog: emptyLog,
    normalize: normalize,
    validate: validate,
    wardMedsFrom: wardMedsFrom
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.DailyLog = api;
  }
})(typeof window !== "undefined" ? window : this);
