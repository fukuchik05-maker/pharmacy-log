# 薬局業務日誌 フェーズ2b-4：マスタ設定 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 記入者・チェックリスト項目・予製マスタ・医師マスタを編集できるマスタ設定画面を追加する。

**Architecture:** `Storage.getMasters()`(新規、読み取り専用)で `masters/current` を取得し、`MastersView.render()` で4セクションを常時編集可能な状態で描画する。保存は既存の `Storage.saveMasters()` をそのまま使う。画面は既存の「データ管理」折りたたみパネルに3枚目のカード群として追加する。

**Tech Stack:** 素の JavaScript(依存パッケージなし)

## Global Constraints

- **依存パッケージを追加しない。** フェーズ1・2a・2b-1〜2b-3と同じ方針
- **`src/model/` と `src/parse/` の既存モジュールは書き換えない**
- **並び順の変更(上下移動)は対象外。** 追加順のまま保持する
- **新規記入者のチェックリストは空リストから開始する。** ハードコードされたデフォルト項目は複製しない
- **重複登録のチェックは行わない**
- **記入者は最低1名を維持する。** 最後の1名を削除しようとした場合はエラーメッセージを表示し、削除しない
- 画面はスマートフォンでも読めること。横スクロールはテーブル単位に閉じ込め、ページ全体を横スクロールさせない

設計の詳細は [フェーズ2b-4 設計書](../specs/2026-08-26-phase2b4-masters-design.md) を参照。

---

## File Structure

| ファイル | 責務 |
|---|---|
| `src/app/storage.js` (変更) | マスタを読み取る `getMasters` を追加 |
| `src/app/views/masters.js` | マスタ設定画面の描画・状態管理・フォーム収集 |
| `src/app/main.js` (変更) | 「データ管理」パネルを開いたときにマスタを読み込み、保存を仲介する |
| `index.html` (変更) | `masters.js` の読み込み、マスタ設定用コンテナ |

---

### Task 1: マスタの読み取り

**Files:**
- Modify: `src/app/storage.js`

**Interfaces:**
- Consumes: なし
- Produces:
  - `Storage.getMasters(): Promise<{members: string[], checklist: object, premixes: string[], doctors: string[]}>` — `masters/current` を読み取る。ドキュメントが無ければ空の初期値を返す

- [ ] **Step 1: 読み取り関数を追加する**

`src/app/storage.js` の `saveMasters` の下に次を追加する。

```javascript
// マスタ設定画面からの読み取り専用アクセス。ドキュメントが無ければ空の初期値を返す。
async function getMasters() {
  var snap = await getDoc(doc(db, MASTERS, "current"));
  if (!snap.exists()) {
    return { members: [], checklist: {}, premixes: [], doctors: [] };
  }
  var data = snap.data();
  return {
    members: data.members || [],
    checklist: data.checklist || {},
    premixes: data.premixes || [],
    doctors: data.doctors || []
  };
}
```

エクスポートに加える。

```javascript
export { countLogs, saveLogs, saveMasters, getMasters, getLog, listLogsByMonth, saveLog };
```

- [ ] **Step 2: 構文を確認する**

```bash
node -c src/app/storage.js
```

期待する結果: 何も出力せず終了する(構文エラーなし)。`listLogsByMonth` / `saveLog` と同様、薄いFirestoreラッパーであり自動テストは持たない。

- [ ] **Step 3: コミットする**

```bash
git add src/app/storage.js
git commit -m "feat: add Storage.getMasters for reading doctor/premix/member masters"
```

---

### Task 2: マスタ設定画面

**Files:**
- Create: `src/app/views/masters.js`

**Interfaces:**
- Consumes: なし(既存の `src/model/*` には依存しない。純粋にマスタのデータ構造だけを扱う)
- Produces:
  - `MastersView.render(container: Element, masters: object, onSave: (data: object) => void)` — 記入者・チェックリスト・予製・医師の4セクションを描画する。「保存」クリックで現在の状態をまとめたオブジェクト(`{members, checklist, premixes, doctors}`)を引数に `onSave` を呼ぶ

