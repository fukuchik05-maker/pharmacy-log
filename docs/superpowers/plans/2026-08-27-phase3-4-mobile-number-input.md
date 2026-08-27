# モバイル入力ページの数値入力を打ちやすく(フェーズ3-4) 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `src/entry/entry-form.js` の全数値入力を「空欄 + `placeholder="0"` + `inputmode="numeric"`」にして、スマホで 0 を消す手間なく打てるようにする。

**Architecture:** 数値入力を生成する6箇所すべてで `value="0"`(および `numInput` の `value="<n>"`)を削除し、`placeholder="0"` と `inputmode="numeric"` を付ける。`collect()` と合計計算は `num("")` が 0 を返すため変更不要。

**Tech Stack:** 素の JavaScript(依存パッケージなし)。UMD モジュール `src/entry/entry-form.js`。

## Global Constraints

- **依存パッケージを一切追加しない。**
- **変更するのは `src/entry/entry-form.js` の1ファイルのみ。** `collect()` / `render()` 内の `input` リスナー / `edit.js` / `detail.js` は変更しない。
- `type="number"` は維持する(`inputmode="numeric"` を足すだけ)。
- 新しい CSS クラスは追加しない。

設計の詳細は [フェーズ3-4 設計書](../specs/2026-08-27-phase3-4-mobile-number-input-design.md) を参照。

---

## File Structure

| ファイル | 変更点 |
|---|---|
| `src/entry/entry-form.js` | `numInput` ヘルパー、`winjBody`、`wardRxKindBlock`、`doctorChangesBody`、`premixesBody`、`packerBody`、`fieldInputHtml` の数値入力を「空欄 + placeholder + inputmode」に |
| `src/app/views/changelog.js` | フェーズ3-4 のエントリ追加 |
| `index.html` | `.app-version` を `3-4 (2026-08-27)` に |
| `docs/superpowers/handoff-2026-08-26.md` | フェーズ3-4 完了を反映 |

自動テストの追加は無し(`entry-form.js` は DOM 組み立てファイルで既存方針によりテストを持たない)。ブラウザ目視で検証する。

---

### Task 1: `entry-form.js` の数値入力を空欄化 + テンキー化

**Files:**
- Modify: `src/entry/entry-form.js`

**Interfaces:**
- Consumes: なし
- Produces: なし(`EntryForm.render` / `EntryForm.collect` のシグネチャ・戻り値は不変)

- [ ] **Step 1: `numInput` ヘルパーを書き換える**

`src/entry/entry-form.js` の

```javascript
  function numInput(field, value) {
    return '<input type="number" min="0" step="1" class="num-input" data-field="' +
      field + '" value="' + num(value) + '">';
  }
```

を次に置き換える:

```javascript
  function numInput(field) {
    return '<input type="number" inputmode="numeric" min="0" step="1" class="num-input" data-field="' +
      field + '" placeholder="0">';
  }
```

- [ ] **Step 2: `numInput` の呼び出しから第2引数を外す**

`gairaiBody()` 内の

```javascript
    return table('<th>区分</th><th class="num">枚数</th><th class="num">件数</th>',
      "<tr><td>外来処方箋</td><td>" + numInput("rxOpCnt", 0) + "</td><td>" + numInput("rxOpDose", 0) + "</td></tr>" +
      "<tr><td>外来注射箋</td><td>" + numInput("rxInjCnt", 0) + "</td><td>" + numInput("rxInjDose", 0) + "</td></tr>"
    ) + '<div class="edit-row"><label>薬剤管理指導（件）</label>' + numInput("counsel", 0) + "</div>";
```

を次に置き換える:

```javascript
    return table('<th>区分</th><th class="num">枚数</th><th class="num">件数</th>',
      "<tr><td>外来処方箋</td><td>" + numInput("rxOpCnt") + "</td><td>" + numInput("rxOpDose") + "</td></tr>" +
      "<tr><td>外来注射箋</td><td>" + numInput("rxInjCnt") + "</td><td>" + numInput("rxInjDose") + "</td></tr>"
    ) + '<div class="edit-row"><label>薬剤管理指導（件）</label>' + numInput("counsel") + "</div>";
```

