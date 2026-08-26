# 病院システムCSV取込(フェーズ3-1) 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 病院システムが出力した日次CSV(`MMDD.csv`)をブラウザで選ぶと、その日の日誌ドキュメントの `wardRx`(病棟別処方箋データ)だけを Firestore へ直接書き込めるようにする。

**Architecture:** テスト可能な純粋コア(ファイル名 → 日付解決 + CSVパース)を UMD モジュール `src/app/hospital-import-core.js` に置き、`<script>` で `window` に公開する。Firestore に触れる薄い非同期ラッパー(`inspect` / `run`)は ES モジュール `src/app/hospital-import.js`(`migrate.js` と同じ継ぎ目)に置く。`storage.js` に `wardRx` だけを差し替える `saveWardRx` を足す。UI は「データ管理」パネルに、既存の蓄積CSV移行カードと同じ形のカードを1枚足し、配線は `main.js` のイベントハンドラで行う。

**Tech Stack:** 素の JavaScript(依存パッケージなし)。既存モジュール `src/parse/hospital-csv.js`(Shift-JIS/UTF-8 自動判別、2段ヘッダー)と `src/parse/filename.js`(`MMDD.csv` → `YYYY-MM-DD`)、Firebase Firestore(`storage.js` 経由)。テストは Node 標準 `assert` + `tests/helper.js`。

## Global Constraints

- **依存パッケージを一切追加しない**(`package.json` / `node_modules` なし)。
- **実患者データ入りの CSV / Excel は絶対にコミットしない**。`tests/fixtures/` 配下のダミーのみ許可。
- **Firestore 書き込みはすべてクライアント側**、ログインユーザー自身の権限で行う(サービスアカウント鍵を埋め込まない)。
- **Firebase Spark プラン(無料)を維持**、Cloud Functions は使わない。
- **`src/parse/hospital-csv.js` はバイト列**(`Uint8Array` / `Buffer`)を受け取る。テキストを渡さない。
- **既存モジュール `src/parse/hospital-csv.js`・`src/parse/filename.js`・`src/model/daily-log.js`・`src/app/migrate.js`・既存ビュー群は変更しない。**
- UMD モジュールは既存の `(function (root) { ... })(typeof window !== "undefined" ? window : this)` パターンに合わせる。
- 新しい CSS クラスは追加しない。既存の `.tbl` / `.tbl-wrap` / `.num` / `.ok` / `.err` / `.progress` / `.card-amber` / `.sec-title-amber` を再利用する。

設計の詳細は [フェーズ3-1 設計書](../specs/2026-08-27-phase3-hospital-csv-import-design.md) を参照。

---

## File Structure

| ファイル | 責務 |
|---|---|
| `src/app/hospital-import-core.js`(新規・UMD) | ファイル名から取込対象日を解決し、CSVバイト列をパースして `{date, wardRx, errors}` を返す純粋関数 `buildInspection`。Firestore に触れない |
| `src/app/hospital-import.js`(新規・ESM) | `inspect(file)` / `run(parsed)`。純粋コアを呼び、`storage.js` 経由で既存確認・書き込みを行う |
| `src/app/storage.js`(変更) | `saveWardRx(date, wardRx)` を追加。`wardRx` だけ差し替え、無い日は `emptyLog` を土台に新規作成 |
| `index.html`(変更) | `hospital-csv.js` / `filename.js` / `hospital-import-core.js` の `<script>` 追加、「病院システムCSVの取込」カードの器 |
| `src/app/main.js`(変更) | ファイル選択・実行ボタンのハンドラ、取込後の対象日への遷移、検証用の `window` 公開 |
| `tests/hospital-import-core.test.js`(新規) | `buildInspection` の分岐を Node で検証 |
| `src/app/views/changelog.js`(変更) | フェーズ3-1 のエントリを先頭に追加 |
| `docs/superpowers/handoff-2026-08-26.md`(変更) | フェーズ3-1 完了を反映 |

---

### Task 1: 純粋コア `buildInspection` と単体テスト

**Files:**
- Create: `src/app/hospital-import-core.js`
- Test: `tests/hospital-import-core.test.js`

**Interfaces:**
- Consumes:
  - `require("../parse/hospital-csv.js")` → `{ parse(bytes) → { wardRx: Array, errors: Array } }`(既存・変更なし)
  - `require("../parse/filename.js")` → `{ parse(name, today?) → { date: "YYYY-MM-DD", kind: "csv"|"xlsx" } | null }`(既存・変更なし)
