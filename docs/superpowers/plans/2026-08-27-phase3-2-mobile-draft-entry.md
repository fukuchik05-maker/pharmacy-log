# モバイル下書き → 承認(フェーズ3-2) 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ログイン画面のないモバイル入力ページ(Firebase 匿名認証)で日誌項目をセクション単位で下書き送信し、Googleログイン済みの本アプリで確認・承認して `dailyLogs` へ partial merge する。

**Architecture:** 新ページ `entry.html`(+ `src/entry/`)は匿名認証で `draftEntries` コレクションに下書きを作成し、自端末(匿名UID)の未承認下書きを読み返す。本アプリ(`src/app/`)に「モバイル下書きの承認」カードを足し、下書きを `dailyLogs` へマージ(payload にあるセクションのキーだけ上書き)して下書きを削除する。セクション定義とマージのコア判定は Node で単体テストできる純粋モジュールに切り出す。`firestore.rules` は `masters` の匿名読取と `draftEntries` の匿名作成・自UID読取だけを追加し、`dailyLogs` のルールは変えない。

**Tech Stack:** 素の JavaScript(依存パッケージなし)。Firebase v10.8.0(gstatic CDN、`firebase-app` / `firebase-auth` の `signInAnonymously` / `firebase-firestore`)。テストは Node 標準 `assert` + `tests/helper.js`。

## Global Constraints

- **依存パッケージを一切追加しない**(`package.json` / `node_modules` なし)。
- **`dailyLogs` への書き込みは Google 認証済みの本人のみ**(`firestore.rules` の `dailyLogs` match は変更しない)。サービスアカウント鍵を埋め込まない。
- **実患者データ入りの CSV / Excel は絶対にコミットしない**(`tests/fixtures/` のダミーのみ)。
- **Firebase Spark プラン(無料)を維持**、Cloud Functions は使わない。匿名認証は Spark で使える。
- UMD モジュールは既存パターン `(function (root) { ... })(typeof window !== "undefined" ? window : this)` に合わせる。
- 新しい CSS クラスは追加しない。既存の `style.css`(`.card` / `.sec-title` / `.tbl` / `.tbl-wrap` / `.num` / `.num-input` / `.text-input` / `.textarea-input` / `.edit-row` / `.btn` / `.btn-primary` / `.btn-success` / `.hint` / `.ok` / `.err` / `.card-amber` / `.sec-title-amber` / `.empty`)を再利用する。
- **変更しないもの**: `src/model/daily-log.js`、`src/parse/*`、`src/app/hospital-import*.js`、既存ビュー群(`edit.js` 等)、`src/app/migrate.js`。

設計の詳細は [フェーズ3-2 設計書](../specs/2026-08-27-phase3-2-mobile-draft-entry-design.md) を参照。

---

## File Structure

| ファイル | 責務 |
|---|---|
| `src/model/entry-sections.js`(新規・UMD) | セクション定義(`SECTION_FIELDS` / `SECTION_TITLES` / `DEFAULT_ON`)と純粋関数(`payloadFromSections` / `wardRxTotals` / `sectionLabelsOf`)。`entry-form.js` と `drafts.js` の双方が使う |
| `src/entry/entry-form.js`(新規・UMD) | モバイル入力フォームの DOM 組み立て(`render`)と値の収集(`collect`)。`edit.js` の構成を踏襲、セクション制 |
| `src/entry/entry-main.js`(新規・ES モジュール) | Firebase 初期化 → 匿名認証 → マスタ読取 → `EntryForm` 描画 → `draftEntries` へ作成 → 自端末の下書き一覧 |
| `entry.html`(新規・リポジトリ直下) | モバイル入力ページ。`style.css` と上記 3 ファイルを読む |
| `src/app/draft-merge.js`(新規・UMD) | `mergeDraftIntoLog(existingOrNull, {date, author, payload})` — partial merge の純粋関数 |
| `src/app/storage.js`(変更) | `listDrafts()` / `deleteDraft(id)` / `saveDailyEntry(date, fields)` を追加し `export` に加える |
| `src/app/views/drafts.js`(新規・UMD) | 本アプリの「モバイル下書きの承認」カード(`DraftsView.render`) |
| `index.html`(変更) | 承認カードの器、`entry-sections.js` / `draft-merge.js` / `drafts.js` の `<script>` |
| `src/app/main.js`(変更) | 承認カードの配線、`toolsDetails` を開くたびの下書き再読込、承認後の対象日遷移 |
| `firestore.rules`(変更) | `masters` 匿名読取・`draftEntries` の匿名作成/自UID読取を許可 |
| `tests/entry-sections.test.js`(新規) | `payloadFromSections` / `wardRxTotals` / `sectionLabelsOf` |
| `tests/draft-merge.test.js`(新規) | `mergeDraftIntoLog` |
| `src/app/views/changelog.js`(変更) | フェーズ3-2 のエントリ |
| `docs/superpowers/handoff-2026-08-26.md`(変更) | フェーズ3-2 完了を反映 |

**フェーズ分け**: Task 1〜4 = 3-2a(入力ページ側。単体で「下書き送信＋自端末の見返し」が動く)。Task 5〜9 = 3-2b(本アプリの承認フロー)。

---

## Phase 3-2a: 入力ページ

### Task 1: `src/model/entry-sections.js` とテスト

**Files:**
- Create: `src/model/entry-sections.js`
- Test: `tests/entry-sections.test.js`

**Interfaces:**
- Consumes: なし(素の JS のみ)
- Produces:
  - `EntrySections.SECTION_FIELDS: { [sectionKey]: string[] }` — セクション → 日誌フィールド名
  - `EntrySections.SECTION_TITLES: { [sectionKey]: string }` — セクション → 日本語見出し
  - `EntrySections.DEFAULT_ON: string[]` — 既定でチェックが入るセクションキー(`wardRx` を含まない)
  - `EntrySections.payloadFromSections(rawValues: object, checkedKeys: string[]) → object` — `checkedKeys` のセクションに属するキーだけを `rawValues` から取り出した新オブジェクト
  - `EntrySections.wardRxTotals(rows: Array) → Array` — 各行に `total: {cnt, dose}` を計算して入れた新配列。`cnt = teiki.cnt+rinji.cnt+taiin.cnt+meds.cnt+ippoka.cnt`、`dose` は同様に `.dose` の和
  - `EntrySections.sectionLabelsOf(payload: object) → string[]` — `payload` にキーが1つでも含まれるセクションの日本語見出しの配列(`SECTION_FIELDS` の宣言順)
  - ブラウザでは `window.EntrySections`、Node では `module.exports`

- [ ] **Step 1: 失敗するテストを書く**

Create `tests/entry-sections.test.js`:

```javascript
var assert = require("assert");
var h = require("./helper.js");
var test = h.test;
var S = require("../src/model/entry-sections.js");

test("DEFAULT_ON has every section except wardRx", function () {
  var all = Object.keys(S.SECTION_FIELDS);
  assert.deepStrictEqual(
    S.DEFAULT_ON.slice().sort(),
    all.filter(function (k) { return k !== "wardRx"; }).sort()
  );
});

test("payloadFromSections keeps only checked sections' keys", function () {
  var raw = {
    rxOpCnt: 1, rxOpDose: 2, rxInjCnt: 3, rxInjDose: 4, counsel: 5,
    winjData: [{ ward: "かりゆし", cnt: 0, dose: 0 }],
    wardRx: [{ name: "かりゆし" }],
    doctorChanges: [{ doctor: "A", cnt: 0 }],
    premixes: [{ drug: "X", cnt: 0 }],
    packerData: { tab: {}, san: {} },
    checklist: ["項目A"],
    inquiries: [{ type: "用量" }], mrVisits: [], contacts: [], drugs: [],
    shortages: [], meetings: [], trainings: [],
    notes: "メモ"
  };
  var out = S.payloadFromSections(raw, ["gairai", "meisai", "notes"]);
  assert.deepStrictEqual(Object.keys(out).sort(), [
    "contacts", "counsel", "drugs", "inquiries", "meetings", "mrVisits",
    "notes", "rxInjCnt", "rxInjDose", "rxOpCnt", "rxOpDose", "shortages", "trainings"
  ].sort());
  assert.strictEqual(out.rxOpCnt, 1);
  assert.strictEqual(out.notes, "メモ");
  assert.strictEqual(out.wardRx, undefined);
  assert.strictEqual(out.checklist, undefined);
});

test("payloadFromSections with wardRx section includes wardRx only", function () {
  var raw = { wardRx: [{ name: "かりゆし" }], notes: "x" };
  var out = S.payloadFromSections(raw, ["wardRx"]);
  assert.deepStrictEqual(Object.keys(out), ["wardRx"]);
});

test("wardRxTotals computes per-ward totals", function () {
  var rows = [{
    name: "かりゆし",
    teiki: { cnt: 3, dose: 18 }, rinji: { cnt: 9, dose: 9 },
    taiin: { cnt: 0, dose: 0 }, meds: { cnt: 1, dose: 4 }, ippoka: { cnt: 0, dose: 0 }
  }];
  var out = S.wardRxTotals(rows);
  assert.deepStrictEqual(out[0].total, { cnt: 13, dose: 31 });
  assert.strictEqual(rows[0].total, undefined); // 元配列は変更しない
});

test("sectionLabelsOf lists sections present in the payload, in declared order", function () {
  var labels = S.sectionLabelsOf({ rxOpCnt: 0, inquiries: [], notes: "" });
  assert.deepStrictEqual(labels, ["外来", "明細", "その他"]);
});

h.summary();
```

