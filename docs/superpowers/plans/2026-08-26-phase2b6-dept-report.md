# 薬局業務日誌 フェーズ2b-6：部門長会議報告書 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 年度単位(4月始まり)で1年分の実績をまとめた部門長会議報告書を閲覧・印刷できるようにする。

**Architecture:** 月報(フェーズ2b-3)と同じく、集計ロジック(`src/model/dept-report.js`)と描画(`src/app/views/dept-report.js`)を分離する。病棟処方箋は月報と異なり枚数(dose)も必要なため、別の集計関数として実装する。`main.js`はツールバーに「部門長報告書」ボタンを追加し、月移動ツールバーを隠して年度・報告者選択と印刷ボタンに切り替える。

**Tech Stack:** 素の JavaScript(依存パッケージなし)

## Global Constraints

- **依存パッケージを追加しない。** フェーズ1・2a・2b-1〜2b-4と同じ方針
- **`src/model/daily-log.js` と `src/parse/` の既存モジュールは書き換えない**
- **報告者はFirestoreに保存しない。** 印刷する人がその場でプルダウンから選ぶだけの表示用項目
- **持参薬鑑別・1包化は4病棟(かりゆし/ゆいゆい/うりずん北/はいさい、うりずん南は対象外)に絞る。** このアプリ全体の規約に統一する(既存アプリの実装はこの絞り込みが無いように見えるが、それは踏襲しない)
- 画面はスマートフォンでも読めること。横スクロールはテーブル単位に閉じ込め、ページ全体を横スクロールさせない

設計の詳細は [フェーズ2b-6 設計書](../specs/2026-08-26-phase2b6-dept-report-design.md) を参照。

---

## File Structure

| ファイル | 責務 |
|---|---|
| `src/app/storage.js` (変更) | 年度単位で取得する `listLogsByFiscalYear` を追加 |
| `src/model/dept-report.js` | 集計ロジック(純粋関数) |
| `tests/dept-report.test.js` | 集計ロジックのテスト |
| `src/app/views/dept-report.js` | 部門長報告書の描画 |
| `src/app/main.js` (変更) | 「部門長報告書」ボタンでの画面切り替え |
| `index.html` (変更) | 部門長報告書用の器・ツールバー、スクリプト読み込み |
| `style.css` (変更) | 報告書の見た目、印刷用スタイル |

---

### Task 1: 年度単位のデータ取得

**Files:**
- Modify: `src/app/storage.js`

**Interfaces:**
- Consumes: なし
- Produces:
  - `Storage.listLogsByFiscalYear(fiscalYear: number): Promise<object[]>` — `{fiscalYear}-04-01` 〜 `{fiscalYear+1}-03-31` の日誌を日付昇順で返す

- [ ] **Step 1: 取得関数を追加する**

`src/app/storage.js` の `listLogsByMonth` の下に次を追加する。

```javascript
// 年度(4月始まり)単位でまとめて取得する。listLogsByMonth と同じ単一フィールド範囲検索。
async function listLogsByFiscalYear(fiscalYear) {
  var from = fiscalYear + "-04-01";
  var to = (fiscalYear + 1) + "-03-31";
  var snap = await getDocs(query(
    collection(db, LOGS),
    where("date", ">=", from),
    where("date", "<=", to),
    orderBy("date")
  ));
  var logs = [];
  snap.forEach(function (d) { logs.push(d.data()); });
  return logs;
}
```

エクスポートに加える。

```javascript
export {
  countLogs, saveLogs, saveMasters, getMasters, getLog,
  listLogsByMonth, saveLog, listLogsByFiscalYear
};
```

- [ ] **Step 2: 構文を確認する**

```bash
node -c src/app/storage.js
```

期待する結果: 何も出力せず終了する(構文エラーなし)。`listLogsByMonth` と同様、薄いFirestoreラッパーであり自動テストは持たない。

- [ ] **Step 3: コミットする**

```bash
git add src/app/storage.js
git commit -m "feat: add Storage.listLogsByFiscalYear for the department head report"
```

---

### Task 2: 部門長報告書の集計ロジック

**Files:**
- Create: `src/model/dept-report.js`
- Test: `tests/dept-report.test.js`

