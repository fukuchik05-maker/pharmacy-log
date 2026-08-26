# 病院システムCSV取込(フェーズ3-1) 設計書

作成日: 2026-08-27

## 1. 背景と目的

薬局業務日誌のWeb化は、フェーズ2b-7(閲覧・編集・月報・マスタ設定・部門長報告書・
このアプリ自身の更新履歴)まで実装・push済み。次はデータ取込の自動化に着手する。

その第一歩として、**病院システムが出力する日次CSVをブラウザから直接取り込み、
Firestore の該当日ドキュメントの `wardRx`(病棟別処方箋データ)だけを更新する**機能を作る。
Dropbox / GitHub Actions を経由しない、ブラウザ内パース → 直接書き込み方式
(DB化設計書 6.3 の方針)。

### 目的

- 病院CSVの `wardRx` 部分を、手作業のコピー・変換なしで日誌に反映する
- スマートフォンからでも操作でき、取込前に検証エラーを画面で確認できる
- ページに権限キーを一切埋め込まない(ログインユーザー自身の権限で書き込む)

### 非目的(YAGNI)

- Excelテンプレート(手入力項目)の取込。別途検討として保留中(引継ぎメモ 論点2)
- Dropbox 連携・GitHub Actions による定期取込。将来フェーズ
- 日誌一覧の「出どころバッジ」表示。未実装。本設計は `_meta` を正しく残すに留める
- 複数日の一括取込。病院CSVは 1 日 1 ファイル

## 2. 前提(調査済み・変更不要)

- **`src/parse/hospital-csv.js`**: `parse(buffer)` はバイト列(`Uint8Array`/`Buffer`)を受け取り、
  UTF-8 → Shift-JIS の順で自動デコードする。2 行ヘッダー(入院定期/入院臨時/退院/持参薬/
  1包化　持参薬/■合計■)を解釈し `{wardRx: [...], errors: [...]}` を返す。`■合計■` 行・列は除外。
  テスト済み(`tests/hospital-csv.test.js`、6 件)。**テキストではなくバイト列を渡すこと。**
- **`src/parse/filename.js`**: `parse(name, today?)` が `MMDD.csv` / `MMDD.xlsx` 形式のファイル名から
  `{date: "YYYY-MM-DD", kind: "csv"|"xlsx"}` を返す。年は実行日から最も近い年を採用。
  形式に合わなければ `null`。テスト済み(`tests/filename.test.js`、6 件)。
- **`src/model/daily-log.js`**: 公開 API に `emptyLog(date)`、`normalize(partial)`、`validate(record)`。
  `WARDS`(5 病棟)、`RX_KINDS = ["teiki","rinji","taiin","meds","ippoka","total"]`。
- **`src/app/storage.js`**: `getLog(date)`(無ければ `null`)、`saveLog(date, data)`
  (全体上書き、`_meta.source` を強制的に `"web"` にする)。CSV取込専用の関数はまだ無い。
- **`index.html`**: `src/parse/hospital-csv.js` と `src/parse/filename.js` の `<script>` は未読込。
- 「データ管理」`<details id="toolsDetails">` 内に、蓄積CSV一括移行カード
  (`#migrateFile` / `#migratePreview` / `#migrateRunBtn` / `#migrateResult`)がある。
  本機能はこれと同じ形のカードを新設する。
- **`src/app/migrate.js`**: `inspect(file)` / `run(parsed, onProgress)` を公開する継ぎ目。
  本機能の `hospital-import.js` はこの構造を踏襲する。

## 3. 決定事項(ブレインストーミングでの確認結果)

1. **新規日の扱い**: その日付のドキュメントが無い場合、`DailyLog.emptyLog(date)` を土台に
   自動で新規作成し、`wardRx` だけ CSV 由来の値を入れる。`author` 等は空のまま
   (あとで編集画面で補完)。取込は 1 回のワークフローで完結する。
2. **既存日の上書き**: 既にその日の `wardRx` に値がある場合、プレビューで
   「既存 → 新」を併記し、ボタン押下で確定する(蓄積CSV移行カードと同じ確認パターン)。
3. **エラー時**: パーサーが `errors` を 1 件でも返したら**全体を中止**し、内容を画面に列挙する。
   部分取込はしない(データが静かに壊れるのを防ぐ)。
