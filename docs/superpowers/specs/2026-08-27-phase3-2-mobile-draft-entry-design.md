# モバイル下書き → 承認(フェーズ3-2) 設計書

作成日: 2026-08-27

## 1. 背景と目的

薬局業務日誌の記入項目を、その場・スマートフォンから記録できるようにする。
引継ぎメモ(`docs/superpowers/handoff-2026-08-26.md`)の論点2「Excelテンプレートの要否」に
決着をつけ、**Excelテンプレートは廃止**する。

入力は**セクション単位**で行い、記入したセクションだけを下書きとして送る。病棟別処方箋データ
(`wardRx`)も任意セクションの一つとして手入力できる(病院CSV取込=フェーズ3-1 は主経路として
残すが、スマホから直接入れる選択肢も持たせる)。件数の少ない日は、CSVをUSBで持ち出して
アップロードするより手入力のほうが早い、という判断による。

現行の編集画面(フェーズ2b-2)は項目数が多く、PC前提の操作感で、外出先やスマホから
その日の出来事(疑義照会・来客・会議など)をその都度メモするのに向かない。

### 方針

- **ログイン画面のないモバイル入力ページ**を新設する。Firebase の**匿名認証**を使い、
  利用者にログインを求めない。
- 入力内容は Firestore の `draftEntries` コレクションに**下書き**として保存する。
  匿名セッションは下書きの**作成**と、**自分(同じ匿名UID)が作った下書きの読み取り**だけができる。
  他人の下書きの読み取り、および全下書きの更新・削除はできない。
- Google ログイン済みの本アプリに「モバイル下書きの承認」画面を足す。本人が下書きを
  確認 → 承認すると `dailyLogs` のその日へ、**下書きに含まれるセクションだけ**反映
  (記録の無い日は新規作成)し、下書きを削除する。却下もできる。`payload` に無いキーは
  触らない(**partial merge**)。
- `dailyLogs` と `masters` の書き込みルールは一切変更しない。実データは従来どおり保護される。
- 依存パッケージは追加しない。

### 非目的 (YAGNI)

- **院内LAN(インターネット非到達)での入力。** このページは Firebase にアクセスするため
  LAN 内では動かない。LAN 側の手入力は本設計の対象外(必要になれば別途)。
- **ファイル書き出し / QRコード / カメラ読み取り。** すべて不採用。下書きは Firestore 経由。
- **依存パッケージの追加**(QR生成・.xlsx解析ライブラリ等)。
- **下書きの複数人同時編集・リアルタイム同期。** 作成しっぱなしの一方向。
- **入力ページからの `dailyLogs`(確定日誌)閲覧。** 匿名では読めない設計。入力ページで見返せるのは
  自端末が送った未承認の下書きだけ(§5.4)。

## 2. アーキテクチャ / ファイル変更

| ファイル | 役割 |
|---|---|
| `entry.html`(新規・リポジトリ直下、`index.html` の隣) | モバイル入力ページ本体。GitHub Pages で `/pharmacy-log/entry.html` として配信。インターネット前提 |
| `src/entry/entry-main.js`(新規・ES モジュール) | Firebase 初期化 → 匿名認証 → マスタ読取 → フォーム描画呼び出し → `draftEntries` へ作成 → 自端末の下書き一覧の取得・表示 |
| `src/entry/entry-form.js`(新規・UMD) | フォームのDOM組み立てと値の収集。セクション制(`wardRx` を含む全記入項目)。`src/app/views/edit.js` の構成を踏襲 |
| `src/app/storage.js`(変更) | `listDrafts()` / `deleteDraft(id)` / `saveDailyEntry(date, fields)` を追加し `export` に加える |
| `src/app/views/drafts.js`(新規・UMD) | 本アプリの「モバイル下書きの承認」カードの描画。`root.DraftsView` に公開 |
| `src/app/main.js`(変更) | 承認カードの配線(「データ管理」パネル内)、承認後の対象日遷移 |
| `index.html`(変更) | 承認カードの器、`src/app/views/drafts.js` の `<script>` |
| `firestore.rules`(変更) | 匿名の `masters` 読取・`draftEntries` の作成と自UID分の読取を許可 |
| `src/model/daily-log.js` | **変更なし。** `emptyLog` / `validate` を入力ページと本アプリの双方で再利用 |
| `tests/draft-entry.test.js`(新規) | 純粋関数 `mergeDraftIntoLog` の Node 単体テスト |

