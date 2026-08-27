# 病棟処方箋に「件数」を追加(フェーズ3-3) 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 手入力系の3画面(モバイル入力・編集・詳細)で、病棟処方箋の各区分(定期/臨時/退院/持参薬/1包化)の**枚数と件数の両方**を扱えるようにする。

**Architecture:** `daily-log.js` に「編集対象の5区分＋ラベル」を公開定数 `WARDRX_INPUT_KINDS` として1か所に置き、`entry-form.js` / `edit.js` / `detail.js` がそれを参照する。モデル(`normalize`/`validate`/`emptyWardRx`)は既に `{cnt, dose}` 対応済みのため変更しない。合計は5区分の cnt / dose をそれぞれ足して算出する。

**Tech Stack:** 素の JavaScript(依存パッケージなし)。UMD モジュール。テストは Node 標準 `assert` + `tests/helper.js`。

## Global Constraints

- **依存パッケージを一切追加しない**(`package.json` / `node_modules` なし)。
- **`src/model/daily-log.js` のロジックは変更しない。** 追加するのは公開定数1つだけ。
- **`src/model/monthly-report.js` は変更しない。** cnt 集計専用のため区分リストは現状のまま。
- **`src/parse/hospital-csv.js` は変更しない。** 既に cnt・dose 両方をパースしている。
- **外来行は wardRx に含めない。** wardRx は5病棟のまま。外来処方箋は `gairai` セクションの `rxOpCnt` / `rxOpDose`。
- UMD モジュールは既存パターン `(function (root) { ... })(typeof window !== "undefined" ? window : this)` に合わせる。
- 新しい CSS クラスは追加しない。既存の `.tbl` / `.tbl-wrap` / `.num` / `.num-input` / `.card` / `.sec-title` / `.hint` / `.edit-row` / `card-green` / `sec-title-green` を再利用する。

設計の詳細は [フェーズ3-3 設計書](../specs/2026-08-27-phase3-3-wardrx-dose-design.md) を参照。

---

## File Structure

| ファイル | 責務(この計画での変更点) |
|---|---|
| `src/model/daily-log.js` | `WARDRX_INPUT_KINDS`(5区分 × `{key,label}`)を追加し `api` に加える |
| `tests/daily-log.test.js` | `WARDRX_INPUT_KINDS` の中身を検証する1件を追加 |
| `src/entry/entry-form.js` | `wardRx` セクションを区分ごとの縦ブロック(病棟/枚数/件数)に作り直す。`collect` は cnt・dose 両方を返す |
| `src/app/views/detail.js` | `wardRxSection` を5区分 + 合計の7列にし、各セルを「枚 / 件」で表示 |
| `src/app/views/edit.js` | `wardRx` セクションを5区分 × 枚数・件数の編集に。`collect` を cnt・dose 両方読み・合計算出に変更 |
| `src/app/views/changelog.js` | フェーズ3-3 のエントリを追加 |
| `index.html` | `.app-version` を更新 |
| `docs/superpowers/handoff-2026-08-26.md` | フェーズ3-3 完了を反映 |

---

### Task 1: `daily-log.js` に `WARDRX_INPUT_KINDS` を追加

**Files:**
- Modify: `src/model/daily-log.js`
- Test: `tests/daily-log.test.js`

**Interfaces:**
- Consumes: なし
- Produces:
  - `DailyLog.WARDRX_INPUT_KINDS: Array<{ key: string, label: string }>` — `teiki/rinji/taiin/meds/ippoka` の順で5件。`entry-form.js` / `edit.js` / `detail.js` が参照する

- [ ] **Step 1: 失敗するテストを書く**

`tests/daily-log.test.js` の `h.summary();` の直前に挿入:

```javascript
test("WARDRX_INPUT_KINDS lists the five editable ward-rx kinds in order", function () {
  assert.deepStrictEqual(
    DailyLog.WARDRX_INPUT_KINDS.map(function (k) { return k.key; }),
    ["teiki", "rinji", "taiin", "meds", "ippoka"]
  );
  DailyLog.WARDRX_INPUT_KINDS.forEach(function (k) {
    assert.ok(typeof k.key === "string" && k.label.length > 0);
  });
});
```

- [ ] **Step 2: テストを実行して失敗を確認する**

Run: `node tests/daily-log.test.js`
Expected: FAIL — `Cannot read properties of undefined (reading 'map')`(`WARDRX_INPUT_KINDS` 未定義)

- [ ] **Step 3: 定数を追加する**

