# 薬局業務日誌 フェーズ2b-3：月報 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 月別一覧・詳細に続き、その月の日誌を集計した月報を閲覧できるようにする。

**Architecture:** 集計ロジック(`src/model/monthly-report.js`)と描画(`src/app/views/report.js`)を分離する。集計は既存`src/model/*`と同じ流儀(依存パッケージなし、Node/ブラウザ両対応)の純粋関数とし、Node単体テストを書く。`main.js`はツールバーの「月報」⇔「一覧」ボタンで、既に取得済みの月次ログを使い回して集計・描画を行う。

**Tech Stack:** 素の JavaScript(依存パッケージなし)

## Global Constraints

- **依存パッケージを追加しない。** フェーズ1・2a・2b-1・2b-2と同じ方針
- **`src/parse/` の既存モジュールは書き換えない**
- **`masters` コレクションへは一切アクセスしない。** 医師別・薬剤別集計はその月の実績のみから作る(0件の医師・薬剤は表示しない)。理由は設計書2節を参照
- **「部門長会議報告書」(年度単位の別集計)は対象外**
- 表示は既存 `pharmacy_logV2.6.html` の月報タブの見た目・カード構成・配色を踏襲する
- 画面はスマートフォンでも読めること。横スクロールはテーブル単位に閉じ込め、ページ全体を横スクロールさせない
- 月移動(◀/▶/今月)は、現在の表示(一覧 or 月報)を維持したまま該当月のデータを再読み込みする

設計の詳細は [フェーズ2b-3 設計書](../specs/2026-08-26-phase2b3-monthly-report-design.md) を参照。

---

## File Structure

| ファイル | 責務 |
|---|---|
| `src/model/monthly-report.js` | 集計ロジック(純粋関数) |
| `tests/monthly-report.test.js` | 集計ロジックのテスト |
| `src/app/views/report.js` | 月報の描画 |
| `src/app/main.js` (変更) | 「月報」⇔「一覧」の画面切り替え |
| `index.html` (変更) | `report.js` の読み込み、月報用コンテナ、切り替えボタン |
| `style.css` (変更) | 棒グラフ・変更率バー・週見出し等の見た目 |

---

### Task 1: 月報の集計ロジック

**Files:**
- Create: `src/model/monthly-report.js`
- Test: `tests/monthly-report.test.js`

**Interfaces:**
- Consumes: `DailyLog.normalize` / `DailyLog.wardMedsFrom` / `DailyLog.WARDS` / `DailyLog.INQ_TYPES` / `DailyLog.MEETING_TYPES` / `DailyLog.CONTACT_FROM` / `DailyLog.PACKER_UNITS`(すべて既存 `src/model/daily-log.js`、変更しない)
- Produces:
  - `MonthlyReport.compute(entries: object[], ym: {y, m}): object` — 詳細は下記の戻り値の形を参照。`entries` は `Storage.listLogsByMonth` の戻り値をそのまま渡せる(内部で `normalize` する)

**戻り値の形:**

```
{
  year, month, dayCount,
  rx: { opCnt, opDose, injCnt, injDose, winjCnt, winjDose, counsel },
  wardMeds: { list: [{ward,cnt,dose,ipCnt,ipDose}, ...4件], totalCnt, totalDose, totalIpCnt, totalIpDose },
  wardRx: { list: [{ward,teiki,rinji,taiin,meds,total}, ...5件], total: {teiki,rinji,taiin,meds,total} },
  avgTeikiPerDay, avgWardRxPerDay,
  dailyOp: [{date, dow, total, pct}, ...],
  inquiries: { total, changed, changeRate, byType: [{type,count}, ...], byDoctor: [{doctor,count,changed}, ...], unassigned, unassignedChanged },
  doctorChanges: { list: [{doctor,count}, ...], total },
  shortages: { list: [{name,qty}, ...], total },
  premixes: { list: [{drug,cnt}, ...] },
  dow: [{inj,winj,teiki,rinji,taiin,wardTotal,days}, ...7件(添字0=日曜〜6=土曜)],
  weeks: [entries[]またはnull, ...],
  packer: { tab: {分包紙,インク,清掃}, san: {分包紙,インク,清掃} },
  meetings: { list: [{type,dates:[]}, ...], total },
  mrVisits: [{company,memo,date}, ...],
  contacts: { list: [{from,count}, ...], total },
  trainings: { list: [{date,theme,lecturer,count}, ...], totalCount, totalPeople },
  authors: [{author,count,dates:[]}, ...]
}
```

- [ ] **Step 1: 失敗するテストを書く**

`tests/monthly-report.test.js` を作成する。