- [ ] **Step 2: テストを実行して失敗を確認する**

Run: `node tests/entry-sections.test.js`
Expected: FAIL — `Cannot find module '../src/model/entry-sections.js'`

- [ ] **Step 3: `src/model/entry-sections.js` を作成する**

```javascript
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
```

- [ ] **Step 4: テストを実行して通ることを確認する**

Run: `node tests/entry-sections.test.js`
Expected: PASS — `--- 5 passed, 0 failed ---`

- [ ] **Step 5: コミット**

```bash
git add src/model/entry-sections.js tests/entry-sections.test.js
git commit -m "feat: add entry-sections model (section map + pure helpers)"
```

---

### Task 2: `firestore.rules` の更新と匿名認証の有効化

**Files:**
- Modify: `firestore.rules`

**Interfaces:**
- Consumes: なし
- Produces: `draftEntries` コレクションの匿名 create / 自UID read、`masters` の匿名 read

このタスクは自動テストを持たない。デプロイ後にブラウザから手動確認する(Step 4)。

- [ ] **Step 1: Firebase コンソールで匿名認証を有効化する(手作業)**

Firebase コンソール → Authentication → Sign-in method → 「匿名」を **有効** にする。
(これは利用者アカウントでの操作。実装者が代行できない場合はここで停止し依頼する。)

- [ ] **Step 2: `firestore.rules` を書き換える**

現在の全文:

```
rules_version = '2';

service cloud.firestore {
  match /databases/{database}/documents {

    function isOwner() {
      return request.auth != null
        && request.auth.uid == 'T0LwgXmrDTXtlI2mdSweuBp197c2';
    }

    match /{document=**} {
      allow read, write: if isOwner();
    }
  }
}
```

これを次にする:

```
rules_version = '2';

service cloud.firestore {
  match /databases/{database}/documents {

    // 本人のアカウントだけを許可する。
    // メールアドレスではなく UID で判定する。
    // このファイルは公開リポジトリに含まれるため、個人情報を残さないため。
    function isOwner() {
      return request.auth != null
        && request.auth.uid == 'T0LwgXmrDTXtlI2mdSweuBp197c2';
    }

    // 確定日誌。従来どおり本人のみ。
    match /dailyLogs/{doc} {
      allow read, write: if isOwner();
    }

    // マスタ。本人は読み書き、匿名(モバイル入力ページ)は読み取りのみ。
    match /masters/{doc} {
      allow read: if isOwner() || request.auth != null;
      allow write: if isOwner();
    }

    // モバイル入力ページの下書き。
    // 匿名は「自分の uid を付けた作成」と「自分の uid の下書きの読み取り」だけ。
    // 承認・却下(update / delete)は本人のみ。
    match /draftEntries/{doc} {
      allow update, delete: if isOwner();
      allow read: if isOwner()
        || (request.auth != null && resource.data.uid == request.auth.uid);
      allow create: if request.auth != null
        && request.resource.data.keys().hasOnly(
             ['schemaVersion', 'uid', 'date', 'author', 'createdAt', 'status', 'payload'])
        && request.resource.data.schemaVersion == 1
        && request.resource.data.uid == request.auth.uid
        && request.resource.data.status == 'pending'
        && request.resource.data.date.matches('[0-9]{4}-[0-9]{2}-[0-9]{2}')
        && request.resource.data.author is string
        && request.resource.data.author.size() <= 40
        && request.resource.data.payload is map;
    }

    // その他(ingestRuns 等)は従来どおり本人のみ。
    match /{document=**} {
      allow read, write: if isOwner();
    }
  }
}
```

- [ ] **Step 3: ルールをデプロイする(手作業)**

次のいずれか:
- Firebase コンソール → Firestore Database → ルール → 上記を貼り付けて「公開」
- または `firebase deploy --only firestore:rules`(firebase-tools が入っている場合)

- [ ] **Step 4: コミット**

```bash
git add firestore.rules
git commit -m "feat: allow anonymous draft create and own-draft read in firestore rules"
```

(ブラウザからの実挙動確認は Task 4 Step 6 でまとめて行う。)

---

### Task 3: `src/entry/entry-form.js`(入力フォーム)

**Files:**
- Create: `src/entry/entry-form.js`

**Interfaces:**
- Consumes:
  - `window.DailyLog`(`WARDS`, `INQ_TYPES`, `DRUG_TYPES`, `MEETING_TYPES`, `CONTACT_FROM`)
  - `window.EntrySections`(`DEFAULT_ON`, `SECTION_TITLES`, `payloadFromSections`, `wardRxTotals`)— Task 1
- Produces:
  - `EntryForm.render(container: Element, masters: {members, checklist, premixes, doctors}) → void`
    — 日付・記入者ヘッダーと全セクション(各セクションに「記入する」チェック)を `container.innerHTML` に描画する。
    `wardRx` セクションのチェックは既定オフ。記入者を変えると `checklist` セクションを再描画する。
  - `EntryForm.collect(container: Element) → { date: string, author: string, payload: object }`
    — DOM から全セクションの生値を読み、チェックされているセクションのキーだけを含む `payload` を返す。
    `wardRx` が含まれる場合は `EntrySections.wardRxTotals` で `total` を計算済みにする。
  - ブラウザでは `window.EntryForm`(UMD)

- [ ] **Step 1: `src/entry/entry-form.js` を作成する**