`src/model/daily-log.js` の `var RX_KINDS = [...]` の行の直後に挿入:

```javascript
  var WARDRX_INPUT_KINDS = [
    { key: "teiki", label: "定期" },
    { key: "rinji", label: "臨時" },
    { key: "taiin", label: "退院" },
    { key: "meds", label: "持参薬" },
    { key: "ippoka", label: "1包化" }
  ];
```

同ファイルの `var api = {` ブロックの `RX_KINDS: RX_KINDS,` の直後に:

```javascript
    WARDRX_INPUT_KINDS: WARDRX_INPUT_KINDS,
```

- [ ] **Step 4: テストを実行して通ることを確認する**

Run: `node tests/daily-log.test.js`
Expected: PASS — 末尾が `--- 9 passed, 0 failed ---`(既存8 + 新規1)

- [ ] **Step 5: 既存テストが壊れていないことを確認する**

Run: `node tests/monthly-report.test.js && node tests/dept-report.test.js && node tests/entry-sections.test.js && node tests/hospital-csv.test.js`
Expected: すべて `0 failed`

- [ ] **Step 6: コミット**

```bash
git add src/model/daily-log.js tests/daily-log.test.js
git commit -m "feat: add DailyLog.WARDRX_INPUT_KINDS shared constant"
```

---

### Task 2: `entry-form.js` の wardRx セクションを枚数＋件数に

**Files:**
- Modify: `src/entry/entry-form.js`

**Interfaces:**
- Consumes:
  - `root.DailyLog.WARDRX_INPUT_KINDS` — Task 1
  - `root.EntrySections.wardRxTotals(rows)` — 既存(cnt・dose 両方を合計する。`tests/entry-sections.test.js` で検証済み)
- Produces: 変更なし(`EntryForm.render` / `EntryForm.collect` のシグネチャは同じ。`collect().payload.wardRx` の各区分が `{cnt, dose}` になる)

- [ ] **Step 1: 冒頭の `WARDRX_KINDS` 定数を差し替える**

`src/entry/entry-form.js` の

```javascript
  var WARDRX_KINDS = [
    { key: "teiki", label: "定期" }, { key: "rinji", label: "臨時" },
    { key: "taiin", label: "退院" }, { key: "meds", label: "持参薬" },
    { key: "ippoka", label: "1包化" }
  ];
```

を次に置き換える:

```javascript
  var WARDRX_KINDS = DL.WARDRX_INPUT_KINDS;
```

- [ ] **Step 2: `wardRxBody()` を区分ごとの縦ブロックに書き換える**

現在の `wardRxBody` 関数全体を次に置き換える:

```javascript
  function wardRxKindBlock(kind) {
    var rows = WARDS.map(function (ward) {
      return "<tr><td>" + esc(ward) + "</td><td>" +
        '<input type="number" min="0" step="1" class="num-input" data-wardrx-ward="' + esc(ward) +
        '" data-wardrx-kind="' + kind.key + '" data-wardrx-metric="cnt" value="0"></td><td>' +
        '<input type="number" min="0" step="1" class="num-input" data-wardrx-ward="' + esc(ward) +
        '" data-wardrx-kind="' + kind.key + '" data-wardrx-metric="dose" value="0"></td></tr>';
    }).join("");
    return '<div style="margin-bottom:.75rem">' +
      '<div style="font-size:12px;font-weight:600;margin-bottom:4px">' + esc(kind.label) + "</div>" +
      table('<th>病棟</th><th class="num">枚数</th><th class="num">件数</th>', rows) + "</div>";
  }

  function wardRxTotalBlock() {
    var rows = WARDS.map(function (ward) {
      return "<tr><td>" + esc(ward) + '</td><td class="num">' +
        '<span data-wardrx-total-cnt="' + esc(ward) + '">0</span> / ' +
        '<span data-wardrx-total-dose="' + esc(ward) + '">0</span></td></tr>';
    }).join("");
    return '<div style="margin-bottom:.25rem">' +
      '<div style="font-size:12px;font-weight:600;margin-bottom:4px">合計（枚 / 件）</div>' +
      table('<th>病棟</th><th class="num">合計</th>', rows) + "</div>";
  }

  function wardRxBody() {
    return WARDRX_KINDS.map(wardRxKindBlock).join("") + wardRxTotalBlock() +
      '<div class="hint">合計は自動計算です。</div>';
  }
```

- [ ] **Step 3: `render()` 内の wardRx 合計計算リスナーを書き換える**