```javascript
var assert = require("assert");
var h = require("./helper.js");
var test = h.test;
var MonthlyReport = require("../src/model/monthly-report.js");

// 2026年8月: 8/1=土, 8/3=月, 8/4=火, 8/10=月。3日分の合成データで検証する。
var day1 = {
  date: "2026-08-03", author: "田中",
  rxOpCnt: 10, rxOpDose: 20, rxInjCnt: 2, rxInjDose: 3, counsel: 1,
  winjData: [{ ward: "かりゆし", cnt: 2, dose: 3 }],
  wardRx: [{
    name: "かりゆし",
    teiki: { cnt: 5, dose: 9 }, rinji: { cnt: 1, dose: 1 }, taiin: { cnt: 0, dose: 0 },
    meds: { cnt: 2, dose: 8 }, ippoka: { cnt: 1, dose: 4 }, total: { cnt: 6, dose: 10 }
  }],
  inquiries: [
    { type: "用法", doctor: "佐藤", memo: "m1", changed: true },
    { type: "用量", doctor: "", memo: "m2", changed: false }
  ],
  doctorChanges: [{ doctor: "佐藤", cnt: 3 }],
  shortages: [{ name: "薬A", qty: 5 }],
  premixes: [{ drug: "予製X", cnt: 2 }],
  packerData: { tab: { "分包紙": 1, "インク": 0, "清掃": true }, san: { "分包紙": 0, "インク": 2, "清掃": false } },
  meetings: [{ type: "感染" }],
  mrVisits: [{ company: "東和", memo: "訪問1" }],
  contacts: [{ from: "医師", memo: "問い合わせ1" }],
  trainings: [{ theme: "研修A", lecturer: "講師1", count: 5 }]
};

var day2 = {
  date: "2026-08-04", author: "田中",
  rxOpCnt: 8, rxOpDose: 15, rxInjCnt: 1, rxInjDose: 1, counsel: 0,
  winjData: [{ ward: "かりゆし", cnt: 1, dose: 1 }],
  wardRx: [{
    name: "かりゆし",
    teiki: { cnt: 3, dose: 5 }, rinji: { cnt: 0, dose: 0 }, taiin: { cnt: 1, dose: 1 },
    meds: { cnt: 0, dose: 0 }, ippoka: { cnt: 0, dose: 0 }, total: { cnt: 4, dose: 6 }
  }],
  inquiries: [{ type: "用法", doctor: "佐藤", memo: "m3", changed: false }],
  premixes: [{ drug: "予製X", cnt: 1 }],
  contacts: [{ from: "病棟", memo: "問い合わせ2" }]
};

var day3 = {
  date: "2026-08-10", author: "鈴木",
  rxOpCnt: 5, rxOpDose: 5, rxInjCnt: 0, rxInjDose: 0, counsel: 2
};

var report = MonthlyReport.compute([day1, day2, day3], { y: 2026, m: 8 });

test("computes rx totals across the month", function () {
  assert.strictEqual(report.dayCount, 3);
  assert.deepStrictEqual(report.rx, {
    opCnt: 23, opDose: 40, injCnt: 3, injDose: 4, winjCnt: 3, winjDose: 4, counsel: 3
  });
});

test("computes wardMeds totals for the four carried-medication wards, excluding うりずん南", function () {
  assert.strictEqual(report.wardMeds.list.length, 4);
  assert.deepStrictEqual(report.wardMeds.list.map(function (w) { return w.ward; }),
    ["かりゆし", "ゆいゆい", "うりずん北", "はいさい"]);
  var kariyushi = report.wardMeds.list[0];
  assert.deepStrictEqual(kariyushi, { ward: "かりゆし", cnt: 2, dose: 8, ipCnt: 1, ipDose: 4 });
  assert.strictEqual(report.wardMeds.totalCnt, 2);
  assert.strictEqual(report.wardMeds.totalIpCnt, 1);
});

test("computes wardRx cnt-only totals per ward and the grand total", function () {
  assert.strictEqual(report.wardRx.list.length, 5);
  var kariyushi = report.wardRx.list.filter(function (w) { return w.ward === "かりゆし"; })[0];
  assert.deepStrictEqual(kariyushi, { ward: "かりゆし", teiki: 8, rinji: 1, taiin: 1, meds: 2, total: 10 });
  assert.deepStrictEqual(report.wardRx.total, { teiki: 8, rinji: 1, taiin: 1, meds: 2, total: 10 });
});

test("computes average teiki and wardRx per day", function () {
  assert.strictEqual(report.avgTeikiPerDay, 8 / 3);
  assert.strictEqual(report.avgWardRxPerDay, 10 / 3);
});

test("computes inquiries totals, by-type, by-doctor and change rate", function () {
  assert.strictEqual(report.inquiries.total, 3);
  assert.strictEqual(report.inquiries.changed, 1);
  assert.strictEqual(report.inquiries.changeRate, 33);
  var byType = {};
  report.inquiries.byType.forEach(function (t) { byType[t.type] = t.count; });
  assert.strictEqual(byType["用法"], 2);
  assert.strictEqual(byType["用量"], 1);
  assert.strictEqual(report.inquiries.byDoctor.length, 1);
  assert.deepStrictEqual(report.inquiries.byDoctor[0], { doctor: "佐藤", count: 2, changed: 1 });
});

test("counts inquiries with no doctor selected separately", function () {
  assert.strictEqual(report.inquiries.unassigned, 1);
  assert.strictEqual(report.inquiries.unassignedChanged, 0);
});

test("computes doctor changes from daily input", function () {
  assert.deepStrictEqual(report.doctorChanges.list, [{ doctor: "佐藤", count: 3 }]);
  assert.strictEqual(report.doctorChanges.total, 3);
});

test("computes shortages by drug", function () {
  assert.deepStrictEqual(report.shortages.list, [{ name: "薬A", qty: 5 }]);
  assert.strictEqual(report.shortages.total, 1);
});

test("computes premixes by drug, sorted by count", function () {
  assert.deepStrictEqual(report.premixes.list, [{ drug: "予製X", cnt: 3 }]);
});

test("builds day-of-week breakdown using local dates", function () {
  // 8/3, 8/10 は月曜(dow=1)、8/4 は火曜(dow=2)
  assert.deepStrictEqual(report.dow[1], { inj: 2, winj: 2, teiki: 5, rinji: 1, taiin: 0, wardTotal: 6, days: 2 });
  assert.deepStrictEqual(report.dow[2], { inj: 1, winj: 1, teiki: 3, rinji: 0, taiin: 1, wardTotal: 4, days: 1 });
  assert.strictEqual(report.dow[0].days, 0);
});

test("groups entries into weeks, leaving empty weeks as null", function () {
  // 2026-08-01は土曜(月初の曜日=6)。8/3,8/4は第2週(添字1)、8/10は第3週(添字2)。第1週(添字0)は空。
  assert.strictEqual(report.weeks.length, 3);
  assert.strictEqual(report.weeks[0], null);
  assert.strictEqual(report.weeks[1].length, 2);
  assert.strictEqual(report.weeks[1][0].date, "2026-08-03");
  assert.strictEqual(report.weeks[2].length, 1);
  assert.strictEqual(report.weeks[2][0].date, "2026-08-10");
});

test("computes packer maintenance totals", function () {
  assert.deepStrictEqual(report.packer, {
    tab: { "分包紙": 1, "インク": 0, "清掃": 1 },
    san: { "分包紙": 0, "インク": 2, "清掃": 0 }
  });
});

test("computes meetings, MR visits, contacts and trainings", function () {
  assert.deepStrictEqual(report.meetings.list, [{ type: "感染", dates: ["2026-08-03"] }]);
  assert.strictEqual(report.meetings.total, 1);
  assert.deepStrictEqual(report.mrVisits, [{ company: "東和", memo: "訪問1", date: "2026-08-03" }]);
  var byFrom = {};
  report.contacts.list.forEach(function (c) { byFrom[c.from] = c.count; });
  assert.strictEqual(byFrom["医師"], 1);
  assert.strictEqual(byFrom["病棟"], 1);
  assert.strictEqual(report.contacts.total, 2);
  assert.deepStrictEqual(report.trainings.list,
    [{ date: "2026-08-03", theme: "研修A", lecturer: "講師1", count: 5 }]);
  assert.strictEqual(report.trainings.totalPeople, 5);
});

test("computes author breakdown sorted by day count", function () {
  assert.deepStrictEqual(report.authors[0], { author: "田中", count: 2, dates: ["2026-08-03", "2026-08-04"] });
  assert.deepStrictEqual(report.authors[1], { author: "鈴木", count: 1, dates: ["2026-08-10"] });
});

test("computes the daily bar-chart percentages relative to the month's max", function () {
  assert.strictEqual(report.dailyOp.length, 3);
  var byDate = {};
  report.dailyOp.forEach(function (d) { byDate[d.date] = d; });
  assert.strictEqual(byDate["2026-08-03"].total, 12);
  assert.strictEqual(byDate["2026-08-03"].pct, 100);
  assert.strictEqual(byDate["2026-08-04"].pct, 75);
  assert.strictEqual(byDate["2026-08-10"].pct, 42);
});

test("returns zeroed totals for a month with no entries", function () {
  var empty = MonthlyReport.compute([], { y: 2026, m: 8 });
  assert.strictEqual(empty.dayCount, 0);
  assert.strictEqual(empty.rx.opCnt, 0);
  assert.strictEqual(empty.avgTeikiPerDay, 0);
  assert.deepStrictEqual(empty.weeks, []);
  assert.deepStrictEqual(empty.authors, []);
});

h.summary();
```