```javascript
(function (root) {
  "use strict";

  var DL = root.DailyLog;
  var ES = root.EntrySections;
  var WARDS = DL.WARDS;

  var DRUG_LABELS = {
    adopt: "採用", remove: "削除", expire: "期限切れ", "return": "返品", maintenance: "メンテナンス"
  };
  var WARDRX_KINDS = [
    { key: "teiki", label: "定期" }, { key: "rinji", label: "臨時" },
    { key: "taiin", label: "退院" }, { key: "meds", label: "持参薬" },
    { key: "ippoka", label: "1包化" }
  ];
  var PACKER_UNITS = [
    { key: "tab", label: "錠剤分包機" }, { key: "san", label: "散剤分包機" }
  ];
  var LIST_SECTIONS = {
    inquiries: { title: "疑義照会", fields: [
      { field: "type", type: "select", options: DL.INQ_TYPES, label: "区分" },
      { field: "doctor", type: "text", label: "医師" },
      { field: "memo", type: "text", label: "内容" },
      { field: "changed", type: "checkbox", label: "処方変更" }
    ] },
    mrVisits: { title: "MR訪問", fields: [
      { field: "company", type: "text", label: "会社" },
      { field: "memo", type: "text", label: "内容" }
    ] },
    contacts: { title: "問い合わせ", fields: [
      { field: "from", type: "select", options: DL.CONTACT_FROM, label: "区分" },
      { field: "memo", type: "text", label: "内容" }
    ] },
    drugs: { title: "薬剤管理", fields: [
      { field: "type", type: "select", options: DL.DRUG_TYPES, optionLabels: DRUG_LABELS, label: "区分" },
      { field: "name", type: "text", label: "薬品名" }
    ] },
    shortages: { title: "欠品", fields: [
      { field: "name", type: "text", label: "薬品名" },
      { field: "qty", type: "number", label: "数量" }
    ] },
    meetings: { title: "会議", fields: [
      { field: "type", type: "select", options: DL.MEETING_TYPES, label: "種別" }
    ] },
    trainings: { title: "研修会", fields: [
      { field: "theme", type: "text", label: "テーマ" },
      { field: "lecturer", type: "text", label: "担当者" },
      { field: "count", type: "number", label: "参加人数" }
    ] }
  };
  var MEISAI_KEYS = ["inquiries", "mrVisits", "contacts", "drugs", "shortages", "meetings", "trainings"];

  function esc(v) {
    return String(v === undefined || v === null ? "" : v)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function num(v) { var n = Number(v); return isFinite(n) ? n : 0; }
  function numInput(field, value) {
    return '<input type="number" min="0" step="1" class="num-input" data-field="' +
      field + '" value="' + num(value) + '">';
  }
  function table(head, rows) {
    return '<div class="tbl-wrap"><table class="tbl"><thead><tr>' + head +
      "</tr></thead><tbody>" + rows + "</tbody></table></div>";
  }

  // --- 固定構造セクションの body ---
  function gairaiBody() {
    return table('<th>区分</th><th class="num">枚数</th><th class="num">件数</th>',
      "<tr><td>外来処方箋</td><td>" + numInput("rxOpCnt", 0) + "</td><td>" + numInput("rxOpDose", 0) + "</td></tr>" +
      "<tr><td>外来注射箋</td><td>" + numInput("rxInjCnt", 0) + "</td><td>" + numInput("rxInjDose", 0) + "</td></tr>"
    ) + '<div class="edit-row"><label>薬剤管理指導（件）</label>' + numInput("counsel", 0) + "</div>";
  }
  function winjBody() {
    var rows = WARDS.map(function (ward) {
      return "<tr><td>" + esc(ward) + "</td><td>" +
        '<input type="number" min="0" step="1" class="num-input" data-winj-ward="' + esc(ward) +
        '" data-winj-kind="cnt" value="0"></td><td>' +
        '<input type="number" min="0" step="1" class="num-input" data-winj-ward="' + esc(ward) +
        '" data-winj-kind="dose" value="0"></td></tr>';
    }).join("");
    return table('<th>病棟</th><th class="num">枚数</th><th class="num">件数</th>', rows);
  }
  function wardRxBody() {
    var head = "<th>病棟</th>" + WARDRX_KINDS.map(function (k) {
      return '<th class="num">' + k.label + "</th>";
    }).join("") + '<th class="num">合計</th>';
    var rows = WARDS.map(function (ward) {
      var cells = WARDRX_KINDS.map(function (kind) {
        return "<td>" +
          '<input type="number" min="0" step="1" class="num-input" data-wardrx-ward="' + esc(ward) +
          '" data-wardrx-kind="' + kind.key + '" value="0"></td>';
      }).join("");
      return "<tr><td>" + esc(ward) + "</td>" + cells + '<td class="num" data-wardrx-total="' + esc(ward) + '">0</td></tr>';
    }).join("");
    return table(head, rows) + '<div class="hint">合計は自動計算です。</div>';
  }
  function doctorChangesBody(masters) {
    var list = masters.doctors || [];
    if (!list.length) return '<div class="hint">医師マスタが空です。</div>';
    var rows = list.map(function (doctor, i) {
      return "<tr><td>" + esc(doctor) + "</td><td>" +
        '<input type="number" min="0" step="1" class="num-input" data-doctor="' + esc(doctor) +
        '" data-doctor-index="' + i + '" value="0"></td></tr>';
    }).join("");
    return table('<th>医師</th><th class="num">処方変更件数</th>', rows);
  }
  function premixesBody(masters) {
    var list = masters.premixes || [];
    if (!list.length) return '<div class="hint">予製マスタが空です。</div>';
    var rows = list.map(function (drug, i) {
      return "<tr><td>" + esc(drug) + "</td><td>" +
        '<input type="number" min="0" step="1" class="num-input" data-premix="' + esc(drug) +
        '" data-premix-index="' + i + '" value="0"></td></tr>';
    }).join("");
    return table('<th>薬剤</th><th class="num">個数</th>', rows);
  }
  function packerBody() {
    var blocks = PACKER_UNITS.map(function (unit) {
      return '<div><div style="font-size:12px;font-weight:600;margin-bottom:4px">' + unit.label + "</div>" +
        '<div class="edit-row"><label>分包紙</label><input type="number" min="0" step="1" class="num-input" data-packer-unit="' +
        unit.key + '" data-packer-item="分包紙" value="0"></div>' +
        '<div class="edit-row"><label>インク</label><input type="number" min="0" step="1" class="num-input" data-packer-unit="' +
        unit.key + '" data-packer-item="インク" value="0"></div>' +
        '<div class="edit-row"><label><input type="checkbox" data-packer-unit="' + unit.key +
        '" data-packer-item="清掃"> 清掃</label></div></div>';
    }).join("");
    return '<div style="display:grid;grid-template-columns:1fr 1fr;gap:.5rem">' + blocks + "</div>";
  }
  function checklistBody(masters, author) {
    var items = (masters.checklist && masters.checklist[author]) || [];
    if (!author) return '<div class="hint">先に記入者を選んでください。</div>';
    if (!items.length) return '<div class="hint">この記入者のチェック項目はありません。</div>';
    return items.map(function (item) {
      return '<div class="edit-row"><label><input type="checkbox" data-checklist-item="' + esc(item) +
        '"> ' + esc(item) + "</label></div>";
    }).join("");
  }
  function notesBody() {
    return '<textarea class="text-input textarea-input" data-field="notes" rows="3"></textarea>';
  }

  // --- 明細系(行の追加・削除) ---
  function fieldInputHtml(spec, value) {
    if (spec.type === "select") {
      var opts = spec.options.map(function (opt) {
        var label = (spec.optionLabels && spec.optionLabels[opt]) || opt;
        return '<option value="' + esc(opt) + '"' + (opt === value ? " selected" : "") + ">" + esc(label) + "</option>";
      }).join("");
      return '<select class="text-input" data-field="' + spec.field + '">' + opts + "</select>";
    }
    if (spec.type === "checkbox") {
      return '<input type="checkbox" data-field="' + spec.field + '"' + (value ? " checked" : "") + ">";
    }
    if (spec.type === "number") {
      return '<input type="number" min="0" step="1" class="num-input" data-field="' + spec.field + '" value="' + num(value) + '">';
    }
    return '<input type="text" class="text-input" data-field="' + spec.field + '" value="' + esc(value) + '">';
  }
  function listRowHtml(fields) {
    var cells = fields.map(function (spec) { return "<td>" + fieldInputHtml(spec, undefined) + "</td>"; }).join("");
    return "<tr data-row>" + cells + '<td><button type="button" class="btn" data-remove-row>削除</button></td></tr>';
  }
  function meisaiBody() {
    return MEISAI_KEYS.map(function (key) {
      var def = LIST_SECTIONS[key];
      var head = def.fields.map(function (f) { return "<th>" + f.label + "</th>"; }).join("") + "<th></th>";
      return '<div style="margin-bottom:.75rem"><div style="font-size:12px;font-weight:600;margin-bottom:4px">' +
        def.title + "</div>" +
        '<div class="tbl-wrap"><table class="tbl" data-section="' + key + '"><thead><tr>' + head +
        "</tr></thead><tbody data-rows></tbody></table></div>" +
        '<button type="button" class="btn" data-add-row="' + key + '">+ 行追加</button></div>';
    }).join("");
  }

  var SECTION_BODY = {
    gairai: function () { return gairaiBody(); },
    winj: function () { return winjBody(); },
    wardRx: function () { return wardRxBody(); },
    doctorChanges: function (m) { return doctorChangesBody(m); },
    premixes: function (m) { return premixesBody(m); },
    packer: function () { return packerBody(); },
    checklist: function (m, author) { return checklistBody(m, author); },
    meisai: function () { return meisaiBody(); },
    notes: function () { return notesBody(); }
  };
  var SECTION_ORDER = ["gairai", "winj", "wardRx", "doctorChanges", "premixes", "packer", "checklist", "meisai", "notes"];

  function todayStr() {
    var d = new Date(), p = function (n) { return n < 10 ? "0" + n : "" + n; };
    return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate());
  }

  function sectionCardHtml(key, masters, author) {
    var on = ES.DEFAULT_ON.indexOf(key) >= 0;
    return '<div class="card" data-section-card="' + key + '">' +
      '<div class="sec-title"><label><input type="checkbox" data-section-toggle="' + key + '"' +
      (on ? " checked" : "") + "> " + ES.SECTION_TITLES[key] + "</label></div>" +
      '<div data-section-body="' + key + '"' + (on ? "" : ' style="opacity:.4;pointer-events:none"') + ">" +
      SECTION_BODY[key](masters, author) + "</div></div>";
  }

  function render(container, masters) {
    var members = masters.members || [];
    var authorOpts = ['<option value="">（選択）</option>'].concat(members.map(function (m) {
      return '<option value="' + esc(m) + '">' + esc(m) + "</option>";
    })).join("");

    container.innerHTML =
      '<div class="card"><div class="edit-row"><label>日付</label>' +
      '<input type="date" class="text-input" id="entryDate" value="' + todayStr() + '"></div>' +
      '<div class="edit-row"><label>記入者</label>' +
      '<select class="text-input" id="entryAuthor">' + authorOpts + "</select></div></div>" +
      SECTION_ORDER.map(function (key) { return sectionCardHtml(key, masters, ""); }).join("");

    // セクションの有効/無効トグル
    container.addEventListener("change", function (e) {
      var t = e.target.closest("[data-section-toggle]");
      if (!t) return;
      var body = container.querySelector('[data-section-body="' + t.getAttribute("data-section-toggle") + '"]');
      if (t.checked) { body.style.opacity = ""; body.style.pointerEvents = ""; }
      else { body.style.opacity = ".4"; body.style.pointerEvents = "none"; }
    });

    // 記入者変更 → checklist セクションを再描画
    container.querySelector("#entryAuthor").addEventListener("change", function (e) {
      var body = container.querySelector('[data-section-body="checklist"]');
      body.innerHTML = checklistBody(masters, e.target.value);
    });

    // wardRx 合計の自動計算
    container.addEventListener("input", function (e) {
      if (!e.target.closest("[data-wardrx-ward]")) return;
      var ward = e.target.getAttribute("data-wardrx-ward");
      var sum = { cnt: 0, dose: 0 };
      WARDRX_KINDS.forEach(function (kind) {
        var inp = container.querySelector('[data-wardrx-ward="' + ward + '"][data-wardrx-kind="' + kind.key + '"]');
        sum.cnt += num(inp.value);
      });
      // dose は入力欄が無い(枚/件 の "件" は kind ごとに1つ)。cnt のみの表示にする。
      container.querySelector('[data-wardrx-total="' + ward + '"]').textContent = sum.cnt;
    });

    // 明細の行追加・削除
    container.addEventListener("click", function (e) {
      var add = e.target.closest("[data-add-row]");
      if (add) {
        var key = add.getAttribute("data-add-row");
        add.closest(".card").querySelector('table[data-section="' + key + '"] [data-rows]')
          .insertAdjacentHTML("beforeend", listRowHtml(LIST_SECTIONS[key].fields));
        return;
      }
      var rm = e.target.closest("[data-remove-row]");
      if (rm) rm.closest("tr").remove();
    });
  }

  function collectList(container, key) {
    var def = LIST_SECTIONS[key];
    var tableEl = container.querySelector('table[data-section="' + key + '"]');
    var items = [];
    tableEl.querySelectorAll("[data-row]").forEach(function (tr) {
      var item = {};
      def.fields.forEach(function (spec) {
        var inp = tr.querySelector('[data-field="' + spec.field + '"]');
        if (spec.type === "checkbox") item[spec.field] = inp.checked;
        else if (spec.type === "number") item[spec.field] = num(inp.value);
        else item[spec.field] = inp.value;
      });
      items.push(item);
    });
    return items;
  }

  function collect(container) {
    var q = function (sel) { return container.querySelector(sel); };
    var author = q("#entryAuthor").value;

    var wardRxRows = WARDS.map(function (ward) {
      var row = { name: ward };
      WARDRX_KINDS.forEach(function (kind) {
        var inp = q('[data-wardrx-ward="' + ward + '"][data-wardrx-kind="' + kind.key + '"]');
        row[kind.key] = { cnt: num(inp.value), dose: 0 };
      });
      return row;
    });

    var raw = {
      rxOpCnt: num(q('[data-field="rxOpCnt"]').value),
      rxOpDose: num(q('[data-field="rxOpDose"]').value),
      rxInjCnt: num(q('[data-field="rxInjCnt"]').value),
      rxInjDose: num(q('[data-field="rxInjDose"]').value),
      counsel: num(q('[data-field="counsel"]').value),
      winjData: WARDS.map(function (ward) {
        return {
          ward: ward,
          cnt: num(q('[data-winj-ward="' + ward + '"][data-winj-kind="cnt"]').value),
          dose: num(q('[data-winj-ward="' + ward + '"][data-winj-kind="dose"]').value)
        };
      }),
      wardRx: ES.wardRxTotals(wardRxRows),
      doctorChanges: [].slice.call(container.querySelectorAll("[data-doctor]")).map(function (inp) {
        return { doctor: inp.getAttribute("data-doctor"), cnt: num(inp.value) };
      }),
      premixes: [].slice.call(container.querySelectorAll("[data-premix]")).map(function (inp) {
        return { drug: inp.getAttribute("data-premix"), cnt: num(inp.value) };
      }),
      packerData: {
        tab: packerUnit(container, "tab"),
        san: packerUnit(container, "san")
      },
      checklist: [].slice.call(container.querySelectorAll("[data-checklist-item]"))
        .filter(function (c) { return c.checked; })
        .map(function (c) { return c.getAttribute("data-checklist-item"); }),
      notes: q('[data-field="notes"]').value
    };
    MEISAI_KEYS.forEach(function (key) { raw[key] = collectList(container, key); });

    var checked = SECTION_ORDER.filter(function (key) {
      return container.querySelector('[data-section-toggle="' + key + '"]').checked;
    });

    return {
      date: q("#entryDate").value,
      author: author,
      payload: ES.payloadFromSections(raw, checked)
    };
  }

  function packerUnit(container, unit) {
    var g = function (item) { return container.querySelector('[data-packer-unit="' + unit + '"][data-packer-item="' + item + '"]'); };
    return { "分包紙": num(g("分包紙").value), "インク": num(g("インク").value), "清掃": g("清掃").checked };
  }

  root.EntryForm = { render: render, collect: collect };
})(typeof window !== "undefined" ? window : this);
```