`render` 関数内の

```javascript
    // wardRx 合計の自動計算
    container.addEventListener("input", function (e) {
      if (!e.target.closest("[data-wardrx-ward]")) return;
      var ward = e.target.getAttribute("data-wardrx-ward");
      var sum = 0;
      WARDRX_KINDS.forEach(function (kind) {
        var inp = container.querySelector('[data-wardrx-ward="' + ward + '"][data-wardrx-kind="' + kind.key + '"]');
        sum += num(inp.value);
      });
      container.querySelector('[data-wardrx-total="' + ward + '"]').textContent = sum;
    });
```

を次に置き換える:

```javascript
    // wardRx 合計(枚・件)の自動計算
    container.addEventListener("input", function (e) {
      if (!e.target.closest("[data-wardrx-ward]")) return;
      var ward = e.target.getAttribute("data-wardrx-ward");
      var cnt = 0, dose = 0;
      WARDRX_KINDS.forEach(function (kind) {
        cnt += num(container.querySelector('[data-wardrx-ward="' + ward + '"][data-wardrx-kind="' + kind.key + '"][data-wardrx-metric="cnt"]').value);
        dose += num(container.querySelector('[data-wardrx-ward="' + ward + '"][data-wardrx-kind="' + kind.key + '"][data-wardrx-metric="dose"]').value);
      });
      container.querySelector('[data-wardrx-total-cnt="' + ward + '"]').textContent = cnt;
      container.querySelector('[data-wardrx-total-dose="' + ward + '"]').textContent = dose;
    });
```

- [ ] **Step 4: `collect()` 内の wardRx 収集を書き換える**

`collect` 関数内の

```javascript
    var wardRxRows = WARDS.map(function (ward) {
      var row = { name: ward };
      WARDRX_KINDS.forEach(function (kind) {
        var inp = q('[data-wardrx-ward="' + ward + '"][data-wardrx-kind="' + kind.key + '"]');
        row[kind.key] = { cnt: num(inp.value), dose: 0 };
      });
      return row;
    });
```

を次に置き換える:

```javascript
    var wardRxRows = WARDS.map(function (ward) {
      var row = { name: ward };
      WARDRX_KINDS.forEach(function (kind) {
        row[kind.key] = {
          cnt: num(q('[data-wardrx-ward="' + ward + '"][data-wardrx-kind="' + kind.key + '"][data-wardrx-metric="cnt"]').value),
          dose: num(q('[data-wardrx-ward="' + ward + '"][data-wardrx-kind="' + kind.key + '"][data-wardrx-metric="dose"]').value)
        };
      });
      return row;
    });
```

- [ ] **Step 5: 構文チェックと関連テスト**

Run: `node --check src/entry/entry-form.js && node tests/entry-sections.test.js && node tests/daily-log.test.js`
Expected: エラーなし / すべて `0 failed`

- [ ] **Step 6: コミット**

```bash
git add src/entry/entry-form.js
git commit -m "feat: mobile entry wardRx section takes count + dose per kind"
```

---

### Task 3: `detail.js` の病棟処方箋カードに件数を表示

**Files:**
- Modify: `src/app/views/detail.js`

**Interfaces:**
- Consumes: `root.DailyLog.WARDRX_INPUT_KINDS` — Task 1
- Produces: なし(表示のみ)

- [ ] **Step 1: `wardRxSection` を書き換える**

`src/app/views/detail.js` の `wardRxSection` 関数全体を次に置き換える:

```javascript
  function wardRxSection(log) {
    if (!log.wardRx || !log.wardRx.length) return "";
    var kinds = root.DailyLog.WARDRX_INPUT_KINDS;
    var head = "<th>病棟</th>" + kinds.map(function (k) {
      return '<th class="num">' + k.label + "</th>";
    }).join("") + '<th class="num">合計</th>';
    var rows = log.wardRx.map(function (w) {
      var cells = kinds.map(function (k) {
        var p = w[k.key] || { cnt: 0, dose: 0 };
        return '<td class="num">' + (p.cnt || 0) + " / " + (p.dose || 0) + "</td>";
      }).join("");
      var t = w.total || { cnt: 0, dose: 0 };
      return "<tr><td>" + esc(w.name) + "</td>" + cells +
        '<td class="num">' + (t.cnt || 0) + " / " + (t.dose || 0) + "</td></tr>";
    }).join("");
    return card("病棟処方箋", table(head, rows), "card-green", "sec-title-green");
  }
```

