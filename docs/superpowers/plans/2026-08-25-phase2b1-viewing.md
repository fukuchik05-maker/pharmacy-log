# 薬局業務日誌 フェーズ2b-1：閲覧画面 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Firestore に入っている97日分の日誌を、月ごとの一覧と1日分の詳細として閲覧できるようにする。

**Architecture:** 既存の `src/app/` に画面モジュールを足す。表示ロジックは既存 `pharmacy_logV2.6.html` の詳細表示をそのまま移植する。日付の計算と祝日判定は Firestore に依存しない純粋な関数として切り出し、フェーズ1と同じくテストで裏づける。編集機能はフェーズ2b-2 で追加するため、ここでは**読み取り専用**とする。

**Tech Stack:** Firebase JS SDK v10.8.0、素の JavaScript

## Global Constraints

- **依存パッケージを追加しない。** フェーズ1・2a と同じ方針
- **`src/model/` と `src/parse/` の既存モジュールは書き換えない**
- **表示は既存 `pharmacy_logV2.6.html` の見た目を踏襲する。** 配色・カード構成・バッジをそのまま使う
- **`wardMeds` は保存されていない。** 表示には `DailyLog.wardMedsFrom(log.wardRx)` を使って算出する
- **持参薬鑑別の病棟は4件** (`かりゆし` `ゆいゆい` `うりずん北` `はいさい`)。うりずん南は対象外。これは既存アプリの仕様に合わせる
- 画面はスマートフォンでも読めること。横スクロールはテーブル単位に閉じ込め、ページ全体を横スクロールさせない

---

## File Structure

| ファイル | 責務 |
|---|---|
| `src/model/holidays.js` | 祝日判定 (kin プロジェクトからの移植) |
| `src/model/month.js` | 月の日付一覧の生成、欠損日の判定 |
| `src/app/storage.js` (変更) | 月単位での日誌取得を追加 |
| `src/app/views/list.js` | 月別一覧の描画 |
| `src/app/views/detail.js` | 1日分の詳細の描画 |
| `src/app/main.js` (変更) | 画面の切り替えと月移動 |
| `index.html` (変更) | 一覧・詳細の器を追加 |
| `style.css` (変更) | 一覧表・統計カード・バッジの見た目 |

---

### Task 1: 祝日判定と月ユーティリティ

**Files:**
- Create: `src/model/holidays.js` (kin からコピー)
- Create: `src/model/month.js`
- Test: `tests/holidays.test.js` (kin からコピー)
- Test: `tests/month.test.js`

**Interfaces:**
- Consumes: なし
- Produces:
  - `Holidays.isHoliday(dateStr: string): string|null` — 祝日名、または null
  - `Month.daysOf(year: number, month: number): Array<{date, day, dow, dowLabel, isWeekend, holiday}>`
    — その月の全日。`dow` は 0=日曜。`holiday` は祝日名または null
  - `Month.shift(ym: {y, m}, delta: number): {y, m}` — 月を前後に移動する
  - `Month.label(ym: {y, m}): string` — `2026年8月` の形式
  - `Month.key(ym: {y, m}): {from: string, to: string}` — 月の初日と末日 (`2026-08-01` / `2026-08-31`)
  - `Month.missingDays(days, logsByDate): string[]` — 記録が無い平日 (祝日を除く) の日付

- [ ] **Step 1: 祝日モジュールを移植する**

kin プロジェクトから、すでに動作実績のあるモジュールとそのテストをそのままコピーする。

```bash
cp "C:/Users/GM/Desktop/csv/kin/holidays.js" src/model/holidays.js
cp "C:/Users/GM/Desktop/csv/kin/tests/holidays.test.js" tests/holidays.test.js
```

テスト側の読み込み先を新しい場所に合わせる。`tests/holidays.test.js` の先頭を次に書き換える。

```javascript
var Holidays = require("../src/model/holidays.js");
```

移植できたことを確認する。

```bash
node tests/holidays.test.js
```

期待する結果: すべて `OK:` で終わる。

- [ ] **Step 2: 月ユーティリティの失敗するテストを書く**

`tests/month.test.js` を作成する。