> 注: `wardRx` の入力欄は各区分の「枚数(cnt)」のみとし、`dose` は 0 固定で送る(病院CSVが `dose` を持つ主経路。手入力では枚数だけ取れれば実用上足りる、という設計判断)。承認側の partial merge で `wardRx` セクションを送った場合は `dose:0` で上書きされる点は、この画面を使う運用者が承知しているものとする。合計セルは cnt の和のみ表示。

- [ ] **Step 2: 構文チェック**

Run: `node --check src/entry/entry-form.js`
Expected: 出力なし・終了コード0

- [ ] **Step 3: 既存テストが壊れていないことを確認する**

Run: `node tests/entry-sections.test.js && node tests/daily-log.test.js`
Expected: 両方とも `0 failed`

- [ ] **Step 4: コミット**

```bash
git add src/entry/entry-form.js
git commit -m "feat: add mobile entry form (section-based, wardRx optional)"
```

---

### Task 4: `entry.html` と `src/entry/entry-main.js`

**Files:**
- Create: `entry.html`
- Create: `src/entry/entry-main.js`

**Interfaces:**
- Consumes:
  - `window.DailyLog` / `window.EntrySections` / `window.EntryForm` — `<script>` で読み込み
  - Firebase v10.8.0(`firebase-app` / `firebase-auth` の `signInAnonymously` / `firebase-firestore`)
  - `../../firebase-config.js` の `FIREBASE_CONFIG`
- Produces: 稼働するモバイル入力ページ

- [ ] **Step 1: `entry.html` を作成する**

```html
<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>薬局業務日誌 かんたん入力</title>
<link rel="stylesheet" href="style.css">
</head>
<body>
  <header class="app-header">
    <div class="app-title">かんたん入力（下書き）</div>
  </header>
  <main class="app">
    <div id="fatal" class="card" hidden><span class="err"></span></div>

    <div id="formWrap">
      <div id="form"></div>
      <div class="card">
        <button id="submitBtn" class="btn btn-primary">下書きを送信</button>
        <div id="submitMsg" class="hint"></div>
      </div>
    </div>

    <div id="done" class="card" hidden>
      <span class="ok">送信しました。薬局のPCで承認してください。</span>
      <div><button id="againBtn" class="btn">続けてもう1件入力</button></div>
    </div>

    <div class="card">
      <div class="sec-title">この端末から送信した下書き</div>
      <button id="refreshMineBtn" class="btn">更新</button>
      <div id="mine" class="hint"></div>
    </div>
  </main>

  <script src="src/model/daily-log.js"></script>
  <script src="src/model/entry-sections.js"></script>
  <script src="src/entry/entry-form.js"></script>
  <script type="module" src="src/entry/entry-main.js"></script>
</body>
</html>
```

- [ ] **Step 2: `src/entry/entry-main.js` を作成する**

