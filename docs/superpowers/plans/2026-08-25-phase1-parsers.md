# 薬局業務日誌 フェーズ1：データモデルとパーサー 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 病院システムCSVと既存の蓄積CSVを正確に読み取り、統一されたデータ構造へ変換できるモジュール群を、テストで裏づけた状態にする。

**Architecture:** 外部サービスに一切依存しない純粋なJavaScriptモジュールとして実装する。同一ファイルが Node (取込スクリプト) とブラウザ (Webアプリ) の双方でそのまま動くよう、kin プロジェクトと同じ IIFE + デュアルエクスポート形式を用いる。フェーズ1の成果物は単体で完結し、Firebase やネットワークを必要としない。

**Tech Stack:** 素の JavaScript (ES5相当の構文)、Node 標準の `assert` と `node:test` を使わない自前の簡易テストランナー (kin と同じ形式)、`TextDecoder` (Node 標準・追加ライブラリ不要)

## Global Constraints

- **依存パッケージを追加しない。** `package.json` も `node_modules` も作らない。kin プロジェクトの流儀に従う
- **モジュール形式は kin の `holidays.js` と同一。** `(function (root) { ... })(typeof window !== "undefined" ? window : this);` で包み、末尾で `module.exports` と `root.<Name>` の両方に対応させる
- **患者情報を含む実データをリポジトリに置かない。** テスト用フィクスチャはすべて創作したダミーとする
- **病院システムCSVの文字コードは Shift-JIS (CP932)。** `new TextDecoder("shift_jis")` でデコードする
- **フィールド名は既存の蓄積CSVと完全に一致させる。** 設計書 4.1 の表に従う
- **病棟名の並び順は固定。** `["かりゆし", "ゆいゆい", "うりずん北", "うりずん南", "はいさい"]`
- テストは `node tests/<name>.test.js` の単体で実行でき、失敗時に終了コードが 0 以外になること

---

## File Structure

| ファイル | 責務 |
|---|---|
| `src/model/daily-log.js` | 日誌レコードの正準的な形の定義。空レコード生成・正規化・検証 |
| `src/parse/filename.js` | 入力ファイル名から対象日と種別を判定する |
| `src/parse/hospital-csv.js` | 病院システムの日次CSV (Shift-JIS) を `wardRx[]` に変換する |
| `src/parse/accum-csv.js` | 既存の蓄積CSVを日誌レコード配列とマスタに変換する (移行専用) |
| `tests/helper.js` | 全テストで共有する簡易テストランナー |
| `tests/*.test.js` | 各モジュールの単体テスト |
| `tests/fixtures/*` | ダミーのテストデータ |
| `scripts/verify-real-data.js` | 手元の実データに対して変換の正しさを検証する (リポジトリ外のファイルを読む) |

---

### Task 1: 日誌レコードのモデル定義

このモジュールが、以降すべてのタスクが従うデータ構造の唯一の定義になる。

**Files:**
- Create: `src/model/daily-log.js`
- Create: `tests/helper.js`
- Test: `tests/daily-log.test.js`

**Interfaces:**
- Consumes: なし (最初のタスク)
- Produces:
  - `DailyLog.WARDS: string[]` — 病棟名5件の固定配列
  - `DailyLog.RX_KINDS: string[]` — `["teiki","rinji","taiin","meds","ippoka","total"]`
  - `DailyLog.INQ_TYPES / DRUG_TYPES / MEETING_TYPES / CONTACT_FROM: string[]`
  - `DailyLog.emptyLog(date: string): object` — 全項目が初期値で埋まった日誌レコード
  - `DailyLog.normalize(partial: object): object` — 部分的なオブジェクトを完全なレコードへ補完
  - `DailyLog.validate(record: object): Array<{field: string, message: string}>` — 問題があれば配列で返す。無ければ空配列
  - `DailyLog.wardMedsFrom(wardRx: object[]): Array<{ward,cnt,dose,ipCnt,ipDose}>` — 持参薬鑑別・1包化を `wardRx` から算出する

- [ ] **Step 1: 共有テストランナーを作る**

`tests/helper.js` を作成する。kin の `tests/holidays.test.js` が各ファイル内に持っている `test()` 関数を共有化したもの。

```javascript
var results = { pass: 0, fail: 0 };

function test(name, fn) {
  try {
    fn();
    results.pass++;
    console.log("OK: " + name);
  } catch (e) {
    results.fail++;
    console.error("FAIL: " + name);
    console.error(e && e.message ? e.message : e);
    process.exitCode = 1;
  }
}

function summary() {
  console.log("--- " + results.pass + " passed, " + results.fail + " failed ---");
}

module.exports = { test: test, summary: summary };
```

- [ ] **Step 2: 失敗するテストを書く**

`tests/daily-log.test.js` を作成する。

```javascript
var assert = require("assert");
var h = require("./helper.js");
var test = h.test;
var DailyLog = require("../src/model/daily-log.js");

test("emptyLog returns every field initialised", function () {
  var log = DailyLog.emptyLog("2026-08-24");
  assert.strictEqual(log.date, "2026-08-24");
  assert.strictEqual(log.author, "");
  assert.strictEqual(log.rxOpCnt, 0);
  assert.strictEqual(log.counsel, 0);
  assert.strictEqual(log.notes, "");
  assert.deepStrictEqual(log.inquiries, []);
  assert.strictEqual(log.wardRx.length, 5);
  assert.strictEqual(log.wardRx[0].name, "かりゆし");
  assert.strictEqual(log.wardRx[0].teiki.cnt, 0);
  assert.strictEqual(log.wardRx[4].name, "はいさい");
  assert.strictEqual(log.winjData.length, 5);
  assert.strictEqual(log.packerData.tab["分包紙"], 0);
  assert.strictEqual(log.packerData.san["清掃"], false);
  assert.strictEqual(log.submissions.diNews, false);
  assert.strictEqual(log.submissions.notices, 0);
});

test("normalize fills in missing fields but keeps supplied ones", function () {
  var log = DailyLog.normalize({ date: "2026-08-24", counsel: 3, notes: "特記事項" });
  assert.strictEqual(log.counsel, 3);
  assert.strictEqual(log.notes, "特記事項");
  assert.strictEqual(log.rxOpCnt, 0);
  assert.deepStrictEqual(log.mrVisits, []);
});

test("normalize does not share nested objects between records", function () {
  var a = DailyLog.normalize({ date: "2026-08-24" });
  var b = DailyLog.normalize({ date: "2026-08-25" });
  a.wardRx[0].teiki.cnt = 99;
  a.inquiries.push({ type: "用量" });
  assert.strictEqual(b.wardRx[0].teiki.cnt, 0);
  assert.strictEqual(b.inquiries.length, 0);
});

test("validate accepts a well-formed record", function () {
  assert.deepStrictEqual(DailyLog.validate(DailyLog.emptyLog("2026-08-24")), []);
});

test("validate rejects a malformed date", function () {
  var log = DailyLog.emptyLog("2026-08-24");
  log.date = "8/24";
  var errors = DailyLog.validate(log);
  assert.strictEqual(errors.length, 1);
  assert.strictEqual(errors[0].field, "date");
});

test("validate rejects negative and non-numeric counts", function () {
  var log = DailyLog.emptyLog("2026-08-24");
  log.rxOpCnt = -1;
  log.counsel = "３件";
  var fields = DailyLog.validate(log).map(function (e) { return e.field; });
  assert.ok(fields.indexOf("rxOpCnt") >= 0);
  assert.ok(fields.indexOf("counsel") >= 0);
});

test("validate rejects an unknown inquiry type", function () {
  var log = DailyLog.emptyLog("2026-08-24");
  log.inquiries.push({ type: "存在しない区分", memo: "x", changed: false });
  var errors = DailyLog.validate(log);
  assert.strictEqual(errors.length, 1);
  assert.ok(errors[0].message.indexOf("存在しない区分") >= 0);
});

test("wardMedsFrom derives carried-in drug figures from wardRx", function () {
  var log = DailyLog.emptyLog("2026-08-24");
  log.wardRx[4].meds = { cnt: 1, dose: 4 };
  log.wardRx[4].ippoka = { cnt: 2, dose: 5 };
  var meds = DailyLog.wardMedsFrom(log.wardRx);
  assert.strictEqual(meds.length, 5);
  assert.deepStrictEqual(meds[4], { ward: "はいさい", cnt: 1, dose: 4, ipCnt: 2, ipDose: 5 });
  assert.deepStrictEqual(meds[0], { ward: "かりゆし", cnt: 0, dose: 0, ipCnt: 0, ipDose: 0 });
});

h.summary();
```