**Interfaces:**
- Consumes: `DailyLog.normalize` / `DailyLog.wardMedsFrom`(既存 `src/model/daily-log.js`、変更しない)
- Produces:
  - `DeptReport.compute(entries: object[], fiscalYear: number): object` — 詳細は下記の戻り値の形を参照。`entries` は `Storage.listLogsByFiscalYear` の戻り値をそのまま渡せる(内部で `normalize` する)

**戻り値の形:**

```
{
  fiscalYear,
  months: [{month, days, teikiCnt, teikiDose, rinjiCnt, rinjiDose, taiinCnt, taiinDose,
            totalCnt, totalDose, winjCnt, winjDose, opCnt, opDose, injCnt, injDose,
            wardMedsCnt, ippokaCnt, counsel}, ...12件(4月〜3月の順)],
  totals: { 上記と同じキー(monthを除く)の年度累計 },
  averages: { 上記と同じキー(days・monthを除く)の年度1日平均。年度の実日数が0ならnull },
  monthAverages: [{month, 上記と同じキー(days・monthを除く)}, ...12件。その月の実日数が0ならnull]
}
```

- [ ] **Step 1: 失敗するテストを書く**

`tests/dept-report.test.js` を作成する。

```javascript
var assert = require("assert");
var h = require("./helper.js");
var test = h.test;
var DeptReport = require("../src/model/dept-report.js");

// 2025年度(2025-04〜2026-03): 4月に2日分、5月に1日分の合成データで検証する。
var day1 = {
  date: "2025-04-10",
  rxOpCnt: 5, rxOpDose: 8, rxInjCnt: 1, rxInjDose: 2, counsel: 3,
  winjData: [{ ward: "かりゆし", cnt: 2, dose: 4 }],
  wardRx: [{
    name: "かりゆし",
    teiki: { cnt: 10, dose: 20 }, rinji: { cnt: 2, dose: 3 }, taiin: { cnt: 1, dose: 1 },
    meds: { cnt: 0, dose: 0 }, ippoka: { cnt: 0, dose: 0 }, total: { cnt: 13, dose: 24 }
  }]
};

var day2 = {
  date: "2025-04-15",
  rxOpCnt: 3, rxOpDose: 4, rxInjCnt: 0, rxInjDose: 0, counsel: 1,
  winjData: [{ ward: "かりゆし", cnt: 1, dose: 1 }],
  wardRx: [{
    name: "かりゆし",
    teiki: { cnt: 5, dose: 9 }, rinji: { cnt: 0, dose: 0 }, taiin: { cnt: 0, dose: 0 },
    meds: { cnt: 2, dose: 8 }, ippoka: { cnt: 1, dose: 4 }, total: { cnt: 5, dose: 9 }
  }]
};

var day3 = {
  date: "2025-05-01",
  rxOpCnt: 2, rxOpDose: 2, rxInjCnt: 1, rxInjDose: 1, counsel: 0
};

var report = DeptReport.compute([day1, day2, day3], 2025);

function monthRow(m) {
  return report.months.filter(function (r) { return r.month === m; })[0];
}
function monthAvgRow(m) {
  return report.monthAverages.filter(function (r) { return r.month === m; })[0];
}

test("buckets entries into their fiscal-year month, in April-to-March order", function () {
  assert.strictEqual(report.months.length, 12);
  assert.deepStrictEqual(report.months.map(function (r) { return r.month; }),
    [4, 5, 6, 7, 8, 9, 10, 11, 12, 1, 2, 3]);
  assert.strictEqual(monthRow(4).days, 2);
  assert.strictEqual(monthRow(5).days, 1);
  assert.strictEqual(monthRow(6).days, 0);
});

test("sums wardRx counts and doses for a month with entries", function () {
  var april = monthRow(4);
  assert.strictEqual(april.teikiCnt, 15);
  assert.strictEqual(april.teikiDose, 29);
  assert.strictEqual(april.rinjiCnt, 2);
  assert.strictEqual(april.rinjiDose, 3);
  assert.strictEqual(april.taiinCnt, 1);
  assert.strictEqual(april.taiinDose, 1);
  assert.strictEqual(april.totalCnt, 18);
  assert.strictEqual(april.totalDose, 33);
});

test("sums outpatient, ward-injection and counseling totals for a month", function () {
  var april = monthRow(4);
  assert.strictEqual(april.winjCnt, 3);
  assert.strictEqual(april.winjDose, 5);
  assert.strictEqual(april.opCnt, 8);
  assert.strictEqual(april.opDose, 12);
  assert.strictEqual(april.injCnt, 1);
  assert.strictEqual(april.injDose, 2);
  assert.strictEqual(april.counsel, 4);
});

test("limits wardMeds/ippoka totals to the four carried-medication wards", function () {
  var april = monthRow(4);
  assert.strictEqual(april.wardMedsCnt, 2);
  assert.strictEqual(april.ippokaCnt, 1);
});

test("computes fiscal-year totals across all twelve months", function () {
  assert.strictEqual(report.totals.days, 3);
  assert.strictEqual(report.totals.teikiCnt, 15);
  assert.strictEqual(report.totals.opCnt, 10);
  assert.strictEqual(report.totals.injCnt, 2);
  assert.strictEqual(report.totals.wardMedsCnt, 2);
});

test("computes fiscal-year averages using total days across the year", function () {
  assert.strictEqual(report.averages.teikiCnt, 15 / 3);
  assert.strictEqual(report.averages.opCnt, 10 / 3);
  assert.strictEqual(report.averages.injCnt, 2 / 3);
});

test("computes per-month averages using that month's own day count", function () {
  var aprilAvg = monthAvgRow(4);
  assert.strictEqual(aprilAvg.teikiCnt, 15 / 2);
  assert.strictEqual(aprilAvg.opCnt, 8 / 2);
  var mayAvg = monthAvgRow(5);
  assert.strictEqual(mayAvg.teikiCnt, 0);
  assert.strictEqual(mayAvg.opCnt, 2);
});

test("returns null averages for a month with no entries", function () {
  var juneAvg = monthAvgRow(6);
  assert.strictEqual(juneAvg.teikiCnt, null);
  assert.strictEqual(juneAvg.opCnt, null);
});

h.summary();
```

