# 薬局業務日誌 フェーズ2b-7：更新履歴 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** このアプリ自身の開発履歴を「データ管理」パネルから閲覧できるようにする。

**Architecture:** `src/app/views/changelog.js` 1ファイルに、静的な履歴配列と描画関数をまとめる。Firestore読み取りが無いため非同期処理は不要。既存の「データ管理」折りたたみパネルに4枚目のカードとして追加する。

**Tech Stack:** 素の JavaScript(依存パッケージなし)

## Global Constraints

- **依存パッケージを追加しない。** フェーズ1・2a・2b-1〜2b-6と同じ方針
- **旧アプリ(`pharmacy_logV2.6.html`)の履歴データは移植しない。** このアプリ自身の開発履歴を新規に書く
- **Firestoreへの保存はしない。** コードに直接追記する運用とする
- **新しいCSSクラスは追加しない。** 既存の `.badge` / `.b-green` / `.b-red` / `.b-gray` を再利用する

設計の詳細は [フェーズ2b-7 設計書](../specs/2026-08-26-phase2b7-changelog-design.md) を参照。

---

## File Structure

| ファイル | 責務 |
|---|---|
| `src/app/views/changelog.js` | 更新履歴の内容(静的配列)と描画 |
| `index.html` (変更) | 更新履歴用の器、スクリプト読み込み |
| `src/app/main.js` (変更) | 「データ管理」パネルを開いたときに描画する |

---

### Task 1: 更新履歴の内容と描画

**Files:**
- Create: `src/app/views/changelog.js`

**Interfaces:**
- Consumes: なし
- Produces:
  - `ChangelogView.render(container: Element)` — 更新履歴をカードとして描画する

このタスクではまだ `index.html` / `main.js` に配線しない(Task 2で行う)。

- [ ] **Step 1: `src/app/views/changelog.js` を作成する**

```javascript
(function (root) {
  "use strict";

  var TYPE_LABELS = {
    feat: { label: "機能追加", badge: "b-green" },
    fix: { label: "バグ修正", badge: "b-red" },
    chore: { label: "調整", badge: "b-gray" }
  };

  // 新しいフェーズが完了するたびに、この配列の先頭に1件追加していく。
  var CHANGELOG_ENTRIES = [
    {
      date: "2026-08-26", type: "feat",
      title: "フェーズ2b-6: 部門長会議報告書を追加",
      detail: "年度単位(4月始まり)で病棟集計・病棟1日平均・外来集計・その他集計をまとめて閲覧・印刷できるようにした。",
      cause: null
    },
    {
      date: "2026-08-26", type: "chore",
      title: "タイトル横にバージョン表示を追加",
      detail: "公開ページのタイトル横に、現在のフェーズと更新日を表示するようにした。反映されているかどうかが一目でわかるようにするため。",
      cause: null
    },
    {
      date: "2026-08-26", type: "feat",
      title: "フェーズ2b-4: マスタ設定画面を追加",
      detail: "記入者・チェックリスト項目・予製マスタ・医師マスタを、それぞれ追加・削除できる設定画面を追加した。",
      cause: null
    },
    {
      date: "2026-08-25", type: "feat",
      title: "フェーズ2b-3: 月報を追加",
      detail: "その月の日誌を集計した月報を、一覧画面から切り替えて閲覧できるようにした。",
      cause: null
    },
    {
      date: "2026-08-25", type: "fix",
      title: "月移動・詳細画面の不具合をまとめて修正",
      detail: "月を移動したとき未来日を「記録なし」と誤表示していた不具合、月移動を連打したときに古い月の結果が新しい月の画面に表示される不具合、詳細画面の持参薬鑑別の統計カードとテーブル合計で対象病棟の数が食い違っていた不整合を修正した。",
      cause: "実装計画の時点では想定していなかった、タスクをまたいだ結合部分の不具合。単体のタスクレビューでは見つからず、全体レビューで発覚した。"
    },
    {
      date: "2026-08-25", type: "feat",
      title: "フェーズ2b-2: 日誌の編集・保存機能を追加",
      detail: "既存日の詳細画面から、その場で内容を修正して保存できるようにした。",
      cause: null
    },
    {
      date: "2026-08-25", type: "feat",
      title: "フェーズ2b-1: 月別一覧・日誌詳細の閲覧画面を追加",
      detail: "Firestoreに移行済みだった97日分の日誌を、月別一覧と1日分の詳細として閲覧できるようにした。",
      cause: null
    },
    {
      date: "2026-08-25", type: "feat",
      title: "フェーズ2a: Firebase連携・過去データ移行、公開ページの提供開始",
      detail: "Firebase(Firestore・Authentication)への接続、Googleアカウントでのログイン制限、過去97日分のデータ移行を実装し、GitHub Pagesでの公開を開始した。",
      cause: null
    },
    {
      date: "2026-08-25", type: "feat",
      title: "フェーズ1: データモデル・CSVパーサーを実装",
      detail: "日誌データの型定義、蓄積CSVと病院システムCSVのパーサーを実装した。このアプリ全体の土台。",
      cause: null
    }
  ];

  function esc(value) {
    return String(value === undefined || value === null ? "" : value)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function entryHtml(entry, isLast) {
    var type = TYPE_LABELS[entry.type] || TYPE_LABELS.chore;
    var borderStyle = isLast ? "" : "border-bottom:1px solid #F3F4F6;";
    var causeHtml = entry.cause
      ? '<div style="font-size:11px;color:#9CA3AF;margin-top:4px">原因：' + esc(entry.cause) + "</div>"
      : "";
    return '<div style="padding:.75rem 0;' + borderStyle + '">' +
      '<div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">' +
      '<span class="badge ' + type.badge + '">' + esc(type.label) + "</span>" +
      '<span style="font-size:11px;color:#9CA3AF">' + esc(entry.date) + "</span>" +
      "</div>" +
      '<div style="font-size:13px;font-weight:500">' + esc(entry.title) + "</div>" +
      '<div style="font-size:12px;color:#6B7280;margin-top:2px">' + esc(entry.detail) + "</div>" +
      causeHtml +
      "</div>";
  }

  function render(container) {
    var rows = CHANGELOG_ENTRIES.map(function (entry, i) {
      return entryHtml(entry, i === CHANGELOG_ENTRIES.length - 1);
    }).join("");
    container.innerHTML = '<div class="card"><div class="sec-title">更新履歴</div>' + rows + "</div>";
  }

  root.ChangelogView = { render: render };
})(typeof window !== "undefined" ? window : this);
```