- [ ] **Step 2: テストを実行して失敗を確認する**

```bash
node tests/monthly-report.test.js
```

期待する結果: `Cannot find module '../src/model/monthly-report.js'` で異常終了する。

- [ ] **Step 3: 集計ロジックを実装する**

`src/model/monthly-report.js` を作成する。

```javascript
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
```

- [ ] **Step 4: テストを実行して成功を確認する**

```bash
node tests/monthly-report.test.js
```

期待する結果: 16件すべて `OK:` で `--- 16 passed, 0 failed ---`。

- [ ] **Step 5: コミットする**

```bash
git add src/model/monthly-report.js tests/monthly-report.test.js
git commit -m "feat: add monthly report aggregation logic"
```

---

### Task 2: 月報の描画

**Files:**
- Create: `src/app/views/report.js`

**Interfaces:**
- Consumes: `MonthlyReport.compute` の戻り値の形(Task 1)、`window.Month.DOW_LABELS`(既存 `src/model/month.js`)
- Produces:
  - `ReportView.render(container: Element, report: object)` — `compute()` の戻り値をHTMLとして描画する

このタスクではまだ `index.html` / `main.js` に配線しない(Task 3で行う)。

- [ ] **Step 1: `src/app/views/report.js` を作成する**

```javascript
(function (root) {
  "use strict";

  var DOW_ORDER = [1, 2, 3, 4, 5, 6, 0]; // 月〜日の表示順(添字は0=日〜6=土のcompute側インデックス)
  var WARD_NAMES_MEDS = ["かりゆし", "ゆいゆい", "うりずん北", "はいさい"]; // 持参薬鑑別の対象病棟(うりずん南は対象外)

  function esc(value) {
    return String(value === undefined || value === null ? "" : value)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function card(title, body, extraClass, titleClass) {
    return '<div class="card ' + (extraClass || "") + '">' +
      '<div class="sec-title ' + (titleClass || "") + '">' + title + "</div>" + body + "</div>";
  }

  function table(head, rows) {
    return '<div class="tbl-wrap"><table class="tbl"><thead><tr>' + head +
      "</tr></thead><tbody>" + rows + "</tbody></table></div>";
  }

  function fmt1(value) {
    return value.toFixed(1);
  }

  function statGrid(report) {
    var stats = [
      [report.rx.opCnt, "外来処方箋 合計"],
      [report.rx.injCnt, "外来注射箋 合計"],
      [report.rx.winjCnt, "病棟注射箋 合計"],
      [report.rx.counsel, "服薬指導 合計"],
      [report.inquiries.total, "疑義照会 合計"],
      [report.wardMeds.totalCnt, "持参薬鑑別 合計"],
      [report.wardMeds.totalIpCnt, "持参薬1包化 合計"],
      [report.wardRx.total.total, "病棟処方箋 合計"],
      [report.dayCount, "入力日数"],
      [report.dayCount ? fmt1(report.avgTeikiPerDay) : "—", "病棟定期 平均（/日）"],
      [report.dayCount ? fmt1(report.avgWardRxPerDay) : "—", "病棟処方箋 平均（/日）"]
    ];
    return '<div class="stat-grid">' + stats.map(function (s) {
      return '<div class="stat-card"><div class="val">' + s[0] +
        '</div><div class="lbl2">' + s[1] + "</div></div>";
    }).join("") + "</div>";
  }

  function rxSection(report) {
    var r = report.rx;
    return card("処方箋受付 区分別合計", table(
      '<th>区分</th><th class="num">枚数</th><th class="num">件数</th>',
      "<tr><td>外来処方箋</td><td class=\"num\">" + r.opCnt + '</td><td class="num">' + r.opDose + "</td></tr>" +
      "<tr><td>外来注射箋</td><td class=\"num\">" + r.injCnt + '</td><td class="num">' + r.injDose + "</td></tr>" +
      "<tr><td>病棟注射箋</td><td class=\"num\">" + r.winjCnt + '</td><td class="num">' + r.winjDose + "</td></tr>" +
      '<tr class="total"><td>合計</td><td class="num">' + (r.opCnt + r.injCnt + r.winjCnt) +
      '</td><td class="num">' + (r.opDose + r.injDose + r.winjDose) + "</td></tr>"
    ));
  }

  function dailyBarSection(report) {
    var rows = report.dailyOp.map(function (d) {
      var label = d.date.slice(5) + "(" + window.Month.DOW_LABELS[d.dow] + ")";
      return '<div class="bar-wrap"><span class="bar-lbl">' + label + '</span>' +
        '<div class="bar-track"><div class="bar-fill" style="width:' + d.pct + '%"></div></div>' +
        '<span class="bar-val">' + d.total + "</span></div>";
    }).join("");
    return card("日別 処方箋件数（外来）", rows);
  }

  function inquiriesSection(report) {
    var inq = report.inquiries;
    var typeRows = inq.byType.map(function (t) {
      return "<tr><td>" + esc(t.type) + '</td><td class="num">' + t.count + "</td></tr>";
    }).join("");
    return card("疑義照会 区分別 ＋ 処方変更率",
      '<div class="grid2" style="gap:.75rem">' +
      table('<th>区分</th><th class="num">件数</th>',
        typeRows + '<tr class="total"><td>合計</td><td class="num">' + inq.total + "</td></tr>") +
      '<div>' +
      '<div style="font-size:13px;margin-bottom:.5rem">処方変更あり：<strong>' + inq.changed +
      '</strong>件 ／ 全体：<strong>' + inq.total + '</strong>件</div>' +
      '<div class="change-rate-wrap"><div class="change-rate-bar">' +
      '<div class="change-rate-fill" style="width:' + inq.changeRate + '%"></div></div>' +
      '<span class="change-rate-lbl">' + inq.changeRate + '%</span></div>' +
      '<div style="font-size:11px;color:#6B7280;margin-top:.5rem">処方変更率：疑義照会のうち処方変更につながった割合</div>' +
      "</div></div>");
  }

  function inquiriesByDoctorSection(report) {
    var inq = report.inquiries;
    var rows = inq.byDoctor.map(function (d) {
      return "<tr><td>" + esc(d.doctor) + '</td><td class="num">' + d.count +
        '</td><td class="num">' + d.changed + "</td></tr>";
    }).join("");
    if (inq.unassigned > 0) {
      rows += "<tr><td>未選択</td><td class=\"num\">" + inq.unassigned +
        '</td><td class="num">' + inq.unassignedChanged + "</td></tr>";
    }
    return card("疑義照会 医師別集計", table(
      '<th>医師</th><th class="num">件数</th><th class="num">処方変更</th>',
      rows + '<tr class="total"><td>合計</td><td class="num">' + inq.total +
      '</td><td class="num">' + inq.changed + "</td></tr>"));
  }

  function shortagesSection(report) {
    var s = report.shortages;
    var rows = s.list.map(function (x) {
      return "<tr><td>" + esc(x.name) + '</td><td class="num">' + x.qty + "</td></tr>";
    }).join("");
    return card("欠品 薬剤別集計（計" + s.total + "件）",
      table('<th>薬品名</th><th class="num">数量</th>', rows), "card-red", "sec-title-red");
  }

  function doctorChangesSection(report) {
    var dc = report.doctorChanges;
    var rows = dc.list.map(function (x) {
      return "<tr><td>" + esc(x.doctor) + '</td><td class="num">' + x.count + "</td></tr>";
    }).join("");
    return card("処方変更 医師別集計（日次入力・計" + dc.total + "件）", table(
      '<th>医師</th><th class="num">処方変更件数</th>',
      rows + '<tr class="total"><td>合計</td><td class="num">' + dc.total + "</td></tr>"));
  }

  function wardMedsSection(report) {
    var wm = report.wardMeds;
    var rows = wm.list.map(function (w) {
      return "<tr><td>" + esc(w.ward) + '</td><td class="num">' + w.cnt +
        '</td><td class="num">' + w.dose + '</td><td class="num">' + w.ipCnt +
        '</td><td class="num">' + w.ipDose + "</td></tr>";
    }).join("");
    return card("持参薬鑑別・1包化 病棟別", table(
      '<th>病棟</th><th class="num">持参薬件数</th><th class="num">持参薬剤数</th>' +
      '<th class="num">1包化件数</th><th class="num">1包化剤数</th>',
      rows + '<tr class="total"><td>合計</td><td class="num">' + wm.totalCnt +
      '</td><td class="num">' + wm.totalDose + '</td><td class="num">' + wm.totalIpCnt +
      '</td><td class="num">' + wm.totalIpDose + "</td></tr>"), "card-green", "sec-title-green");
  }

  function premixesSection(report) {
    var rows = report.premixes.list.map(function (p) {
      return "<tr><td>" + esc(p.drug) + '</td><td class="num">' + p.cnt + "</td></tr>";
    }).join("");
    return card("予製 薬剤別", table('<th>薬剤</th><th class="num">個数</th>', rows));
  }

  function wardRxSection(report) {
    var rows = report.wardRx.list.map(function (w) {
      return "<tr><td>" + esc(w.ward) + '</td><td class="num">' + w.teiki +
        '</td><td class="num">' + w.rinji + '</td><td class="num">' + w.taiin +
        '</td><td class="num">' + w.meds + '</td><td class="num">' + w.total + "</td></tr>";
    }).join("");
    var t = report.wardRx.total;
    return card("病棟処方箋 病棟別×区分別", table(
      '<th>病棟</th><th class="num">定期</th><th class="num">臨時</th>' +
      '<th class="num">退院</th><th class="num">持参薬</th><th class="num">合計</th>',
      rows + '<tr class="total"><td>合計</td><td class="num">' + t.teiki +
      '</td><td class="num">' + t.rinji + '</td><td class="num">' + t.taiin +
      '</td><td class="num">' + t.meds + '</td><td class="num">' + t.total + "</td></tr>"),
      "card-green", "sec-title-green");
  }

  function dowSection(report) {
    var rows = DOW_ORDER.map(function (i) {
      var d = report.dow[i];
      var teikiAvg = d.days ? Math.round(d.teiki / d.days) : "—";
      var wardAvg = d.days ? Math.round(d.wardTotal / d.days) : "—";
      return "<tr><td>" + window.Month.DOW_LABELS[i] + '</td><td class="num">' + d.inj +
        '</td><td class="num">' + d.winj + '</td><td class="num">' + d.teiki +
        '</td><td class="num">' + d.rinji + '</td><td class="num">' + d.taiin +
        '</td><td class="num">' + d.wardTotal + '</td><td class="num">' + d.days +
        '</td><td class="num">' + teikiAvg + '</td><td class="num">' + wardAvg + "</td></tr>";
    }).join("");
    var totalTeikiAvg = report.dayCount ? Math.round(report.avgTeikiPerDay) : "—";
    var totalWardAvg = report.dayCount ? Math.round(report.avgWardRxPerDay) : "—";
    return card("曜日別 集計", '<div style="overflow-x:auto"><table class="tbl" style="min-width:680px">' +
      '<tr><th>曜日</th><th class="num">外来注射箋</th><th class="num">病棟注射箋</th>' +
      '<th class="num">病棟定期</th><th class="num">病棟臨時</th><th class="num">病棟退院</th>' +
      '<th class="num">病棟合計</th><th class="num">日数</th><th class="num">定期平均</th>' +
      '<th class="num">病棟平均</th></tr>' + rows +
      '<tr class="total"><td>合計</td><td class="num">' + report.rx.injCnt +
      '</td><td class="num">' + report.rx.winjCnt + '</td><td class="num">' + report.wardRx.total.teiki +
      '</td><td class="num">' + report.wardRx.total.rinji + '</td><td class="num">' + report.wardRx.total.taiin +
      '</td><td class="num">' + report.wardRx.total.total + '</td><td class="num">' + report.dayCount +
      '</td><td class="num">' + totalTeikiAvg + '</td><td class="num">' + totalWardAvg +
      "</td></tr></table></div>");
  }

  function weeksSection(report) {
    var body = report.weeks.map(function (week, wi) {
      if (!week || !week.length) return "";
      var rows = week.map(function (e) {
        // 持参薬鑑別はこのアプリ全体の規約どおり4病棟(うりずん南を除く)に絞って合計する。
        var wardMeds = window.DailyLog.wardMedsFrom(e.wardRx).filter(function (w) {
          return WARD_NAMES_MEDS.indexOf(w.ward) !== -1;
        });
        var wardMedsCnt = wardMeds.reduce(function (acc, w) { return acc + w.cnt; }, 0);
        var wardRxCnt = (e.wardRx || []).reduce(function (acc, w) { return acc + w.total.cnt; }, 0);
        return "<tr><td>" + e.date + "</td><td>" + window.Month.DOW_LABELS[localDow(e.date)] +
          '</td><td class="num">' + e.rxOpCnt + '</td><td class="num">' + e.rxInjCnt +
          '</td><td class="num">' + e.counsel + '</td><td class="num">' + (e.inquiries || []).length +
          '</td><td class="num">' + wardMedsCnt + '</td><td class="num">' + wardRxCnt + "</td></tr>";
      }).join("");
      return '<div style="margin-bottom:1rem"><div class="week-hdr">第' + (wi + 1) + "週（" +
        week[0].date + " 〜 " + week[week.length - 1].date + "）</div>" +
        table('<th>日付</th><th>曜日</th><th class="num">外来処方</th><th class="num">外来注射</th>' +
          '<th class="num">服薬指導</th><th class="num">疑義照会</th><th class="num">持参薬</th>' +
          '<th class="num">病棟処方</th>', rows) + "</div>";
    }).join("");
    return card("週別 詳細", body);
  }

  // src/model/monthly-report.js の localDow と同じ計算(依存を増やさないための小さな重複。
  // list.js/detail.js/main.js の esc() 重複と同じ、このプロジェクトの既存の流儀)。
  function localDow(dateStr) {
    var parts = dateStr.split("-");
    return new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2])).getDay();
  }

  function packerSection(report) {
    var p = report.packer;
    return card("分包機メンテナンス 月間集計", table(
      '<th>項目</th><th class="num">錠剤分包機</th><th class="num">散剤分包機</th>',
      "<tr><td>分包紙</td><td class=\"num\">" + p.tab["分包紙"] + '</td><td class="num">' + p.san["分包紙"] + "</td></tr>" +
      "<tr><td>インク</td><td class=\"num\">" + p.tab["インク"] + '</td><td class="num">' + p.san["インク"] + "</td></tr>" +
      "<tr><td>清掃</td><td class=\"num\">" + p.tab["清掃"] + "回</td><td class=\"num\">" + p.san["清掃"] + "回</td></tr>"));
  }

  function meetingsSection(report) {
    if (!report.meetings.total) return "";
    var rows = report.meetings.list.map(function (m) {
      return "<tr><td>" + esc(m.type) + '</td><td class="num">' + m.dates.length + "回</td>" +
        '<td style="font-size:11px;color:#6B7280">' +
        m.dates.map(function (d) { return d.slice(5); }).join("、") + "</td></tr>";
    }).join("");
    return card("会議 種別集計（計" + report.meetings.total + "回）",
      table('<th>種別</th><th class="num">回数</th><th>開催日</th>', rows));
  }

  function mrVisitsSection(report) {
    if (!report.mrVisits.length) return "";
    var rows = report.mrVisits.map(function (m) {
      return '<tr><td style="font-weight:500">' + esc(m.company || "—") + "</td>" +
        '<td style="font-size:12px;color:#6B7280">' + esc(m.memo || "—") + "</td>" +
        '<td class="num" style="font-size:11px">' + m.date.slice(5) + "</td></tr>";
    }).join("");
    return card("MR訪問（計" + report.mrVisits.length + "件）", table(
      '<th style="width:140px">会社</th><th>内容</th><th style="width:60px" class="num">日付</th>', rows));
  }

  function contactsSection(report) {
    if (!report.contacts.total) return "";
    var rows = report.contacts.list.map(function (c) {
      return "<tr><td>" + esc(c.from) + '</td><td class="num">' + c.count + "件</td></tr>";
    }).join("");
    return card("問い合わせ 区分別集計（計" + report.contacts.total + "件）", table(
      '<th>区分</th><th class="num">件数</th>',
      rows + '<tr class="total"><td>合計</td><td class="num">' + report.contacts.total + "件</td></tr>"));
  }

  function trainingsSection(report) {
    if (!report.trainings.totalCount) return "";
    var rows = report.trainings.list.map(function (t) {
      return '<tr><td style="font-size:11px">' + t.date + "</td><td>" + esc(t.theme || "—") +
        "</td><td>" + esc(t.lecturer || "—") + '</td><td class="num">' + (t.count || 0) + "名</td></tr>";
    }).join("");
    return card("研修会（" + report.trainings.totalCount + "回・参加合計" + report.trainings.totalPeople + "名）",
      table('<th>日付</th><th>テーマ</th><th style="width:120px">担当者</th>' +
        '<th style="width:70px" class="num">参加人数</th>', rows));
  }

  function authorsSection(report) {
    var rows = report.authors.map(function (a) {
      return "<tr><td>" + esc(a.author) + '</td><td class="num">' + a.count + "日</td>" +
        '<td style="font-size:11px;color:#6B7280">' + a.dates.join("、") + "</td></tr>";
    }).join("");
    return card("記入者別 集計", table('<th>記入者</th><th class="num">入力日数</th><th>入力日一覧</th>', rows));
  }

  function render(container, report) {
    if (!report.dayCount) {
      container.innerHTML = '<div class="no-data">この月のデータがありません<br>' +
        "<small>蓄積CSVを読み込んでからご確認ください</small></div>";
      return;
    }

    container.innerHTML =
      statGrid(report) +
      rxSection(report) +
      dailyBarSection(report) +
      inquiriesSection(report) +
      '<div class="grid2" style="gap:.75rem;margin-bottom:.75rem">' +
      inquiriesByDoctorSection(report) + shortagesSection(report) +
      "</div>" +
      doctorChangesSection(report) +
      '<div class="grid2" style="gap:.75rem;margin-bottom:.75rem">' +
      wardMedsSection(report) + premixesSection(report) +
      "</div>" +
      wardRxSection(report) +
      dowSection(report) +
      weeksSection(report) +
      packerSection(report) +
      meetingsSection(report) +
      mrVisitsSection(report) +
      contactsSection(report) +
      trainingsSection(report) +
      authorsSection(report);
  }

  root.ReportView = { render: render };
})(typeof window !== "undefined" ? window : this);
```