`entry.html` は Firebase SDK(gstatic CDN)と `firebase-config.js`(既に公開済み)を読む。
`src/app/` のコードは一切使わない(あちらは Google 認証済みアプリ)。共有するのは
`src/model/daily-log.js` のみ。

### 依存関係の向き

```
entry.html ──> src/entry/entry-main.js ──> src/entry/entry-form.js
                     │                            │
                     └──> firebase SDK            └──> src/model/daily-log.js
                     └──> firebase-config.js

index.html ──> src/app/main.js ──> src/app/storage.js ──> firebase SDK
                     │
                     └──> src/app/views/drafts.js ──> src/model/daily-log.js
```

## 3. Firestore ルール変更 + 匿名認証

### 3.1 Firebase コンソール作業(利用者が1回行う)

Authentication → Sign-in method → **「匿名」を有効化**。

### 3.2 `firestore.rules`

現状は全コレクションが owner UID のみ(`match /{document=**} { allow read, write: if isOwner(); }`)。
次の構造にする。`isOwner()` 関数は既存のものを流用する。

```
match /dailyLogs/{doc}  { allow read, write: if isOwner(); }        // 従来どおり

match /masters/{doc} {
  allow read:  if isOwner() || request.auth != null;                // 匿名も読取可
  allow write: if isOwner();
}

match /draftEntries/{doc} {
  allow update, delete: if isOwner();                               // 承認・却下は本人(Google)のみ
  allow read: if isOwner()                                          // 本人は全件読める(承認用)
    || (request.auth != null && resource.data.uid == request.auth.uid);  // 匿名は自分が作った分だけ
  allow create: if request.auth != null                            // 匿名も作成可
    && request.resource.data.keys().hasOnly(
         ['schemaVersion','uid','date','author','createdAt','status','payload'])
    && request.resource.data.schemaVersion == 1
    && request.resource.data.uid == request.auth.uid               // 他人のUIDでは作れない
    && request.resource.data.status == 'pending'
    && request.resource.data.date.matches('[0-9]{4}-[0-9]{2}-[0-9]{2}')
    && request.resource.data.author is string
    && request.resource.data.author.size() <= 40
    && request.resource.data.payload is map;
}

match /{document=**} { allow read, write: if isOwner(); }           // ingestRuns 等は従来どおり
```

ルールは「いずれかの match が許可すれば許可」の OR 評価。`draftEntries` の create は
末尾の `{document=**}`(owner 限定)にもマッチするが、専用 match の許可で匿名 create が通る。

### 3.3 受け入れるリスク(明記)

匿名 create を許すため、`signInAnonymously` を悪用して `draftEntries` にスパム作成される
可能性がある(無料枠の1日20,000書き込みを消費されうる)。

- 被害は**下書き置き場に限定**される。`dailyLogs`・`masters` の実データは従来どおり保護され、
  第三者に書き換えられることはない(`dailyLogs` のルールは一切触らない)。
- 匿名セッションが読めるのは **`uid` が自分と一致する下書きだけ**。他人が作成した下書き
  (疑義照会等を含む)は読めない。承認済み(=削除済み)の下書きも当然読めない。
- 匿名 UID は端末の Firebase Auth 永続化(IndexedDB)に保存される。その端末に物理アクセス
  できる者は、その端末が送った**未承認の**下書きを閲覧できる(= 端末を触れる人と同じ範囲)。
  承認されればサーバから消えるため、露出window は「送信〜承認まで」に限られる。
- 本人が承認画面でゴミ下書きを却下できる。問題が続けば Firebase コンソールで匿名認証を
  無効化すれば即座に止まる(入力ページは使えなくなるが実害は無い)。
- 完全な防御(App Check 等)は「依存を増やさない・構成を単純に保つ」方針のため見送る。

## 4. `draftEntries` スキーマ

ドキュメントID = 自動ID(`addDoc`)。同じ日に複数の下書きが並んでもよい(訂正・追記)。

```
{
  schemaVersion: 1,
  uid:       "<匿名認証のUID>",       // auth.currentUser.uid。自端末の見返しとルールの絞り込みに使う
  date:      "YYYY-MM-DD",           // 対象日(入力ページで選択、既定=今日)
  author:    "山田",                 // 記入者(マスタ members から選択)
  createdAt: "<ISO文字列>",          // 入力ページで new Date().toISOString()
  status:    "pending",
  payload: { ... }                   // 記入したセクションのフィールドだけ(下記)
}
```