- [ ] **Step 2: 構文チェックと既存テスト**

Run: `node --check src/app/views/detail.js && node tests/monthly-report.test.js && node tests/dept-report.test.js`
Expected: エラーなし / すべて `0 failed`

- [ ] **Step 3: コミット**

```bash
git add src/app/views/detail.js
git commit -m "feat: show wardRx dispensing count in the detail view"
```

---

### Task 4: `edit.js` で件数も編集できるようにする

**Files:**
- Modify: `src/app/views/edit.js`

**Interfaces:**
- Consumes: `root.DailyLog.WARDRX_INPUT_KINDS` — Task 1
- Produces: なし(`EditView.render` のシグネチャは同じ。`collect` の戻り値の `wardRx` の各区分が入力欄由来の `{cnt, dose}` になり、`total` は算出値になる)

- [ ] **Step 1: 冒頭の `WARDRX_KINDS` 定数を差し替える**

`src/app/views/edit.js` の

```javascript
  var WARDRX_KINDS = [
    { key: "teiki", label: "定期" },
    { key: "rinji", label: "臨時" },
    { key: "taiin", label: "退院" },
    { key: "meds", label: "持参薬" },
    { key: "total", label: "合計" }
  ];
```

を次に置き換える:

```javascript
  var WARDRX_KINDS = root.DailyLog.WARDRX_INPUT_KINDS;
```

- [ ] **Step 2: `wardRxSection` を区分ごとの縦ブロックに書き換える**

`wardRxSection` 関数全体を次に置き換える:

```javascript
  function wardRxKindBlock(byName, kind) {
    var rows = WARDS.map(function (ward) {
      var w = byName[ward] || {};
      var pair = w[kind.key] || { cnt: 0, dose: 0 };
      return "<tr><td>" + esc(ward) + "</td><td>" +
        '<input type="number" min="0" step="1" class="num-input" data-wardrx-ward="' + esc(ward) +
        '" data-wardrx-kind="' + kind.key + '" data-wardrx-metric="cnt" value="' + num(pair.cnt) + '"></td><td>' +
        '<input type="number" min="0" step="1" class="num-input" data-wardrx-ward="' + esc(ward) +
        '" data-wardrx-kind="' + kind.key + '" data-wardrx-metric="dose" value="' + num(pair.dose) + '"></td></tr>';
    }).join("");
    return '<div style="margin-bottom:.75rem">' +
      '<div style="font-size:12px;font-weight:600;margin-bottom:4px">' + esc(kind.label) + "</div>" +
      table('<th>病棟</th><th class="num">枚数</th><th class="num">件数</th>', rows) + "</div>";
  }

  function wardRxSection(log) {
    var byName = {};
    (log.wardRx || []).forEach(function (w) { byName[w.name] = w; });
    var body = WARDRX_KINDS.map(function (kind) { return wardRxKindBlock(byName, kind); }).join("") +
      '<div class="hint">合計は保存時に自動計算されます。</div>';
    return card("病棟処方箋", body, "card-green", "sec-title-green");
  }
```

- [ ] **Step 3: `collect` 内の wardRx 収集を書き換える**

`collect` 関数内の

```javascript
      wardRx: WARDS.map(function (ward) {
        var orig = byWardRx[ward] || {};
        var row = { name: ward };
        WARDRX_KINDS.forEach(function (kind) {
          var input = container.querySelector(
            '[data-wardrx-ward="' + ward + '"][data-wardrx-kind="' + kind.key + '"]');
          var origPair = orig[kind.key] || { cnt: 0, dose: 0 };
          row[kind.key] = { cnt: num(input.value), dose: origPair.dose || 0 };
        });
        row.ippoka = orig.ippoka || { cnt: 0, dose: 0 };
        return row;
      }),
```

を次に置き換える:

```javascript
      wardRx: WARDS.map(function (ward) {
        var row = { name: ward };
        var t = { cnt: 0, dose: 0 };
        WARDRX_KINDS.forEach(function (kind) {
          var cnt = num(container.querySelector(
            '[data-wardrx-ward="' + ward + '"][data-wardrx-kind="' + kind.key + '"][data-wardrx-metric="cnt"]').value);
          var dose = num(container.querySelector(
            '[data-wardrx-ward="' + ward + '"][data-wardrx-kind="' + kind.key + '"][data-wardrx-metric="dose"]').value);
          row[kind.key] = { cnt: cnt, dose: dose };
          t.cnt += cnt;
          t.dose += dose;
        });
        row.total = t;
        return row;
      }),
```