- [ ] **Step 2: 構文を確認する**

```bash
node -c src/app/views/report.js
```

期待する結果: 何も出力せず終了する(構文エラーなし)。`list.js` / `detail.js` / `edit.js` と同様、DOM組み立てコードのため自動テストは持たない。この時点ではどこからも読み込まれていないため、ブラウザでの動作確認は Task 3 で行う。

- [ ] **Step 3: コミットする**

```bash
git add src/app/views/report.js
git commit -m "feat: add the monthly report view"
```

---

### Task 3: 月報の配線

**Files:**
- Modify: `src/app/main.js`
- Modify: `index.html`
- Modify: `style.css`

**Interfaces:**
- Consumes: `MonthlyReport.compute`(Task 1)、`ReportView.render`(Task 2)
- Produces: ツールバーの「月報」⇔「一覧」ボタンで画面を切り替え、月移動を維持したまま月報が更新される一連の画面遷移

- [ ] **Step 1: `index.html` に月報用の器とボタン、スクリプト読み込みを追加する**

`<div id="signedIn">` 内のツールバーに月報ボタンを追加し、`#detailView` の下に `#reportView` を追加する。

```html
    <div id="signedIn" hidden>
      <div class="toolbar">
        <button id="prevMonthBtn" class="btn">◀</button>
        <span id="monthLabel" class="month-label"></span>
        <button id="nextMonthBtn" class="btn">▶</button>
        <button id="thisMonthBtn" class="btn">今月</button>
        <button id="reportToggleBtn" class="btn" style="margin-left:auto">月報</button>
      </div>

      <div id="monthNotice"></div>

      <div id="listView"></div>

      <div id="detailView" hidden></div>

      <div id="reportView" hidden></div>

      <details class="tools" id="toolsDetails">
```