4. **対象日の決定**: ファイル名(`MMDD.csv`)からの自動判定のみ。手動の日付上書き欄は設けない。
   形式に合わなければエラー。

## 4. ファイル変更

| 変更 | 内容 |
|---|---|
| `index.html` | ① `<script src="src/parse/hospital-csv.js">` と `<script src="src/parse/filename.js">` を `accum-csv.js` の隣に追加。② 「データ管理」`<details>` 内、蓄積CSV移行カードの直後に「病院システムCSVの取込」カードを新設 |
| `src/app/hospital-import.js`(新規) | `inspect(file)` / `run(parsed, onProgress)` を公開する ES モジュール |
| `src/app/storage.js` | `saveWardRx(date, wardRx)` を追加し `export` に加える |
| `src/app/main.js` | 新カードの `change` / `click` ハンドラを、既存 migrate ハンドラの直下に同じ構造で配線 |
| `tests/hospital-import.test.js`(新規) | 純粋コア `buildInspection` の分岐を Node で検証 |
| `tests/fixtures/` | 患者情報を含まないダミー病院CSV(5 病棟 + `■合計■` 行) |

**変更しないもの**: `src/parse/hospital-csv.js`、`src/parse/filename.js`、`src/model/daily-log.js`、
既存のビュー群、`src/app/migrate.js`。

## 5. コンポーネント設計

### 5.1 `src/app/hospital-import.js`

`migrate.js` と同じく ES モジュールとし、ブラウザからは `import * as HospitalImport` で使う
(`main.js` に配線)。Firestore に触れる非同期の薄いラッパー(`inspect` / `run`)と、
Node で単体テストできる純粋なコア(`buildInspection`)に分ける。

#### 純粋コア(同期・依存注入なし)

```
buildInspection(fileName, bytes) → {
  date:   "YYYY-MM-DD",   // Filename.parse が解決した対象日
  wardRx: [ { name, teiki, rinji, taiin, meds, ippoka, total }, ... ],  // 5 病棟
  errors: [ { field, message }, ... ]   // HospitalCsv.parse のエラー
}
```

1. `Filename.parse(fileName)` を呼ぶ。`null` または `kind !== "csv"` なら
   `throw new Error("ファイル名から日付を判定できません。0824.csv の形式にしてください")`。
2. `HospitalCsv.parse(bytes)` を呼び、`{ date, wardRx, errors }` を組み立てて返す。

この関数は `Filename` / `HospitalCsv` を **参照するだけ**で、Firestore には触れない。
ブラウザでは `window.Filename` / `window.HospitalCsv`(`<script>` で読込済み)を、
Node テストでは同モジュール先頭で `require("../parse/filename.js")` 等を解決して使う
(両モジュールは既に `module.exports` / `window.*` の両対応)。

#### 非同期ラッパー

```
inspect(file) → Promise<{
  date, wardRx, errors,          // buildInspection の結果
  exists:         boolean,       // その日の Firestore ドキュメントが既にあるか
  existingWardRx: [ ... ] | null // 既存があればプレビュー比較用に同梱
}>
```

1. `const bytes = new Uint8Array(await file.arrayBuffer())`。
2. `const core = buildInspection(file.name, bytes)`(例外はそのまま呼び出し側へ)。
3. `const existing = await Storage.getLog(core.date)`。
4. `{ ...core, exists: existing !== null, existingWardRx: existing ? existing.wardRx : null }` を返す。

```
run(parsed, onProgress?) → Promise<{ date }>
```

1. `parsed.errors.length` があれば
   `throw new Error("検証に通らない項目があるため取り込めません")`(`migrate.run` と同じガード)。
2. `await Storage.saveWardRx(parsed.date, parsed.wardRx)`。
3. `{ date: parsed.date }` を返す。

`onProgress` は単日書き込みのため実質使わないが、`migrate.run` とシグネチャを揃えるため受け取る。

### 5.2 `src/app/storage.js` に追加する `saveWardRx(date, wardRx)`