- [ ] **Step 2: テストを実行して失敗を確認する**

```bash
node tests/dept-report.test.js
```

期待する結果: `Cannot find module '../src/model/dept-report.js'` で異常終了する。

- [ ] **Step 3: 集計ロジックを実装する**

`src/model/dept-report.js` を作成する。

```javascript
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
```

- [ ] **Step 4: テストを実行して成功を確認する**

```bash
node tests/dept-report.test.js
```

期待する結果: 8件すべて `OK:` で `--- 8 passed, 0 failed ---`。

- [ ] **Step 5: コミットする**

```bash
git add src/model/dept-report.js tests/dept-report.test.js
git commit -m "feat: add department head report aggregation logic"
```

---

### Task 3: 部門長報告書の描画

**Files:**
- Create: `src/app/views/dept-report.js`

**Interfaces:**
- Consumes: `DeptReport.compute` の戻り値の形(Task 2)
- Produces:
  - `DeptReportView.render(container: Element, report: object, meta: {author: string})` — `compute()` の戻り値をHTMLとして描画する

このタスクではまだ `index.html` / `main.js` に配線しない(Task 4で行う)。

- [ ] **Step 1: `src/app/views/dept-report.js` を作成する**

```javascript
(function (root) {
  "use strict";

  var MO_LABELS = {
    4: "４月", 5: "５月", 6: "６月", 7: "７月", 8: "８月", 9: "９月",
    10: "１０月", 11: "１１月", 12: "１２月", 1: "１月", 2: "２月", 3: "３月"
  };

  function esc(value) {
    return String(value === undefined || value === null ? "" : value)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function numFmt(v) {
    return v === 0 ? "0" : v.toLocaleString();
  }

  function fmtAvg(v) {
    return v === null || v === undefined ? "—" : v.toFixed(2);
  }

  function todayLabel() {
    var now = new Date();
    return now.getFullYear() + "年" + (now.getMonth() + 1) + "月" + now.getDate() + "日";
  }

  function wardRow(r) {
    return "<td>" + numFmt(r.teikiCnt) + "</td><td>" + numFmt(r.teikiDose) + "</td>" +
      "<td>" + numFmt(r.rinjiCnt) + "</td><td>" + numFmt(r.rinjiDose) + "</td>" +
      "<td>" + numFmt(r.taiinCnt) + "</td><td>" + numFmt(r.taiinDose) + "</td>" +
      "<td>" + numFmt(r.totalCnt) + "</td><td>" + numFmt(r.totalDose) + "</td>" +
      "<td>" + numFmt(r.winjCnt) + "</td><td>" + numFmt(r.winjDose) + "</td><td>" + numFmt(r.days) + "</td>";
  }

  function wardAvgRow(r) {
    return '<td class="avg">' + fmtAvg(r.teikiCnt) + '</td><td class="avg">' + fmtAvg(r.teikiDose) + "</td>" +
      '<td class="avg">' + fmtAvg(r.rinjiCnt) + '</td><td class="avg">' + fmtAvg(r.rinjiDose) + "</td>" +
      '<td class="avg">' + fmtAvg(r.taiinCnt) + '</td><td class="avg">' + fmtAvg(r.taiinDose) + "</td>" +
      '<td class="avg">' + fmtAvg(r.totalCnt) + '</td><td class="avg">' + fmtAvg(r.totalDose) + "</td>" +
      '<td class="avg">' + fmtAvg(r.winjCnt) + '</td><td class="avg">' + fmtAvg(r.winjDose) + "</td><td></td>";
  }

  function wardHead() {
    return '<tr><th class="left" rowspan="2">月</th><th colspan="2">定期処方箋</th><th colspan="2">臨時処方箋</th>' +
      '<th colspan="2">退院処方箋</th><th colspan="2">処方箋（合計）</th><th colspan="2">注射処方箋</th>' +
      '<th rowspan="2">実日数</th></tr>' +
      "<tr><th>枚数</th><th>調剤件数</th><th>枚数</th><th>調剤件数</th><th>枚数</th><th>調剤件数</th>" +
      "<th>枚数</th><th>調剤件数</th><th>枚数</th><th>調剤件数</th></tr>";
  }

  function wardSection(report) {
    var rows = report.months.map(function (r) {
      return '<tr><td class="lft">' + MO_LABELS[r.month] + "</td>" + wardRow(r) + "</tr>";
    }).join("");
    var t = report.totals;
    return '<div class="report-section"><div class="report-section-title">●病棟集計</div>' +
      '<div class="tbl-wrap"><table class="report-tbl"><thead>' + wardHead() + "</thead><tbody>" + rows +
      '<tr class="grandtotal"><td class="lft">累計</td>' +
      "<td>" + numFmt(t.teikiCnt) + "</td><td>" + numFmt(t.teikiDose) + "</td>" +
      "<td>" + numFmt(t.rinjiCnt) + "</td><td>" + numFmt(t.rinjiDose) + "</td>" +
      "<td>" + numFmt(t.taiinCnt) + "</td><td>" + numFmt(t.taiinDose) + "</td>" +
      "<td>" + numFmt(t.totalCnt) + "</td><td>" + numFmt(t.totalDose) + "</td>" +
      "<td>" + numFmt(t.winjCnt) + "</td><td>" + numFmt(t.winjDose) + "</td>" +
      "<td>" + numFmt(t.days) + "</td></tr>" +
      "</tbody></table></div></div>";
  }

  function wardAvgSection(report) {
    var rows = report.monthAverages.map(function (r) {
      return '<tr><td class="lft">' + MO_LABELS[r.month] + "</td>" + wardAvgRow(r) + "</tr>";
    }).join("");
    var a = report.averages;
    return '<div class="report-section"><div class="report-section-title">●病棟１日平均</div>' +
      '<div class="tbl-wrap"><table class="report-tbl"><thead>' + wardHead() + "</thead><tbody>" + rows +
      '<tr class="grandtotal"><td class="lft">平均</td>' +
      '<td class="avg">' + fmtAvg(a.teikiCnt) + '</td><td class="avg">' + fmtAvg(a.teikiDose) + "</td>" +
      '<td class="avg">' + fmtAvg(a.rinjiCnt) + '</td><td class="avg">' + fmtAvg(a.rinjiDose) + "</td>" +
      '<td class="avg">' + fmtAvg(a.taiinCnt) + '</td><td class="avg">' + fmtAvg(a.taiinDose) + "</td>" +
      '<td class="avg">' + fmtAvg(a.totalCnt) + '</td><td class="avg">' + fmtAvg(a.totalDose) + "</td>" +
      '<td class="avg">' + fmtAvg(a.winjCnt) + '</td><td class="avg">' + fmtAvg(a.winjDose) + "</td><td></td></tr>" +
      "</tbody></table></div></div>";
  }

  function outpatientSection(report) {
    var rows = report.months.map(function (r, i) {
      var avg = report.monthAverages[i];
      return '<tr><td class="lft" style="white-space:nowrap">' + MO_LABELS[r.month] + "</td>" +
        "<td>" + numFmt(r.injCnt) + '</td><td class="avg">' + fmtAvg(avg.injCnt) + "</td>" +
        "<td>" + numFmt(r.injDose) + '</td><td class="avg">' + fmtAvg(avg.injDose) + "</td>" +
        "<td>" + numFmt(r.opCnt) + '</td><td class="avg">' + fmtAvg(avg.opCnt) + "</td>" +
        "<td>" + numFmt(r.opDose) + '</td><td class="avg">' + fmtAvg(avg.opDose) + "</td></tr>";
    }).join("");
    var t = report.totals, a = report.averages;
    return '<div class="report-section" style="margin-bottom:0"><div class="report-section-title">●外来集計</div>' +
      '<div class="tbl-wrap"><table class="report-tbl" style="font-size:11px"><thead>' +
      '<tr><th class="left" rowspan="2" style="width:30px;white-space:nowrap">月</th>' +
      '<th colspan="4">外来注射処方箋</th><th colspan="4">外来処方箋（臨時）</th></tr>' +
      "<tr><th>枚数</th><th>枚数平均</th><th>件数</th><th>件数平均</th>" +
      "<th>枚数</th><th>枚数平均</th><th>件数</th><th>件数平均</th></tr></thead>" +
      "<tbody>" + rows +
      '<tr class="grandtotal"><td class="lft" style="white-space:nowrap">累計</td>' +
      "<td>" + numFmt(t.injCnt) + '</td><td class="avg">' + fmtAvg(a.injCnt) + "</td>" +
      "<td>" + numFmt(t.injDose) + '</td><td class="avg">' + fmtAvg(a.injDose) + "</td>" +
      "<td>" + numFmt(t.opCnt) + '</td><td class="avg">' + fmtAvg(a.opCnt) + "</td>" +
      "<td>" + numFmt(t.opDose) + '</td><td class="avg">' + fmtAvg(a.opDose) + "</td></tr>" +
      "</tbody></table></div></div>";
  }

  function otherSection(report) {
    var rows = report.months.map(function (r) {
      return '<tr><td class="lft" style="white-space:nowrap">' + MO_LABELS[r.month] + "</td>" +
        "<td>" + numFmt(r.wardMedsCnt) + "</td><td>" + numFmt(r.ippokaCnt) + "</td>" +
        "<td>" + numFmt(r.counsel) + "</td></tr>";
    }).join("");
    var t = report.totals;
    return '<div class="report-section" style="margin-bottom:0"><div class="report-section-title">●その他集計</div>' +
      '<div class="tbl-wrap"><table class="report-tbl" style="font-size:11px"><thead>' +
      '<tr><th class="left" style="white-space:nowrap">月</th><th>持参薬<br>鑑別件数</th>' +
      "<th>持参薬<br>１包化</th><th>薬剤管理<br>指導件数</th></tr></thead>" +
      "<tbody>" + rows +
      '<tr class="grandtotal"><td class="lft" style="white-space:nowrap">累計</td>' +
      "<td>" + numFmt(t.wardMedsCnt) + "</td><td>" + numFmt(t.ippokaCnt) + "</td>" +
      "<td>" + numFmt(t.counsel) + "</td></tr>" +
      "</tbody></table></div></div>";
  }

  function render(container, report, meta) {
    container.innerHTML =
      '<div class="report-wrap" id="print-area">' +
      '<div class="report-title">部門長会議報告書</div>' +
      '<div class="report-subtitle">' + report.fiscalYear + "年度　薬剤課</div>" +
      '<div class="report-meta"><span>部署名：薬剤課</span><span>報告者：' + esc(meta.author) +
      "</span><span>報告日：" + todayLabel() + "</span></div>" +
      wardSection(report) +
      wardAvgSection(report) +
      '<div style="display:grid;grid-template-columns:1fr auto;gap:1.5rem;margin-top:1rem;align-items:start">' +
      outpatientSection(report) + otherSection(report) +
      "</div></div>";
  }

  root.DeptReportView = { render: render };
})(typeof window !== "undefined" ? window : this);
```