`</body>` 直前のスクリプト読み込みに `monthly-report.js` と `report.js` を足す(`month.js` の次、`report.js` は `daily-log.js`・`month.js` の後ろならどこでもよいが、他のビューと並べて `edit.js` の次に置く)。

```html
  <script src="src/model/daily-log.js"></script>
  <script src="src/model/holidays.js"></script>
  <script src="src/model/month.js"></script>
  <script src="src/model/monthly-report.js"></script>
  <script src="src/parse/accum-csv.js"></script>
  <script src="src/app/views/list.js"></script>
  <script src="src/app/views/detail.js"></script>
  <script src="src/app/views/edit.js"></script>
  <script src="src/app/views/report.js"></script>
  <script type="module" src="src/app/main.js"></script>
```

- [ ] **Step 2: `main.js` に月報⇔一覧の切り替えを追加する**

`src/app/main.js` に以下の変更を行う。月報の集計・描画(`MonthlyReport.compute` / `ReportView.render`)はどちらも同期処理でFirestoreへの追加読み取りを行わないため、一覧取得(`loadMonth`)が既に持つ `loadSeq` の連番ガードだけで十分であり、月報側に別のガードを追加する必要はない。

まず変数宣言に `currentView` を追加する。

```javascript
var el = function (id) { return document.getElementById(id); };
var parsed = null;
var currentMonth = null;
var currentLogs = [];
var loadSeq = 0;
var statusLoaded = false;
var currentView = "list"; // "list" | "report"
```