```javascript
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, signInAnonymously } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import {
  getFirestore, doc, getDoc, collection, addDoc, query, where, getDocs
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { FIREBASE_CONFIG } from "../../firebase-config.js";

var app = initializeApp(FIREBASE_CONFIG);
var auth = getAuth(app);
var db = getFirestore(app);
var el = function (id) { return document.getElementById(id); };
var masters = null;

function showFatal(message) {
  el("formWrap").hidden = true;
  el("fatal").hidden = false;
  el("fatal").querySelector(".err").textContent = message;
}

function describe(err) { return err && err.message ? err.message : String(err); }

async function boot() {
  try {
    await signInAnonymously(auth);
  } catch (e) {
    showFatal("この端末はネットに接続されていないか、設定が未完了です（" + describe(e) + "）");
    return;
  }
  var uid = auth.currentUser.uid;

  try {
    var snap = await getDoc(doc(db, "masters", "current"));
    masters = snap.exists() ? snap.data()
      : { members: [], checklist: {}, premixes: [], doctors: [] };
  } catch (e) {
    showFatal("マスタの取得に失敗しました（" + describe(e) + "）");
    return;
  }

  window.EntryForm.render(el("form"), masters);
  el("submitBtn").addEventListener("click", function () { submit(uid); });
  el("refreshMineBtn").addEventListener("click", function () { refreshMine(uid); });
  el("againBtn").addEventListener("click", function () {
    el("done").hidden = true;
    el("formWrap").hidden = false;
    window.EntryForm.render(el("form"), masters);
  });
  await refreshMine(uid);
}

async function submit(uid) {
  var picked = window.EntryForm.collect(el("form"));
  var problems = [];
  if (!picked.author) problems.push("記入者を選んでください");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(picked.date)) problems.push("日付が正しくありません");
  if (!Object.keys(picked.payload).length) problems.push("記入したセクションがありません");
  if (problems.length) { el("submitMsg").innerHTML = '<span class="err">' + problems.join(" / ") + "</span>"; return; }

  el("submitBtn").disabled = true;
  el("submitMsg").textContent = "送信中…";
  try {
    await addDoc(collection(db, "draftEntries"), {
      schemaVersion: 1,
      uid: uid,
      date: picked.date,
      author: picked.author,
      createdAt: new Date().toISOString(),
      status: "pending",
      payload: picked.payload
    });
    el("formWrap").hidden = true;
    el("done").hidden = false;
    el("submitBtn").disabled = false;
    el("submitMsg").textContent = "";
    await refreshMine(uid);
  } catch (e) {
    el("submitMsg").innerHTML = '<span class="err">送信に失敗しました: ' + describe(e) + "</span>";
    el("submitBtn").disabled = false;
  }
}

async function refreshMine(uid) {
  el("mine").textContent = "読み込み中…";
  try {
    var snap = await getDocs(query(collection(db, "draftEntries"), where("uid", "==", uid)));
    var rows = [];
    snap.forEach(function (d) { rows.push(d.data()); });
    rows.sort(function (a, b) { return (a.createdAt < b.createdAt) ? 1 : -1; });
    if (!rows.length) {
      el("mine").textContent = "この端末からの未承認の下書きはありません。";
      return;
    }
    el("mine").innerHTML = rows.map(function (r) {
      var labels = window.EntrySections.sectionLabelsOf(r.payload || {});
      var t = r.createdAt.slice(11, 16);
      return '<div style="padding:4px 0;border-bottom:1px solid #EDF0F5">' +
        esc(r.date) + " ・ 記入者:" + esc(r.author) + " ・ 送信 " + esc(t) +
        " ・ " + labels.map(function (x) { return "[" + esc(x) + "]"; }).join("") + "</div>";
    }).join("");
  } catch (e) {
    el("mine").innerHTML = '<span class="err">一覧の取得に失敗しました: ' + describe(e) + "</span>";
  }
}

function esc(v) {
  return String(v === undefined || v === null ? "" : v)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

boot();
```

- [ ] **Step 3: 構文チェック**

Run: `node --check src/entry/entry-main.js && node --check src/entry/entry-form.js`
Expected: 出力なし・終了コード0

- [ ] **Step 4: dev サーバを起動してページを開く**

Run: `node scripts/dev-server.js`(バックグラウンド、ポート8430)。
ブラウザ手段で `http://localhost:8430/entry.html` を開く。

- [ ] **Step 5: コンソールで初期化を確認する**

```javascript
[typeof window.EntrySections, typeof window.EntryForm,
 document.getElementById("entryDate") ? "form:ok" : "form:MISSING",
 document.getElementById("fatal").hidden]
```

Expected: `["object","object","form:ok", true]`(fatal は隠れている = 匿名認証とマスタ取得が成功)。
コンソールに Firebase 由来のエラーが出ていないこと。`fatal` が表示される場合は、
Task 2 Step 1 の匿名認証有効化、Step 3 のルールデプロイが済んでいるか確認する。

- [ ] **Step 6: 下書きを1件送信してルールの実挙動を確認する**

```javascript
document.getElementById("entryAuthor").value =
  document.getElementById("entryAuthor").options[1] ? document.getElementById("entryAuthor").options[1].value : "";
document.getElementById("entryAuthor").dispatchEvent(new Event("change"));
// wardRx セクションを1つ ON にして数値を入れる
var t = document.querySelector('[data-section-toggle="wardRx"]'); t.checked = true; t.dispatchEvent(new Event("change", {bubbles:true}));
document.querySelector('[data-wardrx-ward="かりゆし"][data-wardrx-kind="teiki"]').value = 3;
document.getElementById("submitBtn").click();
```

数秒後:

```javascript
[document.getElementById("done").hidden, document.getElementById("mine").innerHTML.indexOf("記入者") >= 0]
```

Expected: `[false, true]`。`#done` が表示され、`#mine` に送信した下書きが1件出る
(= 匿名 create 成功 + 自UID read 成功)。Firestore コンソールの `draftEntries` にも
`uid` 付きのドキュメントが1件できていること。**この下書きは Task 8 の承認テストで使うか、
不要なら Firestore コンソールで削除する。**

- [ ] **Step 7: 別セッションから読めないことを確認する(任意・強く推奨)**

同じページを**シークレットウィンドウ**で開き、コンソールで:

```javascript
var s = await window.EntryForm; // ダミー参照(EntryForm 読み込み確認)
// entry-main が別の匿名UIDでサインインしている状態で
document.getElementById("mine").textContent
```

Expected: 「この端末からの未承認の下書きはありません。」(別UIDなので Step 6 の下書きは見えない)。

- [ ] **Step 8: コミット**

```bash
git add entry.html src/entry/entry-main.js
git commit -m "feat: add mobile draft-entry page wired to anonymous auth"
```

---

## Phase 3-2b: 承認フロー(本アプリ)

### Task 5: `src/app/draft-merge.js` とテスト

**Files:**
- Create: `src/app/draft-merge.js`
- Test: `tests/draft-merge.test.js`

**Interfaces:**
- Consumes: `require("../model/daily-log.js")` / `root.DailyLog`(`emptyLog`)
- Produces:
  - `DraftMerge.mergeDraftIntoLog(existingLogOrNull: object|null, draft: {date: string, author: string, payload: object}) → mergedLog`
    - `existingLogOrNull` が null → `DailyLog.emptyLog(draft.date)` を土台にする
    - `draft.payload` にあるキーだけを土台へ上書きする(**partial merge**。payload に無いキーは触らない)
    - `draft.author` が空でない文字列なら `author` に入れる
    - `_meta = { ...(existing._meta or {}), source: "mobile", mobileEntryAt: <ISO> }`
  - ブラウザでは `window.DraftMerge`(UMD)

- [ ] **Step 1: 失敗するテストを書く**

Create `tests/draft-merge.test.js`:

```javascript
var assert = require("assert");
var h = require("./helper.js");
var test = h.test;
var DM = require("../src/app/draft-merge.js");
var DailyLog = require("../src/model/daily-log.js");

test("new day: partial payload sits on an emptyLog base", function () {
  var out = DM.mergeDraftIntoLog(null, {
    date: "2026-08-26", author: "山田",
    payload: { rxOpCnt: 5, rxOpDose: 12, notes: "テスト" }
  });
  assert.strictEqual(out.date, "2026-08-26");
  assert.strictEqual(out.author, "山田");
  assert.strictEqual(out.rxOpCnt, 5);
  assert.strictEqual(out.rxOpDose, 12);
  assert.strictEqual(out.notes, "テスト");
  // 送っていないキーは emptyLog 既定
  assert.strictEqual(out.rxInjCnt, 0);
  assert.strictEqual(out.wardRx.length, 5);
  assert.deepStrictEqual(out.wardRx[0].teiki, { cnt: 0, dose: 0 });
  assert.strictEqual(out._meta.source, "mobile");
  assert.ok(typeof out._meta.mobileEntryAt === "string");
});

test("existing day without wardRx in payload: existing wardRx is kept", function () {
  var existing = DailyLog.emptyLog("2026-08-26");
  existing.wardRx[0].teiki = { cnt: 9, dose: 40 };
  existing.counsel = 3;
  existing._meta = { source: "csv", csvIngestedAt: "2026-08-26T01:00:00.000Z" };

  var out = DM.mergeDraftIntoLog(existing, {
    date: "2026-08-26", author: "佐藤",
    payload: { rxOpCnt: 7 }
  });
  assert.deepStrictEqual(out.wardRx[0].teiki, { cnt: 9, dose: 40 }); // 保持
  assert.strictEqual(out.counsel, 3);                                // payload に無い → 保持
  assert.strictEqual(out.rxOpCnt, 7);                                // payload → 上書き
  assert.strictEqual(out.author, "佐藤");
  assert.strictEqual(out._meta.source, "mobile");
  assert.strictEqual(out._meta.csvIngestedAt, "2026-08-26T01:00:00.000Z"); // 既存 _meta キーは保持
});

test("existing day with wardRx in payload: wardRx is overwritten", function () {
  var existing = DailyLog.emptyLog("2026-08-26");
  existing.wardRx[0].teiki = { cnt: 9, dose: 40 };

  var newWardRx = DailyLog.emptyLog("2026-08-26").wardRx;
  newWardRx[0].teiki = { cnt: 3, dose: 0 };
  newWardRx[0].total = { cnt: 3, dose: 0 };

  var out = DM.mergeDraftIntoLog(existing, {
    date: "2026-08-26", author: "山田",
    payload: { wardRx: newWardRx }
  });
  assert.deepStrictEqual(out.wardRx[0].teiki, { cnt: 3, dose: 0 });
  assert.deepStrictEqual(out.wardRx[0].total, { cnt: 3, dose: 0 });
});

test("empty author does not clobber an existing author", function () {
  var existing = DailyLog.emptyLog("2026-08-26");
  existing.author = "既存者";
  var out = DM.mergeDraftIntoLog(existing, { date: "2026-08-26", author: "", payload: { notes: "x" } });
  assert.strictEqual(out.author, "既存者");
});

h.summary();
```

- [ ] **Step 2: テストを実行して失敗を確認する**

Run: `node tests/draft-merge.test.js`
Expected: FAIL — `Cannot find module '../src/app/draft-merge.js'`

- [ ] **Step 3: `src/app/draft-merge.js` を作成する**

```javascript
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
```

- [ ] **Step 4: テストを実行して通ることを確認する**

Run: `node tests/draft-merge.test.js`
Expected: PASS — `--- 4 passed, 0 failed ---`

- [ ] **Step 5: コミット**

```bash
git add src/app/draft-merge.js tests/draft-merge.test.js
git commit -m "feat: add draft-merge core (partial merge of a mobile draft)"
```

---

### Task 6: `storage.js` に下書き用の関数を追加

**Files:**
- Modify: `src/app/storage.js`
- Modify: `index.html`(スクリプト追加)

**Interfaces:**
- Consumes:
  - Firestore ヘルパー `collection` / `doc` / `getDoc` / `getDocs` / `setDoc` / `query`(`storage.js` に既存。`deleteDoc` を import に追加)
  - `window.DraftMerge.mergeDraftIntoLog` — Task 5(`index.html` の `<script>` で読み込む)
- Produces:
  - `Storage.listDrafts() → Promise<Array<{id, uid, date, author, createdAt, payload}>>` — `createdAt` 昇順
  - `Storage.deleteDraft(id: string) → Promise<void>`
  - `Storage.saveDailyEntry(date: string, fields: object) → Promise<void>` — `fields` = `Object.assign({author}, payload)`。既存ログを読み `mergeDraftIntoLog` でマージして `setDoc`
  - `Storage.mergeDraftIntoLog` は使わない(承認画面は `saveDailyEntry` を呼ぶ)。純粋関数は `window.DraftMerge` から使う

- [ ] **Step 1: `storage.js` の import に `deleteDoc` を足す**

先頭の firestore import を次にする(`deleteDoc` を追加):

```javascript
import {
  getFirestore, collection, doc, getDoc, getDocs, setDoc, deleteDoc, writeBatch,
  query, orderBy, limit, where, getCountFromServer
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
```

- [ ] **Step 2: `saveWardRx` の直後に3関数を追加する**

`saveWardRx` 関数の閉じ `}` の直後に挿入する:

```javascript
var DRAFTS = "draftEntries";

// モバイル入力ページが作った下書きを createdAt 昇順で全件取得する。
async function listDrafts() {
  var snap = await getDocs(query(collection(db, DRAFTS), orderBy("createdAt")));
  var out = [];
  snap.forEach(function (d) {
    var data = d.data();
    out.push({
      id: d.id, uid: data.uid, date: data.date, author: data.author,
      createdAt: data.createdAt, payload: data.payload || {}
    });
  });
  return out;
}

async function deleteDraft(id) {
  await deleteDoc(doc(db, DRAFTS, id));
}

// 下書きの承認。fields = Object.assign({author}, payload)。
// 既存ログを読み、payload にあるキーだけ上書きして保存する(partial merge)。
async function saveDailyEntry(date, fields) {
  var snap = await getDoc(doc(db, LOGS, date));
  var existing = snap.exists() ? snap.data() : null;
  var payload = {};
  Object.keys(fields).forEach(function (k) { if (k !== "author") payload[k] = fields[k]; });
  var merged = window.DraftMerge.mergeDraftIntoLog(existing, {
    date: date, author: fields.author || "", payload: payload
  });
  await setDoc(doc(db, LOGS, date), merged);
}
```

- [ ] **Step 3: `storage.js` の `export` に3関数を足す**

```javascript
export {
  countLogs, saveLogs, saveMasters, getMasters, getLog,
  listLogsByMonth, saveLog, saveWardRx, listLogsByFiscalYear,
  listDrafts, deleteDraft, saveDailyEntry
};
```

- [ ] **Step 4: `index.html` に `<script>` を2本足す**

`<script src="src/app/hospital-import-core.js"></script>` の直後に:

```html
  <script src="src/model/entry-sections.js"></script>
  <script src="src/app/draft-merge.js"></script>
```

- [ ] **Step 5: 構文チェックと既存テスト**

Run: `node --check src/app/storage.js && node tests/draft-merge.test.js && node tests/entry-sections.test.js`
Expected: すべて `0 failed` / エラーなし

- [ ] **Step 6: コミット**

```bash
git add src/app/storage.js index.html
git commit -m "feat: add storage.listDrafts / deleteDraft / saveDailyEntry"
```

---

### Task 7: `src/app/views/drafts.js`(承認カードの描画)

**Files:**
- Create: `src/app/views/drafts.js`

**Interfaces:**
- Consumes: `window.EntrySections.sectionLabelsOf`(Task 1、`index.html` で読み込み済み)
- Produces:
  - `DraftsView.render(container: Element, drafts: Array, handlers: { onApprove(id), onReject(id) }) → void`
    - `drafts` は `Storage.listDrafts()` の戻り値
    - 各下書きを1行 + 「確認」ボタン。「確認」で payload の主要値を展開し「承認して反映」「却下」ボタンを出す
    - 「承認して反映」→ `handlers.onApprove(id)`、「却下」→ `window.confirm` の後 `handlers.onReject(id)`
    - 0件なら「未承認の下書きはありません」
  - ブラウザでは `window.DraftsView`(UMD)

- [ ] **Step 1: `src/app/views/drafts.js` を作成する**