`.report-tbl` を `.tbl-wrap` で包むのは既存の他画面(月報など)と同じ横スクロール対応(ページ全体ではなくテーブル単位で横スクロールさせる)ためで、既存アプリには無い追加。

- [ ] **Step 2: 構文を確認する**

```bash
node -c src/app/views/dept-report.js
```

期待する結果: 何も出力せず終了する(構文エラーなし)。他のビューファイルと同様、DOM組み立てコードのため自動テストは持たない。この時点ではどこからも読み込まれていないため、ブラウザでの動作確認は Task 4 で行う。

- [ ] **Step 3: コミットする**

```bash
git add src/app/views/dept-report.js
git commit -m "feat: add the department head report view"
```

---

### Task 4: 部門長報告書の配線

**Files:**
- Modify: `src/app/main.js`
- Modify: `index.html`
- Modify: `style.css`

**Interfaces:**
- Consumes: `Storage.listLogsByFiscalYear`(Task 1)、`Storage.countLogs` / `Storage.getMasters`(既存)、`DeptReport.compute`(Task 2)、`DeptReportView.render`(Task 3)
- Produces: ツールバーの「部門長報告書」ボタンから、年度・報告者を選んで報告書を表示し、印刷できる一連の画面遷移

- [ ] **Step 1: `index.html` に部門長報告書用の器・ツールバー・スクリプト読み込みを追加する**