- Produces:
  - `HospitalImportCore.buildInspection(fileName: string, bytes: Uint8Array|Buffer, today?: Date) → { date: string, wardRx: Array<{name, teiki, rinji, taiin, meds, ippoka, total}>, errors: Array<{field, message}> }`
  - ファイル名が `MMDD.csv` 形式でない、または `kind !== "csv"` のとき `Error("ファイル名から日付を判定できません。0824.csv の形式にしてください")` を throw する
  - ブラウザでは `window.HospitalImportCore`、Node では `module.exports`

- [ ] **Step 1: 失敗するテストを書く**

Create `tests/hospital-import-core.test.js`:

```javascript
var assert = require("assert");
var fs = require("fs");
var path = require("path");
var h = require("./helper.js");
var test = h.test;
var Core = require("../src/app/hospital-import-core.js");

var AUG_25 = new Date(2026, 7, 25);

function fixture(name) {
  return fs.readFileSync(path.join(__dirname, "fixtures", name));
}

test("builds date and wardRx from a valid hospital CSV", function () {
  var result = Core.buildInspection("0824.csv", fixture("hospital-sample.csv"), AUG_25);
  assert.strictEqual(result.date, "2026-08-24");
  assert.deepStrictEqual(result.errors, []);
  assert.strictEqual(result.wardRx.length, 5);
  assert.deepStrictEqual(result.wardRx[0].teiki, { cnt: 1, dose: 2 });
  assert.deepStrictEqual(result.wardRx[0].name, "かりゆし");
});

test("throws when the file name is not MMDD.csv", function () {
  assert.throws(function () {
    Core.buildInspection("メモ.csv", fixture("hospital-sample.csv"), AUG_25);
  }, /日付を判定できません/);
});

test("throws for an .xlsx name", function () {
  assert.throws(function () {
    Core.buildInspection("0824.xlsx", fixture("hospital-sample.csv"), AUG_25);
  }, /日付を判定できません/);
});

test("passes parser errors through when a ward row is missing", function () {
  var text = [
    "病棟,入院定期,,■合計■,",
    ",処方箋枚数,調剤件数,処方箋枚数,調剤件数",
    "かりゆし,1,2,1,2"
  ].join("\r\n");
  var result = Core.buildInspection("0824.csv", Buffer.from(text, "utf8"), AUG_25);
  assert.ok(result.errors.length > 0);
  assert.ok(result.errors.some(function (e) { return e.message.indexOf("ゆいゆい") >= 0; }));
});

test("passes parser errors through for a non-numeric cell", function () {
  var result = Core.buildInspection("0824.csv", fixture("hospital-bad-number.csv"), AUG_25);
  assert.ok(result.errors.length > 0);
  assert.ok(result.errors.some(function (e) { return e.message.indexOf("数値") >= 0; }));
});

h.summary();
```

- [ ] **Step 2: テストを実行して失敗を確認する**

Run: `node tests/hospital-import-core.test.js`
Expected: FAIL — `Cannot find module '../src/app/hospital-import-core.js'`

- [ ] **Step 3: 最小の実装を書く**

Create `src/app/hospital-import-core.js`:

```javascript
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
```

- [ ] **Step 4: テストを実行して通ることを確認する**

Run: `node tests/hospital-import-core.test.js`
Expected: PASS — `--- 5 passed, 0 failed ---`

- [ ] **Step 5: 既存テストが壊れていないことを確認する**

Run: `node tests/hospital-csv.test.js && node tests/filename.test.js`
Expected: 両方とも `0 failed`

- [ ] **Step 6: コミット**

```bash
git add src/app/hospital-import-core.js tests/hospital-import-core.test.js
git commit -m "feat: add hospital CSV import core (filename + parse)"
```

---

### Task 2: `inspect` / `run` ラッパーと `storage.saveWardRx`

**Files:**
- Create: `src/app/hospital-import.js`
- Modify: `src/app/storage.js`(`saveWardRx` を追加し `export` に加える)

**Interfaces:**
- Consumes:
  - `window.HospitalImportCore.buildInspection(fileName, bytes)` — Task 1(ブラウザでは `<script>` 経由で `window` にある。Task 3 で読み込む)
  - `Storage.getLog(date) → Promise<object|null>`(既存・変更なし)
  - `window.DailyLog.emptyLog(date) → object`(既存・変更なし。`storage.js` は既に `window.Month` を使っている)
  - Firestore ヘルパー `getDoc` / `setDoc` / `doc` / `db` / `LOGS`(`storage.js` に既存)