```javascript
(function (root) {
  "use strict";

  function esc(v) {
    return String(v === undefined || v === null ? "" : v)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  function summarize(payload) {
    var parts = [];
    if (payload.rxOpDose !== undefined) parts.push("外来処方 " + payload.rxOpDose + "件");
    if (payload.counsel !== undefined) parts.push("薬管指導 " + payload.counsel + "件");
    ["inquiries", "mrVisits", "contacts", "drugs", "shortages", "meetings", "trainings"].forEach(function (k) {
      if (Array.isArray(payload[k]) && payload[k].length) {
        parts.push(k + " " + payload[k].length + "件");
      }
    });
    if (Array.isArray(payload.wardRx)) parts.push("病棟別処方");
    if (Array.isArray(payload.checklist) && payload.checklist.length) {
      parts.push("チェック " + payload.checklist.length + "件");
    }
    if (typeof payload.notes === "string" && payload.notes) parts.push("特記あり");
    return parts.length ? parts.join(" / ") : "(数値のみ)";
  }

  function rowHtml(d) {
    var labels = root.EntrySections.sectionLabelsOf(d.payload || {});
    var t = (d.createdAt || "").slice(11, 16);
    return '<div class="card" data-draft="' + esc(d.id) + '">' +
      '<div class="hint">' + esc(d.date) + " ・ 記入者:" + esc(d.author) + " ・ 送信 " + esc(t) +
      " ・ " + labels.map(function (x) { return "[" + esc(x) + "]"; }).join("") + "</div>" +
      '<button type="button" class="btn" data-draft-confirm>確認</button>' +
      '<div data-draft-detail hidden>' +
      '<div class="hint">' + esc(summarize(d.payload || {})) + "</div>" +
      '<button type="button" class="btn btn-success" data-draft-approve>承認して反映</button> ' +
      '<button type="button" class="btn" data-draft-reject>却下</button>' +
      "</div>" +
      '<div class="hint" data-draft-msg></div></div>';
  }

  function render(container, drafts, handlers) {
    if (!drafts.length) {
      container.innerHTML = '<div class="card"><div class="sec-title">モバイル下書きの承認</div>' +
        '<div class="empty">未承認の下書きはありません</div></div>';
      return;
    }
    container.innerHTML =
      '<div class="sec-title">モバイル下書きの承認</div>' +
      drafts.map(rowHtml).join("");

    container.onclick = function (event) {
      var card = event.target.closest("[data-draft]");
      if (!card) return;
      var id = card.getAttribute("data-draft");

      if (event.target.closest("[data-draft-confirm]")) {
        var box = card.querySelector("[data-draft-detail]");
        box.hidden = !box.hidden;
        return;
      }
      if (event.target.closest("[data-draft-approve]")) {
        card.querySelector("[data-draft-msg]").textContent = "反映中…";
        handlers.onApprove(id);
        return;
      }
      if (event.target.closest("[data-draft-reject]")) {
        if (window.confirm("この下書きを却下(削除)しますか？")) handlers.onReject(id);
      }
    };
  }

  root.DraftsView = { render: render };
})(typeof window !== "undefined" ? window : this);
```

- [ ] **Step 2: 構文チェック**

Run: `node --check src/app/views/drafts.js`
Expected: 出力なし・終了コード0

- [ ] **Step 3: コミット**

```bash
git add src/app/views/drafts.js
git commit -m "feat: add mobile draft approval card view"
```

---

### Task 8: `index.html` と `main.js` に承認カードを配線

**Files:**
- Modify: `index.html`
- Modify: `src/app/main.js`

**Interfaces:**
- Consumes:
  - `Storage.listDrafts` / `Storage.saveDailyEntry` / `Storage.deleteDraft` — Task 6
  - `window.DraftsView.render` — Task 7
  - 既存の `el` / `esc` / `describeError` / `hospGotoImportedDay` / `refreshStatus` — `main.js` に既存
- Produces: UI 挙動のみ

- [ ] **Step 1: `index.html` にカードの器とスクリプトを足す**

「病院システムCSVの取込」カードの閉じ `</div>` の直後、`<div id="mastersView"></div>` の直前に:

```html
        <div class="card card-amber">
          <div id="draftsView"></div>
        </div>
```

`<script src="src/app/views/changelog.js"></script>` の直後に:

```html
  <script src="src/app/views/drafts.js"></script>
```

- [ ] **Step 2: `main.js` の toolsDetails トグルで下書きを毎回読み直す**

現在の toggle ハンドラ(`el("toolsDetails").addEventListener("toggle", ...)`)を次にする:

```javascript
el("toolsDetails").addEventListener("toggle", function (event) {
  if (!event.target.open) return;
  if (!statusLoaded) {
    statusLoaded = true;
    refreshStatus();
    loadMasters();
    window.ChangelogView.render(el("changelogView"));
  }
  loadDrafts();
});
```

- [ ] **Step 3: `main.js` に `loadDrafts` と承認・却下ハンドラを足す**

`Auth.onChange(render);` の直前に挿入する:

```javascript
async function loadDrafts() {
  el("draftsView").innerHTML = '<div class="empty">読み込み中…</div>';
  try {
    var drafts = await Storage.listDrafts();
    window.DraftsView.render(el("draftsView"), drafts, {
      onApprove: approveDraft,
      onReject: rejectDraft
    });
  } catch (err) {
    el("draftsView").innerHTML = '<div class="sec-title">モバイル下書きの承認</div>' +
      '<span class="err">読み取りに失敗しました: ' + esc(describeError(err)) + "</span>";
  }
}

async function approveDraft(id) {
  var msgEl = el("draftsView").querySelector('[data-draft="' + id + '"] [data-draft-msg]');
  var drafts;
  try {
    drafts = await Storage.listDrafts();
  } catch (err) {
    if (msgEl) msgEl.innerHTML = '<span class="err">' + esc(describeError(err)) + "</span>";
    return;
  }
  var draft = drafts.filter(function (d) { return d.id === id; })[0];
  if (!draft) { loadDrafts(); return; }

  var fields = Object.assign({ author: draft.author }, draft.payload);
  var merged = window.DraftMerge.mergeDraftIntoLog(null, {
    date: draft.date, author: draft.author, payload: draft.payload
  });
  var errors = window.DailyLog.validate(merged);
  if (errors.length) {
    if (msgEl) {
      msgEl.innerHTML = '<span class="err">検証エラー:<br>' +
        errors.map(function (e) { return esc(e.field) + "：" + esc(e.message); }).join("<br>") + "</span>";
    }
    return;
  }

  try {
    await Storage.saveDailyEntry(draft.date, fields);
  } catch (err) {
    if (msgEl) msgEl.innerHTML = '<span class="err">反映に失敗しました: ' + esc(describeError(err)) + "</span>";
    return;
  }
  try {
    await Storage.deleteDraft(id);
  } catch (err) {
    if (msgEl) {
      msgEl.innerHTML = '<span class="err">反映しましたが下書きの削除に失敗しました。もう一度却下してください。</span>';
    }
    await refreshStatus();
    await hospGotoImportedDay(draft.date);
    return;
  }
  await refreshStatus();
  await hospGotoImportedDay(draft.date);
}

async function rejectDraft(id) {
  try {
    await Storage.deleteDraft(id);
  } catch (err) {
    var msgEl = el("draftsView").querySelector('[data-draft="' + id + '"] [data-draft-msg]');
    if (msgEl) msgEl.innerHTML = '<span class="err">削除に失敗しました: ' + esc(describeError(err)) + "</span>";
    return;
  }
  loadDrafts();
}
```

> `approveDraft` は承認前に `mergeDraftIntoLog(null, ...)` + `DailyLog.validate` で下書き単体の妥当性を検査する(既存日とのマージ結果ではなく、下書きが持つ値そのものの検証。`saveDailyEntry` 内でも同じマージを行うが、そちらは検証しない)。

- [ ] **Step 4: 構文チェックと既存テスト**

Run: `node --check src/app/main.js && node tests/draft-merge.test.js && node tests/entry-sections.test.js && node tests/daily-log.test.js`
Expected: すべて `0 failed` / エラーなし

- [ ] **Step 5: ブラウザで承認フローを確認する(Google ログインが必要)**

dev サーバで `http://localhost:8430`(本アプリ)を開き、Google ログイン後:

1. 「データ管理」パネルを開く → 「モバイル下書きの承認」に Task 4 Step 6 で作った下書きが1件出ること
2. 「確認」→ 概要が展開されること
3. 「承認して反映」→ その日の詳細画面へ遷移し、`wardRx` の かりゆし 定期 = 3 が反映されていること
4. パネルを開き直す → その下書きが消えていること(`deleteDraft` 成功)
5. コンソールに:
   ```javascript
   (await window.PharmacyStorage.getLog("<対象日>"))._meta
   ```
   Expected: `{ source: "mobile", mobileEntryAt: "..." , (病院CSVを先に入れていれば csvIngestedAt も) }`

> Google ログインを自動化できないため、この Step は手動。実施できない場合は
> 引継ぎメモに「未検証」と記録して先へ進む(Task 9)。

- [ ] **Step 6: コミット**

```bash
git add index.html src/app/main.js
git commit -m "feat: wire mobile draft approval card in the data-management panel"
```