メインツールバーに `id="mainToolbar"` を追加し、「部門長報告書」ボタンを足す。

```html
      <div class="toolbar" id="mainToolbar">
        <button id="prevMonthBtn" class="btn">◀</button>
        <span id="monthLabel" class="month-label"></span>
        <button id="nextMonthBtn" class="btn">▶</button>
        <button id="thisMonthBtn" class="btn">今月</button>
        <button id="reportToggleBtn" class="btn" style="margin-left:auto">月報</button>
        <button id="deptReportToggleBtn" class="btn">部門長報告書</button>
      </div>
```

`<div id="reportView" hidden></div>` の直後、`<details class="tools" id="toolsDetails">` の直前に、部門長報告書用のツールバーと器を追加する。

```html
      <div id="reportView" hidden></div>

      <div class="toolbar" id="deptReportToolbar" hidden>
        <button id="deptReportBackBtn" class="btn">◀ 一覧へ戻る</button>
        <span style="font-size:12px;color:#6B7280">年度</span>
        <select id="deptReportYearSel" class="text-input" style="width:auto"></select>
        <span style="font-size:12px;color:#6B7280">報告者</span>
        <select id="deptReportAuthorSel" class="text-input" style="width:auto"></select>
        <button id="deptReportPrintBtn" class="btn btn-primary" style="margin-left:auto">🖨 印刷</button>
      </div>

      <div id="deptReportView" hidden></div>

      <details class="tools" id="toolsDetails">
```