- Produces:
  - `HospitalImport.inspect(file: File) → Promise<{ date: string, wardRx: Array, errors: Array<{field, message}>, exists: boolean, existingWardRx: Array|null }>`
  - `HospitalImport.run(parsed: {date, wardRx, errors}) → Promise<{ date: string }>` — `parsed.errors.length` があれば `Error("検証に通らない項目があるため取り込めません")` を throw
  - `Storage.saveWardRx(date: string, wardRx: Array) → Promise<void>` — 既存ドキュメントがあれば `wardRx` だけ差し替え、無ければ `emptyLog(date)` を土台に新規作成。`_meta.source = "csv"`、`_meta.csvIngestedAt = <ISO>` を付与し、既存の `_meta` の他キーは保持する

このタスクではまだ `index.html` / `main.js` に配線しない(Task 3・4 で行う)。Firestore 依存のため Node テストは書かない(`migrate.js` も同様)。

- [ ] **Step 1: `src/app/storage.js` に `saveWardRx` を追加する**

`saveLog` 関数(`_meta.source` を `"web"` にするやつ)の直後に、次を挿入する:

```javascript
// 病院システムCSVの取込。該当日の wardRx だけを差し替え、他フィールドには触れない。
// その日のドキュメントが無ければ emptyLog を土台に新規作成する (記入者などは空のまま)。
async function saveWardRx(date, wardRx) {
  var snap = await getDoc(doc(db, LOGS, date));
  var copy;
  if (snap.exists()) {
    var data = snap.data();
    copy = {};
    Object.keys(data).forEach(function (key) { copy[key] = data[key]; });
    copy.wardRx = wardRx;
    var prevMeta = data._meta || {};
    copy._meta = {};
    Object.keys(prevMeta).forEach(function (key) { copy._meta[key] = prevMeta[key]; });
    copy._meta.source = "csv";
    copy._meta.csvIngestedAt = new Date().toISOString();
  } else {
    copy = window.DailyLog.emptyLog(date);
    copy.wardRx = wardRx;
    copy._meta = { source: "csv", csvIngestedAt: new Date().toISOString() };
  }
  await setDoc(doc(db, LOGS, date), copy);
}
```

- [ ] **Step 2: `storage.js` の `export` に `saveWardRx` を加える**

末尾の `export { ... }` を次にする(`saveWardRx` を追加):

```javascript
export {
  countLogs, saveLogs, saveMasters, getMasters, getLog,
  listLogsByMonth, saveLog, saveWardRx, listLogsByFiscalYear
};
```

- [ ] **Step 3: `src/app/hospital-import.js` を作成する**

```javascript
import * as Storage from "./storage.js";

// 純粋コアは UMD モジュール。index.html の <script> で window に公開される。
var Core = window.HospitalImportCore;

async function inspect(file) {
  var bytes = new Uint8Array(await file.arrayBuffer());
  var core = Core.buildInspection(file.name, bytes);
  var existing = await Storage.getLog(core.date);
  return {
    date: core.date,
    wardRx: core.wardRx,
    errors: core.errors,
    exists: existing !== null,
    existingWardRx: existing ? existing.wardRx : null
  };
}

async function run(parsed) {
  if (parsed.errors.length) {
    throw new Error("検証に通らない項目があるため取り込めません");
  }
  await Storage.saveWardRx(parsed.date, parsed.wardRx);
  return { date: parsed.date };
}

export { inspect, run };
```

- [ ] **Step 4: 構文チェック(Node でパースできることだけ確認)**

Run: `node --check src/app/hospital-import.js && node --check src/app/storage.js`
Expected: 出力なし・終了コード0(`node --check` は ESM の `import` 構文を許容する)

- [ ] **Step 5: 既存テストが壊れていないことを確認する**

Run: `node tests/daily-log.test.js && node tests/hospital-import-core.test.js`
Expected: 両方とも `0 failed`

- [ ] **Step 6: コミット**

```bash
git add src/app/hospital-import.js src/app/storage.js
git commit -m "feat: add hospital CSV import inspect/run and storage.saveWardRx"
```

---

### Task 3: `index.html` にスクリプトと取込カードを追加