1. `const snap = await getDoc(doc(db, LOGS, date))`。
2. `snap.exists()` の場合:
   - `const copy = { ...snap.data() }`
   - `copy.wardRx = wardRx`
   - `copy._meta = { ...(snap.data()._meta || {}), source: "csv", csvIngestedAt: new Date().toISOString() }`
3. `snap.exists()` でない場合:
   - `const copy = window.DailyLog.emptyLog(date)`
   - `copy.wardRx = wardRx`
   - `copy._meta = { source: "csv", csvIngestedAt: new Date().toISOString() }`
4. `await setDoc(doc(db, LOGS, date), copy)`(全体上書き。既存コードの流儀に合わせる)。

既存の `_meta` キー(`webEditedAt` 等)は保持する。DB化設計書 4.1 の
「取込元・更新日時を種別ごとに持つ」方針に沿う。

## 6. UI とデータフロー

### 6.1 新カードの HTML(蓄積CSV移行カードの直後)

```html
<div class="card">
  <div class="sec-title">病院システムCSVの取込</div>
  <p class="hint">
    病院システムが出力した日次CSV(<code>MMDD.csv</code>、例 <code>0824.csv</code>)を選ぶと、
    その日の病棟別処方箋データ(wardRx)だけを更新します。他の項目には触れません。
  </p>
  <input type="file" id="hospCsvFile" accept=".csv">
  <div id="hospCsvPreview" class="hint"></div>
  <button id="hospCsvRunBtn" class="btn btn-success" disabled>取り込みを実行</button>
  <div id="hospCsvResult" class="hint"></div>
</div>
```

### 6.2 フロー

1. **ファイル選択(`change`)** → `parsed` をリセット、ボタン無効化、`#hospCsvResult` クリア →
   `HospitalImport.inspect(file)`。
   - 例外(ファイル名不正・読込失敗)→ `#hospCsvPreview` に赤字。ボタン無効のまま。
   - `errors.length > 0` → 赤字で先頭 5 件を `field — message` で表示し、
     「◯件の問題があります。取り込みを中止しました。」と明示。ボタン無効のまま(**全体中止**)。
   - 正常 → プレビュー表示、`parsed` をモジュールスコープに保持、ボタン有効化。
2. **プレビュー表示**(`#hospCsvPreview`)
   - 対象日と新規/上書きの別:
     - `exists === false` → 「YYYY-MM-DD — 新規作成します(記入者は空。あとで編集画面で補完してください)」
     - `exists === true` → 「YYYY-MM-DD — この日の wardRx を上書きします」
   - 5 病棟 × 6 区分(`RX_KINDS`)の読み取り値を小さな表で列挙。
     `exists === true` のときは各セルを「既存 → 新」で併記し、値が変わるセルだけ `<strong>` で強調。
3. **実行(`click`)** → ボタン無効化、`#hospCsvResult` に「取り込み中…」→ `HospitalImport.run(parsed)`。
   - 成功 → 「YYYY-MM-DD を取り込みました。」→ `refreshStatus()` → 対象日の詳細画面へ遷移(6.3)。
   - 失敗 → `#hospCsvResult` に赤字で `describeError(err)`。ボタン再有効化。

### 6.3 取込後の遷移

単日取込のため、蓄積CSV移行の `showList()` ではなく、その日の詳細画面へ遷移する。
`main.js` の `showDetail(date)` は `currentLogs`(= `loadMonth()` がロードした現在月)から
日を引くため、以下の順で行う。

1. `currentMonth = { y: +parsed.date.slice(0, 4), m: +parsed.date.slice(5, 7) }`
2. `await loadMonth()`(`currentLogs` が対象月で埋まる。取込直後なので当該日を含む)
3. `showList()` 相当の表示状態にしてから `showDetail(parsed.date)`

`toolsDetails` パネルは開いたままでよい(既存 migrate と同じ)。`el("monthLabel")` も
`loadMonth()` が更新する。

## 7. エラー処理とエッジケース