- [ ] **Step 4: `collect` 冒頭の未使用になった `byWardRx` を確認して残す/消す**

`collect` 関数の先頭にある

```javascript
    var byWardRx = {};
    (original.wardRx || []).forEach(function (w) { byWardRx[w.name] = w; });
```

は Step 3 の書き換えで参照されなくなる。この2行を削除する。

- [ ] **Step 5: 構文チェックと既存テスト**

Run: `node --check src/app/views/edit.js && node tests/daily-log.test.js && node tests/monthly-report.test.js`
Expected: エラーなし / すべて `0 failed`

- [ ] **Step 6: コミット**

```bash
git add src/app/views/edit.js
git commit -m "feat: edit view takes wardRx count + dose for all five kinds"
```

---

### Task 5: 検証・更新履歴・引継ぎメモ

**Files:**
- Modify: `src/app/views/changelog.js`
- Modify: `index.html`
- Modify: `docs/superpowers/handoff-2026-08-26.md`

**Interfaces:**
- Consumes: なし
- Produces: なし

- [ ] **Step 1: 全 Node テストを流す**

Run: `for f in tests/*.test.js; do node "$f"; done`(または個別に)
Expected: すべての `.test.js` が `0 failed`。合計 81 件(daily-log +1)。

- [ ] **Step 2: dev サーバを起動し、モバイル入力ページを検証する**

Run: `node scripts/dev-server.js`(バックグラウンド)。
`http://localhost:8430/entry.html` を開き(匿名認証が有効な前提)、コンソールで:

```javascript
(function(){
  var t = document.querySelector('[data-section-toggle="wardRx"]');
  t.checked = true; t.dispatchEvent(new Event("change", {bubbles:true}));
  var cnt = document.querySelector('[data-wardrx-ward="かりゆし"][data-wardrx-kind="teiki"][data-wardrx-metric="cnt"]');
  var dose = document.querySelector('[data-wardrx-ward="かりゆし"][data-wardrx-kind="teiki"][data-wardrx-metric="dose"]');
  cnt.value = 3; cnt.dispatchEvent(new Event("input", {bubbles:true}));
  dose.value = 18; dose.dispatchEvent(new Event("input", {bubbles:true}));
  return JSON.stringify({
    totalCnt: document.querySelector('[data-wardrx-total-cnt="かりゆし"]').textContent,
    totalDose: document.querySelector('[data-wardrx-total-dose="かりゆし"]').textContent
  });
})()
```

Expected: `{"totalCnt":"3","totalDose":"18"}`。続けて記入者を選び「下書きを送信」→ `#done` 表示。

- [ ] **Step 3: 本アプリで承認 → 詳細表示を検証する(Google ログイン環境)**

`http://localhost:8430/` にログイン → 「データ管理」→「モバイル下書きの承認」で Step 2 の下書きを承認 →
遷移先の詳細画面の「病棟処方箋」カードで、かりゆし 定期のセルが「3 / 18」、合計が「3 / 18」に
なっていること。病院CSVを取り込んだ既存日を開き、各セルが「枚 / 件」で正しく出ることも確認。

> Google ログインを自動化できない場合は、この Step を手動で行い、結果を引継ぎメモに記録する。

- [ ] **Step 4: 編集画面を検証する(Google ログイン環境)**

任意の既存日を開いて「編集」→「病棟処方箋」が区分ごとの縦ブロックになっていること →
いずれかの区分の件数を変更 →「保存」→ 詳細でその件数が反映されていること。

- [ ] **Step 5: 更新履歴に1件足す**

`src/app/views/changelog.js` の `CHANGELOG_ENTRIES` 配列の先頭に:

```javascript
    {
      date: "2026-08-27", type: "feat",
      title: "フェーズ3-3: 病棟処方箋に調剤件数を追加",
      detail: "病棟処方箋の各区分（定期・臨時・退院・持参薬・1包化）について、これまで処方箋枚数しか扱えなかったモバイル入力・編集・詳細の3画面で、調剤件数も入力・編集・表示できるようにした。合計は枚数・件数それぞれ自動計算する。編集画面で1包化が編集できなかった不整合も解消した。",
      cause: null
    },
```

- [ ] **Step 6: バージョン表示を更新する**

`index.html` の `<span class="app-version">3-2 (2026-08-27)</span>` を:

```html
<span class="app-version">3-3 (2026-08-27)</span>
```

- [ ] **Step 7: 引継ぎメモを更新する**