このタスクではまだ `index.html` / `main.js` に配線しない(Task 3で行う)。

- [ ] **Step 1: `src/app/views/masters.js` を作成する**

```javascript
(function (root) {
  "use strict";

  // 記入者・予製・医師は「文字列の配列」という同じ形なので、共通の定義で描画・削除を扱う。
  var SIMPLE_LISTS = {
    members: { title: "記入者管理", label: "氏名", placeholder: "氏名を入力", minCount: 1 },
    premixes: { title: "予製マスタ", label: "薬剤名", placeholder: "薬剤名を入力", minCount: 0 },
    doctors: { title: "医師マスタ", label: "医師名", placeholder: "医師名を入力", minCount: 0 }
  };

  function esc(value) {
    return String(value === undefined || value === null ? "" : value)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function card(title, body, extraClass, titleClass) {
    return '<div class="card ' + (extraClass || "") + '">' +
      '<div class="sec-title ' + (titleClass || "") + '">' + title + "</div>" + body + "</div>";
  }

  function cloneChecklist(src) {
    var out = {};
    Object.keys(src || {}).forEach(function (member) {
      out[member] = (src[member] || []).slice();
    });
    return out;
  }

  function simpleListSectionHtml(key, list) {
    var def = SIMPLE_LISTS[key];
    var rows = list.map(function (name, index) {
      return "<tr><td>" + esc(name) + "</td><td>" +
        '<button type="button" class="btn btn-row-remove" data-remove-list="' + key +
        '" data-index="' + index + '">削除</button></td></tr>';
    }).join("");
    var body = '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>' + def.label +
      "</th><th></th></tr></thead><tbody>" + rows + "</tbody></table></div>" +
      '<div class="edit-row">' +
      '<input type="text" class="text-input" data-new-input="' + key + '" placeholder="' + def.placeholder + '">' +
      '<button type="button" class="btn btn-primary" data-add-list="' + key + '">追加</button>' +
      "</div>";
    return card(def.title, body);
  }

  function render(container, masters, onSave) {
    var state = {
      members: (masters.members || []).slice(),
      checklist: cloneChecklist(masters.checklist),
      premixes: (masters.premixes || []).slice(),
      doctors: (masters.doctors || []).slice()
    };
    var selectedMember = state.members[0] || "";

    function checklistSectionHtml() {
      if (!state.members.length) {
        return card("チェックリスト編集", '<p class="hint">記入者を追加してください。</p>');
      }
      if (state.members.indexOf(selectedMember) === -1) selectedMember = state.members[0];
      var items = state.checklist[selectedMember] || [];
      var options = state.members.map(function (m) {
        return '<option value="' + esc(m) + '"' + (m === selectedMember ? " selected" : "") +
          ">" + esc(m) + "</option>";
      }).join("");
      var rows = items.map(function (item, index) {
        return "<tr><td>" + esc(item) + "</td><td>" +
          '<button type="button" class="btn btn-row-remove" data-remove-check data-index="' +
          index + '">削除</button></td></tr>';
      }).join("");
      var body =
        '<div class="edit-row"><label>記入者を選択</label>' +
        '<select class="text-input" id="checklistMemberSel">' + options + "</select></div>" +
        '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>チェック項目</th><th></th></tr></thead>' +
        "<tbody>" + rows + "</tbody></table></div>" +
        '<div class="edit-row">' +
        '<input type="text" class="text-input" id="newCheckItemInput" placeholder="チェック項目を入力">' +
        '<button type="button" class="btn btn-primary" id="addCheckItemBtn">追加</button>' +
        "</div>";
      return card("チェックリスト編集", body);
    }

    function showMessage(html) {
      var box = container.querySelector("#mastersMessage");
      if (box) box.innerHTML = html;
    }

    function attachEvents() {
      container.querySelectorAll("[data-remove-list]").forEach(function (btn) {
        btn.addEventListener("click", function () {
          var key = btn.getAttribute("data-remove-list");
          var index = Number(btn.getAttribute("data-index"));
          var def = SIMPLE_LISTS[key];
          if (state[key].length <= def.minCount) {
            showMessage('<div class="notice notice-err">最低' + def.minCount + '名は必要です。</div>');
            return;
          }
          state[key].splice(index, 1);
          renderAll();
        });
      });

      container.querySelectorAll("[data-add-list]").forEach(function (btn) {
        btn.addEventListener("click", function () {
          var key = btn.getAttribute("data-add-list");
          var input = container.querySelector('[data-new-input="' + key + '"]');
          var value = input.value.trim();
          if (!value) return;
          state[key].push(value);
          if (key === "members" && !state.checklist[value]) state.checklist[value] = [];
          renderAll();
        });
      });

      var memberSel = container.querySelector("#checklistMemberSel");
      if (memberSel) {
        memberSel.addEventListener("change", function () {
          selectedMember = memberSel.value;
          renderAll();
        });
      }

      var addCheckBtn = container.querySelector("#addCheckItemBtn");
      if (addCheckBtn) {
        addCheckBtn.addEventListener("click", function () {
          var input = container.querySelector("#newCheckItemInput");
          var value = input.value.trim();
          if (!value) return;
          if (!state.checklist[selectedMember]) state.checklist[selectedMember] = [];
          state.checklist[selectedMember].push(value);
          renderAll();
        });
      }

      container.querySelectorAll("[data-remove-check]").forEach(function (btn) {
        btn.addEventListener("click", function () {
          var index = Number(btn.getAttribute("data-index"));
          state.checklist[selectedMember].splice(index, 1);
          renderAll();
        });
      });

      container.querySelector("#mastersSaveBtn").addEventListener("click", function () {
        onSave({
          members: state.members,
          checklist: state.checklist,
          premixes: state.premixes,
          doctors: state.doctors
        });
      });
    }

    function renderAll() {
      container.innerHTML =
        simpleListSectionHtml("members", state.members) +
        checklistSectionHtml() +
        simpleListSectionHtml("premixes", state.premixes) +
        simpleListSectionHtml("doctors", state.doctors) +
        '<div id="mastersMessage"></div>' +
        '<div class="edit-row"><button type="button" class="btn btn-primary" id="mastersSaveBtn">保存</button></div>';
      attachEvents();
    }

    renderAll();
  }

  root.MastersView = { render: render };
})(typeof window !== "undefined" ? window : this);
```

