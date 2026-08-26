(function (root) {
  "use strict";

  var DailyLog = (typeof require !== "undefined")
    ? require("./daily-log.js")
    : root.DailyLog;

  var WARD_NAMES_MEDS = ["かりゆし", "ゆいゆい", "うりずん北", "はいさい"];
  var WARDRX_KINDS = ["teiki", "rinji", "taiin", "meds", "total"];

  function sum(list, pick) {
    return (list || []).reduce(function (acc, item) { return acc + (pick(item) || 0); }, 0);
  }

  // "YYYY-MM-DD" をローカル日付として解釈し、曜日(0=日〜6=土)を返す。
  // new Date("YYYY-MM-DD") はUTC解釈されるため使わない。
  function localDow(dateStr) {
    var parts = dateStr.split("-");
    return new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2])).getDay();
  }

  function computeRx(entries) {
    return {
      opCnt: sum(entries, function (e) { return e.rxOpCnt; }),
      opDose: sum(entries, function (e) { return e.rxOpDose; }),
      injCnt: sum(entries, function (e) { return e.rxInjCnt; }),
      injDose: sum(entries, function (e) { return e.rxInjDose; }),
      winjCnt: sum(entries, function (e) { return sum(e.winjData, function (w) { return w.cnt; }); }),
      winjDose: sum(entries, function (e) { return sum(e.winjData, function (w) { return w.dose; }); }),
      counsel: sum(entries, function (e) { return e.counsel; })
    };
  }

  function computeWardMeds(entries) {
    var map = {};
    WARD_NAMES_MEDS.forEach(function (name) {
      map[name] = { ward: name, cnt: 0, dose: 0, ipCnt: 0, ipDose: 0 };
    });
    entries.forEach(function (e) {
      DailyLog.wardMedsFrom(e.wardRx).forEach(function (w) {
        if (!map[w.ward]) return;
        map[w.ward].cnt += w.cnt;
        map[w.ward].dose += w.dose;
        map[w.ward].ipCnt += w.ipCnt;
        map[w.ward].ipDose += w.ipDose;
      });
    });
    var list = WARD_NAMES_MEDS.map(function (name) { return map[name]; });
    return {
      list: list,
      totalCnt: sum(list, function (w) { return w.cnt; }),
      totalDose: sum(list, function (w) { return w.dose; }),
      totalIpCnt: sum(list, function (w) { return w.ipCnt; }),
      totalIpDose: sum(list, function (w) { return w.ipDose; })
    };
  }

  function computeWardRx(entries) {
    var map = {};
    DailyLog.WARDS.forEach(function (name) {
      map[name] = { ward: name, teiki: 0, rinji: 0, taiin: 0, meds: 0, total: 0 };
    });
    entries.forEach(function (e) {
      (e.wardRx || []).forEach(function (w) {
        var row = map[w.name];
        if (!row) return;
        WARDRX_KINDS.forEach(function (kind) {
          row[kind] += (w[kind] && w[kind].cnt) || 0;
        });
      });
    });
    var list = DailyLog.WARDS.map(function (name) { return map[name]; });
    var total = {};
    WARDRX_KINDS.forEach(function (kind) {
      total[kind] = sum(list, function (w) { return w[kind]; });
    });
    return { list: list, total: total };
  }

  function computeInquiries(entries) {
    var byType = {};
    DailyLog.INQ_TYPES.forEach(function (t) { byType[t] = 0; });
    entries.forEach(function (e) {
      (e.inquiries || []).forEach(function (q) {
        if (byType[q.type] !== undefined) byType[q.type]++;
      });
    });

    var byDoctorMap = {};
    var unassigned = 0, unassignedChanged = 0, total = 0, changed = 0;
    entries.forEach(function (e) {
      (e.inquiries || []).forEach(function (q) {
        total++;
        if (q.changed) changed++;
        if (!q.doctor) {
          unassigned++;
          if (q.changed) unassignedChanged++;
          return;
        }
        if (!byDoctorMap[q.doctor]) byDoctorMap[q.doctor] = { doctor: q.doctor, count: 0, changed: 0 };
        byDoctorMap[q.doctor].count++;
        if (q.changed) byDoctorMap[q.doctor].changed++;
      });
    });

    var byDoctor = Object.keys(byDoctorMap)
      .map(function (k) { return byDoctorMap[k]; })
      .sort(function (a, b) { return b.count - a.count; });

    return {
      total: total,
      changed: changed,
      changeRate: total ? Math.round(changed / total * 100) : 0,
      byType: DailyLog.INQ_TYPES.map(function (t) { return { type: t, count: byType[t] }; }),
      byDoctor: byDoctor,
      unassigned: unassigned,
      unassignedChanged: unassignedChanged
    };
  }

  function computeDoctorChanges(entries) {
    var map = {};
    entries.forEach(function (e) {
      (e.doctorChanges || []).forEach(function (x) {
        if (!x.doctor || !x.cnt) return;
        map[x.doctor] = (map[x.doctor] || 0) + x.cnt;
      });
    });
    var list = Object.keys(map)
      .map(function (k) { return { doctor: k, count: map[k] }; })
      .sort(function (a, b) { return b.count - a.count; });
    return { list: list, total: sum(list, function (x) { return x.count; }) };
  }

  function computeShortages(entries) {
    var map = {};
    entries.forEach(function (e) {
      (e.shortages || []).forEach(function (s) {
        if (!s.name) return;
        map[s.name] = (map[s.name] || 0) + (s.qty || 0);
      });
    });
    var list = Object.keys(map)
      .map(function (k) { return { name: k, qty: map[k] }; })
      .sort(function (a, b) { return b.qty - a.qty; });
    return { list: list, total: sum(entries, function (e) { return (e.shortages || []).length; }) };
  }

  function computePremixes(entries) {
    var map = {};
    entries.forEach(function (e) {
      (e.premixes || []).forEach(function (p) {
        if (!p.drug) return;
        map[p.drug] = (map[p.drug] || 0) + (p.cnt || 0);
      });
    });
    var list = Object.keys(map)
      .map(function (k) { return { drug: k, cnt: map[k] }; })
      .filter(function (p) { return p.cnt > 0; })
      .sort(function (a, b) { return b.cnt - a.cnt; });
    return { list: list };
  }

  function computeDow(entries) {
    var dow = [0, 1, 2, 3, 4, 5, 6].map(function () {
      return { inj: 0, winj: 0, teiki: 0, rinji: 0, taiin: 0, wardTotal: 0, days: 0 };
    });
    entries.forEach(function (e) {
      var d = dow[localDow(e.date)];
      d.inj += e.rxInjCnt;
      d.winj += sum(e.winjData, function (w) { return w.cnt; });
      d.teiki += sum(e.wardRx, function (w) { return w.teiki.cnt; });
      d.rinji += sum(e.wardRx, function (w) { return w.rinji.cnt; });
      d.taiin += sum(e.wardRx, function (w) { return w.taiin.cnt; });
      d.wardTotal += sum(e.wardRx, function (w) { return w.total.cnt; });
      d.days++;
    });
    return dow;
  }

  function computeWeeks(entries, ym) {
    var monthStartDow = new Date(ym.y, ym.m - 1, 1).getDay();
    var weeks = [];
    var maxWeek = -1;
    entries.forEach(function (e) {
      var day = Number(e.date.split("-")[2]);
      var wk = Math.floor((day - 1 + monthStartDow) / 7);
      if (!weeks[wk]) weeks[wk] = [];
      weeks[wk].push(e);
      if (wk > maxWeek) maxWeek = wk;
    });
    var dense = [];
    for (var i = 0; i <= maxWeek; i++) {
      dense.push(weeks[i] || null);
    }
    return dense;
  }

  function computePacker(entries) {
    var packer = {};
    DailyLog.PACKER_UNITS.forEach(function (unit) {
      packer[unit] = { "分包紙": 0, "インク": 0, "清掃": 0 };
    });
    entries.forEach(function (e) {
      var pd = e.packerData || {};
      DailyLog.PACKER_UNITS.forEach(function (unit) {
        var u = pd[unit] || {};
        packer[unit]["分包紙"] += u["分包紙"] || 0;
        packer[unit]["インク"] += u["インク"] || 0;
        if (u["清掃"]) packer[unit]["清掃"]++;
      });
    });
    return packer;
  }

  function computeMeetings(entries) {
    var map = {};
    DailyLog.MEETING_TYPES.forEach(function (t) { map[t] = []; });
    entries.forEach(function (e) {
      (e.meetings || []).forEach(function (m) {
        if (map[m.type] !== undefined) map[m.type].push(e.date);
      });
    });
    var list = DailyLog.MEETING_TYPES
      .map(function (t) { return { type: t, dates: map[t] }; })
      .filter(function (x) { return x.dates.length > 0; });
    return { list: list, total: sum(list, function (x) { return x.dates.length; }) };
  }

  function computeMrVisits(entries) {
    var list = [];
    entries.forEach(function (e) {
      (e.mrVisits || []).forEach(function (m) {
        list.push({ company: m.company, memo: m.memo, date: e.date });
      });
    });
    return list;
  }

  function computeContacts(entries) {
    var map = {};
    DailyLog.CONTACT_FROM.forEach(function (t) { map[t] = 0; });
    entries.forEach(function (e) {
      (e.contacts || []).forEach(function (c) {
        if (map[c.from] !== undefined) map[c.from]++;
      });
    });
    var list = DailyLog.CONTACT_FROM.map(function (t) { return { from: t, count: map[t] }; });
    return { list: list, total: sum(entries, function (e) { return (e.contacts || []).length; }) };
  }

  function computeTrainings(entries) {
    var list = [];
    entries.forEach(function (e) {
      (e.trainings || []).forEach(function (t) {
        list.push({ date: e.date, theme: t.theme, lecturer: t.lecturer, count: t.count });
      });
    });
    return {
      list: list,
      totalCount: list.length,
      totalPeople: sum(list, function (t) { return t.count; })
    };
  }

  function computeAuthors(entries) {
    var map = {};
    entries.forEach(function (e) {
      if (!map[e.author]) map[e.author] = { author: e.author, count: 0, dates: [] };
      map[e.author].count++;
      map[e.author].dates.push(e.date);
    });
    return Object.keys(map)
      .map(function (k) { return map[k]; })
      .sort(function (a, b) { return b.count - a.count; });
  }

  function computeDailyOp(entries) {
    var totals = entries.map(function (e) { return e.rxOpCnt + e.rxInjCnt; });
    var maxRx = Math.max.apply(null, totals.concat([1]));
    return entries.map(function (e) {
      var total = e.rxOpCnt + e.rxInjCnt;
      return {
        date: e.date,
        dow: localDow(e.date),
        total: total,
        pct: Math.round(total / maxRx * 100)
      };
    });
  }

  function compute(entries, ym) {
    var normalized = (entries || []).map(function (e) { return DailyLog.normalize(e); });
    var dayCount = normalized.length;
    var wardRx = computeWardRx(normalized);

    return {
      year: ym.y,
      month: ym.m,
      dayCount: dayCount,
      rx: computeRx(normalized),
      wardMeds: computeWardMeds(normalized),
      wardRx: wardRx,
      avgTeikiPerDay: dayCount ? wardRx.total.teiki / dayCount : 0,
      avgWardRxPerDay: dayCount ? wardRx.total.total / dayCount : 0,
      dailyOp: computeDailyOp(normalized),
      inquiries: computeInquiries(normalized),
      doctorChanges: computeDoctorChanges(normalized),
      shortages: computeShortages(normalized),
      premixes: computePremixes(normalized),
      dow: computeDow(normalized),
      weeks: computeWeeks(normalized, ym),
      packer: computePacker(normalized),
      meetings: computeMeetings(normalized),
      mrVisits: computeMrVisits(normalized),
      contacts: computeContacts(normalized),
      trainings: computeTrainings(normalized),
      authors: computeAuthors(normalized)
    };
  }

  var api = { compute: compute };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.MonthlyReport = api;
  }
})(typeof window !== "undefined" ? window : this);