```javascript
var assert = require("assert");
var h = require("./helper.js");
var test = h.test;
var Month = require("../src/model/month.js");

test("daysOf returns every day of the month", function () {
  var days = Month.daysOf(2026, 8);
  assert.strictEqual(days.length, 31);
  assert.strictEqual(days[0].date, "2026-08-01");
  assert.strictEqual(days[30].date, "2026-08-31");
  var feb = Month.daysOf(2026, 2);
  assert.strictEqual(feb.length, 28);
});

test("daysOf marks weekends", function () {
  // 2026-08-01 は土曜日
  var days = Month.daysOf(2026, 8);
  assert.strictEqual(days[0].dow, 6);
  assert.strictEqual(days[0].dowLabel, "土");
  assert.strictEqual(days[0].isWeekend, true);
  assert.strictEqual(days[1].dowLabel, "日");
  assert.strictEqual(days[1].isWeekend, true);
  assert.strictEqual(days[2].dowLabel, "月");
  assert.strictEqual(days[2].isWeekend, false);
});

test("daysOf marks public holidays", function () {
  var days = Month.daysOf(2026, 8);
  var aug11 = days.filter(function (d) { return d.date === "2026-08-11"; })[0];
  assert.strictEqual(aug11.holiday, "山の日");
  var aug12 = days.filter(function (d) { return d.date === "2026-08-12"; })[0];
  assert.strictEqual(aug12.holiday, null);
});

test("shift moves across year boundaries", function () {
  assert.deepStrictEqual(Month.shift({ y: 2026, m: 8 }, 1), { y: 2026, m: 9 });
  assert.deepStrictEqual(Month.shift({ y: 2026, m: 12 }, 1), { y: 2027, m: 1 });
  assert.deepStrictEqual(Month.shift({ y: 2026, m: 1 }, -1), { y: 2025, m: 12 });
});

test("label and key format the month", function () {
  assert.strictEqual(Month.label({ y: 2026, m: 8 }), "2026年8月");
  assert.deepStrictEqual(Month.key({ y: 2026, m: 8 }), { from: "2026-08-01", to: "2026-08-31" });
  assert.deepStrictEqual(Month.key({ y: 2026, m: 2 }), { from: "2026-02-01", to: "2026-02-28" });
});

test("missingDays reports weekdays without a record", function () {
  var days = Month.daysOf(2026, 8);
  var logs = {};
  days.forEach(function (d) {
    // 平日はすべて記録済み、ただし 8/7 だけ欠けている状態を作る
    if (!d.isWeekend && !d.holiday && d.date !== "2026-08-07") logs[d.date] = true;
  });
  assert.deepStrictEqual(Month.missingDays(days, logs), ["2026-08-07"]);
});

test("missingDays ignores weekends and holidays", function () {
  var days = Month.daysOf(2026, 8);
  // 記録が1件も無い場合でも、土日と山の日は欠損として挙げない
  var missing = Month.missingDays(days, {});
  assert.strictEqual(missing.indexOf("2026-08-01"), -1); // 土
  assert.strictEqual(missing.indexOf("2026-08-02"), -1); // 日
  assert.strictEqual(missing.indexOf("2026-08-11"), -1); // 山の日
  assert.ok(missing.indexOf("2026-08-07") >= 0);         // 平日
});

h.summary();
```

- [ ] **Step 3: テストを実行して失敗を確認する**

```bash
node tests/month.test.js
```

期待する結果: `Cannot find module '../src/model/month.js'` で異常終了する。

- [ ] **Step 4: 月ユーティリティを実装する**

`src/model/month.js` を作成する。

```javascript
(function (root) {
  "use strict";

  var Holidays = (typeof require !== "undefined")
    ? require("./holidays.js")
    : root.Holidays;

  var DOW_LABELS = ["日", "月", "火", "水", "木", "金", "土"];

  function pad2(value) {
    return value < 10 ? "0" + value : "" + value;
  }

  function dateKey(year, month, day) {
    return year + "-" + pad2(month) + "-" + pad2(day);
  }

  function lastDayOf(year, month) {
    return new Date(year, month, 0).getDate();
  }

  function daysOf(year, month) {
    var days = [];
    var last = lastDayOf(year, month);
    for (var day = 1; day <= last; day++) {
      var key = dateKey(year, month, day);
      var dow = new Date(year, month - 1, day).getDay();
      days.push({
        date: key,
        day: day,
        dow: dow,
        dowLabel: DOW_LABELS[dow],
        isWeekend: dow === 0 || dow === 6,
        holiday: Holidays.isHoliday(key)
      });
    }
    return days;
  }

  function shift(ym, delta) {
    var index = ym.y * 12 + (ym.m - 1) + delta;
    return { y: Math.floor(index / 12), m: (index % 12) + 1 };
  }

  function label(ym) {
    return ym.y + "年" + ym.m + "月";
  }

  function key(ym) {
    return {
      from: dateKey(ym.y, ym.m, 1),
      to: dateKey(ym.y, ym.m, lastDayOf(ym.y, ym.m))
    };
  }

  function missingDays(days, logsByDate) {
    return days.filter(function (d) {
      if (d.isWeekend || d.holiday) return false;
      return !logsByDate[d.date];
    }).map(function (d) {
      return d.date;
    });
  }

  var api = {
    DOW_LABELS: DOW_LABELS,
    daysOf: daysOf,
    shift: shift,
    label: label,
    key: key,
    missingDays: missingDays
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.Month = api;
  }
})(typeof window !== "undefined" ? window : this);
```

- [ ] **Step 5: テストを実行して成功を確認する**

```bash
node tests/month.test.js
```

期待する結果: 6件すべて `OK:` で `--- 6 passed, 0 failed ---`。

- [ ] **Step 6: コミットする**

```bash
git add src/model/holidays.js src/model/month.js tests/holidays.test.js tests/month.test.js
git commit -m "feat: add holiday lookup and month calendar helpers"
```

---

### Task 2: 月単位のデータ取得

**Files:**
- Modify: `src/app/storage.js`

**Interfaces:**
- Consumes: `Month.key` (Task 1)
- Produces:
  - `Storage.listLogsByMonth(ym: {y, m}): Promise<object[]>` — その月の日誌を日付昇順で返す

ドキュメントIDと `date` フィールドが同じ値なので、`date` に対する範囲検索で month 単位に取得できる。
単一フィールドの範囲検索のため、複合インデックスの作成は不要。

- [ ] **Step 1: 取得関数を追加する**