**Files:**
- Modify: `index.html`

**Interfaces:**
- Consumes: Task 1 の `src/app/hospital-import-core.js`(`window.HospitalImportCore` を定義)
- Produces:
  - `#hospCsvFile`(`<input type="file" accept=".csv">`)
  - `#hospCsvPreview`(`<div class="hint">`)
  - `#hospCsvRunBtn`(`<button class="btn btn-success" disabled>`)
  - `#hospCsvResult`(`<div class="hint">`)
  - `window.HospitalCsv` / `window.Filename` / `window.HospitalImportCore` がページ読み込み時に定義される

- [ ] **Step 1: `<script>` を3本追加する**

`index.html` の `<script src="src/parse/accum-csv.js"></script>`(現在91行目)の**直後**に、次の3行を順番どおりに挿入する。`hospital-import-core.js` は読み込み時に `window.HospitalCsv` / `window.Filename` を参照するため、必ずこの2つより後に置く:

```html
  <script src="src/parse/hospital-csv.js"></script>
  <script src="src/parse/filename.js"></script>
  <script src="src/app/hospital-import-core.js"></script>
```

- [ ] **Step 2: 取込カードを追加する**

「過去データの移行」カードの閉じ `</div>`(現在76行目)の直後、`<div id="mastersView"></div>`(現在78行目)の直前に、次を挿入する:

```html

        <div class="card card-amber">
          <div class="sec-title sec-title-amber">病院システムCSVの取込</div>
          <p class="hint">
            病院システムが出力した日次CSV (<code>MMDD.csv</code>、例 <code>0824.csv</code>) を選ぶと、
            その日の病棟別処方箋データ (wardRx) だけを更新します。他の項目には触れません。
          </p>
          <input type="file" id="hospCsvFile" accept=".csv">
          <div id="hospCsvPreview" class="hint"></div>
          <button id="hospCsvRunBtn" class="btn btn-success" disabled>取り込みを実行</button>
          <div id="hospCsvResult" class="hint"></div>
        </div>
```

- [ ] **Step 3: dev サーバを起動してページが読み込めることを確認する**

Run: `node scripts/dev-server.js` をバックグラウンドで起動(`PORT` 未指定なら 8430)。
ブラウザ手段で `http://localhost:8430` を開き、コンソールで次を評価する:

```javascript
[typeof window.HospitalCsv, typeof window.Filename, typeof window.HospitalImportCore,
 typeof window.HospitalImportCore.buildInspection]
```

Expected: `["object", "object", "object", "function"]`。コンソールに 404 やスクリプトエラーが出ていないこと。

- [ ] **Step 4: 取込カードの器が存在することを確認する**

「データ管理」`<summary>` を開き、コンソールで:

```javascript
["hospCsvFile", "hospCsvPreview", "hospCsvRunBtn", "hospCsvResult"].map(function (id) {
  return document.getElementById(id) ? id + ":ok" : id + ":MISSING";
})
```

Expected: すべて `:ok`。カードが「過去データの移行」と「マスタ設定」の間に、amber の枠線で表示されていること。

- [ ] **Step 5: コミット**

```bash
git add index.html
git commit -m "feat: add hospital CSV import card and scripts to the page"
```

---

### Task 4: `main.js` にハンドラと取込後遷移を配線

**Files:**
- Modify: `src/app/main.js`

**Interfaces:**
- Consumes:
  - `HospitalImport.inspect(file)` / `HospitalImport.run(parsed)` — Task 2
  - 既存の `el`, `esc`, `describeError`, `refreshStatus`, `showDetail`, `loadMonth`, `currentMonth`, `currentView`, `window.DailyLog.RX_KINDS` — `main.js` に既存
- Produces: UI 挙動のみ(他タスクが依存する新しいシンボルは無し)。検証用に `window.HospitalImport` と `window.PharmacyStorage` を公開する

- [ ] **Step 1: import と検証用の `window` 公開を追加する**

`import * as Migrate from "./migrate.js";`(現在3行目)の直後に:

```javascript
import * as HospitalImport from "./hospital-import.js";
```

`var deptReportInited = false;`(現在13行目)の直後に:

```javascript

// 合成検証用。ブラウザのコンソールから取込ロジックを直接叩けるようにする
// (ビュー群が root.*View で公開されているのと同じ発想。実害なし)。
window.HospitalImport = HospitalImport;
window.PharmacyStorage = Storage;

var hospParsed = null;
```