`docs/superpowers/handoff-2026-08-26.md` の「状態:」行を:

```markdown
状態: **フェーズ3-3（病棟処方箋の調剤件数対応）まで実装完了。次は 2b-5（他部署向け日報）保留分。**
```

「### 次にやること」の直前に:

```markdown
### フェーズ3-3 完了メモ (2026-08-27)

- 設計書: `docs/superpowers/specs/2026-08-27-phase3-3-wardrx-dose-design.md`
- 実装計画: `docs/superpowers/plans/2026-08-27-phase3-3-wardrx-dose.md`
- `daily-log.js` に `WARDRX_INPUT_KINDS`（teiki/rinji/taiin/meds/ippoka × {key,label}）を追加。モデル本体は不変
- `entry-form.js` / `edit.js` / `detail.js` の wardRx を、5区分 × 枚数・件数 に統一。合計は cnt/dose それぞれ算出
- `edit.js` で 1包化が編集できず・件数が引き継ぎだけ、だった制限を解消
- `monthly-report.js`（cnt 集計専用）は未変更
- 検証: モバイル入力の合計自動計算、承認→詳細の「枚 / 件」表示、編集画面の件数編集（Google ログイン環境での目視は環境次第）
```

- [ ] **Step 8: コミット**

```bash
git add src/app/views/changelog.js index.html docs/superpowers/handoff-2026-08-26.md
git commit -m "docs: record phase 3-3 wardRx dose in changelog and handoff"
```

---

## Self-Review

**Spec coverage:**

| 設計書のセクション | 対応するタスク |
|---|---|
| §2 `WARDRX_INPUT_KINDS` を `daily-log.js` に追加 | Task 1 |
| §2 区分リストの食い違いを entry/edit/detail で揃える | Task 2 Step 1 / Task 4 Step 1 / Task 3 Step 1(いずれも `WARDRX_INPUT_KINDS` を参照) |
| §3.1 モバイル入力の区分ごとの縦ブロック | Task 2 Step 2 |
| §3.2 合計の自動計算(枚・件) | Task 2 Step 3 |
| §3.3 `collect` が cnt・dose 両方 | Task 2 Step 4 |
| §4 詳細画面の7列「枚 / 件」表示 | Task 3 Step 1 |
| §5.1 編集画面の縦ブロック | Task 4 Step 2 |
| §5.2 `collect` を cnt・dose 読み・合計算出に | Task 4 Step 3 / Step 4 |
| §6 エラー処理(number 入力・validate は既存) | 追加コードなし。`num()` と既存 `validate` に委譲 |
| §7 テスト | Task 1 Step 1(定数テスト)、Task 5 Step 1(全 Node テスト)、Task 5 Step 2〜4(ブラウザ検証) |
| §8 絶対原則 | Global Constraints |

**Placeholder scan:** 「TBD」「後で」等なし。コードを要する全ステップに完全なコードを記載。ブラウザ検証はコンソール式を明記。

**Type consistency:**
- `DailyLog.WARDRX_INPUT_KINDS`（`[{key,label}]`）— Task 1 で定義。Task 2(`WARDRX_KINDS = DL.WARDRX_INPUT_KINDS`)、Task 3(`root.DailyLog.WARDRX_INPUT_KINDS`)、Task 4(`root.DailyLog.WARDRX_INPUT_KINDS`)で参照。すべて `k.key` / `k.label` としてアクセス。一致。
- `data-wardrx-ward` + `data-wardrx-kind` + `data-wardrx-metric="cnt"|"dose"` の3属性セレクタ — Task 2(body 生成・input リスナー・collect)と Task 4(body 生成・collect)で同一形。一致。
- `data-wardrx-total-cnt` / `data-wardrx-total-dose` — Task 2 Step 2 で生成、Step 3 のリスナーで更新。一致。
- `EntrySections.wardRxTotals(rows) → rows(total 付き)` — 既存・変更なし。Task 2 の `collect` が使う(`raw.wardRx = ES.wardRxTotals(wardRxRows)` は現行コードのまま)。`edit.js` は `wardRxTotals` を使わず `collect` 内で合計を算出(Task 4 Step 3)。両者とも `total = {cnt, dose}` の形で一致。
- `edit.js` の `collect` から `byWardRx` を削除(Task 4 Step 4)— Step 3 の新コードは `byWardRx` を参照しないことを確認済み。`original` 引数自体は他の収集(premixes/doctorChanges)で使うため残す。