`src/app/storage.js` の import 文に `where` を足す。

```javascript
import {
  getFirestore, collection, doc, getDoc, getDocs, setDoc, writeBatch,
  query, orderBy, limit, where, getCountFromServer
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
```

`getLog` の下に次を追加する。

```javascript
// 月単位でまとめて取得する。ドキュメントIDと date フィールドが同じ形式のため、
// date への範囲検索で足りる (複合インデックスは不要)。
async function listLogsByMonth(ym) {
  var range = window.Month.key(ym);
  var snap = await getDocs(query(
    collection(db, LOGS),
    where("date", ">=", range.from),
    where("date", "<=", range.to),
    orderBy("date")
  ));
  var logs = [];
  snap.forEach(function (d) { logs.push(d.data()); });
  return logs;
}
```

エクスポートに加える。

```javascript
export { countLogs, saveLogs, saveMasters, getLog, listLogsByMonth };
```

- [ ] **Step 2: コミットする**

```bash
git add src/app/storage.js
git commit -m "feat: fetch daily logs one month at a time"
```

---

### Task 3: 月別一覧画面

**Files:**
- Modify: `index.html`
- Modify: `style.css`
- Create: `src/app/views/list.js`
- Modify: `src/app/main.js`

**Interfaces:**
- Consumes: `Month.*` (Task 1)、`Storage.listLogsByMonth` (Task 2)、`window.DailyLog`
- Produces:
  - `ListView.render(container, ym, logs, onSelect)` — 一覧を描画する。`onSelect(date)` は行がクリックされたときに呼ばれる

一覧には、その月の**全日**を出す。記録の無い平日は警告として色を変える。土日祝は淡く表示する。

- [ ] **Step 1: 画面の器を足す**

`index.html` の `<div id="signedIn" hidden>` の中身を、次の構成に置き換える。
移行パネルは日常的には使わないため `<details>` で折りたたむ。

```html
    <div id="signedIn" hidden>
      <div class="toolbar">
        <button id="prevMonthBtn" class="btn">◀</button>
        <span id="monthLabel" class="month-label"></span>
        <button id="nextMonthBtn" class="btn">▶</button>
        <button id="thisMonthBtn" class="btn">今月</button>
      </div>

      <div id="monthNotice"></div>

      <div id="listView"></div>

      <div id="detailView" hidden></div>

      <details class="tools">
        <summary>データ管理</summary>
        <div class="card">
          <div class="sec-title">データの状況</div>
          <div id="dbStatus" class="hint">確認中…</div>
        </div>

        <div class="card card-amber">
          <div class="sec-title sec-title-amber">過去データの移行</div>
          <p class="hint">
            蓄積CSV (<code>pharmacy_accum_*.csv</code>) を選ぶと、その中身をデータベースへ取り込みます。
            同じ日付のデータが既にある場合は、選んだファイルの内容で置き換えます。
          </p>
          <input type="file" id="migrateFile" accept=".csv">
          <div id="migratePreview" class="hint"></div>
          <button id="migrateRunBtn" class="btn btn-success" disabled>取り込みを実行</button>
          <div id="migrateResult" class="hint"></div>
        </div>
      </details>
    </div>
```

`</body>` の直前のモジュール読み込みに、新しいファイルを足す。**読み込み順に意味がある**
(`month.js` は `holidays.js` を、`list.js` は `DailyLog` を参照する)。

```html
  <script src="src/model/daily-log.js"></script>
  <script src="src/model/holidays.js"></script>
  <script src="src/model/month.js"></script>
  <script src="src/parse/accum-csv.js"></script>
  <script src="src/app/views/list.js"></script>
  <script src="src/app/views/detail.js"></script>
  <script type="module" src="src/app/main.js"></script>
```

- [ ] **Step 2: スタイルを足す**

`style.css` の末尾に追加する。