`renderAll()` は状態(`state`)が変わるたびに `container.innerHTML` を丸ごと作り直す。そのため `attachEvents()` が付けるリスナーは常にそのとき新しく作られた要素に対してであり、Task 3で `MastersView.render` を(パネルを開いたときの1回だけ)呼び出す限り、リスナーが積み重なる心配は無い(フェーズ2b-2の `edit.js` で見つかった「持続するコンテナに直接リスナーを付けると開くたびに増える」問題は、ここでは `render()` 自体が1回しか呼ばれないため発生しない)。

- [ ] **Step 2: 構文を確認する**

```bash
node -c src/app/views/masters.js
```

期待する結果: 何も出力せず終了する(構文エラーなし)。`list.js` / `detail.js` / `edit.js` / `report.js` と同様、DOM組み立てコードのため自動テストは持たない。この時点ではどこからも読み込まれていないため、ブラウザでの動作確認は Task 3 で行う。

- [ ] **Step 3: コミットする**

```bash
git add src/app/views/masters.js
git commit -m "feat: add the masters settings view"
```

---

### Task 3: マスタ設定の配線

**Files:**
- Modify: `src/app/main.js`
- Modify: `index.html`

**Interfaces:**
- Consumes: `Storage.getMasters` / `Storage.saveMasters`(既存)、`MastersView.render`(Task 2)
- Produces: 「データ管理」パネルを開いたときにマスタ設定が表示され、「保存」でFirestoreへ書き込まれる一連の画面遷移

- [ ] **Step 1: `index.html` にマスタ設定用の器とスクリプト読み込みを追加する**

`過去データの移行` カードの直後、`</details>` の直前に追加する。