- [ ] **Step 3: テストを実行して失敗を確認する**

```bash
node tests/daily-log.test.js
```

期待する結果: `Cannot find module '../src/model/daily-log.js'` で異常終了する。

- [ ] **Step 4: モジュールを実装する**

`src/model/daily-log.js` を作成する。

```javascript
(function (root) {
  "use strict";

  var WARDS = ["かりゆし", "ゆいゆい", "うりずん北", "うりずん南", "はいさい"];
  var RX_KINDS = ["teiki", "rinji", "taiin", "meds", "ippoka", "total"];
  var INQ_TYPES = ["用法", "用量", "日数", "相互作用", "重複", "禁忌", "漏れ", "その他"];
  var DRUG_TYPES = ["adopt", "remove", "expire", "return", "maintenance"];
  var MEETING_TYPES = ["電子カルテ", "感染", "部門長", "倫理", "医薬品", "褥瘡", "医療安全"];
  var CONTACT_FROM = ["医師", "病棟", "その他"];
  var PACKER_UNITS = ["tab", "san"];

  var NUMBER_FIELDS = ["rxOpCnt", "rxOpDose", "rxInjCnt", "rxInjDose", "counsel"];
  var LIST_FIELDS = [
    "inquiries", "mrVisits", "contacts", "drugs",
    "shortages", "meetings", "trainings", "premixes",
    "doctorChanges", "checklist"
  ];

  var DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

  function emptyPair() {
    return { cnt: 0, dose: 0 };
  }

  function emptyWardRx() {
    return WARDS.map(function (name) {
      var row = { name: name };
      RX_KINDS.forEach(function (kind) {
        row[kind] = emptyPair();
      });
      return row;
    });
  }

  function emptyWinj() {
    return WARDS.map(function (name) {
      return { ward: name, cnt: 0, dose: 0 };
    });
  }

  function emptyPacker() {
    var packer = {};
    PACKER_UNITS.forEach(function (unit) {
      packer[unit] = { "分包紙": 0, "インク": 0, "清掃": false };
    });
    return packer;
  }

  function emptyLog(date) {
    var log = {
      date: date || "",
      author: "",
      wardRx: emptyWardRx(),
      winjData: emptyWinj(),
      packerData: emptyPacker(),
      submissions: { diNews: false, notices: 0, other: "" },
      notes: ""
    };
    NUMBER_FIELDS.forEach(function (field) {
      log[field] = 0;
    });
    LIST_FIELDS.forEach(function (field) {
      log[field] = [];
    });
    return log;
  }

  function normalize(partial) {
    var source = partial || {};
    var log = emptyLog(source.date || "");

    if (typeof source.author === "string") log.author = source.author;
    if (typeof source.notes === "string") log.notes = source.notes;

    NUMBER_FIELDS.forEach(function (field) {
      if (source[field] !== undefined && source[field] !== null) {
        log[field] = source[field];
      }
    });

    LIST_FIELDS.forEach(function (field) {
      if (Array.isArray(source[field])) {
        log[field] = source[field].slice();
      }
    });

    if (Array.isArray(source.wardRx)) {
      log.wardRx = mergeWardRx(source.wardRx);
    }
    if (Array.isArray(source.winjData)) {
      log.winjData = mergeWinj(source.winjData);
    }
    if (source.packerData) {
      PACKER_UNITS.forEach(function (unit) {
        var incoming = source.packerData[unit];
        if (!incoming) return;
        if (incoming["分包紙"] !== undefined) log.packerData[unit]["分包紙"] = incoming["分包紙"];
        if (incoming["インク"] !== undefined) log.packerData[unit]["インク"] = incoming["インク"];
        if (incoming["清掃"] !== undefined) log.packerData[unit]["清掃"] = !!incoming["清掃"];
      });
    }
    if (source.submissions) {
      if (source.submissions.diNews !== undefined) log.submissions.diNews = !!source.submissions.diNews;
      if (source.submissions.notices !== undefined) log.submissions.notices = source.submissions.notices;
      if (typeof source.submissions.other === "string") log.submissions.other = source.submissions.other;
    }
    return log;
  }

  function mergeWardRx(incoming) {
    var byName = {};
    incoming.forEach(function (row) {
      if (row && row.name) byName[row.name] = row;
    });
    return WARDS.map(function (name) {
      var row = { name: name };
      var found = byName[name];
      RX_KINDS.forEach(function (kind) {
        var pair = found && found[kind] ? found[kind] : null;
        row[kind] = {
          cnt: pair && pair.cnt !== undefined ? pair.cnt : 0,
          dose: pair && pair.dose !== undefined ? pair.dose : 0
        };
      });
      return row;
    });
  }

  function mergeWinj(incoming) {
    var byWard = {};
    incoming.forEach(function (row) {
      if (row && row.ward) byWard[row.ward] = row;
    });
    return WARDS.map(function (name) {
      var found = byWard[name];
      return {
        ward: name,
        cnt: found && found.cnt !== undefined ? found.cnt : 0,
        dose: found && found.dose !== undefined ? found.dose : 0
      };
    });
  }

  function isCount(value) {
    return typeof value === "number" && isFinite(value) && value >= 0;
  }

  function validate(record) {
    var errors = [];

    if (!record || typeof record !== "object") {
      return [{ field: "(record)", message: "レコードがオブジェクトではありません" }];
    }
    if (!DATE_RE.test(record.date || "")) {
      errors.push({ field: "date", message: "日付は YYYY-MM-DD 形式である必要があります: " + record.date });
    }

    NUMBER_FIELDS.forEach(function (field) {
      if (!isCount(record[field])) {
        errors.push({ field: field, message: "0以上の数値である必要があります: " + record[field] });
      }
    });

    (record.wardRx || []).forEach(function (row) {
      RX_KINDS.forEach(function (kind) {
        var pair = row[kind] || {};
        if (!isCount(pair.cnt) || !isCount(pair.dose)) {
          errors.push({
            field: "wardRx." + row.name + "." + kind,
            message: "枚数・件数は0以上の数値である必要があります"
          });
        }
      });
    });

    (record.inquiries || []).forEach(function (item, index) {
      if (INQ_TYPES.indexOf(item.type) < 0) {
        errors.push({
          field: "inquiries[" + index + "].type",
          message: "疑義照会の区分が不正です: " + item.type
        });
      }
    });

    (record.drugs || []).forEach(function (item, index) {
      if (DRUG_TYPES.indexOf(item.type) < 0) {
        errors.push({
          field: "drugs[" + index + "].type",
          message: "薬品管理の区分が不正です: " + item.type
        });
      }
    });

    (record.meetings || []).forEach(function (item, index) {
      if (MEETING_TYPES.indexOf(item.type) < 0) {
        errors.push({
          field: "meetings[" + index + "].type",
          message: "会議の種別が不正です: " + item.type
        });
      }
    });

    (record.contacts || []).forEach(function (item, index) {
      if (CONTACT_FROM.indexOf(item.from) < 0) {
        errors.push({
          field: "contacts[" + index + "].from",
          message: "問い合わせ元が不正です: " + item.from
        });
      }
    });

    return errors;
  }

  function wardMedsFrom(wardRx) {
    var byName = {};
    (wardRx || []).forEach(function (row) {
      if (row && row.name) byName[row.name] = row;
    });
    return WARDS.map(function (name) {
      var row = byName[name] || {};
      var meds = row.meds || emptyPair();
      var ippoka = row.ippoka || emptyPair();
      return {
        ward: name,
        cnt: meds.cnt || 0,
        dose: meds.dose || 0,
        ipCnt: ippoka.cnt || 0,
        ipDose: ippoka.dose || 0
      };
    });
  }

  var api = {
    WARDS: WARDS,
    RX_KINDS: RX_KINDS,
    INQ_TYPES: INQ_TYPES,
    DRUG_TYPES: DRUG_TYPES,
    MEETING_TYPES: MEETING_TYPES,
    CONTACT_FROM: CONTACT_FROM,
    PACKER_UNITS: PACKER_UNITS,
    emptyLog: emptyLog,
    normalize: normalize,
    validate: validate,
    wardMedsFrom: wardMedsFrom
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.DailyLog = api;
  }
})(typeof window !== "undefined" ? window : this);
```