```css
/* ツールバー */
.toolbar{display:flex;align-items:center;gap:8px;margin-bottom:1rem;flex-wrap:wrap}
.month-label{font-size:16px;font-weight:600;min-width:110px;text-align:center}

/* 一覧表 */
.tbl-wrap{overflow-x:auto;-webkit-overflow-scrolling:touch}
.tbl{width:100%;border-collapse:collapse;font-size:13px}
.tbl th{text-align:left;padding:7px 8px;font-weight:500;font-size:11px;color:#6B7280;
  border-bottom:1px solid #E0E5EE;letter-spacing:.04em;background:#F4F6F9;white-space:nowrap}
.tbl td{padding:7px 8px;border-bottom:1px solid #EDF0F5;color:#1F2937}
.tbl tr:last-child td{border-bottom:none}
.tbl .num{text-align:right;font-variant-numeric:tabular-nums}
.tbl .total td{background:#EEF3FA;font-weight:500}

.row-link{cursor:pointer}
.row-link:hover td{background:#EBF2FB}
.row-off td{color:#9CA3AF;background:#FAFBFD}
.row-missing td{background:#FEF3C7}
.dow-sat{color:#185FA5}
.dow-sun{color:#DC2626}
.holiday-name{font-size:11px;color:#DC2626;margin-left:4px}

/* バッジ */
.badge{display:inline-flex;align-items:center;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:500}
.b-blue{background:#E6F1FB;color:#0C447C}
.b-green{background:#D1FAE5;color:#065F46}
.b-amber{background:#FEF3C7;color:#92400E}
.b-red{background:#FEE2E2;color:#991B1B}
.b-purple{background:#EDE9FE;color:#5B21B6}
.b-teal{background:#CCFBF1;color:#134E4A}
.b-gray{background:#F3F4F6;color:#374151}

/* 統計カード */
.stat-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(110px,1fr));gap:8px;margin-bottom:1rem}
.stat-card{background:#fff;border-radius:8px;padding:.75rem 1rem;border:1px solid #D4D9E2;
  box-shadow:0 1px 3px rgba(0,0,0,.06)}
.stat-card .val{font-size:22px;font-weight:600;line-height:1.1}
.stat-card .lbl2{font-size:11px;color:#6B7280;margin-top:3px}

.card-green{border-left-color:#059669}
.sec-title-green{color:#059669}

/* 通知 */
.notice{border-radius:8px;padding:.625rem .875rem;margin-bottom:.75rem;font-size:12px}
.notice-warn{background:#FEF3C7;color:#92400E;border:1px solid #FDE68A}

/* 折りたたみツール */
.tools{margin-top:1.5rem}
.tools summary{cursor:pointer;font-size:12px;color:#6B7280;padding:.5rem 0}
.tools summary:hover{color:#185FA5}

.detail-head{display:flex;align-items:center;gap:10px;margin-bottom:1rem;flex-wrap:wrap}
.detail-title{font-size:16px;font-weight:600}
.author-line{font-size:12px;color:#9CA3AF;margin-top:.25rem;text-align:right}
.empty{font-size:13px;color:#6B7280;padding:1.5rem;text-align:center}
```

- [ ] **Step 3: 一覧の描画を実装する**

`src/app/views/list.js` を作成する。

```javascript
(function (root) {
  "use strict";

  function esc(value) {
    return String(value === undefined || value === null ? "" : value)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function sumWardRx(log) {
    return (log.wardRx || []).reduce(function (acc, w) {
      return acc + ((w.total && w.total.cnt) || 0);
    }, 0);
  }

  function sumWinj(log) {
    return (log.winjData || []).reduce(function (acc, w) {
      return acc + (w.cnt || 0);
    }, 0);
  }

  function dowClass(day) {
    if (day.holiday) return "dow-sun";
    if (day.dow === 0) return "dow-sun";
    if (day.dow === 6) return "dow-sat";
    return "";
  }

  function rowClass(day, log) {
    if (log) return "row-link";
    if (day.isWeekend || day.holiday) return "row-off";
    return "row-missing";
  }

  function render(container, ym, logs, onSelect) {
    var days = root.Month.daysOf(ym.y, ym.m);
    var byDate = {};
    logs.forEach(function (log) { byDate[log.date] = log; });

    var rows = days.map(function (day) {
      var log = byDate[day.date];
      var cells;

      if (log) {
        cells =
          '<td class="num">' + (log.rxOpCnt || 0) + "</td>" +
          '<td class="num">' + sumWardRx(log) + "</td>" +
          '<td class="num">' + sumWinj(log) + "</td>" +
          '<td class="num">' + ((log.inquiries || []).length) + "</td>" +
          "<td>" + esc(log.author) + "</td>";
      } else {
        var note = (day.isWeekend || day.holiday) ? "" : "記録なし";
        cells = '<td colspan="5" style="color:#92400E;font-size:12px">' + note + "</td>";
      }

      return '<tr class="' + rowClass(day, log) + '" data-date="' + day.date + '">' +
        '<td class="' + dowClass(day) + '">' + day.day + "日（" + day.dowLabel + "）" +
        (day.holiday ? '<span class="holiday-name">' + esc(day.holiday) + "</span>" : "") +
        "</td>" + cells + "</tr>";
    }).join("");

    container.innerHTML =
      '<div class="card"><div class="tbl-wrap"><table class="tbl">' +
      "<thead><tr><th>日付</th><th class=\"num\">外来処方箋</th><th class=\"num\">病棟処方箋</th>" +
      "<th class=\"num\">病棟注射箋</th><th class=\"num\">疑義照会</th><th>記入者</th></tr></thead>" +
      "<tbody>" + rows + "</tbody></table></div></div>";

    container.querySelectorAll("tr.row-link").forEach(function (tr) {
      tr.addEventListener("click", function () {
        onSelect(tr.getAttribute("data-date"));
      });
    });
  }

  root.ListView = { render: render };
})(typeof window !== "undefined" ? window : this);
```

- [ ] **Step 4: 画面の切り替えを実装する**

`src/app/main.js` を書き換える。認証と移行の処理は残し、月移動と一覧描画を足す。