`payload` には**記入した(チェックを入れた)セクションのフィールドだけ**が入る。取りうるキーと
その形は `DailyLog.emptyLog()` の戻り値の対応キーと一致させる(`date` は payload に入れない。
`author` はトップレベル)。セクションとフィールドの対応:

| セクション | payload に入るキー |
|---|---|
| `gairai`(外来) | `rxOpCnt`, `rxOpDose`, `rxInjCnt`, `rxInjDose`, `counsel` |
| `winj`(病棟別注射) | `winjData` |
| `wardRx`(病棟別処方箋) | `wardRx`(`total` はアプリ側で自動計算して格納) |
| `doctorChanges`(処方変更) | `doctorChanges` |
| `premixes`(予製) | `premixes` |
| `packer`(分包機) | `packerData` |
| `checklist`(チェックリスト) | `checklist` |
| `meisai`(明細) | `inquiries`, `mrVisits`, `contacts`, `drugs`, `shortages`, `meetings`, `trainings` |
| `notes`(その他) | `notes` |

`submissions`(提出資料)は本アプリの編集画面が未対応のため、今回のスコープに含めない
(別途データモデルを定めてから)。

`checklist` の日誌側の形をここで定める: **`string[]`**(その日実施したチェック項目名の配列)。
入力ページでは選択中の記入者の項目 `masters.checklist[author]` をチェックボックスで並べ、
チェックが入った項目名だけを `payload.checklist` に入れる。項目が無い/1つも選ばれなければ `[]`。
`DailyLog.normalize` は `checklist` を配列としてそのまま通すため、モデル変更は不要。

`wardRx` の `total`: 枚 = `teiki.cnt + rinji.cnt + taiin.cnt + meds.cnt + ippoka.cnt`、
件 = 同じく `.dose` の和。入力ページで計算して `payload.wardRx` に含める。

承認時に本アプリ側で、マージ後のドキュメント全体に `DailyLog.validate()` を通す。

## 5. モバイル入力ページ(`entry.html` + `src/entry/`)

### 5.1 読み込み時(`entry-main.js`)

1. Firebase 初期化 → `signInAnonymously()`。失敗(匿名認証が無効・オフライン)→
   全画面エラー「この端末はネットに接続されていないか、設定が未完了です」。フォームは出さない。
   `signInAnonymously` は永続化(既定=IndexedDB)により、2回目以降は同じ UID で復帰する。
2. `getDoc(doc(db, 'masters', 'current'))` でマスタ取得。失敗 → 同様に全画面エラー。
3. `entry-form.js` の `render(container, masters)` を呼びフォームを描画。
4. フォームの下に「この端末から送信した下書き」一覧を描画(§5.4)。

### 5.2 フォーム構成(`entry-form.js`)

`src/app/views/edit.js` の構成を踏襲する。**セクション制**。

- 上部(常に有効・必須): 日付(`<input type="date">`、既定=今日)、記入者(マスタ `members` のプルダウン)
- 以下、各セクションの見出しに「この項目を記入する」チェックを付ける。チェックを外すと
  そのセクションの入力欄は無効化(グレーアウト)され、`collect()` の対象外になる。
  - 既定 **ON**: `gairai`(外来処方箋・注射・薬剤管理指導)/ `winj`(病棟別注射 5病棟)/
    `doctorChanges`(処方変更 医師別)/ `premixes`(予製)/ `packer`(分包機)/
    `checklist`(チェックリスト)/
    `meisai`(明細: 疑義照会・来客・問い合わせ・薬品管理・欠品・会議・研修、行の追加削除可)/
    `notes`(その他)
  - 既定 **OFF**: `wardRx`(病棟別処方箋 5病棟 × 定期/臨時/退院/持参薬/1包化 × 枚/件)。
    病院CSV取込が主経路のため既定では送らない。`total` は表示のみ・自動計算。
- `checklist` セクションは選択中の記入者に依存する。記入者プルダウンを変えたら、
  `masters.checklist[記入者]` の項目でセクションを再描画する。記入者にひも付く項目が無ければ
  「この記入者のチェック項目はありません」と表示する。
- `doctorChanges` は `masters.doctors` の各医師 × 件数、`premixes` は `masters.premixes` の各品目 × 包数。
  既存ログを土台にしないため、初期値はすべて 0。

### 5.3 送信