`</body>` 直前のスクリプト読み込みに `dept-report.js`(モデル)と `dept-report.js`(ビュー)を足す。

```html
  <script src="src/model/daily-log.js"></script>
  <script src="src/model/holidays.js"></script>
  <script src="src/model/month.js"></script>
  <script src="src/model/monthly-report.js"></script>
  <script src="src/model/dept-report.js"></script>
  <script src="src/parse/accum-csv.js"></script>
  <script src="src/app/views/list.js"></script>
  <script src="src/app/views/detail.js"></script>
  <script src="src/app/views/edit.js"></script>
  <script src="src/app/views/report.js"></script>
  <script src="src/app/views/masters.js"></script>
  <script src="src/app/views/dept-report.js"></script>
  <script type="module" src="src/app/main.js"></script>
```

- [ ] **Step 2: `main.js` に部門長報告書の画面切り替えを追加する**

グローバル変数に部門長報告書用の状態を追加する。既存の `var currentView = "list"; // "list" | "report"` の行を次のように変更する(2行追加するだけで、`currentView` の行自体は変更しない)。

```javascript
var currentView = "list"; // "list" | "report"
var deptReportCache = null; // compute() の戻り値。報告者切り替え時の再描画に使う
var deptReportInited = false;
```

`refreshStatus` / `loadMasters` / `handleMastersSave` 関数(既存)の直後に、次の関数を追加する。

