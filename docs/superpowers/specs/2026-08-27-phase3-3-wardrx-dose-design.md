# 病棟処方箋に「件数」を追加(フェーズ3-3) 設計書

作成日: 2026-08-27

## 1. 背景と目的

病院システムの日次CSVは、病棟処方箋の各区分(入院定期/入院臨時/退院/持参薬/1包化)について
**処方箋枚数(cnt)と調剤件数(dose)の両方**を出力する。ところが手入力系の画面は枚数しか
扱っていない:

- フェーズ3-2 のモバイル入力ページ(`entry-form.js`)は wardRx の各区分の**枚数のみ**入力し、
  件数は 0 固定で送っていた。
- 編集画面(`edit.js`)は wardRx の**枚数のみ**編集でき、件数は編集開始時の値を引き継ぐだけ。
  さらに `ippoka`(1包化)は編集対象に含まれていない(`total` が入力欄になっている)。
- 詳細画面(`detail.js`)は wardRx の**枚数のみ**表示する。

一方で部門長報告書(`dept-report.js`)は既に `wardRx[].teiki.dose` 等を集計している。
手入力の日は件数が 0 で入るため、報告書が実態より少なくなる。

### 目的

手入力系の3画面(モバイル入力・編集・詳細)で、病棟処方箋の**枚数と件数の両方**を
入力・編集・表示できるようにする。

### 非目的 (YAGNI)

- データモデルの変更。`daily-log.js` は既に `wardRx` の各区分を `{cnt, dose}` で保持し、
  `normalize` / `validate` / `emptyWardRx` すべて対応済み。
- `monthly-report.js` の変更。cnt 集計専用のため区分リストは現状のままでよい。
- `hospital-csv.js` の変更。既に cnt・dose 両方をパースしている。
- 外来(病棟行の「外来」)を wardRx に含めること。外来処方箋は `gairai` セクションの
  `rxOpCnt` / `rxOpDose` が扱う。wardRx は5病棟のまま。

## 2. データモデル(`src/model/daily-log.js`)

モデル自体は変更しない。**公開定数を1つ追加する**だけ。

```js
var WARDRX_INPUT_KINDS = [
  { key: "teiki",  label: "定期" },
  { key: "rinji",  label: "臨時" },
  { key: "taiin",  label: "退院" },
  { key: "meds",   label: "持参薬" },
  { key: "ippoka", label: "1包化" }
];
```

`api` に `WARDRX_INPUT_KINDS` を加える。`entry-form.js` / `edit.js` / `detail.js` の3つが
これを参照して区分と並びを揃える。`合計`(total)は入力せず、5区分の cnt / dose を
それぞれ合計して算出・表示する。

現状の区分リストの食い違い(この機会に entry/edit/detail を揃える):