---

### Task 9: 更新履歴・バージョン・引継ぎメモ

**Files:**
- Modify: `src/app/views/changelog.js`
- Modify: `index.html`(`.app-version`)
- Modify: `docs/superpowers/handoff-2026-08-26.md`

**Interfaces:**
- Consumes: なし
- Produces: なし(ドキュメントのみ)

- [ ] **Step 1: 更新履歴に1件足す**

`src/app/views/changelog.js` の `CHANGELOG_ENTRIES` 配列の先頭に:

```javascript
    {
      date: "2026-08-27", type: "feat",
      title: "フェーズ3-2: モバイル下書き入力と承認を追加",
      detail: "ログイン画面のないモバイル入力ページ (entry.html) を追加した。Firebase の匿名認証で、その日の日誌項目をセクション単位で下書き送信でき、送った端末から自分の未承認分を見返せる。本アプリの「データ管理」パネルに承認カードを足し、下書きを確認して承認すると、その日の日誌へ記入したセクションだけを反映 (partial merge) し、下書きを削除する。病棟別処方箋データも任意セクションとして手入力できる (病院CSV取込は主経路として存続)。",
      cause: null
    },
```

- [ ] **Step 2: バージョン表示を更新する**

`index.html` の `<span class="app-version">3-1 (2026-08-27)</span>` を:

```html
<span class="app-version">3-2 (2026-08-27)</span>
```

- [ ] **Step 3: 引継ぎメモを更新する**

`docs/superpowers/handoff-2026-08-26.md` の「状態:」行を:

```markdown
状態: **フェーズ3-2(モバイル下書き→承認)まで実装完了・feature ブランチ上・未push。次は 2b-5(他部署向け日報)保留分。**
```

「### 次にやること」の直前に:

```markdown
### フェーズ3-2 完了メモ (2026-08-27)

- 設計書: `docs/superpowers/specs/2026-08-27-phase3-2-mobile-draft-entry-design.md`
- 実装計画: `docs/superpowers/plans/2026-08-27-phase3-2-mobile-draft-entry.md`
- 新ページ `entry.html` + `src/entry/`(匿名認証・下書き作成・自端末の見返し)
- `src/model/entry-sections.js`(セクション定義と純粋関数・テスト有)、`src/app/draft-merge.js`(partial merge・テスト有)
- `storage.js` に `listDrafts` / `deleteDraft` / `saveDailyEntry`
- 「データ管理」パネルに「モバイル下書きの承認」カード(`src/app/views/drafts.js`)
- `firestore.rules` 変更: `masters` 匿名読取・`draftEntries` の匿名作成/自UID読取。`dailyLogs` は不変
- **利用者の作業**: Firebase コンソールで匿名認証を有効化 + ルールをデプロイ
- **submissions(提出資料)と checklist の日誌側フル対応は未了**: checklist は string[] として入力ページのみ対応。編集画面(edit.js)・詳細画面(detail.js)は未対応。submissions はスコープ外
- **検証の残**: Google ログインが必要な承認フローの目視(Task 8 Step 5)は環境次第
```

- [ ] **Step 4: 全テストを流す**

Run: `node tests/entry-sections.test.js && node tests/draft-merge.test.js && node tests/hospital-import-core.test.js && node tests/hospital-csv.test.js && node tests/filename.test.js && node tests/daily-log.test.js && node tests/accum-csv.test.js && node tests/month.test.js && node tests/monthly-report.test.js && node tests/dept-report.test.js && node tests/holidays.test.js`
Expected: すべて `0 failed`

- [ ] **Step 5: コミット**

```bash
git add src/app/views/changelog.js index.html docs/superpowers/handoff-2026-08-26.md
git commit -m "docs: record phase 3-2 mobile draft entry in changelog and handoff"
```

---

## Self-Review

**Spec coverage:**

| 設計書のセクション | 対応するタスク |
|---|---|
| §2 ファイル変更(entry.html / entry-main.js / entry-form.js / storage.js / drafts.js / main.js / index.html / firestore.rules / daily-log.js 不変) | Task 1〜9。純粋コアは `entry-sections.js`(Task 1)と `draft-merge.js`(Task 5)に分離 |
| §3.1 匿名認証の有効化 | Task 2 Step 1(利用者作業) |
| §3.2 `firestore.rules` | Task 2 Step 2(全文を明記) |
| §3.3 受け入れるリスク | 本計画では実装なし。設計書に記録済み |
| §4 スキーマ(`uid` 含む・payload は記入セクションのみ) | Task 4 Step 2 の `addDoc`、Task 1 `payloadFromSections` |
| §4 セクション対応表 | Task 1 `SECTION_FIELDS` |
| §4 `wardRx.total` 自動計算 | Task 1 `wardRxTotals`、Task 3 `collect` |
| §4 `checklist` は string[] | Task 3 `checklistBody` / `collect`(`data-checklist-item` のチェック済みのみ) |
| §5.1 読み込み(匿名認証→マスタ→フォーム→自端末一覧) | Task 4 Step 2 `boot` |
| §5.2 セクション制フォーム・既定ON/OFF・checklist の記入者依存 | Task 3 `render` |
| §5.3 送信(collect→addDoc・送信前チェック・成功/失敗) | Task 4 Step 2 `submit` |
| §5.4 自端末の下書き一覧(`where('uid','==')`・クライアント側ソート) | Task 4 Step 2 `refreshMine` |
| §5.5 表示範囲 | Task 4(dailyLogs にアクセスしない・他UID分を読まない) |
| §6 承認カード(パネルを開くたび読み直し・確認・承認・却下・遷移) | Task 8 |
| §7 `saveDailyEntry` / `mergeDraftIntoLog`(partial merge・_meta) | Task 5 / Task 6 |
| §8 エラー処理 | Task 4(fatal / submit 失敗 / 一覧失敗)、Task 8(listDrafts 失敗 / validate / delete 失敗) |
| §9 テスト方針 | Task 1・Task 5 の Node テスト、Task 4 Step 5〜7 ブラウザ検証、Task 8 Step 5 承認の目視、Task 2 Step の手動ルール検証 |
| §10 絶対原則 | Global Constraints |

設計書との差分(計画で確定):
- 純粋コアを2ファイルに分離(`entry-sections.js` / `draft-merge.js`)。理由: Node テストのため UMD にする必要があり、責務も別(セクション定義 / マージ)。
- `wardRx` 手入力は各区分の cnt のみ(dose は 0 固定)。理由: 詳細/編集画面でも `wardRx.dose` は表示・編集されておらず、手入力で枚数だけ取れれば実用上足りる。Task 3 Step 1 の注記に明記。
- 承認カードのルール検証(§9)は Task 2 に前倒しで文面を置き、実挙動確認は Task 4/Task 8 のブラウザ手順に含めた。

**Placeholder scan:** 「TBD」「後で」「適切なエラー処理」等なし。コードを要する全ステップに実コードを記載。ブラウザ検証ステップはコンソール式を明記。

**Type consistency:**
- `EntrySections.payloadFromSections(rawValues, checkedKeys)` / `wardRxTotals(rows)` / `sectionLabelsOf(payload)` — Task 1 で定義、Task 3(`collect`)・Task 4(`refreshMine`)・Task 7(`rowHtml`)で同名・同引数で使用。一致。
- `DraftMerge.mergeDraftIntoLog(existingOrNull, {date, author, payload})` — Task 5 で定義、Task 6(`saveDailyEntry`)・Task 8(`approveDraft` の事前検証)で使用。一致。
- `Storage.listDrafts()` 戻り値 `{id, uid, date, author, createdAt, payload}` — Task 6 で定義、Task 7(`drafts` 配列)・Task 8(`approveDraft`)で `d.id` / `d.date` / `d.author` / `d.payload` として使用。一致。
- `Storage.saveDailyEntry(date, fields)` の `fields` = `Object.assign({author}, payload)` — Task 6 の定義と Task 8 の呼び出しで一致。`saveDailyEntry` 内で `author` を除いて payload を再構成する点も明記済み。
- `DraftsView.render(container, drafts, handlers)` の `handlers` = `{onApprove(id), onReject(id)}` — Task 7 で定義、Task 8 の `loadDrafts` で同じ形を渡す。一致。
- 下書きスキーマのキー(`schemaVersion, uid, date, author, createdAt, status, payload`)— Task 2 のルール `hasOnly`、Task 4 の `addDoc`、Task 6 の `listDrafts` 射影で一致。
- `hospGotoImportedDay(date)` — フェーズ3-1 で `main.js` に導入済みの関数を Task 8 で再利用。名称そのまま。