```javascript
function fiscalYearOf(dateStr) {
  var y = Number(dateStr.split("-")[0]);
  var m = Number(dateStr.split("-")[1]);
  return m >= 4 ? y : y - 1;
}

function showDeptReport() {
  el("mainToolbar").hidden = true;
  el("monthNotice").hidden = true;
  el("listView").hidden = true;
  el("detailView").hidden = true;
  el("reportView").hidden = true;
  el("deptReportToolbar").hidden = false;
  el("deptReportView").hidden = false;

  if (!deptReportInited) {
    deptReportInited = true;
    initDeptReport();
  }
}

function backFromDeptReport() {
  el("deptReportToolbar").hidden = true;
  el("deptReportView").hidden = true;
  el("mainToolbar").hidden = false;
  showList();
}

async function initDeptReport() {
  el("deptReportView").innerHTML = '<div class="empty">読み込み中…</div>';
  try {
    var info = await Storage.countLogs();
    if (info.count === 0) {
      el("deptReportView").innerHTML = '<div class="card"><span class="err">データがありません。</span></div>';
      return;
    }

    var masters = await Storage.getMasters();
    var firstFY = fiscalYearOf(info.first);
    var lastFY = fiscalYearOf(info.last);
    var years = [];
    for (var y = lastFY; y >= firstFY; y--) years.push(y);

    el("deptReportYearSel").innerHTML = years.map(function (y) {
      return '<option value="' + y + '">' + y + "年度</option>";
    }).join("");
    el("deptReportAuthorSel").innerHTML = (masters.members || []).map(function (m) {
      return "<option>" + m + "</option>";
    }).join("");

    await loadDeptReport();
  } catch (err) {
    el("deptReportView").innerHTML = '<div class="card"><span class="err">読み取りに失敗しました: ' +
      describeError(err) + "</span></div>";
  }
}

async function loadDeptReport() {
  var fiscalYear = Number(el("deptReportYearSel").value);
  el("deptReportView").innerHTML = '<div class="empty">集計中…</div>';
  try {
    var logs = await Storage.listLogsByFiscalYear(fiscalYear);
    deptReportCache = window.DeptReport.compute(logs, fiscalYear);
    renderDeptReport();
  } catch (err) {
    el("deptReportView").innerHTML = '<div class="card"><span class="err">読み取りに失敗しました: ' +
      describeError(err) + "</span></div>";
  }
}

function renderDeptReport() {
  if (!deptReportCache) return;
  window.DeptReportView.render(el("deptReportView"), deptReportCache, {
    author: el("deptReportAuthorSel").value
  });
}
```

ツールバーのイベントリスナー群の末尾(`el("toolsDetails")...` の前)に、部門長報告書関連のリスナーを追加する。

```javascript
el("deptReportToggleBtn").addEventListener("click", showDeptReport);

el("deptReportBackBtn").addEventListener("click", backFromDeptReport);

el("deptReportYearSel").addEventListener("change", loadDeptReport);

el("deptReportAuthorSel").addEventListener("change", renderDeptReport);

el("deptReportPrintBtn").addEventListener("click", function () {
  window.print();
});
```

- [ ] **Step 3: スタイルを追加する**

`style.css` の末尾に追加する。

