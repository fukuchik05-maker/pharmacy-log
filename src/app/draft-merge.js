(function (root) {
  "use strict";

  var DailyLog = (typeof require !== "undefined")
    ? require("../model/daily-log.js")
    : root.DailyLog;

  // モバイル下書きの承認。draft.payload にあるキーだけを土台へ上書きする(partial merge)。
  // payload に無いキー(未記入セクション)には一切触れない。
  function mergeDraftIntoLog(existing, draft) {
    var base = {};
    if (existing) {
      Object.keys(existing).forEach(function (k) { base[k] = existing[k]; });
    } else {
      base = DailyLog.emptyLog(draft.date);
    }
    base.date = draft.date;
    if (typeof draft.author === "string" && draft.author) {
      base.author = draft.author;
    }

    var payload = draft.payload || {};
    Object.keys(payload).forEach(function (key) {
      base[key] = payload[key];
    });

    var prevMeta = (existing && existing._meta) || {};
    base._meta = {};
    Object.keys(prevMeta).forEach(function (k) { base._meta[k] = prevMeta[k]; });
    base._meta.source = "mobile";
    base._meta.mobileEntryAt = new Date().toISOString();

    return base;
  }

  var api = { mergeDraftIntoLog: mergeDraftIntoLog };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.DraftMerge = api;
  }
})(typeof window !== "undefined" ? window : this);