- [ ] **Step 3: `winjBody` の2つの input を書き換える**

```javascript
      return "<tr><td>" + esc(ward) + "</td><td>" +
        '<input type="number" min="0" step="1" class="num-input" data-winj-ward="' + esc(ward) +
        '" data-winj-kind="cnt" value="0"></td><td>' +
        '<input type="number" min="0" step="1" class="num-input" data-winj-ward="' + esc(ward) +
        '" data-winj-kind="dose" value="0"></td></tr>';
```

を次に置き換える:

```javascript
      return "<tr><td>" + esc(ward) + "</td><td>" +
        '<input type="number" inputmode="numeric" min="0" step="1" class="num-input" data-winj-ward="' + esc(ward) +
        '" data-winj-kind="cnt" placeholder="0"></td><td>' +
        '<input type="number" inputmode="numeric" min="0" step="1" class="num-input" data-winj-ward="' + esc(ward) +
        '" data-winj-kind="dose" placeholder="0"></td></tr>';
```

- [ ] **Step 4: `wardRxKindBlock` の2つの input を書き換える**

```javascript
      return "<tr><td>" + esc(ward) + "</td><td>" +
        '<input type="number" min="0" step="1" class="num-input" data-wardrx-ward="' + esc(ward) +
        '" data-wardrx-kind="' + kind.key + '" data-wardrx-metric="cnt" value="0"></td><td>' +
        '<input type="number" min="0" step="1" class="num-input" data-wardrx-ward="' + esc(ward) +
        '" data-wardrx-kind="' + kind.key + '" data-wardrx-metric="dose" value="0"></td></tr>';
```

を次に置き換える:

```javascript
      return "<tr><td>" + esc(ward) + "</td><td>" +
        '<input type="number" inputmode="numeric" min="0" step="1" class="num-input" data-wardrx-ward="' + esc(ward) +
        '" data-wardrx-kind="' + kind.key + '" data-wardrx-metric="cnt" placeholder="0"></td><td>' +
        '<input type="number" inputmode="numeric" min="0" step="1" class="num-input" data-wardrx-ward="' + esc(ward) +
        '" data-wardrx-kind="' + kind.key + '" data-wardrx-metric="dose" placeholder="0"></td></tr>';
```

- [ ] **Step 5: `doctorChangesBody` の input を書き換える**

```javascript
      return "<tr><td>" + esc(doctor) + "</td><td>" +
        '<input type="number" min="0" step="1" class="num-input" data-doctor="' + esc(doctor) +
        '" data-doctor-index="' + i + '" value="0"></td></tr>';
```

を次に置き換える:

```javascript
      return "<tr><td>" + esc(doctor) + "</td><td>" +
        '<input type="number" inputmode="numeric" min="0" step="1" class="num-input" data-doctor="' + esc(doctor) +
        '" data-doctor-index="' + i + '" placeholder="0"></td></tr>';
```

- [ ] **Step 6: `premixesBody` の input を書き換える**

```javascript
      return "<tr><td>" + esc(drug) + "</td><td>" +
        '<input type="number" min="0" step="1" class="num-input" data-premix="' + esc(drug) +
        '" data-premix-index="' + i + '" value="0"></td></tr>';
```

を次に置き換える:

```javascript
      return "<tr><td>" + esc(drug) + "</td><td>" +
        '<input type="number" inputmode="numeric" min="0" step="1" class="num-input" data-premix="' + esc(drug) +
        '" data-premix-index="' + i + '" placeholder="0"></td></tr>';
```

- [ ] **Step 7: `packerBody` の2つの input を書き換える**