```html
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

        <div id="mastersView"></div>
      </details>
```

`</body>` 直前のスクリプト読み込みに `masters.js` を足す(`report.js` の次、`main.js` の前)。

```html
  <script src="src/app/views/edit.js"></script>
  <script src="src/app/views/report.js"></script>
  <script src="src/app/views/masters.js"></script>
  <script type="module" src="src/app/main.js"></script>
```

- [ ] **Step 2: `main.js` にマスタの読み込みと保存を追加する**

`el("toolsDetails")` のトグルリスナーを次のように変更する(既存の `refreshStatus()` 呼び出しに `loadMasters()` を追加する)。

```javascript
el("toolsDetails").addEventListener("toggle", function (event) {
  if (event.target.open && !statusLoaded) {
    statusLoaded = true;
    refreshStatus();
    loadMasters();
  }
});
```

`refreshStatus` 関数の直後に、次の2つの関数を追加する。

```javascript
async function loadMasters() {
  el("mastersView").innerHTML = '<div class="empty">読み込み中…</div>';
  try {
    var masters = await Storage.getMasters();
    window.MastersView.render(el("mastersView"), masters, handleMastersSave);
  } catch (err) {
    el("mastersView").innerHTML = '<div class="card"><span class="err">読み取りに失敗しました: ' +
      describeError(err) + "</span></div>";
  }
}

async function handleMastersSave(data) {
  var saveBtn = el("mastersView").querySelector("#mastersSaveBtn");
  var msgEl = el("mastersView").querySelector("#mastersMessage");
  saveBtn.disabled = true;
  saveBtn.textContent = "保存中…";
  msgEl.innerHTML = "";

  try {
    await Storage.saveMasters(data);
    msgEl.innerHTML = '<span class="ok">保存しました。</span>';
  } catch (err) {
    msgEl.innerHTML = '<div class="notice notice-err">保存に失敗しました: ' +
      describeError(err) + "</div>";
  }
  saveBtn.disabled = false;
  saveBtn.textContent = "保存";
}
```

- [ ] **Step 3: 画面で確認する**

開発サーバを起動して確認する。

```bash
node scripts/dev-server.js
```

http://localhost:8430 を開き、ログインした状態で次を確かめる。

1. 「データ管理」を開くと、「データの状況」「過去データの移行」に続いて「記入者管理」「チェックリスト編集」「予製マスタ」「医師マスタ」のカードが表示される
2. 「記入者管理」に氏名を入力して「追加」すると一覧に増える。「削除」で減らせる
3. 記入者を1名まで減らして削除しようとすると、「最低1名は必要です。」と表示され削除されない
4. 「チェックリスト編集」で記入者を切り替えると、その記入者のチェック項目が表示される。項目を追加・削除できる
5. 別の記入者に切り替えてから最初の記入者に戻しても、追加・削除した内容が保持されている(保存前でも画面内では消えない)
6. 「予製マスタ」「医師マスタ」にも同様に追加・削除できる
7. 一通り編集してから「保存」を押すと、「保存しました。」と表示される
8. ページを再読み込みしてから「データ管理」を開き直すと、保存した内容が反映されている
9. コンソールにエラーが出ていない
10. 表示幅を375pxにしても、各テーブルはカード内で横スクロールし、ページ全体は横スクロールしない

- [ ] **Step 4: コミットする**

```bash
git add src/app/main.js index.html
git commit -m "feat: wire up the masters settings panel"
```

---

## フェーズ2b-4完了時の状態

- 「データ管理」パネルに、記入者・チェックリスト・予製・医師を編集できる4セクションが表示される
- 記入者は最低1名を維持する
- 保存すると `masters/current` ドキュメントに反映される
- これでフェーズ2bの主要画面(一覧・詳細・編集・月報・マスタ設定)が揃う

## 次のフェーズ

- **フェーズ3**: 新規日の作成を含む自動取込(Excelテンプレート生成、Dropbox連携、GitHub Actions)、`submissions`・`checklist`(日誌側の実施記録)の表示・編集