| ファイル | 現在の wardRx 区分 | 変更後 |
|---|---|---|
| `entry-form.js` | teiki/rinji/taiin/meds/**ippoka**(cnt のみ) | `WARDRX_INPUT_KINDS`(cnt + dose) |
| `edit.js` | teiki/rinji/taiin/meds/**total**(cnt のみ) | `WARDRX_INPUT_KINDS`(cnt + dose)、total は算出表示 |
| `detail.js` | teiki/rinji/taiin/meds/**total**(cnt のみ) | `WARDRX_INPUT_KINDS` + total、各セル「枚 / 件」 |
| `monthly-report.js` | teiki/rinji/taiin/meds/total(cnt 集計) | **変更しない** |

## 3. モバイル入力ページ(`src/entry/entry-form.js`)

`wardRx` セクションの本体(`wardRxBody` と `collect` の wardRx 部分、`input` リスナー、
`WARDRX_KINDS` 定数)を作り直す。

### 3.1 レイアウト

区分ごとの縦ブロックを積む。各ブロックは病棟/枚数/件数の3列表。

```
【定期】
 病棟        枚数   件数
 かりゆし    [__]   [__]
 ゆいゆい    [__]   [__]
 うりずん北  [__]   [__]
 うりずん南  [__]   [__]
 はいさい    [__]   [__]

【臨時】 …（同じ3列表）
【退院】 …
【持参薬】 …
【1包化】 …

【合計】(表示のみ・自動計算)
 かりゆし    3 / 18
 ゆいゆい    …
```

- 区分ブロックの見出しは小見出し(`edit.js` の分包機ブロックの見出しと同じ体裁)。
- 各入力: `<input type="number" min="0" step="1" class="num-input"
  data-wardrx-ward="かりゆし" data-wardrx-kind="teiki" data-wardrx-metric="cnt">`。
  `data-wardrx-metric` は `"cnt"` か `"dose"`。
- 合計ブロック: 病棟ごとに1行、`<span data-wardrx-total-cnt="かりゆし">0</span> / <span data-wardrx-total-dose="かりゆし">0</span>`。

### 3.2 合計の自動計算

`container` の `input` リスナーで、`[data-wardrx-ward]` の入力があったら、その病棟の
5区分 × cnt / dose を集計し、`[data-wardrx-total-cnt="<ward>"]` と
`[data-wardrx-total-dose="<ward>"]` の `textContent` を更新する。

### 3.3 `collect()`

```js
var wardRxRows = WARDS.map(function (ward) {
  var row = { name: ward };
  DL.WARDRX_INPUT_KINDS.forEach(function (kind) {
    row[kind.key] = {
      cnt: num(q('[data-wardrx-ward="' + ward + '"][data-wardrx-kind="' + kind.key + '"][data-wardrx-metric="cnt"]').value),
      dose: num(q('[data-wardrx-ward="' + ward + '"][data-wardrx-kind="' + kind.key + '"][data-wardrx-metric="dose"]').value)
    };
  });
  return row;
});
// raw.wardRx = ES.wardRxTotals(wardRxRows)  ← total を埋める
```

`EntrySections.wardRxTotals` は既に cnt・dose の両方を合計する(`tests/entry-sections.test.js`
で `{cnt:13, dose:31}` を検証済み)。変更不要。

## 4. 詳細画面(`src/app/views/detail.js`)

`wardRxSection` を書き換える。

- ヘッダー: `病棟` + `WARDRX_INPUT_KINDS` の5ラベル + `合計` の7列。
- 各行: 病棟名 + 各区分の `<td class="num">cnt / dose</td>` + 合計の `total.cnt / total.dose`。

```
病棟       定期      臨時     退院    持参薬   1包化   合計
かりゆし   3 / 18    9 / 9    0 / 0   0 / 0    0 / 0   12 / 27
```

`.tbl-wrap` の中なので狭い画面では横スクロールになる。カードの見出し・色(`card-green` /
`sec-title-green`)は現状維持。`statGrid` の「病棟処方箋（件）」は `w.total.cnt` のまま(変更なし)。

`normalize` 済みの `log` を受け取るため、全区分に `{cnt, dose}` が入っている前提でよい。

## 5. 編集画面(`src/app/views/edit.js`)

### 5.1 `wardRxSection`

`entry-form.js` と同じ区分ごとの縦ブロック(病棟/枚数/件数の3列 × 5区分 + 合計表示)に
置き換える。`WARDRX_KINDS` 定数(現在 total を含み ippoka を含まない)を
`root.DailyLog.WARDRX_INPUT_KINDS` に差し替える。入力の初期値は `normalized.wardRx` の
各区分の `cnt` / `dose`。

### 5.2 `collect`

現在の wardRx 収集は「入力欄から cnt を読み、dose と ippoka は `original` から引き継ぐ」。
これを「5病棟 × 5区分の `{cnt, dose}` を入力欄から読み、`total` を算出」に変える。

```js
wardRx: WARDS.map(function (ward) {
  var row = { name: ward };
  var t = { cnt: 0, dose: 0 };
  root.DailyLog.WARDRX_INPUT_KINDS.forEach(function (kind) {
    var cnt = num(container.querySelector('[data-wardrx-ward="' + ward + '"][data-wardrx-kind="' + kind.key + '"][data-wardrx-metric="cnt"]').value);
    var dose = num(container.querySelector('[data-wardrx-ward="' + ward + '"][data-wardrx-kind="' + kind.key + '"][data-wardrx-metric="dose"]').value);
    row[kind.key] = { cnt: cnt, dose: dose };
    t.cnt += cnt; t.dose += dose;
  });
  row.total = t;
  return row;
})
```

`original` から dose / ippoka を引き継ぐコードは削除。編集開始時の値は
`normalized.wardRx` から入力欄に出ているので、触らなければそのまま保存される。

## 6. エラー処理

- `entry-form.js` / `edit.js` の入力欄は `type="number" min="0"`。非数値は `num()` で 0 に落ちる
  (既存の全数値入力と同じ扱い)。
- 承認時・保存時の `DailyLog.validate` は wardRx の全区分 cnt / dose を `isCount` で検査済み
  (既存)。負数・非数値は 0 に正規化されるため実質エラーにならない。
- 区分リストを `WARDRX_INPUT_KINDS` に統一するため、`ippoka` が編集・保存されるようになる。
  `hospital-csv.js` 由来の `ippoka` 値と手入力の `ippoka` 値は同じ形(`{cnt, dose}`)。

## 7. テスト方針

- **`tests/daily-log.test.js`**: `WARDRX_INPUT_KINDS` が `["teiki","rinji","taiin","meds","ippoka"]`
  の順で5件、各要素に `key` と `label` があることを1件追加。
- **`tests/entry-sections.test.js`**: `wardRxTotals` の cnt・dose 合計は既存テストが担保(変更なし)。
- **`tests/monthly-report.test.js` / `tests/dept-report.test.js`**: モデル不変のため既存テストが
  そのまま通ることを確認する(dept-report は既に `w.teiki.dose` 等を集計している)。
- **ブラウザ検証(手動)**:
  - モバイル入力ページ: 【定期】かりゆし に 枚 3・件 18 を入れ、【合計】ブロックが
    「3 / 18」になる → 送信 → 本アプリで承認 → 対象日の詳細の病棟処方箋カードに
    「3 / 18」が出る。
  - 編集画面: 既存日を開き、いずれかの区分の件数を変更 → 保存 → 詳細で反映を確認。
  - 病院CSVを取り込んだ日を詳細で開き、各セルが「枚 / 件」で正しく出ることを確認。

## 8. プロジェクト全体の絶対原則(再確認)

- 依存パッケージを一切追加しない。
- 実患者データ入りの CSV / Excel は絶対にコミットしない。
- `dailyLogs` への書き込みは Google 認証済みの本人のみ(ルール不変)。
- Firebase Spark プラン(無料)を維持、Cloud Functions は使わない。