```javascript
        '<div class="edit-row"><label>分包紙</label><input type="number" min="0" step="1" class="num-input" data-packer-unit="' +
        unit.key + '" data-packer-item="分包紙" value="0"></div>' +
        '<div class="edit-row"><label>インク</label><input type="number" min="0" step="1" class="num-input" data-packer-unit="' +
        unit.key + '" data-packer-item="インク" value="0"></div>' +
```

を次に置き換える:

```javascript
        '<div class="edit-row"><label>分包紙</label><input type="number" inputmode="numeric" min="0" step="1" class="num-input" data-packer-unit="' +
        unit.key + '" data-packer-item="分包紙" placeholder="0"></div>' +
        '<div class="edit-row"><label>インク</label><input type="number" inputmode="numeric" min="0" step="1" class="num-input" data-packer-unit="' +
        unit.key + '" data-packer-item="インク" placeholder="0"></div>' +
```

- [ ] **Step 8: `fieldInputHtml` の number 分岐を書き換える**

```javascript
    if (spec.type === "number") {
      return '<input type="number" min="0" step="1" class="num-input" data-field="' + spec.field + '" value="' + num(value) + '">';
    }
```

を次に置き換える:

```javascript
    if (spec.type === "number") {
      return '<input type="number" inputmode="numeric" min="0" step="1" class="num-input" data-field="' + spec.field + '" placeholder="0">';
    }
```

- [ ] **Step 9: 構文チェックと既存テスト**

Run: `node --check src/entry/entry-form.js && node tests/entry-sections.test.js && node tests/daily-log.test.js`
Expected: エラーなし / 両方 `0 failed`

- [ ] **Step 10: 残っている `value="0"` が無いことを確認する**

Run: `grep -n 'value="0"' src/entry/entry-form.js || echo "none left"`
Expected: `none left`

- [ ] **Step 11: コミット**

```bash
git add src/entry/entry-form.js
git commit -m "feat: mobile entry number fields start empty with a numeric keypad"
```

---

### Task 2: 検証・更新履歴・引継ぎメモ

**Files:**
- Modify: `src/app/views/changelog.js`
- Modify: `index.html`
- Modify: `docs/superpowers/handoff-2026-08-26.md`

**Interfaces:**
- Consumes: なし
- Produces: なし

- [ ] **Step 1: dev サーバでモバイル入力ページを検証する**

Run: `node scripts/dev-server.js`(バックグラウンド)。
`http://localhost:8430/entry.html` を開き(匿名認証が有効な前提)、コンソールで:

```javascript
(function(){
  var t = document.querySelector('[data-section-toggle="wardRx"]');
  t.checked = true; t.dispatchEvent(new Event("change", {bubbles:true}));
  var inp = document.querySelector('[data-wardrx-ward="かりゆし"][data-wardrx-kind="teiki"][data-wardrx-metric="cnt"]');
  return JSON.stringify({
    valueIsEmpty: inp.value === "",
    placeholder: inp.getAttribute("placeholder"),
    inputmode: inp.getAttribute("inputmode"),
    anyValueZeroLeft: document.querySelectorAll('#form input[value="0"]').length
  });
})()
```

Expected: `{"valueIsEmpty":true,"placeholder":"0","inputmode":"numeric","anyValueZeroLeft":0}`

- [ ] **Step 2: 未入力のまま送っても 0 で入ることを確認する**

コンソールで記入者を選び「下書きを送信」:

```javascript
var a = document.getElementById("entryAuthor");
a.value = a.options[1].value; a.dispatchEvent(new Event("change"));
document.getElementById("submitBtn").click();
```

数秒後 `#done` が表示されること。Google ログイン環境で本アプリの「モバイル下書きの承認」からこの下書きを承認し、対象日の詳細で外来処方箋・病棟別注射などが 0、破綻が無いことを確認する(できなければ手動で行い引継ぎメモに記録)。**このテスト下書きは確認後に却下で消す。**

- [ ] **Step 3: 更新履歴に1件足す**

`src/app/views/changelog.js` の `CHANGELOG_ENTRIES` 配列の先頭に:

```javascript
    {
      date: "2026-08-27", type: "feat",
      title: "フェーズ3-4: モバイル入力の数値欄を打ちやすく",
      detail: "モバイル入力ページの数値入力欄を、初期値「0」からプレースホルダ表示の空欄に変更した。スマホでタップしたときに「0」を消す操作が不要になる。あわせて inputmode=\"numeric\" を付け、0〜9 のテンキーが出るようにした。未入力の欄はこれまで通り 0 として保存される。",
      cause: null
    },
```

- [ ] **Step 4: バージョン表示を更新する**

`index.html` の `<span class="app-version">3-3 (2026-08-27)</span>` を:

```html
<span class="app-version">3-4 (2026-08-27)</span>
```

- [ ] **Step 5: 引継ぎメモを更新する**

`docs/superpowers/handoff-2026-08-26.md` の「状態:」行を:

```markdown
状態: **フェーズ3-4（モバイル入力の数値欄改善）まで実装完了・feature ブランチ上。次は 2b-5（他部署向け日報）保留分。**
```

「### 次にやること」の直前に:

```markdown
### フェーズ3-4 完了メモ (2026-08-27)

- 設計書: `docs/superpowers/specs/2026-08-27-phase3-4-mobile-number-input-design.md`
- 実装計画: `docs/superpowers/plans/2026-08-27-phase3-4-mobile-number-input.md`
- `entry-form.js` の全数値入力を `value="0"` → 空欄 + `placeholder="0"` + `inputmode="numeric"` に
- `collect()` は不変（`num("")` が 0 を返すため未入力欄は 0 で保存）。`edit.js` は対象外
- 検証: 入力欄が空欄・placeholder/inputmode が付く・未入力送信で 0 保存（承認→反映の目視は Google ログイン環境で）
```

- [ ] **Step 6: 全 Node テストを流してコミット**

Run: `for f in tests/*.test.js; do node "$f" 2>&1 | tail -1; done`
Expected: すべて `0 failed`

```bash
git add src/app/views/changelog.js index.html docs/superpowers/handoff-2026-08-26.md
git commit -m "docs: record phase 3-4 mobile number-input in changelog and handoff"
```

---

## Self-Review

**Spec coverage:**

| 設計書のセクション | 対応するタスク |
|---|---|
| §2 対象6箇所 + `fieldInputHtml` の number 分岐 | Task 1 Step 1〜8(numInput / winj / wardRx / doctorChanges / premixes / packer / fieldInputHtml) |
| §2 `value="0"` 削除 + `placeholder="0"` + `inputmode="numeric"` | Task 1 の各 Step、Step 10 で残存チェック |
| §3 挙動(空欄表示・タップ・collect・合計・記入者/日付は対象外) | Task 1(collect / リスナー / #entryAuthor / #entryDate は触らない)、Task 2 Step 1・2 で検証 |
| §4 エラー処理(変更なし) | 追加コードなし |
| §5 テスト方針(ブラウザ目視) | Task 2 Step 1・2 |
| §6 絶対原則 | Global Constraints |

**Placeholder scan:** 「TBD」等なし。全 Step に完全な old/new コードを記載。

**Type consistency:**
- `numInput(field)` — Task 1 Step 1 で引数を1つに変更、Step 2 で呼び出し5箇所を合わせる。整合。
- `data-winj-ward` / `data-winj-kind` / `data-wardrx-ward` / `data-wardrx-kind` / `data-wardrx-metric` / `data-doctor` / `data-premix` / `data-packer-unit` / `data-packer-item` / `data-field` — 属性名は現行のまま。`collect()`(未変更)がこれらのセレクタで読むため、削除・改名しない。`value` を消して `placeholder` を足すだけなのでセレクタは無傷。整合。
- `num("")` が 0 を返す前提 — `Number("")` は `0`、`isFinite(0)` は `true` のため `num("")` → 0。`collect()` と `render()` の合計リスナーが依存。整合。