- [ ] **Step 5: テストを実行して成功を確認する**

```bash
node tests/daily-log.test.js
```

期待する結果: 8件すべて `OK:` と表示され、`--- 8 passed, 0 failed ---` で終了する。

- [ ] **Step 6: コミットする**

```bash
git add src/model/daily-log.js tests/helper.js tests/daily-log.test.js
git commit -m "feat: define the canonical daily log record shape"
```

---

### Task 2: ファイル名からの日付判定

**Files:**
- Create: `src/parse/filename.js`
- Test: `tests/filename.test.js`

**Interfaces:**
- Consumes: なし
- Produces:
  - `Filename.parse(name: string, today: Date): {date: string, kind: "csv"|"xlsx"} | null`
    — 判定できない名前には `null` を返す。`today` は年の推定に用いる

年は名前に含まれないため、`today` から見て最も近い年を採用する。例えば実行日が 2027-01-05 のとき `1230.csv` は 2026-12-30 と解釈する。

- [ ] **Step 1: 失敗するテストを書く**

`tests/filename.test.js` を作成する。

```javascript
var assert = require("assert");
var h = require("./helper.js");
var test = h.test;
var Filename = require("../src/parse/filename.js");

var AUG_25 = new Date(2026, 7, 25);

test("parses a hospital csv name", function () {
  assert.deepStrictEqual(Filename.parse("0824.csv", AUG_25), { date: "2026-08-24", kind: "csv" });
});

test("parses an excel template name", function () {
  assert.deepStrictEqual(Filename.parse("0824.xlsx", AUG_25), { date: "2026-08-24", kind: "xlsx" });
});

test("ignores surrounding path and letter case", function () {
  assert.deepStrictEqual(Filename.parse("/取込待ち/0824.CSV", AUG_25), { date: "2026-08-24", kind: "csv" });
});

test("picks the nearest year across a year boundary", function () {
  var jan5 = new Date(2027, 0, 5);
  assert.deepStrictEqual(Filename.parse("1230.csv", jan5), { date: "2026-12-30", kind: "csv" });
  assert.deepStrictEqual(Filename.parse("0104.csv", jan5), { date: "2027-01-04", kind: "csv" });
  var dec28 = new Date(2026, 11, 28);
  assert.deepStrictEqual(Filename.parse("0102.csv", dec28), { date: "2027-01-02", kind: "csv" });
});

test("rejects names that are not MMDD", function () {
  assert.strictEqual(Filename.parse("2026-08-24.csv", AUG_25), null);
  assert.strictEqual(Filename.parse("082.csv", AUG_25), null);
  assert.strictEqual(Filename.parse("メモ.csv", AUG_25), null);
  assert.strictEqual(Filename.parse("0824.txt", AUG_25), null);
});

test("rejects an impossible calendar date", function () {
  assert.strictEqual(Filename.parse("1332.csv", AUG_25), null);
  assert.strictEqual(Filename.parse("0230.csv", AUG_25), null);
});

h.summary();
```

- [ ] **Step 2: テストを実行して失敗を確認する**

```bash
node tests/filename.test.js
```

期待する結果: `Cannot find module '../src/parse/filename.js'` で異常終了する。

- [ ] **Step 3: モジュールを実装する**

`src/parse/filename.js` を作成する。