```javascript
import * as Auth from "./auth.js";
import * as Storage from "./storage.js";
import * as Migrate from "./migrate.js";

var el = function (id) { return document.getElementById(id); };
var parsed = null;
var currentMonth = null;
var currentLogs = [];

function describeError(err) {
  return err && err.message ? err.message : String(err);
}

function today() {
  var now = new Date();
  return { y: now.getFullYear(), m: now.getMonth() + 1 };
}

function render(state) {
  var signedOut = state.status === "signedOut";
  var denied = state.status === "denied";
  var allowed = state.status === "allowed";

  el("signedOut").hidden = !signedOut;
  el("deniedPanel").hidden = !denied;
  el("signedIn").hidden = !allowed;
  el("signInBtn").hidden = !signedOut;
  el("signOutBtn").hidden = signedOut;

  el("userLabel").textContent = allowed ? state.email : "";

  if (denied) {
    el("deniedDetail").textContent =
      state.email + " ではアクセスできません。許可されたアカウントでログインし直してください。";
  }
  if (allowed) {
    if (!currentMonth) currentMonth = today();
    showList();
    refreshStatus();
  }
}

async function loadMonth() {
  el("monthLabel").textContent = window.Month.label(currentMonth);
  el("listView").innerHTML = '<div class="empty">読み込み中…</div>';
  el("monthNotice").innerHTML = "";

  try {
    currentLogs = await Storage.listLogsByMonth(currentMonth);
  } catch (err) {
    el("listView").innerHTML = '<div class="card"><span class="err">読み取りに失敗しました: ' +
      describeError(err) + "</span></div>";
    return;
  }

  window.ListView.render(el("listView"), currentMonth, currentLogs, showDetail);

  var byDate = {};
  currentLogs.forEach(function (log) { byDate[log.date] = log; });
  var missing = window.Month.missingDays(
    window.Month.daysOf(currentMonth.y, currentMonth.m), byDate);

  if (missing.length) {
    el("monthNotice").innerHTML = '<div class="notice notice-warn">記録の無い平日が' +
      missing.length + "日あります：" + missing.join("、") + "</div>";
  }
}

function showList() {
  el("listView").hidden = false;
  el("detailView").hidden = true;
  el("monthNotice").hidden = false;
  loadMonth();
}

function showDetail(date) {
  var log = currentLogs.filter(function (x) { return x.date === date; })[0];
  if (!log) return;
  el("listView").hidden = true;
  el("monthNotice").hidden = true;
  el("detailView").hidden = false;
  window.DetailView.render(el("detailView"), log, showList);
  window.scrollTo(0, 0);
}

async function refreshStatus() {
  el("dbStatus").textContent = "確認中…";
  try {
    var info = await Storage.countLogs();
    el("dbStatus").textContent = info.count === 0
      ? "データはまだありません。"
      : info.count + "件（" + info.first + " 〜 " + info.last + "）";
  } catch (err) {
    el("dbStatus").innerHTML = '<span class="err">読み取りに失敗しました: ' +
      describeError(err) + "</span>";
  }
}

el("prevMonthBtn").addEventListener("click", function () {
  currentMonth = window.Month.shift(currentMonth, -1);
  showList();
});

el("nextMonthBtn").addEventListener("click", function () {
  currentMonth = window.Month.shift(currentMonth, 1);
  showList();
});

el("thisMonthBtn").addEventListener("click", function () {
  currentMonth = today();
  showList();
});

el("signInBtn").addEventListener("click", function () {
  Auth.signIn().catch(function (err) {
    window.alert("ログインに失敗しました: " + describeError(err));
  });
});

el("signOutBtn").addEventListener("click", function () {
  Auth.signOut();
});

el("migrateFile").addEventListener("change", async function (event) {
  var file = event.target.files[0];
  parsed = null;
  el("migrateRunBtn").disabled = true;
  el("migrateResult").textContent = "";

  if (!file) {
    el("migratePreview").textContent = "";
    return;
  }

  el("migratePreview").textContent = "読み込み中…";
  try {
    var result = await Migrate.inspect(file);

    if (result.invalid.length) {
      el("migratePreview").innerHTML = '<span class="err">' +
        result.invalid.length + "件のレコードに問題があります。取り込みを中止しました。\n" +
        result.invalid.slice(0, 5).map(function (item) {
          return item.date + ": " + item.errors[0].field + " — " + item.errors[0].message;
        }).join("\n") + "</span>";
      return;
    }

    if (!result.logs.length) {
      el("migratePreview").innerHTML =
        '<span class="err">レコードが1件も読み取れませんでした。ファイルを確認してください。</span>';
      return;
    }

    parsed = result;
    var first = result.logs[0], last = result.logs[result.logs.length - 1];
    el("migratePreview").innerHTML = '<span class="ok">' +
      result.logs.length + "件を読み取りました（" + first.date + " 〜 " + last.date + "）。" +
      "医師" + result.masters.doctors.length + "名、予製" + result.masters.premixes.length + "品目。</span>";
    el("migrateRunBtn").disabled = false;
  } catch (err) {
    el("migratePreview").innerHTML = '<span class="err">読み込みに失敗しました: ' +
      describeError(err) + "</span>";
  }
});

el("migrateRunBtn").addEventListener("click", async function () {
  if (!parsed) return;
  el("migrateRunBtn").disabled = true;
  el("migrateResult").innerHTML = '<span class="progress">取り込み中… 0 / ' + parsed.logs.length + "</span>";

  try {
    var result = await Migrate.run(parsed, function (done, total) {
      el("migrateResult").innerHTML = '<span class="progress">取り込み中… ' + done + " / " + total + "</span>";
    });
    el("migrateResult").innerHTML = '<span class="ok">' + result.logs + "件を取り込みました。</span>";
    await refreshStatus();
    showList();
  } catch (err) {
    el("migrateResult").innerHTML = '<span class="err">取り込みに失敗しました: ' +
      describeError(err) + "</span>";
    el("migrateRunBtn").disabled = false;
  }
});

Auth.onChange(render);
```