- [ ] **Step 2: 構文を確認する**

```bash
node -c src/app/views/changelog.js
```

期待する結果: 何も出力せず終了する(構文エラーなし)。他のビューファイルと同様、DOM組み立てコードのため自動テストは持たない。この時点ではどこからも読み込まれていないため、ブラウザでの動作確認は Task 2 で行う。

- [ ] **Step 3: コミットする**

```bash
git add src/app/views/changelog.js
git commit -m "feat: add the changelog content and view"
```

---

### Task 2: 更新履歴の配線

**Files:**
- Modify: `index.html`
- Modify: `src/app/main.js`

**Interfaces:**
- Consumes: `ChangelogView.render`(Task 1)
- Produces: 「データ管理」パネルを開いたときに更新履歴が表示される

- [ ] **Step 1: `index.html` に更新履歴用の器とスクリプト読み込みを追加する**

`<div id="mastersView"></div>` の直後、`</details>` の直前に追加する。

```html
        <div id="mastersView"></div>

        <div id="changelogView"></div>
      </details>
```

`</body>` 直前のスクリプト読み込みに `changelog.js` を足す(`masters.js` の次、`dept-report.js` の前でも後でもよいが、他のビューと並べて `masters.js` の次に置く)。

```html
  <script src="src/app/views/masters.js"></script>
  <script src="src/app/views/changelog.js"></script>
  <script src="src/app/views/dept-report.js"></script>
```

- [ ] **Step 2: `main.js` に更新履歴の描画を追加する**

`el("toolsDetails")` のトグルリスナーを次のように変更する(既存の `refreshStatus()` / `loadMasters()` 呼び出しに `window.ChangelogView.render(...)` を追加する)。

```javascript
el("toolsDetails").addEventListener("toggle", function (event) {
  if (event.target.open && !statusLoaded) {
    statusLoaded = true;
    refreshStatus();
    loadMasters();
    window.ChangelogView.render(el("changelogView"));
  }
});
```

- [ ] **Step 3: 画面で確認する**

開発サーバを起動して確認する。

```bash
node scripts/dev-server.js
```

http://localhost:8430 を開き、ログインした状態で次を確かめる。

1. 「データ管理」を開くと、「データの状況」「過去データの移行」「マスタ設定(4セクション)」に続いて「更新履歴」カードが表示される
2. 新しい順に、日付・種別バッジ(機能追加=緑、バグ修正=赤、調整=グレー)・タイトル・詳細が並んでいる
3. 「月移動・詳細画面の不具合をまとめて修正」の項目にだけ、薄い文字で「原因：」の行が表示される
4. 一番下の項目(フェーズ1)には区切り線が無い
5. コンソールにエラーが出ていない
6. 表示幅を375pxにしても、ページ全体が横スクロールしない

- [ ] **Step 4: コミットする**

```bash
git add index.html src/app/main.js
git commit -m "feat: show the changelog in the data-management panel"
```

---

## フェーズ2b-7完了時の状態

- 「データ管理」パネルに、このアプリ自身の開発履歴が新しい順に表示される
- 今後のフェーズが完了するたびに、`CHANGELOG_ENTRIES` 配列の先頭に1件追加していく

## 次のフェーズ

- **フェーズ2b-5**: 他部署向け日報 — 保留中(再開時に着手)
- **フェーズ3**: 新規日の作成を含む自動取込(Excelテンプレート生成、Dropbox連携、GitHub Actions)