```javascript
(function (root) {
  "use strict";

  var NAME_RE = /^(\d{2})(\d{2})\.(csv|xlsx)$/i;

  function pad2(value) {
    return value < 10 ? "0" + value : "" + value;
  }

  function isRealDate(year, month, day) {
    var d = new Date(year, month - 1, day);
    return d.getFullYear() === year && d.getMonth() === month - 1 && d.getDate() === day;
  }

  function parse(name, today) {
    if (typeof name !== "string") return null;

    var base = name.split("/").pop().split("\\").pop();
    var match = NAME_RE.exec(base);
    if (!match) return null;

    var month = parseInt(match[1], 10);
    var day = parseInt(match[2], 10);
    var kind = match[3].toLowerCase();
    var reference = today || new Date();

    var candidates = [reference.getFullYear() - 1, reference.getFullYear(), reference.getFullYear() + 1];
    var best = null;
    var bestDistance = Infinity;

    candidates.forEach(function (year) {
      if (!isRealDate(year, month, day)) return;
      var distance = Math.abs(new Date(year, month - 1, day).getTime() - reference.getTime());
      if (distance < bestDistance) {
        bestDistance = distance;
        best = year;
      }
    });

    if (best === null) return null;
    return { date: best + "-" + pad2(month) + "-" + pad2(day), kind: kind };
  }

  var api = { parse: parse };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.Filename = api;
  }
})(typeof window !== "undefined" ? window : this);
```

- [ ] **Step 4: テストを実行して成功を確認する**

```bash
node tests/filename.test.js
```

期待する結果: 6件すべて `OK:` と表示され、`--- 6 passed, 0 failed ---` で終了する。

- [ ] **Step 5: コミットする**

```bash
git add src/parse/filename.js tests/filename.test.js
git commit -m "feat: resolve the target date from an input file name"
```

---

### Task 3: 病院システムCSVパーサー

**Files:**
- Create: `src/parse/hospital-csv.js`
- Create: `tests/fixtures/hospital-sample.csv` (Shift-JIS のダミーデータ)
- Test: `tests/hospital-csv.test.js`

**Interfaces:**
- Consumes: `DailyLog.WARDS`, `DailyLog.RX_KINDS` (Task 1)
- Produces:
  - `HospitalCsv.decode(buffer: Buffer|Uint8Array): string` — Shift-JIS を文字列へ
  - `HospitalCsv.parse(buffer: Buffer|Uint8Array): {wardRx: object[], errors: Array<{field,message}>}`

入力の形は次のとおり。1行目が処方区分、2行目が「処方箋枚数 / 調剤件数」、3行目以降が病棟行、最終行が合計行。

```
病棟,入院定期,,入院臨時,,退院,,持参薬,,1包化　持参薬,,■合計■,
,処方箋枚数,調剤件数,処方箋枚数,調剤件数,処方箋枚数,調剤件数,処方箋枚数,調剤件数,処方箋枚数,調剤件数,処方箋枚数,調剤件数
かりゆし,16,61,22,22,0,0,0,0,0,0,38,83
■合計■,45,184,59,62,0,0,3,11,0,0,107,257
```

列見出しから `wardRx` のキーへの対応は次で固定する。

| CSVの見出し | キー |
|---|---|
| 入院定期 | `teiki` |
| 入院臨時 | `rinji` |
| 退院 | `taiin` |
| 持参薬 | `meds` |
| 1包化　持参薬 | `ippoka` |
| ■合計■ | `total` |

- [ ] **Step 1: ダミーのテストデータを作る**

`tests/fixtures/hospital-sample.csv` を **Shift-JIS で** 作成する。数値は実データではない創作値を使う。

Node の `TextEncoder` は UTF-8 しか出力できないため、Shift-JIS での書き出しは PowerShell の
`Text.Encoding.GetEncoding(932)` を用いる。以下を PowerShell ツールで実行する。

```powershell
New-Item -ItemType Directory -Force tests/fixtures | Out-Null
$lines = @(
  '病棟,入院定期,,入院臨時,,退院,,持参薬,,1包化　持参薬,,■合計■,',
  ',処方箋枚数,調剤件数,処方箋枚数,調剤件数,処方箋枚数,調剤件数,処方箋枚数,調剤件数,処方箋枚数,調剤件数,処方箋枚数,調剤件数',
  'かりゆし,1,2,3,4,0,0,0,0,0,0,4,6',
  'ゆいゆい,5,6,0,0,0,0,0,0,0,0,5,6',
  'うりずん北,0,0,0,0,0,0,7,8,0,0,7,8',
  'うりずん南,0,0,0,0,0,0,0,0,0,0,0,0',
  'はいさい,0,0,0,0,9,10,0,0,11,12,20,22',
  '■合計■,6,8,3,4,9,10,7,8,11,12,36,42'
)
[IO.File]::WriteAllText("$PWD/tests/fixtures/hospital-sample.csv", ($lines -join "`r`n") + "`r`n", [Text.Encoding]::GetEncoding(932))
```

変換を確認する。

```bash
node -e "console.log(new TextDecoder('shift_jis').decode(require('fs').readFileSync('tests/fixtures/hospital-sample.csv')).split('\n')[2])"
```

期待する出力: `かりゆし,1,2,3,4,0,0,0,0,0,0,4,6`

- [ ] **Step 2: 失敗するテストを書く**

`tests/hospital-csv.test.js` を作成する。

```javascript
var assert = require("assert");
var fs = require("fs");
var path = require("path");
var h = require("./helper.js");
var test = h.test;
var HospitalCsv = require("../src/parse/hospital-csv.js");

function fixture(name) {
  return fs.readFileSync(path.join(__dirname, "fixtures", name));
}

test("decodes Shift-JIS content", function () {
  var text = HospitalCsv.decode(fixture("hospital-sample.csv"));
  assert.ok(text.indexOf("かりゆし") >= 0);
  assert.ok(text.indexOf("入院定期") >= 0);
});

test("parses every ward in the fixed order", function () {
  var result = HospitalCsv.parse(fixture("hospital-sample.csv"));
  assert.deepStrictEqual(result.errors, []);
  assert.strictEqual(result.wardRx.length, 5);
  assert.deepStrictEqual(
    result.wardRx.map(function (r) { return r.name; }),
    ["かりゆし", "ゆいゆい", "うりずん北", "うりずん南", "はいさい"]
  );
});

test("maps each column heading to the right key", function () {
  var rows = HospitalCsv.parse(fixture("hospital-sample.csv")).wardRx;
  assert.deepStrictEqual(rows[0].teiki, { cnt: 1, dose: 2 });
  assert.deepStrictEqual(rows[0].rinji, { cnt: 3, dose: 4 });
  assert.deepStrictEqual(rows[0].total, { cnt: 4, dose: 6 });
  assert.deepStrictEqual(rows[2].meds, { cnt: 7, dose: 8 });
  assert.deepStrictEqual(rows[4].taiin, { cnt: 9, dose: 10 });
  assert.deepStrictEqual(rows[4].ippoka, { cnt: 11, dose: 12 });
});

test("excludes the grand total row from the ward list", function () {
  var rows = HospitalCsv.parse(fixture("hospital-sample.csv")).wardRx;
  var names = rows.map(function (r) { return r.name; });
  assert.strictEqual(names.indexOf("■合計■"), -1);
});

test("reports an error when a ward is missing", function () {
  var text = [
    "病棟,入院定期,,■合計■,",
    ",処方箋枚数,調剤件数,処方箋枚数,調剤件数",
    "かりゆし,1,2,1,2"
  ].join("\r\n");
  var result = HospitalCsv.parse(Buffer.from(text, "utf8"));
  assert.ok(result.errors.length > 0);
  assert.ok(result.errors[0].message.indexOf("ゆいゆい") >= 0);
});

test("reports an error for a non-numeric cell", function () {
  var result = HospitalCsv.parse(fixture("hospital-bad-number.csv"));
  assert.ok(result.errors.length > 0);
  assert.ok(result.errors[0].message.indexOf("数値") >= 0);
});

h.summary();
```