- [ ] **Step 5: 画面で確認する**

開発サーバを起動して確認する。

```bash
node scripts/dev-server.js
```

http://localhost:8430 を開き、ログインした状態で次を確かめる。

1. 現在の月が表示される
2. 「◀」を押して **2026年8月** に移動すると、31日分の行が出る
3. 8/11 に「山の日」と赤字で表示される
4. 土日の行が淡色になっている
5. 8/7 の行が黄色（記録なし）になっている
6. 上部に「記録の無い平日が1日あります：2026-08-07」と出る
7. コンソールにエラーが出ていない

- [ ] **Step 6: コミットする**

```bash
git add index.html style.css src/app/views/list.js src/app/main.js
git commit -m "feat: browse daily logs month by month"
```

---

### Task 4: 日誌詳細の表示

既存 `pharmacy_logV2.6.html` の詳細表示 (2065行目以降) を移植する。
`wardMeds` は保存されていないため `DailyLog.wardMedsFrom` で算出する点だけが元と異なる。

**Files:**
- Create: `src/app/views/detail.js`

**Interfaces:**
- Consumes: `window.DailyLog`
- Produces:
  - `DetailView.render(container, log, onBack)` — 1日分を描画する。`onBack()` は戻るボタンで呼ばれる

- [ ] **Step 1: 詳細の描画を実装する**

`src/app/views/detail.js` を作成する。