`loadMonth` の中身を、一覧描画をビュー切り替え対応の関数に差し替える。現在の

```javascript
  window.ListView.render(el("listView"), ym, currentLogs, showDetail);
```

の行を、次のように変更する。

```javascript
  renderCurrentView(ym);
```

`loadMonth` 関数の直後(`showList` 関数の前)に、以下の関数を追加する。

```javascript
function renderCurrentView(ym) {
  if (currentView === "report") {
    el("reportView").innerHTML = '<div class="empty">集計中…</div>';
    var report = window.MonthlyReport.compute(currentLogs, ym);
    window.ReportView.render(el("reportView"), report);
  } else {
    window.ListView.render(el("listView"), ym, currentLogs, showDetail);
  }
}
```

`showList` 関数を、月報表示との切り替えに対応させる。

```javascript
function showList() {
  currentView = "list";
  el("reportToggleBtn").textContent = "月報";
  el("listView").hidden = false;
  el("detailView").hidden = true;
  el("reportView").hidden = true;
  el("monthNotice").hidden = false;
  loadMonth();
}
```

`showList` の直後に `showReport` を追加する。

```javascript
function showReport() {
  currentView = "report";
  el("reportToggleBtn").textContent = "一覧";
  el("listView").hidden = true;
  el("detailView").hidden = true;
  el("reportView").hidden = false;
  el("monthNotice").hidden = false;
  loadMonth();
}
```