不正データ用のフィクスチャも作る。UTF-8 でよい (パーサーは BOM 無し UTF-8 も読める必要がある)。

```bash
node -e "
var fs = require('fs');
var lines = [
  '病棟,入院定期,,■合計■,',
  ',処方箋枚数,調剤件数,処方箋枚数,調剤件数',
  'かりゆし,あ,2,1,2',
  'ゆいゆい,0,0,0,0',
  'うりずん北,0,0,0,0',
  'うりずん南,0,0,0,0',
  'はいさい,0,0,0,0'
];
fs.writeFileSync('tests/fixtures/hospital-bad-number.csv', lines.join('\r\n'), 'utf8');
"
```

- [ ] **Step 3: テストを実行して失敗を確認する**

```bash
node tests/hospital-csv.test.js
```

期待する結果: `Cannot find module '../src/parse/hospital-csv.js'` で異常終了する。

- [ ] **Step 4: モジュールを実装する**

`src/parse/hospital-csv.js` を作成する。

**文字コードの判定順序に注意する。** UTF-8 として厳密にデコードを試み、失敗した場合のみ Shift-JIS とみなす。
逆順にしてはならない。UTF-8 のバイト列は Shift-JIS としても「文字化けした結果」が返るだけで例外にならず、
判定に失敗するためである。UTF-8 は不正なバイト列を確実に検出できるので、こちらを先に試す。

```javascript
(function (root) {
  "use strict";

  var DailyLog = (typeof require !== "undefined")
    ? require("../model/daily-log.js")
    : root.DailyLog;

  var HEADING_TO_KEY = {
    "入院定期": "teiki",
    "入院臨時": "rinji",
    "退院": "taiin",
    "持参薬": "meds",
    "1包化　持参薬": "ippoka",
    "■合計■": "total"
  };

  var TOTAL_ROW_LABEL = "■合計■";

  function decode(buffer) {
    var bytes = (typeof Buffer !== "undefined" && Buffer.isBuffer(buffer))
      ? new Uint8Array(buffer)
      : buffer;

    // UTF-8 \u306F\u4E0D\u6B63\u306A\u30D0\u30A4\u30C8\u5217\u3092\u78BA\u5B9F\u306B\u691C\u51FA\u3067\u304D\u308B\u305F\u3081\u5148\u306B\u8A66\u3059\u3002
    // \u9006\u9806\u306B\u3059\u308B\u3068\u3001UTF-8 \u306E\u5185\u5BB9\u304C Shift-JIS \u3068\u3057\u3066\u6587\u5B57\u5316\u3051\u3057\u305F\u307E\u307E\u901A\u3063\u3066\u3057\u307E\u3046\u3002
    try {
      return new TextDecoder("utf-8", { fatal: true }).decode(bytes).replace(/^\uFEFF/, "");
    } catch (e) {
      return new TextDecoder("shift_jis").decode(bytes);
    }
  }

  function splitLine(line) {
    return line.split(",").map(function (cell) {
      return cell.replace(/^"|"$/g, "").trim();
    });
  }

  function normalizeHeading(value) {
    return value.replace(/\s+/g, " ").replace(/ /g, "　").trim();
  }

  function buildColumnMap(headingRow) {
    var map = {};
    var current = null;
    for (var i = 1; i < headingRow.length; i++) {
      var heading = normalizeHeading(headingRow[i]);
      if (heading) {
        current = HEADING_TO_KEY[heading] || HEADING_TO_KEY[headingRow[i].trim()] || null;
        if (current) map[current] = { cnt: i, dose: i + 1 };
      }
    }
    return map;
  }

  function toCount(raw) {
    if (raw === "" || raw === undefined) return 0;
    if (!/^-?\d+$/.test(raw)) return null;
    return parseInt(raw, 10);
  }

  function parse(buffer) {
    var errors = [];
    var text = decode(buffer);
    var lines = text.split(/\r?\n/).filter(function (line) {
      return line.trim() !== "";
    });

    if (lines.length < 3) {
      return { wardRx: [], errors: [{ field: "(file)", message: "行数が足りません" }] };
    }

    var columns = buildColumnMap(splitLine(lines[0]));
    var byWard = {};

    for (var i = 2; i < lines.length; i++) {
      var cells = splitLine(lines[i]);
      var wardName = cells[0];
      if (!wardName || wardName === TOTAL_ROW_LABEL) continue;

      var row = { name: wardName };
      DailyLog.RX_KINDS.forEach(function (kind) {
        var position = columns[kind];
        if (!position) {
          row[kind] = { cnt: 0, dose: 0 };
          return;
        }
        var cnt = toCount(cells[position.cnt]);
        var dose = toCount(cells[position.dose]);
        if (cnt === null || dose === null) {
          errors.push({
            field: wardName + "." + kind,
            message: "数値として読み取れません: " + cells[position.cnt] + " / " + cells[position.dose]
          });
        }
        row[kind] = { cnt: cnt === null ? 0 : cnt, dose: dose === null ? 0 : dose };
      });
      byWard[wardName] = row;
    }

    var wardRx = DailyLog.WARDS.map(function (name) {
      if (byWard[name]) return byWard[name];
      errors.push({ field: name, message: "病棟の行が見つかりません: " + name });
      var blank = { name: name };
      DailyLog.RX_KINDS.forEach(function (kind) {
        blank[kind] = { cnt: 0, dose: 0 };
      });
      return blank;
    });

    return { wardRx: wardRx, errors: errors };
  }

  var api = { decode: decode, parse: parse };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.HospitalCsv = api;
  }
})(typeof window !== "undefined" ? window : this);
```