```javascript
(function (root) {
  "use strict";

  var WARD_NAMES_MEDS = ["かりゆし", "ゆいゆい", "うりずん北", "はいさい"];

  var DRUG_LABELS = {
    adopt: { label: "採用", badge: "b-blue" },
    remove: { label: "削除", badge: "b-red" },
    expire: { label: "期限切れ", badge: "b-amber" },
    "return": { label: "返品", badge: "b-amber" },
    maintenance: { label: "メンテナンス", badge: "b-teal" }
  };

  var PACKER_NUM_ITEMS = ["分包紙", "インク"];
  var PACKER_CHK_ITEMS = ["清掃"];

  function esc(value) {
    return String(value === undefined || value === null ? "" : value)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function sum(list, pick) {
    return (list || []).reduce(function (acc, item) { return acc + (pick(item) || 0); }, 0);
  }

  function card(title, body, extraClass, titleClass) {
    return '<div class="card ' + (extraClass || "") + '">' +
      '<div class="sec-title ' + (titleClass || "") + '">' + title + "</div>" + body + "</div>";
  }

  function table(head, rows) {
    return '<div class="tbl-wrap"><table class="tbl"><thead><tr>' + head +
      "</tr></thead><tbody>" + rows + "</tbody></table></div>";
  }

  function statGrid(log, meds) {
    var stats = [
      [log.rxOpCnt || 0, "外来処方箋（枚）"],
      [log.rxInjCnt || 0, "外来注射箋（枚）"],
      [sum(log.winjData, function (w) { return w.cnt; }), "病棟注射箋（枚）"],
      [log.counsel || 0, "服薬指導"],
      [(log.inquiries || []).length, "疑義照会"],
      [sum(meds, function (w) { return w.cnt; }), "持参薬鑑別"],
      [sum(meds, function (w) { return w.ipCnt; }), "持参薬1包化"],
      [sum(log.wardRx, function (w) { return w.total.cnt; }), "病棟処方箋（件）"]
    ];
    return '<div class="stat-grid">' + stats.map(function (s) {
      return '<div class="stat-card"><div class="val">' + s[0] +
        '</div><div class="lbl2">' + s[1] + "</div></div>";
    }).join("") + "</div>";
  }

  function rxSection(log) {
    return card("処方箋受付", table(
      '<th>区分</th><th class="num">枚数</th><th class="num">件数</th>',
      '<tr><td>外来処方箋</td><td class="num">' + (log.rxOpCnt || 0) +
      '</td><td class="num">' + (log.rxOpDose || 0) + "</td></tr>" +
      '<tr><td>外来注射箋</td><td class="num">' + (log.rxInjCnt || 0) +
      '</td><td class="num">' + (log.rxInjDose || 0) + "</td></tr>" +
      '<tr class="total"><td>外来合計</td><td class="num">' +
      ((log.rxOpCnt || 0) + (log.rxInjCnt || 0)) + '</td><td class="num">' +
      ((log.rxOpDose || 0) + (log.rxInjDose || 0)) + "</td></tr>"
    ));
  }

  function winjSection(log) {
    var rows = (log.winjData || []).map(function (w) {
      return "<tr><td>" + esc(w.ward) + '</td><td class="num">' + (w.cnt || 0) +
        '</td><td class="num">' + (w.dose || 0) + "</td></tr>";
    }).join("");
    var totalCnt = sum(log.winjData, function (w) { return w.cnt; });
    var totalDose = sum(log.winjData, function (w) { return w.dose; });
    return card("病棟注射箋 病棟別", table(
      '<th>病棟</th><th class="num">枚数</th><th class="num">件数</th>',
      rows + '<tr class="total"><td>合計</td><td class="num">' + totalCnt +
      '</td><td class="num">' + totalDose + "</td></tr>"
    ));
  }

  function inquiriesSection(log) {
    var list = log.inquiries || [];
    if (!list.length) return "";
    var changed = list.filter(function (q) { return q.changed; }).length;
    var rows = list.map(function (q) {
      return '<tr><td><span class="badge b-purple">' + esc(q.type) + "</span></td>" +
        '<td style="font-size:12px">' + esc(q.doctor || "—") + "</td>" +
        '<td style="font-size:12px;color:#6B7280;white-space:pre-wrap">' + esc(q.memo || "—") + "</td>" +
        '<td style="text-align:center">' + (q.changed
          ? '<span class="badge b-red">あり</span>'
          : '<span class="badge b-gray">なし</span>') + "</td></tr>";
    }).join("");
    return card("疑義照会（" + list.length + "件・処方変更" + changed + "件）", table(
      '<th style="width:90px">区分</th><th style="width:100px">医師</th><th>内容</th>' +
      '<th style="width:70px;text-align:center">処方変更</th>', rows));
  }

  function doctorChangesSection(log) {
    var list = (log.doctorChanges || []).filter(function (x) { return x.cnt > 0; });
    if (!list.length) return "";
    var total = sum(list, function (x) { return x.cnt; });
    var rows = list.map(function (x) {
      return "<tr><td>" + esc(x.doctor) + '</td><td class="num">' + x.cnt + "</td></tr>";
    }).join("");
    return card("処方変更（医師別・合計" + total + "件）", table(
      '<th>医師</th><th class="num">処方変更件数</th>',
      rows + '<tr class="total"><td>合計</td><td class="num">' + total + "</td></tr>"));
  }

  function medsSection(meds) {
    var byWard = {};
    meds.forEach(function (m) { byWard[m.ward] = m; });
    var rows = WARD_NAMES_MEDS.map(function (name) {
      var w = byWard[name] || { cnt: 0, dose: 0, ipCnt: 0, ipDose: 0 };
      return "<tr><td>" + esc(name) + '</td><td class="num">' + w.cnt +
        '</td><td class="num">' + w.dose + '</td><td class="num">' + w.ipCnt +
        '</td><td class="num">' + w.ipDose + "</td></tr>";
    }).join("");
    var shown = WARD_NAMES_MEDS.map(function (n) { return byWard[n] || {}; });
    return card("持参薬鑑別 病棟別", table(
      '<th>病棟</th><th class="num">持参薬件数</th><th class="num">持参薬剤数</th>' +
      '<th class="num">1包化件数</th><th class="num">1包化剤数</th>',
      rows + '<tr class="total"><td>合計</td>' +
      '<td class="num">' + sum(shown, function (w) { return w.cnt; }) + "</td>" +
      '<td class="num">' + sum(shown, function (w) { return w.dose; }) + "</td>" +
      '<td class="num">' + sum(shown, function (w) { return w.ipCnt; }) + "</td>" +
      '<td class="num">' + sum(shown, function (w) { return w.ipDose; }) + "</td></tr>"
    ), "card-green", "sec-title-green");
  }

  function wardRxSection(log) {
    if (!log.wardRx || !log.wardRx.length) return "";
    var rows = log.wardRx.map(function (w) {
      return "<tr><td>" + esc(w.name) + '</td><td class="num">' + w.teiki.cnt +
        '</td><td class="num">' + w.rinji.cnt + '</td><td class="num">' + w.taiin.cnt +
        '</td><td class="num">' + w.meds.cnt + '</td><td class="num">' + w.total.cnt + "</td></tr>";
    }).join("");
    return card("病棟処方箋", table(
      '<th>病棟</th><th class="num">定期</th><th class="num">臨時</th>' +
      '<th class="num">退院</th><th class="num">持参薬</th><th class="num">合計</th>', rows),
      "card-green", "sec-title-green");
  }

  function premixSection(log) {
    var list = (log.premixes || []).filter(function (p) { return p.cnt > 0; });
    if (!list.length) return "";
    return card("予製", table('<th>薬剤</th><th class="num">個数</th>',
      list.map(function (p) {
        return "<tr><td>" + esc(p.drug) + '</td><td class="num">' + p.cnt + "</td></tr>";
      }).join("")));
  }

  function drugsSection(log) {
    if (!log.drugs || !log.drugs.length) return "";
    return card("薬剤管理", table('<th style="width:90px">区分</th><th>薬品名</th>',
      log.drugs.map(function (g) {
        var t = DRUG_LABELS[g.type] || { label: g.type, badge: "b-gray" };
        return '<tr><td><span class="badge ' + t.badge + '">' + esc(t.label) +
          "</span></td><td>" + esc(g.name || "—") + "</td></tr>";
      }).join("")));
  }

  function shortagesSection(log) {
    if (!log.shortages || !log.shortages.length) return "";
    return card("欠品", table('<th>薬品名</th><th class="num">数量</th>',
      log.shortages.map(function (s) {
        return "<tr><td>" + esc(s.name || "—") + '</td><td class="num">' + (s.qty || 0) + "</td></tr>";
      }).join("")), "card-red", "sec-title-red");
  }

  function packerSection(log) {
    var pd = log.packerData || {};
    var blocks = ["tab", "san"].map(function (type) {
      var unit = pd[type] || {};
      var lines = [];
      PACKER_NUM_ITEMS.forEach(function (item) {
        if ((unit[item] || 0) > 0) {
          lines.push('<div style="font-size:12px;color:#185FA5">● ' + item + "：" + unit[item] + "</div>");
        }
      });
      PACKER_CHK_ITEMS.forEach(function (item) {
        if (unit[item]) {
          lines.push('<div style="font-size:12px;color:#059669">✓ ' + item + "</div>");
        }
      });
      if (!lines.length) return "";
      var label = type === "tab" ? "錠剤分包機" : "散剤分包機";
      return '<div><div style="font-size:12px;font-weight:600;margin-bottom:4px">' +
        label + "</div>" + lines.join("") + "</div>";
    }).filter(Boolean);

    if (!blocks.length) return "";
    return card("分包機メンテナンス",
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:.5rem">' + blocks.join("") + "</div>");
  }

  function meetingsSection(log) {
    if (!log.meetings || !log.meetings.length) return "";
    return card("会議", '<div style="display:flex;flex-wrap:wrap;gap:6px">' +
      log.meetings.map(function (m) {
        return '<span class="badge b-blue">' + esc(m.type) + "</span>";
      }).join("") + "</div>");
  }

  function mrVisitsSection(log) {
    if (!log.mrVisits || !log.mrVisits.length) return "";
    return card("MR訪問", table('<th style="width:140px">会社</th><th>内容</th>',
      log.mrVisits.map(function (m) {
        return '<tr><td style="font-weight:500">' + esc(m.company || "—") + "</td>" +
          '<td style="font-size:12px;color:#6B7280;white-space:pre-wrap">' + esc(m.memo || "—") + "</td></tr>";
      }).join("")));
  }

  function contactsSection(log) {
    if (!log.contacts || !log.contacts.length) return "";
    return card("問い合わせ（" + log.contacts.length + "件）",
      table('<th style="width:80px">区分</th><th>内容</th>',
        log.contacts.map(function (c) {
          return '<tr><td><span class="badge b-amber">' + esc(c.from) + "</span></td>" +
            '<td style="font-size:12px;color:#6B7280;white-space:pre-wrap">' + esc(c.memo || "—") + "</td></tr>";
        }).join("")));
  }

  function trainingsSection(log) {
    if (!log.trainings || !log.trainings.length) return "";
    return card("研修会（" + log.trainings.length + "件）", table(
      '<th>テーマ</th><th style="width:120px">担当者</th><th style="width:70px" class="num">参加人数</th>',
      log.trainings.map(function (t) {
        return "<tr><td>" + esc(t.theme || "—") + "</td><td>" + esc(t.lecturer || "—") +
          '</td><td class="num">' + (t.count || 0) + "名</td></tr>";
      }).join("")));
  }

  function notesSection(log) {
    if (!log.notes) return "";
    return card("特記事項",
      '<div style="font-size:13px;white-space:pre-wrap;color:#4B5563">' + esc(log.notes) + "</div>");
  }

  function render(container, log, onBack) {
    var meds = root.DailyLog.wardMedsFrom(log.wardRx);

    container.innerHTML =
      '<div class="detail-head">' +
      '<button class="btn" id="detailBackBtn">◀ 一覧へ戻る</button>' +
      '<span class="detail-title">' + esc(log.date) + "</span></div>" +
      statGrid(log, meds) +
      rxSection(log) +
      winjSection(log) +
      inquiriesSection(log) +
      doctorChangesSection(log) +
      medsSection(meds) +
      wardRxSection(log) +
      premixSection(log) +
      drugsSection(log) +
      shortagesSection(log) +
      packerSection(log) +
      meetingsSection(log) +
      mrVisitsSection(log) +
      contactsSection(log) +
      trainingsSection(log) +
      notesSection(log) +
      '<div class="author-line">記入者：' + esc(log.author) + "</div>";

    container.querySelector("#detailBackBtn").addEventListener("click", onBack);
  }

  root.DetailView = { render: render };
})(typeof window !== "undefined" ? window : this);
```