ツールバーのイベントリスナー群の末尾(`el("toolsDetails")...` の前)に、月報ボタンのリスナーを追加する。

```javascript
el("reportToggleBtn").addEventListener("click", function () {
  if (currentView === "report") {
    showList();
  } else {
    showReport();
  }
});
```

- [ ] **Step 3: スタイルを追加する**

`style.css` の末尾に追加する。

```css
/* 月報 */
.grid2{display:grid;grid-template-columns:1fr 1fr;gap:.75rem}
.bar-wrap{display:flex;align-items:center;gap:8px;margin-bottom:4px}
.bar-lbl{font-size:11px;color:#6B7280;min-width:52px;text-align:right;flex-shrink:0}
.bar-track{flex:1;background:#EDF0F5;border-radius:4px;height:14px;overflow:hidden;min-width:0}
.bar-fill{height:100%;background:#378ADD;border-radius:4px;transition:width .3s}
.bar-val{font-size:11px;min-width:28px;color:#6B7280;font-variant-numeric:tabular-nums}
.week-hdr{font-size:11px;font-weight:500;color:#6B7280;padding:.25rem .6rem;background:#EEF1F7;
  border-radius:4px;margin-bottom:.5rem;letter-spacing:.04em;border-left:2px solid #93B4D8}
.change-rate-wrap{display:flex;align-items:center;gap:8px;margin-top:.5rem}
.change-rate-bar{flex:1;height:8px;background:#EDF0F5;border-radius:4px;overflow:hidden}
.change-rate-fill{height:100%;background:#DC2626;border-radius:4px}
.change-rate-lbl{font-size:12px;color:#DC2626;font-weight:500;min-width:36px}
.no-data{text-align:center;padding:2.5rem;color:#9CA3AF;font-size:13px}
```