- [ ] **Step 5: テストを実行して成功を確認する**

```bash
node tests/hospital-csv.test.js
```

期待する結果: 6件すべて `OK:` と表示され、`--- 6 passed, 0 failed ---` で終了する。

- [ ] **Step 6: コミットする**

```bash
git add src/parse/hospital-csv.js tests/hospital-csv.test.js tests/fixtures/
git commit -m "feat: parse the hospital ward prescription csv"
```

---

### Task 4: 蓄積CSVパーサー (過去データ移行用)

既存の `pharmacy_accum_*.csv` を読み、日誌レコード配列とマスタに変換する。移行時に一度使うが、正しさを保証する必要があるためテストを伴う。

**Files:**
- Create: `src/parse/accum-csv.js`
- Create: `tests/fixtures/accum-sample.csv`
- Test: `tests/accum-csv.test.js`

**Interfaces:**
- Consumes: `DailyLog.normalize` (Task 1)
- Produces:
  - `AccumCsv.parse(text: string): {logs: object[], masters: object}`
    - `logs` — 日付昇順の日誌レコード配列
    - `masters` — `{members: string[], checklist: object, premixes: string[], doctors: string[]}`

蓄積CSVの構造は次のとおり。

- 1行目がヘッダー。列名は日誌レコードのフィールド名と一致する
- 配列・オブジェクト項目の値は JSON 文字列として1セルに格納されている
- ファイル末尾に `#MEMBERS:` `#CHECKLIST:` `#PREMIX_MASTER:` `#DOCTOR_MASTER:` のコメント行がある

- [ ] **Step 1: ダミーのテストデータを作る**

`tests/fixtures/accum-sample.csv` を作成する。実在する患者情報を含めず、構造だけを再現する。

```bash
node -e "
var fs = require('fs');
var rows = [
  '\"date\",\"author\",\"rxOpCnt\",\"rxOpDose\",\"rxInjCnt\",\"rxInjDose\",\"counsel\",\"inquiries\",\"doctorChanges\",\"premixes\",\"drugs\",\"shortages\",\"meetings\",\"mrVisits\",\"contacts\",\"trainings\",\"packerData\",\"wardMeds\",\"wardRx\",\"winjData\",\"notes\"',
  '\"2026-04-01\",\"検査 太郎\",\"1\",\"2\",\"3\",\"4\",\"5\",\"[{\"\"type\"\":\"\"用量\"\",\"\"memo\"\":\"\"テスト\"\",\"\"changed\"\":true}]\",\"[{\"\"doctor\"\":\"\"検査 医師\"\",\"\"cnt\"\":2}]\",\"[]\",\"[]\",\"[]\",\"[]\",\"[]\",\"[]\",\"[]\",\"{\"\"tab\"\":{\"\"分包紙\"\":1,\"\"インク\"\":0,\"\"清掃\"\":true},\"\"san\"\":{\"\"分包紙\"\":0,\"\"インク\"\":0,\"\"清掃\"\":false}}\",\"[]\",\"[{\"\"name\"\":\"\"かりゆし\"\",\"\"teiki\"\":{\"\"cnt\"\":1,\"\"dose\"\":2},\"\"rinji\"\":{\"\"cnt\"\":0,\"\"dose\"\":0},\"\"taiin\"\":{\"\"cnt\"\":0,\"\"dose\"\":0},\"\"meds\"\":{\"\"cnt\"\":0,\"\"dose\"\":0},\"\"ippoka\"\":{\"\"cnt\"\":0,\"\"dose\"\":0},\"\"total\"\":{\"\"cnt\"\":1,\"\"dose\"\":2}}]\",\"[{\"\"ward\"\":\"\"かりゆし\"\",\"\"cnt\"\":1,\"\"dose\"\":1}]\",\"備考テスト\"',
  '\"2026-04-02\",\"検査 花子\",\"0\",\"0\",\"0\",\"0\",\"0\",\"[]\",\"[]\",\"[]\",\"[]\",\"[]\",\"[]\",\"[]\",\"[]\",\"[]\",\"{}\",\"[]\",\"[]\",\"[]\",\"\"',
  '#MEMBERS:[\"検査 太郎\",\"検査 花子\"]',
  '#CHECKLIST:{\"検査 太郎\":[\"項目A\",\"項目B\"]}',
  '#PREMIX_MASTER:[\"テスト薬A\",\"テスト薬B\"]',
  '#DOCTOR_MASTER:[\"検査 医師\"]'
];
fs.writeFileSync('tests/fixtures/accum-sample.csv', '\ufeff' + rows.join('\r\n'), 'utf8');
console.log('written');
"
```

- [ ] **Step 2: 失敗するテストを書く**

`tests/accum-csv.test.js` を作成する。

```javascript
var assert = require("assert");
var fs = require("fs");
var path = require("path");
var h = require("./helper.js");
var test = h.test;
var AccumCsv = require("../src/parse/accum-csv.js");

function fixtureText() {
  return fs.readFileSync(path.join(__dirname, "fixtures", "accum-sample.csv"), "utf8");
}

test("reads every data row and skips comment lines", function () {
  var result = AccumCsv.parse(fixtureText());
  assert.strictEqual(result.logs.length, 2);
  assert.strictEqual(result.logs[0].date, "2026-04-01");
  assert.strictEqual(result.logs[1].date, "2026-04-02");
});

test("converts numeric columns to numbers", function () {
  var log = AccumCsv.parse(fixtureText()).logs[0];
  assert.strictEqual(log.rxOpCnt, 1);
  assert.strictEqual(log.rxOpDose, 2);
  assert.strictEqual(log.rxInjCnt, 3);
  assert.strictEqual(log.rxInjDose, 4);
  assert.strictEqual(log.counsel, 5);
});

test("expands JSON columns into objects", function () {
  var log = AccumCsv.parse(fixtureText()).logs[0];
  assert.strictEqual(log.inquiries.length, 1);
  assert.strictEqual(log.inquiries[0].type, "用量");
  assert.strictEqual(log.inquiries[0].changed, true);
  assert.strictEqual(log.doctorChanges[0].cnt, 2);
  assert.strictEqual(log.packerData.tab["分包紙"], 1);
  assert.strictEqual(log.packerData.tab["清掃"], true);
});

test("normalises wardRx to all five wards", function () {
  var log = AccumCsv.parse(fixtureText()).logs[0];
  assert.strictEqual(log.wardRx.length, 5);
  assert.deepStrictEqual(log.wardRx[0].teiki, { cnt: 1, dose: 2 });
  assert.deepStrictEqual(log.wardRx[3].teiki, { cnt: 0, dose: 0 });
});

test("drops the derived wardMeds column", function () {
  var log = AccumCsv.parse(fixtureText()).logs[0];
  assert.strictEqual(log.wardMeds, undefined);
});

test("reads the master lists from the trailing comment lines", function () {
  var masters = AccumCsv.parse(fixtureText()).masters;
  assert.deepStrictEqual(masters.members, ["検査 太郎", "検査 花子"]);
  assert.deepStrictEqual(masters.premixes, ["テスト薬A", "テスト薬B"]);
  assert.deepStrictEqual(masters.doctors, ["検査 医師"]);
  assert.deepStrictEqual(masters.checklist["検査 太郎"], ["項目A", "項目B"]);
});

test("tolerates an empty packerData object", function () {
  var log = AccumCsv.parse(fixtureText()).logs[1];
  assert.strictEqual(log.packerData.tab["分包紙"], 0);
  assert.strictEqual(log.packerData.san["清掃"], false);
});

h.summary();
```