- [ ] **Step 2: プレビュー表と遷移ヘルパーを追加する**

`Auth.onChange(render);`(ファイル末尾)の**直前**に、次を挿入する:

```javascript
var HOSP_KIND_LABELS = {
  teiki: "定期", rinji: "臨時", taiin: "退院", meds: "持参薬", ippoka: "1包化", total: "合計"
};

function hospPairText(pair) {
  return ((pair && pair.cnt) || 0) + "/" + ((pair && pair.dose) || 0);
}

// wardRx を「病棟 × 6区分」の表にする。existingWardRx があれば
// 値が変わるセルだけ「既存 → 新」を太字で併記する。
function hospPreviewTable(wardRx, existingWardRx) {
  var kinds = window.DailyLog.RX_KINDS;
  var head = "<tr><th>病棟</th>" + kinds.map(function (k) {
    return '<th class="num">' + HOSP_KIND_LABELS[k] + "</th>";
  }).join("") + "</tr>";
  var prevByName = {};
  (existingWardRx || []).forEach(function (r) { prevByName[r.name] = r; });
  var body = wardRx.map(function (row) {
    var cells = kinds.map(function (k) {
      var next = hospPairText(row[k]);
      var prevRow = prevByName[row.name];
      if (!prevRow) return '<td class="num">' + esc(next) + "</td>";
      var prev = hospPairText(prevRow[k]);
      if (prev === next) return '<td class="num">' + esc(next) + "</td>";
      return '<td class="num"><strong>' + esc(prev) + " → " + esc(next) + "</strong></td>";
    }).join("");
    return "<tr><td>" + esc(row.name) + "</td>" + cells + "</tr>";
  }).join("");
  return '<div class="tbl-wrap"><table class="tbl"><thead>' + head +
    "</thead><tbody>" + body + "</tbody></table></div>";
}

// 取込成功後、その日の詳細画面へ移動する。showDetail は currentLogs
// (現在ロード中の月) から日を引くため、先に対象月をロードする。
async function hospGotoImportedDay(date) {
  currentMonth = { y: +date.slice(0, 4), m: +date.slice(5, 7) };
  currentView = "list";
  el("reportToggleBtn").textContent = "月報";
  el("listView").hidden = false;
  el("detailView").hidden = true;
  el("reportView").hidden = true;
  el("monthNotice").hidden = false;
  await loadMonth();
  showDetail(date);
}
```

- [ ] **Step 3: ファイル選択ハンドラを追加する**

Step 2 で挿入したコードの直後(まだ `Auth.onChange(render);` の前)に:

```javascript
el("hospCsvFile").addEventListener("change", async function (event) {
  var file = event.target.files[0];
  hospParsed = null;
  el("hospCsvRunBtn").disabled = true;
  el("hospCsvResult").textContent = "";

  if (!file) {
    el("hospCsvPreview").textContent = "";
    return;
  }

  el("hospCsvPreview").textContent = "読み込み中…";
  try {
    var result = await HospitalImport.inspect(file);

    if (result.errors.length) {
      el("hospCsvPreview").innerHTML = '<span class="err">' +
        result.errors.length + "件の問題があります。取り込みを中止しました。\n" +
        result.errors.slice(0, 5).map(function (e) {
          return e.field + " — " + e.message;
        }).join("\n") + "</span>";
      return;
    }

    hospParsed = result;
    var lead = result.exists
      ? esc(result.date) + " — この日の wardRx を上書きします"
      : esc(result.date) + " — 新規作成します（記入者は空。あとで編集画面で補完してください）";
    el("hospCsvPreview").innerHTML = '<span class="ok">' + lead + "</span>" +
      hospPreviewTable(result.wardRx, result.existingWardRx);
    el("hospCsvRunBtn").disabled = false;
  } catch (err) {
    el("hospCsvPreview").innerHTML = '<span class="err">読み込みに失敗しました: ' +
      esc(describeError(err)) + "</span>";
  }
});
```

- [ ] **Step 4: 実行ボタンハンドラを追加する**

Step 3 のハンドラの直後(まだ `Auth.onChange(render);` の前)に:

```javascript
el("hospCsvRunBtn").addEventListener("click", async function () {
  if (!hospParsed) return;
  el("hospCsvRunBtn").disabled = true;
  el("hospCsvResult").innerHTML = '<span class="progress">取り込み中…</span>';

  try {
    var result = await HospitalImport.run(hospParsed);
    el("hospCsvResult").innerHTML = '<span class="ok">' + esc(result.date) + " を取り込みました。</span>";
    hospParsed = null;
    el("hospCsvFile").value = "";
    el("hospCsvPreview").textContent = "";
    await refreshStatus();
    await hospGotoImportedDay(result.date);
  } catch (err) {
    el("hospCsvResult").innerHTML = '<span class="err">取り込みに失敗しました: ' +
      esc(describeError(err)) + "</span>";
    el("hospCsvRunBtn").disabled = false;
  }
});
```

- [ ] **Step 5: 構文チェック**

Run: `node --check src/app/main.js`
Expected: 出力なし・終了コード0

- [ ] **Step 6: 既存テストが壊れていないことを確認する**

Run: `node tests/hospital-import-core.test.js && node tests/daily-log.test.js && node tests/monthly-report.test.js`
Expected: すべて `0 failed`

- [ ] **Step 7: ブラウザで合成検証する(新規日)**

dev サーバを起動し、Google ログイン後、コンソールで次を実行する。ダミーCSV(患者情報なし)を組み立て、`0101.csv` という名前の `File` にして取込ロジックを直接呼ぶ:

```javascript
var csv = [
  "病棟,入院定期,,入院臨時,,退院,,持参薬,,1包化　持参薬,,■合計■,",
  ",処方箋枚数,調剤件数,処方箋枚数,調剤件数,処方箋枚数,調剤件数,処方箋枚数,調剤件数,処方箋枚数,調剤件数,処方箋枚数,調剤件数",
  "かりゆし,3,9,1,1,0,0,0,0,0,0,4,10",
  "ゆいゆい,2,5,0,0,0,0,0,0,0,0,2,5",
  "うりずん北,0,0,0,0,0,0,1,4,0,0,1,4",
  "うりずん南,0,0,0,0,0,0,0,0,0,0,0,0",
  "はいさい,0,0,0,0,1,2,0,0,2,6,3,8",
  "■合計■,5,14,1,1,1,2,2,8,2,6,10,27"
].join("\r\n");
var file = new File([new TextEncoder().encode(csv)], "0101.csv", { type: "text/csv" });
var insp = await window.HospitalImport.inspect(file);
console.log(JSON.stringify(insp, null, 2));
```

Expected: `insp.date` が「今日に一番近い 01-01」(実行年により `2026-01-01` 等)、`insp.errors` が `[]`、`insp.exists` が `false`(その日付の記録が無い場合)、`insp.wardRx` が5病棟。

続けて書き込みと読み戻しを確認する:

```javascript
var res = await window.HospitalImport.run(insp);
var back = await window.PharmacyStorage.getLog(res.date);
console.log(res.date, back._meta, back.author, back.wardRx[0]);
```

Expected: `back._meta.source === "csv"`、`back._meta.csvIngestedAt` が ISO 文字列、`back.author === ""`、`back.wardRx[0].teiki` が `{cnt:3, dose:9}`。画面がその日の詳細に遷移していること。

**後始末:** Firebase コンソール(または `window.PharmacyStorage` に無いため手動)で、テストで作成した日付のドキュメント(`2026-01-01` 等)を削除する。使い捨て日付なので実データと衝突しない前提。

- [ ] **Step 8: ブラウザで合成検証する(既存日への上書きプレビュー)**

既にデータのある日付(例: 一覧に見えている日)を選び、その `MMDD` に合わせた名前のダミー `File` を作って `#hospCsvFile` に流し込み、`change` を発火させる:

```javascript
var d = "0801"; // 既存データのある日の MMDD に変える
var csv2 = [
  "病棟,入院定期,,入院臨時,,退院,,持参薬,,1包化　持参薬,,■合計■,",
  ",処方箋枚数,調剤件数,処方箋枚数,調剤件数,処方箋枚数,調剤件数,処方箋枚数,調剤件数,処方箋枚数,調剤件数,処方箋枚数,調剤件数",
  "かりゆし,99,99,0,0,0,0,0,0,0,0,99,99",
  "ゆいゆい,0,0,0,0,0,0,0,0,0,0,0,0",
  "うりずん北,0,0,0,0,0,0,0,0,0,0,0,0",
  "うりずん南,0,0,0,0,0,0,0,0,0,0,0,0",
  "はいさい,0,0,0,0,0,0,0,0,0,0,0,0",
  "■合計■,99,99,0,0,0,0,0,0,0,0,99,99"
].join("\r\n");
var f2 = new File([new TextEncoder().encode(csv2)], d + ".csv", { type: "text/csv" });
var dt = new DataTransfer();
dt.items.add(f2);
el = document.getElementById("hospCsvFile");
el.files = dt.files;
el.dispatchEvent(new Event("change"));
```