```css
/* 部門長会議報告書 */
.report-wrap{background:#fff;border:1px solid #D4D9E2;border-radius:10px;padding:2rem;box-shadow:0 1px 4px rgba(0,0,0,.06)}
.report-title{font-size:18px;font-weight:600;text-align:center;margin-bottom:.25rem}
.report-subtitle{font-size:13px;color:#6B7280;text-align:center;margin-bottom:1.5rem}
.report-meta{display:flex;justify-content:space-between;font-size:13px;margin-bottom:1.5rem;
  padding-bottom:.75rem;border-bottom:2px solid #1F2937}
.report-section{margin-bottom:1.5rem}
.report-section-title{font-size:13px;font-weight:600;background:#1F2937;color:#fff;padding:4px 10px;margin-bottom:.5rem}
.report-tbl{width:100%;border-collapse:collapse;font-size:12px}
.report-tbl th{background:#F4F6F9;padding:5px 8px;border:1px solid #C8D0DC;font-weight:500;
  text-align:center;white-space:nowrap}
.report-tbl th.left{text-align:left}
.report-tbl td{padding:5px 8px;border:1px solid #C8D0DC;text-align:right;font-variant-numeric:tabular-nums}
.report-tbl td.lft{text-align:left;font-weight:500}
.report-tbl tr.grandtotal td{background:#E8EDF4;font-weight:600}
.report-tbl .avg{color:#185FA5}

/* 印刷 */
@media print {
  body{background:#fff!important}
  .app-header,#mainToolbar,#monthNotice,#listView,#detailView,#reportView,
  #deptReportToolbar,.tools{display:none!important}
  .report-wrap{box-shadow:none;border:none;padding:0}
  .report-tbl{font-size:7.5px!important}
  .report-tbl th,.report-tbl td{padding:2px 3px!important}
  .report-section-title{font-size:9px!important;padding:2px 5px!important;margin-bottom:2px!important}
  .report-section{margin-bottom:6px!important;page-break-inside:avoid}
  .report-title{font-size:13px!important;margin-bottom:1px!important}
  .report-subtitle,.report-meta{font-size:9px!important;margin-bottom:4px!important}
  .report-meta{padding-bottom:3px!important}
  @page{margin:6mm;size:A4 portrait}
}
```

- [ ] **Step 4: 画面で確認する**

開発サーバを起動して確認する。

```bash
node scripts/dev-server.js
```

http://localhost:8430 を開き、ログインした状態で次を確かめる。

1. ツールバーに「部門長報告書」ボタンが表示される
2. クリックすると月移動ツールバーが隠れ、「◀ 一覧へ戻る」「年度」「報告者」「🖨 印刷」の専用ツールバーに切り替わる
3. 年度プルダウンにデータのある年度が並び、直近の年度が選ばれた状態で報告書が表示される
4. 「病棟集計」「病棟１日平均」「外来集計」「その他集計」の4セクションが表示される
5. 年度を切り替えると、その年度のデータで再集計される
6. 報告者を切り替えると、再取得なしで即座に「報告者：」の表示が変わる
7. 「◀ 一覧へ戻る」を押すと、月移動ツールバーと一覧表示に戻る
8. コンソールにエラーが出ていない
9. 表示幅を375pxにしても、各テーブルはカード内で横スクロールし、ページ全体は横スクロールしない
10. (印刷プレビューが確認できる場合)印刷プレビューでヘッダー・ツールバーが隠れ、報告書のみが表示される

- [ ] **Step 5: コミットする**

```bash
git add src/app/main.js index.html style.css
git commit -m "feat: wire up the department head report"
```

---

## フェーズ2b-6完了時の状態

- ツールバーの「部門長報告書」ボタンから、年度単位の集計を閲覧できる
- 病棟集計・病棟１日平均・外来集計・その他集計の4セクションが表示される
- 報告者をその場で選んで印刷できる
- 集計ロジックはNode単体テストで検証されている

## 次のフェーズ

- **フェーズ2b-5**: 他部署向け日報 — 保留中(再開時に着手)
- **フェーズ2b-7**: 更新履歴
- **フェーズ3**: 新規日の作成を含む自動取込(Excelテンプレート生成、Dropbox連携、GitHub Actions)