| ケース | 挙動 |
|---|---|
| ファイル名が `MMDD.csv` 形式でない / 拡張子が `.xlsx` | `inspect` が `throw`。プレビューに案内文。ボタン無効 |
| `Filename.parse` が年を解決できない | 同上(`null` 返り) |
| デコード失敗・空ファイル・行数不足 | `HospitalCsv.parse` が `errors:[{field:"(file)", ...}]` を返す → 全体中止、赤字表示 |
| 病棟の行が不足 | パーサーが「病棟の行が見つかりません: ◯◯」を `errors` に積む → 全体中止 |
| 数値として読めないセル | パーサーが該当 `field` を `errors` に積む → 全体中止 |
| `■合計■` 行・列 | パーサーが既に除外。考慮不要 |
| Firestore 書込中の例外(権限・ネットワーク) | `run` の例外を `#hospCsvResult` に `describeError` で表示、ボタン再有効化。`setDoc` 単発のため中途半端な状態は残らない |
| 同じファイルを 2 回取込 | 冪等(同じ `wardRx` で `setDoc`)。`csvIngestedAt` のみ更新 |
| 新規日への取込直後に編集画面を開く | `emptyLog` 土台で全項目が既定値。`normalize`/`validate` を通る。記入者だけ空 |
| 対象日が別の月 | 6.3 の通り対象月をロードしてから `showDetail` |

## 8. テスト方針

取込ロジックが誤るとデータが静かに壊れるため、パーサーとその周辺を最重要のテスト対象とする。

### 8.1 新規の単体テスト `tests/hospital-import.test.js`

純粋コア `buildInspection(fileName, bytes)` の分岐を Node の `assert` で検証する。
Firestore 非依存のため素の `node tests/hospital-import.test.js` で実行できる。

- ファイル名不正(`sample.csv` / `0824.xlsx` など)→ `throw`
- ダミーCSVバイト列(`tests/fixtures/` から読む)→ `date` と `wardRx`(5 病棟 × 6 区分)が
  期待どおり組み上がる
- 病棟の行を欠いたダミー → `errors` に該当項目が入る
- 数値でないセルを含むダミー → `errors` に該当 `field` が入る

`inspect` / `run`(`Storage` 依存)と `saveWardRx` は 8.3 のブラウザ合成検証でカバーする
(`migrate.js` にも Node テストは無い。継ぎ目の precedent に合わせる)。

### 8.2 ダミーフィクスチャ

`tests/fixtures/hospital-sample.csv`(または同等の名前)を新規追加。
患者情報を含まない。5 病棟 + `■合計■` 行、2 行ヘッダー。Shift-JIS でなく UTF-8 でよい
(パーサーが両対応。Shift-JIS 経路は `tests/hospital-csv.test.js` が担保済み)。
実ファイル `C:\Users\GM\Desktop\業務日誌\0824.csv` は絶対にコミットしない。

### 8.3 ブラウザ合成検証(手動。引継ぎメモ §4 のパターン)

`main.js` は検証のため `window.HospitalImport` と `window.Storage` をデバッグ用に公開する
(ビュー群が `root.*View` で公開されているのと同じ発想。実害なし)。

- dev-server 起動 → Google ログイン後、コンソールから:
  1. ダミーCSV文字列から `File`(`name: "0101.csv"`)を生成 → `window.HospitalImport.inspect(file)`
     を呼び、返り値の `wardRx` / `date` / `exists` を assert
  2. `window.HospitalImport.run(parsed)` → 使い捨ての日付(`2020-01-01`)に書き込まれることを
     `window.Storage.getLog("2020-01-01")` で確認(`_meta.source === "csv"`、`author === ""`)→
     詳細画面の描画を `javascript_tool` で確認 → 後始末に Firestore コンソール等で当該ドキュメント削除
- 実際の UI 経由の確認: `#hospCsvFile` に `DataTransfer` で File をセットして `change` を発火 →
  `#hospCsvPreview` の内容を確認 → 既存データのある日で「既存 → 新」併記表示を目視確認

### 8.4 `Storage.saveWardRx`

Firestore 依存のため単体テストせず、8.3 のブラウザ合成検証でカバーする。

## 9. プロジェクト全体の絶対原則(再確認)

- 依存パッケージを一切追加しない(`package.json` / `node_modules` なし)
- 実患者データ入りの CSV / Excel は絶対にコミットしない
- Firestore 書き込みはすべてクライアント側、ログインユーザー自身の権限で行う
- Firebase Spark プラン(無料)を維持、Cloud Functions は使わない