(`el` が `main.js` 内の関数と名前衝突する場合はコンソール変数名を変える。)
Expected: `#hospCsvPreview` に「YYYY-MM-DD — この日の wardRx を上書きします」と表、`かりゆし` 行の変化するセルが「既存 → 99/99」の形で太字表示されること。**このステップでは「取り込みを実行」は押さない**(実データを壊さないため)。押した場合は Step 7 と同様に元の値へ戻すか、正しいCSVで取り込み直す。

- [ ] **Step 9: コミット**

```bash
git add src/app/main.js
git commit -m "feat: wire hospital CSV import card handlers in main.js"
```

---

### Task 5: 更新履歴・バージョン表示・引継ぎメモの更新

**Files:**
- Modify: `src/app/views/changelog.js`
- Modify: `index.html`(`.app-version`)
- Modify: `docs/superpowers/handoff-2026-08-26.md`

**Interfaces:**
- Consumes: なし
- Produces: なし(ドキュメントのみ)

- [ ] **Step 1: 更新履歴に1件追加する**

`src/app/views/changelog.js` の `CHANGELOG_ENTRIES` 配列の**先頭**(最初の `{` の前)に:

```javascript
    {
      date: "2026-08-27", type: "feat",
      title: "フェーズ3-1: 病院システムCSVの取込を追加",
      detail: "病院システムが出力した日次CSV (MMDD.csv) を「データ管理」パネルから選ぶと、その日の病棟別処方箋データ (wardRx) だけをブラウザから直接データベースへ書き込めるようにした。記録の無い日は自動で新規作成し (記入者は空)、既存の日は取込前に「既存 → 新」を表で確認してから上書きする。パースエラーが1件でもあれば取込全体を中止する。",
      cause: null
    },
```

- [ ] **Step 2: バージョン表示を更新する**

`index.html` の `<span class="app-version">2b-7 (2026-08-26)</span>` を次にする:

```html
<span class="app-version">3-1 (2026-08-27)</span>
```

- [ ] **Step 3: 「データ管理」パネルで更新履歴の先頭が新エントリになっていることを確認する**

dev サーバでページを開き、「データ管理」を開いて更新履歴カードの先頭が「フェーズ3-1: 病院システムCSVの取込を追加」、タイトル横のバージョンが `3-1 (2026-08-27)` であることを目視確認する。

- [ ] **Step 4: 引継ぎメモを更新する**

`docs/superpowers/handoff-2026-08-26.md` の冒頭「状態:」行を次にする:

```markdown
状態: **フェーズ3-1(病院CSV取込)まで完了・未push。次は 2b-5(他部署向け日報)保留分、または フェーズ3-2(Excelテンプレートの要否判断)。**
```