- [ ] **Step 3: テストを実行して失敗を確認する**

```bash
node tests/accum-csv.test.js
```

期待する結果: `Cannot find module '../src/parse/accum-csv.js'` で異常終了する。

- [ ] **Step 4: モジュールを実装する**

`src/parse/accum-csv.js` を作成する。CSV の引用符処理を自前で行う (値の中に `,` と `""` が入るため、素朴な `split(",")` では壊れる)。

```javascript
(function (root) {
  "use strict";

  var DailyLog = (typeof require !== "undefined")
    ? require("../model/daily-log.js")
    : root.DailyLog;

  var NUMBER_COLUMNS = ["rxOpCnt", "rxOpDose", "rxInjCnt", "rxInjDose", "counsel"];
  var JSON_COLUMNS = [
    "inquiries", "doctorChanges", "premixes", "drugs", "shortages",
    "meetings", "mrVisits", "contacts", "trainings",
    "packerData", "wardMeds", "wardRx", "winjData"
  ];

  var MASTER_KEYS = {
    "MEMBERS": "members",
    "CHECKLIST": "checklist",
    "PREMIX_MASTER": "premixes",
    "DOCTOR_MASTER": "doctors"
  };

  function splitCsvLine(line) {
    var cells = [];
    var current = "";
    var inQuotes = false;

    for (var i = 0; i < line.length; i++) {
      var ch = line[i];
      if (inQuotes) {
        if (ch === '"') {
          if (line[i + 1] === '"') {
            current += '"';
            i++;
          } else {
            inQuotes = false;
          }
        } else {
          current += ch;
        }
      } else if (ch === '"') {
        inQuotes = true;
      } else if (ch === ",") {
        cells.push(current);
        current = "";
      } else {
        current += ch;
      }
    }
    cells.push(current);
    return cells;
  }

  function toNumber(raw) {
    var value = parseInt(raw, 10);
    return isNaN(value) ? 0 : value;
  }

  function parseJsonCell(raw, fallback) {
    if (raw === "" || raw === undefined) return fallback;
    try {
      var value = JSON.parse(raw);
      return (value === null) ? fallback : value;
    } catch (e) {
      return fallback;
    }
  }

  function parse(text) {
    var clean = text.replace(/^\uFEFF/, "");
    var lines = clean.split(/\r?\n/);

    var header = null;
    var logs = [];
    var masters = { members: [], checklist: {}, premixes: [], doctors: [] };

    lines.forEach(function (line) {
      if (line.trim() === "") return;

      if (line.charAt(0) === "#") {
        var separator = line.indexOf(":");
        if (separator < 0) return;
        var name = line.slice(1, separator);
        var key = MASTER_KEYS[name];
        if (!key) return;
        var fallback = (key === "checklist") ? {} : [];
        masters[key] = parseJsonCell(line.slice(separator + 1), fallback);
        return;
      }

      var cells = splitCsvLine(line);
      if (!header) {
        header = cells;
        return;
      }

      var raw = {};
      header.forEach(function (column, index) {
        raw[column] = cells[index];
      });

      var record = {
        date: raw.date,
        author: raw.author || "",
        notes: raw.notes || ""
      };

      NUMBER_COLUMNS.forEach(function (column) {
        record[column] = toNumber(raw[column]);
      });

      JSON_COLUMNS.forEach(function (column) {
        var fallback = (column === "packerData") ? {} : [];
        record[column] = parseJsonCell(raw[column], fallback);
      });

      // wardMeds は wardRx から算出できるため保存しない
      delete record.wardMeds;

      logs.push(DailyLog.normalize(record));
    });

    logs.sort(function (a, b) {
      return a.date < b.date ? -1 : (a.date > b.date ? 1 : 0);
    });

    return { logs: logs, masters: masters };
  }

  var api = { parse: parse, splitCsvLine: splitCsvLine };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.AccumCsv = api;
  }
})(typeof window !== "undefined" ? window : this);
```

- [ ] **Step 5: テストを実行して成功を確認する**

```bash
node tests/accum-csv.test.js
```

期待する結果: 7件すべて `OK:` と表示され、`--- 7 passed, 0 failed ---` で終了する。

- [ ] **Step 6: コミットする**

```bash
git add src/parse/accum-csv.js tests/accum-csv.test.js tests/fixtures/accum-sample.csv
git commit -m "feat: parse the legacy accumulated csv for migration"
```

---

### Task 5: 実データによる検証

ダミーデータのテストだけでは、実ファイル固有の癖 (全角スペース、列のずれ、97日分の揺らぎ) を検出できない。
リポジトリに実データを置かずに正しさを確かめるため、手元のファイルを読む検証スクリプトを用意する。

**Files:**
- Create: `scripts/verify-real-data.js`
- Create: `README.md`

**Interfaces:**
- Consumes: `AccumCsv.parse` (Task 4), `HospitalCsv.parse` (Task 3), `DailyLog.wardMedsFrom` / `DailyLog.validate` (Task 1)
- Produces: なし (実行専用スクリプト)

- [ ] **Step 1: 検証スクリプトを書く**

`scripts/verify-real-data.js` を作成する。