- [ ] **Step 2: 画面で確認する**

http://localhost:8430 を開き、**2026年8月**へ移動して次を確かめる。

1. **8月21日** の行をクリックすると詳細が開く
2. 統計カードが8枚並ぶ
3. 「疑義照会（2件・処方変更0件）」が表示され、2行の内容が出る
4. 「MR訪問」に2件（東和、ダイコー）が出る
5. 「持参薬鑑別 病棟別」の はいさい 行が **持参薬件数1・持参薬剤数4**（`wardRx` から算出されている）
6. 「病棟処方箋」に5病棟が出る
7. 「◀ 一覧へ戻る」で一覧に戻る
8. コンソールにエラーが出ていない

- [ ] **Step 3: スマートフォン幅で確認する**

表示幅を 375px にして、**ページ全体が横スクロールしないこと**を確かめる。
テーブルは各カードの中で横スクロールする。

- [ ] **Step 4: コミットする**

```bash
git add src/app/views/detail.js
git commit -m "feat: show the full record for a single day"
```

---

## フェーズ2b-1完了時の状態

- 月ごとに日誌を一覧でき、記録の無い平日が警告として出る
- 土日・祝日が区別して表示される
- 1日分の詳細を、既存アプリと同じ見た目で閲覧できる
- スマートフォンからも読める

## 次のフェーズ

- **フェーズ2b-2**: 日誌の編集と保存、月報、マスタ設定
- **フェーズ3**: Excelテンプレート生成、Dropbox連携、GitHub Actions での自動取込