- 「下書きを送信」ボタン → `entry-form.js` の `collect()` が**チェックされたセクションのフィールドだけ**を
  集めて `payload` を返す → `addDoc(collection(db, 'draftEntries'),
  { schemaVersion:1, uid: auth.currentUser.uid, date, author, createdAt, status:'pending', payload })`。
- `wardRx` セクションが ON なら、`collect()` が各病棟の `total` を自動計算して `payload.wardRx` に入れる。
- 送信前チェック: 記入者未選択・日付が `YYYY-MM-DD` でない場合はその場で指摘し送信しない。
  チェック済みセクションが1つも無ければ「記入したセクションがありません」で送信しない。
- 成功 → フォームを畳んで「送信しました。薬局のPCで承認してください。」+「続けてもう1件入力」
  ボタン(押すとフォームを初期状態=既定チェックに戻す)。送信後は §5.4 の一覧を再読込する。
- 失敗 → ボタン上に赤字でメッセージ、ボタン再有効化。

### 5.4 この端末から送信した下書きの一覧

フォームの下に、この端末(= 現在の匿名 UID)が送信した**未承認**の下書きを表示する。

- 取得: `getDocs(query(collection(db, 'draftEntries'), where('uid', '==', auth.currentUser.uid)))`。
  `orderBy` は付けず(複合インデックスを避ける)、`createdAt` でクライアント側降順ソート。
- 各行: `2026-08-27 ・ 記入者:山田 ・ 送信 12:34 ・ [外来][明細]`(§4 のセクション対応で日本語化)。
  タップで payload の主要な数値・件数を展開表示(読み取り専用。編集・削除はできない)。
- 「更新」ボタンで再取得。
- 0件なら「この端末からの未承認の下書きはありません」。
- **承認・却下されるとサーバから消える**ため、一覧から自然に消える(= 残っている＝未処理)。

### 5.5 表示範囲

このページで見られるのは**フォーム**と**この端末が送信した未承認の下書き**だけ。
`dailyLogs`・他端末の下書き・マスタ編集画面には一切アクセスしない。

## 6. 承認フロー(本アプリ)

「データ管理」パネル(`#toolsDetails`)に **「モバイル下書きの承認」カード**を新設する
(病院CSV取込カードの近く)。

- パネルを開くたびに `Storage.listDrafts()` を呼び `DraftsView.render()` する。既存の
  `toolsDetails` の `toggle` ハンドラは `statusLoaded` ガードで初回のみ実行されるが、下書きは
  後から届くため**開くたびに読み直す**(ガードの外に置く)。それ以外の初回処理
  (`refreshStatus` / `loadMasters` / `ChangelogView`)は従来どおり初回のみ。
- `listDrafts()` = `getDocs(query(collection(db,'draftEntries'), orderBy('createdAt')))` →
  `[{id, date, author, createdAt, payload}, ...]`。
- 各下書きを1行で表示: `2026-08-27 ・ 記入者:山田 ・ 送信 12:34 ・ [外来][病棟別注射][明細]` +
  「確認」ボタン。角括弧は `payload` に含まれるセクション名(`Object.keys(payload)` をセクション対応表で
  日本語見出しに変換)。
- 「確認」→ その下書きの `payload` を、含まれるセクションだけ主要な数値・明細件数として展開表示。
  並べて「承認して反映」「却下」ボタン。
- **承認**: `Storage.saveDailyEntry(date, Object.assign({author}, payload))` →
  成功したら `Storage.deleteDraft(id)` → リストから除去 → その日の詳細画面へ遷移
  (病院CSV取込の対象日遷移と同じ手順: `currentMonth` を対象月にして `loadMonth()` → `showDetail`)。
- **却下**: `window.confirm` で確認 → `Storage.deleteDraft(id)` のみ → リストから除去。
- 下書き0件なら「未承認の下書きはありません」。

## 7. `saveDailyEntry(date, fields)`(`storage.js`)

`saveWardRx`(フェーズ3-1)と同じ作り。**partial merge**: `fields` に**あるキーだけ**上書きする。

1. `getDoc(doc(db, 'dailyLogs', date))`。
2. 既存あり → `{...data}` を展開し、`fields` の各キー(`author` と、payload に含まれるキーのみ)で上書き。
   `fields` に無いキー(未記入セクション、および `wardRx` セクションを送っていなければ `wardRx`)は
   **そのまま残す**。`_meta = { ...(prevMeta), source:"mobile", mobileEntryAt:<ISO> }`。