```javascript
"use strict";

var fs = require("fs");
var path = require("path");
var AccumCsv = require("../src/parse/accum-csv.js");
var HospitalCsv = require("../src/parse/hospital-csv.js");
var DailyLog = require("../src/model/daily-log.js");

var DATA_DIR = process.argv[2];

if (!DATA_DIR) {
  console.error("使い方: node scripts/verify-real-data.js <業務日誌フォルダのパス>");
  process.exit(2);
}

var failures = 0;

function check(label, condition, detail) {
  if (condition) {
    console.log("OK: " + label);
  } else {
    failures++;
    console.error("FAIL: " + label + (detail ? " -- " + detail : ""));
  }
}

// --- 蓄積CSV ---
var accumFile = fs.readdirSync(DATA_DIR)
  .filter(function (name) { return /^pharmacy_accum_.*\.csv$/.test(name); })
  .sort()
  .pop();

if (!accumFile) {
  console.error("蓄積CSVが見つかりません: " + DATA_DIR);
  process.exit(2);
}

var accumText = fs.readFileSync(path.join(DATA_DIR, accumFile), "utf8");
var accum = AccumCsv.parse(accumText);

console.log("--- 蓄積CSV: " + accumFile + " ---");
check("1件以上のレコードを読み取れた", accum.logs.length > 0, accum.logs.length + "件");
check("日付が昇順である", accum.logs.every(function (log, i) {
  return i === 0 || accum.logs[i - 1].date <= log.date;
}));
check("マスタ4種をすべて読み取れた",
  accum.masters.members.length > 0 &&
  accum.masters.doctors.length > 0 &&
  accum.masters.premixes.length > 0 &&
  Object.keys(accum.masters.checklist).length > 0);

var invalid = [];
accum.logs.forEach(function (log) {
  var errors = DailyLog.validate(log);
  if (errors.length) invalid.push({ date: log.date, errors: errors });
});
check("全レコードが検証を通過する", invalid.length === 0,
  invalid.slice(0, 3).map(function (item) {
    return item.date + ": " + item.errors[0].field + " " + item.errors[0].message;
  }).join(" / "));

// wardMeds が wardRx から復元できることを、元CSVの値と突き合わせて確認する
var rawRows = accumText.replace(/^\uFEFF/, "").split(/\r?\n/)
  .filter(function (line) { return line.trim() !== "" && line.charAt(0) !== "#"; });
var rawHeader = AccumCsv.splitCsvLine(rawRows[0]);
var wardMedsIndex = rawHeader.indexOf("wardMeds");
var dateIndex = rawHeader.indexOf("date");
var byDate = {};
accum.logs.forEach(function (log) { byDate[log.date] = log; });

var compared = 0;
var mismatched = [];
for (var i = 1; i < rawRows.length; i++) {
  var cells = AccumCsv.splitCsvLine(rawRows[i]);
  var date = cells[dateIndex];
  var log = byDate[date];
  if (!log) continue;
  var original;
  try { original = JSON.parse(cells[wardMedsIndex]); } catch (e) { continue; }
  var derived = DailyLog.wardMedsFrom(log.wardRx);
  var derivedByWard = {};
  derived.forEach(function (row) { derivedByWard[row.ward] = row; });
  original.forEach(function (row) {
    var mine = derivedByWard[row.ward];
    compared++;
    if (!mine || mine.cnt !== row.cnt || mine.dose !== row.dose ||
        mine.ipCnt !== row.ipCnt || mine.ipDose !== row.ipDose) {
      mismatched.push(date + "/" + row.ward);
    }
  });
}
check("wardMeds を wardRx から完全に復元できる (" + compared + "件比較)",
  mismatched.length === 0, mismatched.slice(0, 5).join(", "));

// --- 病院システムCSV ---
var dailyFiles = fs.readdirSync(DATA_DIR).filter(function (name) {
  return /^\d{4}\.csv$/.test(name);
});

console.log("--- 病院システムCSV ---");
if (dailyFiles.length === 0) {
  console.log("SKIP: MMDD.csv 形式のファイルが見つかりません");
} else {
  dailyFiles.forEach(function (name) {
    var result = HospitalCsv.parse(fs.readFileSync(path.join(DATA_DIR, name)));
    check(name + " をエラーなく読み取れる", result.errors.length === 0,
      JSON.stringify(result.errors.slice(0, 2)));
    check(name + " の病棟数が5である", result.wardRx.length === 5);
    var totalRow = result.wardRx.reduce(function (sum, row) {
      return sum + row.total.cnt;
    }, 0);
    check(name + " の合計枚数が正の値である", totalRow > 0, "合計 " + totalRow);
  });
}

console.log("");
if (failures > 0) {
  console.error("検証失敗: " + failures + " 件");
  process.exit(1);
}
console.log("すべての検証を通過しました");
```

- [ ] **Step 2: 実データに対して実行する**

```bash
node scripts/verify-real-data.js "C:/Users/GM/Desktop/業務日誌"
```

期待する結果: すべての行が `OK:` で、最後に `すべての検証を通過しました` と表示される。特に

- 蓄積CSVから **97件** のレコードを読み取れること
- `wardMeds を wardRx から完全に復元できる (387件比較)` が OK であること
- `0824.csv` をエラーなく読み取れ、病棟数が5であること

**失敗した場合は、実装を修正してから次へ進む。** ここで検出される差異は実データ固有の癖であり、フェーズ2以降で必ず問題になる。

- [ ] **Step 3: README を書く**

`README.md` を作成する。

````markdown
# 薬局業務日誌

薬局業務日誌をクラウドDB (Firestore) で管理し、どの端末からでも閲覧・修正できるようにするプロジェクト。

## 設計

- [設計書](docs/superpowers/specs/2026-08-25-pharmacy-log-db-migration-design.md)

## 構成

| ディレクトリ | 内容 |
|---|---|
| `src/model/` | データ構造の定義 |
| `src/parse/` | 入力ファイルのパーサー |
| `tests/` | 単体テスト |
| `scripts/` | 実行用スクリプト |

各モジュールは Node とブラウザの双方で動作する。追加の依存パッケージは使用しない。

## テスト

```bash
node tests/daily-log.test.js
node tests/filename.test.js
node tests/hospital-csv.test.js
node tests/accum-csv.test.js
```

## 実データによる検証

リポジトリには患者情報を含むデータを置かない。手元の実データに対しては次で検証する。

```bash
node scripts/verify-real-data.js "C:/Users/GM/Desktop/業務日誌"
```
````

- [ ] **Step 4: 全テストをまとめて実行する**

```bash
node tests/daily-log.test.js && node tests/filename.test.js && node tests/hospital-csv.test.js && node tests/accum-csv.test.js
```

期待する結果: 4ファイルすべてが `0 failed` で終了する。

- [ ] **Step 5: コミットする**

```bash
git add scripts/verify-real-data.js README.md
git commit -m "feat: verify the parsers against the real data set"
```

---

## フェーズ1完了時の状態

- 病院システムCSVと既存の蓄積CSVを、統一されたデータ構造へ正確に変換できる
- 変換の正しさが、ダミーデータの単体テストと実データ97日分の検証の双方で裏づけられている
- 外部サービスへの接続も、アカウントの設定も、まだ一切必要としない

## 次のフェーズ

- **フェーズ2: Firebase 構築とWebアプリ** — 認証、セキュリティルール、過去データ移行、閲覧・編集・月報の各画面
- **フェーズ3: 自動取込** — Excelテンプレート生成、Dropbox連携、GitHub Actions での定期実行、取込状況パネル
