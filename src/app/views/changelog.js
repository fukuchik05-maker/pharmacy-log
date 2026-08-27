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
      date: "2026-08-27", type: "feat",
      title: "フェーズ3-2: モバイル下書き入力と承認を追加",
      detail: "ログイン画面のないモバイル入力ページ (entry.html) を追加した。Firebase の匿名認証で、その日の日誌項目をセクション単位で下書き送信でき、送った端末から自分の未承認分を見返せる。本アプリの「データ管理」パネルに承認カードを足し、下書きを確認して承認すると、その日の日誌へ記入したセクションだけを反映 (partial merge) し、下書きを削除する。病棟別処方箋データも任意セクションとして手入力できる (病院CSV取込は主経路として存続)。",
      cause: null
    },
    {
      date: "2026-08-27", type: "feat",
      title: "フェーズ3-1: 病院システムCSVの取込を追加",
      detail: "病院システムが出力した日次CSV (MMDD.csv) を「データ管理」パネルから選ぶと、その日の病棟別処方箋データ (wardRx) だけをブラウザから直接データベースへ書き込めるようにした。記録の無い日は自動で新規作成し (記入者は空)、既存の日は取込前に「既存 → 新」を表で確認してから上書きする。パースエラーが1件でもあれば取込全体を中止する。",
      cause: null
    },
    {
      date: "2026-08-26", type: "feat",
      title: "フェーズ2b-7: 更新履歴を追加",
      detail: "このアプリ自身の開発履歴を「データ管理」パネルから閲覧できるようにした。旧アプリの履歴データは移植せず、このWebアプリのフェーズ1以降の履歴を新規に書き起こした。",
      cause: null
    },
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