`style.css` には既に `.card-red` / `.sec-title-red`(欠品セクションで使用)が定義済みであることを確認する(フェーズ2b-1で追加済み)。

- [ ] **Step 4: 画面で確認する**

開発サーバを起動して確認する。

```bash
node scripts/dev-server.js
```

http://localhost:8430 を開き、ログインした状態で次を確かめる。

1. ツールバー右端に「月報」ボタンが表示される
2. 2026年8月へ移動し、「月報」を押すと一覧が月報に切り替わり、ボタンのラベルが「一覧」になる
3. 統計カード・処方箋受付・日別棒グラフ・疑義照会区分別・疑義照会医師別・欠品・処方変更医師別・持参薬鑑別・予製・病棟処方箋・曜日別・週別・分包機・記入者別のカードが表示される
4. 月報表示中に「◀」で前月に移動すると、一覧に戻らず月報のまま前月分の集計に切り替わる
5. データの無い月に移動すると「この月のデータがありません」と表示される
6. 「一覧」ボタンで一覧表示に戻る
7. コンソールにエラーが出ていない
8. 表示幅を375pxにしても、各テーブルはカード内で横スクロールし、ページ全体は横スクロールしない(「週別詳細」「曜日別」は列数が多いため特に確認する)

- [ ] **Step 5: コミットする**

```bash
git add src/app/main.js index.html style.css
git commit -m "feat: wire up the monthly report toggle"
```

---

## フェーズ2b-3完了時の状態

- ツールバーの「月報」ボタンで、一覧⇔月報を切り替えられる
- 月報には既存アプリの月報タブと同じ18セクション(部門長会議報告書を除く)が表示される
- 月移動は現在の表示(一覧 or 月報)を維持したまま行われる
- 集計ロジックはNode単体テストで検証されている

## 次のフェーズ

- **フェーズ2b-4以降**: マスタ設定(医師名・予製品目・チェックリスト項目・記入者の編集)
- **フェーズ3**: 新規日の作成を含む自動取込(Excelテンプレート生成、Dropbox連携、GitHub Actions)、`submissions`・`checklist` の表示・編集