さらに「2. 直前まで進めていた作業」節の末尾(「### 次にやること」の直前)に:

```markdown
### フェーズ3-1 完了メモ (2026-08-27)

- 設計書: `docs/superpowers/specs/2026-08-27-phase3-hospital-csv-import-design.md`
- 実装計画: `docs/superpowers/plans/2026-08-27-phase3-hospital-csv-import.md`
- 追加ファイル: `src/app/hospital-import-core.js` (UMD・純粋コア・テスト有)、`src/app/hospital-import.js` (ESM・inspect/run)
- `storage.js` に `saveWardRx(date, wardRx)` を追加。`wardRx` だけ差し替え、無い日は `emptyLog` 土台で新規作成、`_meta.source="csv"`
- UI: 「データ管理」パネルに「病院システムCSVの取込」カード。`main.js` にハンドラ
- 論点1(新規日): 自動新規作成・記入者は空、で確定・実装済み
- 論点2(Excelテンプレートの要否)は未決着のまま。フェーズ3-2として残る
```

- [ ] **Step 5: 全テストを流す**

Run: `node tests/hospital-import-core.test.js && node tests/hospital-csv.test.js && node tests/filename.test.js && node tests/daily-log.test.js && node tests/accum-csv.test.js && node tests/month.test.js && node tests/monthly-report.test.js && node tests/dept-report.test.js && node tests/holidays.test.js`
Expected: すべて `0 failed`

- [ ] **Step 6: コミット**

```bash
git add src/app/views/changelog.js index.html docs/superpowers/handoff-2026-08-26.md
git commit -m "docs: record phase 3-1 hospital CSV import in changelog and handoff"
```

---

## Self-Review

**Spec coverage:**

| 設計書のセクション | 対応するタスク |
|---|---|
| §4 ファイル変更(index.html / hospital-import.js / storage.js / main.js / test / fixtures) | Task 1〜4。fixtures は既存の `hospital-sample.csv` / `hospital-bad-number.csv` を再利用(新規追加せず) |
| §5.1 純粋コア `buildInspection` | Task 1 |
| §5.1 非同期ラッパー `inspect` / `run` | Task 2(`onProgress` は単日書き込みで不要のため省略) |
| §5.2 `saveWardRx`(既存マージ / 新規は emptyLog 土台 / `_meta` 蓄積) | Task 2 Step 1 |
| §6.1 カードの HTML | Task 3 Step 2(`card-amber` を採用。隣の「過去データの移行」と揃える) |
| §6.2 ファイル選択フロー(例外・errors・プレビュー) | Task 4 Step 3 |
| §6.2 実行フロー(進捗・成功・失敗) | Task 4 Step 4 |
| §6.2 プレビュー表(6区分・「既存 → 新」太字) | Task 4 Step 2 `hospPreviewTable` |
| §6.3 取込後の対象日への遷移 | Task 4 Step 2 `hospGotoImportedDay` |
| §7 エラー処理・エッジケース | Task 1(ファイル名不正で throw)、Task 4 Step 3(errors で中止)、Task 4 Step 4(書込例外) |
| §8.1 Node 単体テスト | Task 1 Step 1(`buildInspection` の5ケース) |
| §8.2 ダミーフィクスチャ | 既存を再利用。実ファイル `0824.csv` はコミットしない(Global Constraints) |
| §8.3 ブラウザ合成検証(`window.HospitalImport` / `window.PharmacyStorage` 公開、新規日・既存日) | Task 4 Step 1 / Step 7 / Step 8 |
| §8.4 `saveWardRx` はブラウザ検証でカバー | Task 4 Step 7 の読み戻し |
| §9 プロジェクト絶対原則 | Global Constraints |

設計書との差分(計画で確定させた点):
- 純粋コアを `src/app/hospital-import.js` 内の関数ではなく独立 UMD ファイル `src/app/hospital-import-core.js` に分離。理由: ESM(`export`)ファイルは CJS テストから `require` できないため、Node で単体テストするにはコアを UMD にする必要がある。既存ビュー群(`list.js` 等)も同じ UMD パターンで `src/app/` にある。
- `buildInspection` に第3引数 `today?` を追加(`Filename.parse` にそのまま渡す)。テストの時刻依存を排除するため。本番の `inspect` は渡さず既定(`new Date()`)を使う。
- fixtures は新規追加せず既存 2 本を再利用。

**Placeholder scan:** 「TBD」「後で」「適切なエラー処理」等なし。コードを要する全ステップに実コードを記載済み。

**Type consistency:**
- `buildInspection(fileName, bytes, today?) → {date, wardRx, errors}` — Task 1 で定義、Task 2 の `inspect` で `core.date` / `core.wardRx` / `core.errors` として消費。一致。
- `inspect(file) → {date, wardRx, errors, exists, existingWardRx}` — Task 2 で定義、Task 4 で `result.errors` / `result.exists` / `result.date` / `result.wardRx` / `result.existingWardRx` として消費。一致。
- `run(parsed) → {date}` — Task 2 で定義、Task 4 で `result.date` として消費。一致。
- `saveWardRx(date, wardRx)` — Task 2 で定義・`export` 追加、`inspect`/`run` と同一ファイルの `run` から呼ばれる。一致。
- `window.HospitalImportCore` / `window.HospitalImport` / `window.PharmacyStorage` — Task 1 / Task 4 で公開、Task 3・4 の検証ステップで参照。一致。
- `RX_KIND` の並び `["teiki","rinji","taiin","meds","ippoka","total"]` は `window.DailyLog.RX_KINDS` を直接使うため定義とズレない。
