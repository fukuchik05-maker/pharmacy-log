(function (root) {
  "use strict";

  var DailyLog = (typeof require !== "undefined")
    ? require("./daily-log.js")
    : root.DailyLog;

  var WARD_NAMES_MEDS = ["かりゆし", "ゆいゆい", "うりずん北", "はいさい"];
  var FISCAL_MONTHS = [4, 5, 6, 7, 8, 9, 10, 11, 12, 1, 2, 3];
  var FIELDS = [
    "teikiCnt", "teikiDose", "rinjiCnt", "rinjiDose", "taiinCnt", "taiinDose",
    "totalCnt", "totalDose", "winjCnt", "winjDose", "opCnt", "opDose", "injCnt", "injDose",
    "wardMedsCnt", "ippokaCnt", "counsel"
  ];

  function sum(list, pick) {
    return (list || []).reduce(function (acc, item) { return acc + (pick(item) || 0); }, 0);
  }

  function monthOf(dateStr) {
    return Number(dateStr.split("-")[1]);
  }

  function wardMedsFor(entry) {
    var meds = DailyLog.wardMedsFrom(entry.wardRx).filter(function (w) {
      return WARD_NAMES_MEDS.indexOf(w.ward) !== -1;
    });
    return {
      cnt: sum(meds, function (w) { return w.cnt; }),
      ipCnt: sum(meds, function (w) { return w.ipCnt; })
    };
  }

  function computeMonth(entries) {
    var wardMedsTotals = entries.reduce(function (acc, e) {
      var m = wardMedsFor(e);
      acc.cnt += m.cnt;
      acc.ip += m.ipCnt;
      return acc;
    }, { cnt: 0, ip: 0 });

    return {
      days: entries.length,
      teikiCnt: sum(entries, function (e) { return sum(e.wardRx, function (w) { return w.teiki.cnt; }); }),
      teikiDose: sum(entries, function (e) { return sum(e.wardRx, function (w) { return w.teiki.dose; }); }),
      rinjiCnt: sum(entries, function (e) { return sum(e.wardRx, function (w) { return w.rinji.cnt; }); }),
      rinjiDose: sum(entries, function (e) { return sum(e.wardRx, function (w) { return w.rinji.dose; }); }),
      taiinCnt: sum(entries, function (e) { return sum(e.wardRx, function (w) { return w.taiin.cnt; }); }),
      taiinDose: sum(entries, function (e) { return sum(e.wardRx, function (w) { return w.taiin.dose; }); }),
      totalCnt: sum(entries, function (e) { return sum(e.wardRx, function (w) { return w.total.cnt; }); }),
      totalDose: sum(entries, function (e) { return sum(e.wardRx, function (w) { return w.total.dose; }); }),
      winjCnt: sum(entries, function (e) { return sum(e.winjData, function (w) { return w.cnt; }); }),
      winjDose: sum(entries, function (e) { return sum(e.winjData, function (w) { return w.dose; }); }),
      opCnt: sum(entries, function (e) { return e.rxOpCnt; }),
      opDose: sum(entries, function (e) { return e.rxOpDose; }),
      injCnt: sum(entries, function (e) { return e.rxInjCnt; }),
      injDose: sum(entries, function (e) { return e.rxInjDose; }),
      wardMedsCnt: wardMedsTotals.cnt,
      ippokaCnt: wardMedsTotals.ip,
      counsel: sum(entries, function (e) { return e.counsel; })
    };
  }

  function compute(entries, fiscalYear) {
    var normalized = (entries || []).map(function (e) { return DailyLog.normalize(e); });
    var byMonth = {};
    FISCAL_MONTHS.forEach(function (m) { byMonth[m] = []; });
    normalized.forEach(function (e) {
      var m = monthOf(e.date);
      if (byMonth[m]) byMonth[m].push(e);
    });

    var months = FISCAL_MONTHS.map(function (m) {
      var stats = computeMonth(byMonth[m]);
      stats.month = m;
      return stats;
    });

    var totals = { days: sum(months, function (r) { return r.days; }) };
    FIELDS.forEach(function (f) {
      totals[f] = sum(months, function (r) { return r[f]; });
    });

    var averages = {};
    FIELDS.forEach(function (f) {
      averages[f] = totals.days ? totals[f] / totals.days : null;
    });

    var monthAverages = months.map(function (r) {
      var avg = { month: r.month };
      FIELDS.forEach(function (f) {
        avg[f] = r.days ? r[f] / r.days : null;
      });
      return avg;
    });

    return {
      fiscalYear: fiscalYear,
      months: months,
      totals: totals,
      averages: averages,
      monthAverages: monthAverages
    };
  }

  var api = { compute: compute };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.DeptReport = api;
  }
})(typeof window !== "undefined" ? window : this);