3. 既存なし → `DailyLog.emptyLog(date)` を土台に `fields` を上書き(送られていないセクションは
   `emptyLog` の既定値のまま)。`_meta = { source:"mobile", mobileEntryAt:<ISO> }`。
4. `setDoc(doc(db, 'dailyLogs', date), merged)`。

`validate` は承認画面側で `setDoc` の前に行う(§6・§8)。同じ日に複数下書きがある場合は、
承認した順に反映(後の承認が、そのセクションについては勝つ)。本人がリストを見て不要な下書きを却下する。

純粋部分を `mergeDraftIntoLog(existingLogOrNull, { date, author, payload }) → mergedLog` として
切り出し、`saveDailyEntry` はそれを呼んで `setDoc` するだけにする(テスト容易性のため)。
`_meta` の付与は `mergeDraftIntoLog` に含める。`payload` に含まれないキーには一切触れないこと。

## 8. エラー処理

| ケース | 挙動 |
|---|---|
| 入力ページ: 匿名認証失敗 / マスタ取得失敗 | 全画面エラー、フォーム非表示 |
| 入力ページ: `addDoc` 失敗(オフライン・ルール違反) | ボタン上に赤字、再送信可 |
| 入力ページ: 記入者未選択・日付不正・記入セクション0件 | 送信前にその場で指摘、送信しない |
| 入力ページ: 自端末下書き一覧の取得失敗 | 一覧欄に赤字。フォーム自体は使える |
| 承認: `listDrafts` 失敗 | カード内に赤字。パネルの他機能には影響させない |
| 承認: `validate` がエラーを返す | 承認中止、`field — message` を列挙。下書きは消さない |
| 承認: `saveDailyEntry` 成功後に `deleteDraft` 失敗 | 反映は済んでいる。「反映しましたが下書きの削除に失敗しました。もう一度却下してください」と表示、リストは残す(冪等: もう一度承認しても同じ結果) |
| 同じ日に複数下書き | 全部表示。承認は1件ずつ |

## 9. テスト方針

- **Node 単体テスト**(新規 `tests/draft-entry.test.js`): 純粋関数
  `mergeDraftIntoLog(existingLogOrNull, {date, author, payload})` を検証する。
  - 新規日(`existingLogOrNull === null`)・payload が一部セクションのみ → `emptyLog` 土台・
    送ったキーは反映・送っていないキー(`wardRx` 含む)は `emptyLog` 既定のまま・`author` が入る・
    `_meta.source === "mobile"`
  - 既存日・payload に `wardRx` を**含めない** → 既存の `wardRx` が保持される・
    payload にあるキーだけ上書き・payload に無いキーは既存値を保持
  - 既存日・payload に `wardRx` を**含める** → `wardRx` が上書きされる(`total` は payload の値をそのまま格納)
  - `_meta` は既存キーを保ちつつ `source`/`mobileEntryAt` を更新
  - `mergeDraftIntoLog` は `require("../src/model/daily-log.js")` を使う純粋関数として実装
    (Firestore 非依存、`node tests/draft-entry.test.js` で実行可)
- `DailyLog.validate` は既存テスト(`tests/daily-log.test.js`)が担保。
- **ブラウザ検証(入力ページ)**: `entry.html` は匿名認証で動くため Google ログイン不要 →
  フォーム描画・`draftEntries` 作成をブラウザで確認できる。
- **ブラウザ検証(承認カード)**: Google ログインが必要なため、ログイン環境での目視
  (引継ぎメモに記録)。
- **ルール検証**: Firebase エミュレータは導入しない方針。デプロイ後にブラウザから手動確認する。
  - 匿名で `draftEntries` を(自分の `uid` を付けて)作成できる
  - 匿名で `where('uid','==', 自分のUID)` の下書きは読める
  - 匿名で他UIDの下書きは読めない(別の匿名セッション or 直接 `getDoc` で確認)
  - 匿名で `dailyLogs` の読み書きが**できない**
  - 匿名で `draftEntries` の更新・削除が**できない**
  - 匿名で `masters/current` 読み取りができる

## 10. プロジェクト全体の絶対原則(再確認)

- 依存パッケージを一切追加しない(`package.json` / `node_modules` なし)。
- 実患者データ入りの CSV / Excel は絶対にコミットしない。
- `dailyLogs` への書き込みは Google 認証済みの本人のみ(ルール不変)。サービスアカウント鍵を
  埋め込まない。
- Firebase Spark プラン(無料)を維持、Cloud Functions は使わない。匿名認証は Spark で使える。
