# 薬局業務日誌 フェーズ2a：Firebase接続と過去データ移行 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Firestore に接続し、本人のGoogleアカウントだけがアクセスできる状態を作った上で、既存の蓄積CSV 97日分を移行する。

**Architecture:** Firebase の無料プラン (Spark) のみを使う。移行処理は **ブラウザ上で実行する**。ログイン済みの利用者自身の権限で書き込むため、サービスアカウントの秘密鍵も追加パッケージも不要になり、フェーズ3で作る「今すぐ取込」と同じ経路を再利用できる。フェーズ1で作ったパーサーはそのまま流用する。

**Tech Stack:** Firebase JS SDK v10.8.0 (gstatic CDN の ES モジュール)、Firestore、Firebase Authentication (Google プロバイダ)

## Global Constraints

- **kin プロジェクトと同じ SDK 構成を用いる。** `https://www.gstatic.com/firebasejs/10.8.0/` から ES モジュールとして読み込み、設定値は `firebase-config.js` が `FIREBASE_CONFIG` としてエクスポートする
- **Blaze プラン (従量課金) へ切り替えない。** Cloud Functions は使わない
- **フェーズ1のモジュールは書き換えない。** `src/model/` と `src/parse/` は完成済みとして扱い、`window.DailyLog` などのグローバル経由で利用する
- **アクセスを許可するアカウントは本人の1つだけ。** 判定には Firebase の UID を用いる (メールアドレスは公開リポジトリに残さない)
- **患者情報を含むデータをリポジトリに置かない。** 移行元CSVは利用者の手元にあるものをブラウザのファイル選択で読み込む
- `firebase-config.js` の `apiKey` は秘密鍵ではなくプロジェクト識別子であり、公開されて問題ない。kin と同様にリポジトリへコミットする

---

## File Structure

| ファイル | 責務 |
|---|---|
| `firebase-config.js` | Firebase プロジェクトの接続設定 |
| `firestore.rules` | Firestore のセキュリティルール (本人のみ許可) |
| `src/app/auth.js` | Googleログイン・ログアウト・利用者の判定 |
| `src/app/storage.js` | Firestore への読み書き |
| `src/app/migrate.js` | 蓄積CSVを読み込んで Firestore へ投入する |
| `index.html` | 画面。フェーズ2a ではログインと移行のみ |
| `style.css` | 既存 `pharmacy_logV2.6.html` から流用する見た目 |

---

### Task 1: Firebase プロジェクトの作成と接続設定

**Files:**
- Create: `firebase-config.js`
- Create: `index.html`
- Create: `style.css`
- Create: `.claude/launch.json`

**Interfaces:**
- Consumes: なし
- Produces: `FIREBASE_CONFIG` (`firebase-config.js` の名前付きエクスポート)

- [ ] **Step 1: 利用者に Firebase プロジェクトを作成してもらう**

以下はブラウザでの操作であり、実装担当者は代行できない。利用者に依頼し、完了を待つ。
**いずれの手順でもクレジットカードの登録は発生しない。**

1. https://console.firebase.google.com/ を開く
2. 「プロジェクトを追加」→ プロジェクト名に `pharmacy-log-2026` と入力 →「続行」
3. 「このプロジェクトで Google アナリティクスを有効にする」を **オフ** にする →「プロジェクトを作成」
4. 左メニュー「構築」→「Firestore Database」→「データベースの作成」
   - ロケーション: **asia-northeast1 (Tokyo)**
   - モード: **本番環境モードで開始する** (ルールは Task 3 で設定する)
5. 左メニュー「構築」→「Authentication」→「始める」→「Google」を選択
   - 「有効にする」をオンにし、プロジェクトのサポートメールに自分のアドレスを選択 →「保存」
6. 左上の歯車アイコン →「プロジェクトの設定」→ 下部の「マイアプリ」→ ウェブアイコン `</>`
   - アプリのニックネーム: `pharmacy-log` →「アプリを登録」
   - 表示される `firebaseConfig` の中身をコピーする

- [ ] **Step 2: 接続設定ファイルを作る**

利用者から受け取った値で `firebase-config.js` を作成する。以下は形の例であり、実際の値に置き換えること。

```javascript
export const FIREBASE_CONFIG = {
  apiKey: "...",
  authDomain: "pharmacy-log-2026.firebaseapp.com",
  projectId: "pharmacy-log-2026",
  storageBucket: "pharmacy-log-2026.firebasestorage.app",
  messagingSenderId: "...",
  appId: "..."
};

// アクセスを許可する利用者の Firebase UID。
// メールアドレスではなく UID で判定することで、公開リポジトリに個人情報を残さない。
// ここでの判定は画面表示の切り替えにすぎない。実際の防御は firestore.rules が担う。
export const ALLOWED_UID = "(Firebase コンソールの Authentication > Users で確認したUID)";
```

- [ ] **Step 3: 画面の骨格を作る**

`index.html` を作成する。フェーズ2a ではログインと移行だけを載せる。

```html
<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>薬局業務日誌</title>
<link rel="stylesheet" href="style.css">
</head>
<body>
  <header class="app-header">
    <div class="app-title">薬局業務日誌</div>
    <div class="actions">
      <span id="userLabel" class="user-label"></span>
      <button id="signInBtn" class="btn btn-primary" hidden>Googleでログイン</button>
      <button id="signOutBtn" class="btn" hidden>ログアウト</button>
    </div>
  </header>

  <main class="app">
    <div id="signedOut" class="card" hidden>
      <div class="sec-title">ログインが必要です</div>
      <p class="hint">このページのデータは、許可されたアカウントでログインした場合のみ表示されます。</p>
    </div>

    <div id="deniedPanel" class="card card-red" hidden>
      <div class="sec-title sec-title-red">アクセスが許可されていません</div>
      <p class="hint" id="deniedDetail"></p>
    </div>

    <div id="signedIn" hidden>
      <div class="card">
        <div class="sec-title">データの状況</div>
        <div id="dbStatus" class="hint">確認中…</div>
      </div>

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
    </div>
  </main>

  <!-- フェーズ1のモジュール。window に公開され、下の app.js から使う -->
  <script src="src/model/daily-log.js"></script>
  <script src="src/parse/accum-csv.js"></script>
  <script type="module" src="src/app/main.js"></script>
</body>
</html>
```

- [ ] **Step 4: スタイルを用意する**

`style.css` を作成する。既存の `pharmacy_logV2.6.html` の配色と余白をそのまま用いる。

```css
*{box-sizing:border-box;margin:0;padding:0}
html,body{background:#DDE2EA;min-height:100vh;font-family:'Hiragino Kaku Gothic ProN','Meiryo',sans-serif;font-size:14px;color:#1F2937}
.app{max-width:960px;margin:0 auto;padding:1.25rem}

.app-header{display:flex;align-items:center;justify-content:space-between;gap:12px;
  max-width:960px;margin:0 auto;padding:1.25rem 1.25rem .75rem;border-bottom:1px solid #C8CDD8}
.app-title{font-size:18px;font-weight:600;letter-spacing:.02em}
.actions{display:flex;align-items:center;gap:8px}
.user-label{font-size:12px;color:#6B7280}

.card{background:#fff;border:1px solid #D4D9E2;border-left:3px solid #185FA5;border-radius:10px;
  padding:1rem 1.25rem;margin-bottom:.75rem;box-shadow:0 1px 4px rgba(0,0,0,.06)}
.card-amber{border-left-color:#D97706}
.card-red{border-left-color:#DC2626}

.sec-title{font-size:11px;font-weight:600;color:#185FA5;letter-spacing:.08em;
  text-transform:uppercase;margin-bottom:.875rem}
.sec-title-amber{color:#D97706}
.sec-title-red{color:#DC2626}

.hint{font-size:12px;color:#6B7280;line-height:1.7;margin:.5rem 0}
.hint code{background:#F4F6F9;border:1px solid #E0E5EE;border-radius:4px;padding:1px 5px;font-size:11px}

.btn{padding:7px 16px;border-radius:7px;font-size:13px;cursor:pointer;border:1px solid #C8D0DC;
  background:#fff;color:#1F2937;transition:all .15s;font-family:inherit;box-shadow:0 1px 2px rgba(0,0,0,.06)}
.btn:hover:not(:disabled){background:#F0F3F8;border-color:#B0BAC8}
.btn:disabled{opacity:.4;cursor:not-allowed}
.btn-primary{background:#185FA5;color:#fff;border-color:#185FA5}
.btn-primary:hover:not(:disabled){background:#0C447C;border-color:#0C447C}
.btn-success{background:#059669;color:#fff;border-color:#059669}
.btn-success:hover:not(:disabled){background:#047857;border-color:#047857}

.ok{color:#065F46}
.warn{color:#92400E}
.err{color:#991B1B;white-space:pre-wrap}

input[type=file]{font-size:13px;margin:.5rem 0}
.progress{font-variant-numeric:tabular-nums}
```

- [ ] **Step 5: ローカル確認用の設定を作る**

`index.html` は ES モジュールを読み込むため `file://` では動かない。開発用サーバの設定を作る。

`.claude/launch.json`:

```json
{
  "version": "0.0.1",
  "configurations": [
    {
      "name": "pharmacy-log-dev",
      "runtimeExecutable": "node",
      "runtimeArgs": ["scripts/dev-server.js"],
      "port": 8430,
      "autoPort": true
    }
  ]
}
```

`scripts/dev-server.js` を作成する。依存パッケージ無しの静的配信サーバ。

```javascript
"use strict";

var http = require("http");
var fs = require("fs");
var path = require("path");

var ROOT = path.resolve(__dirname, "..");
var PORT = parseInt(process.env.PORT, 10) || 8430;

var TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8"
};

http.createServer(function (req, res) {
  var urlPath = decodeURIComponent(req.url.split("?")[0]);
  if (urlPath === "/") urlPath = "/index.html";

  var filePath = path.join(ROOT, urlPath);
  if (filePath.indexOf(ROOT) !== 0) {
    res.writeHead(403);
    res.end("forbidden");
    return;
  }

  fs.readFile(filePath, function (err, body) {
    if (err) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("not found: " + urlPath);
      return;
    }
    res.writeHead(200, { "Content-Type": TYPES[path.extname(filePath)] || "application/octet-stream" });
    res.end(body);
  });
}).listen(PORT, function () {
  console.log("dev server on http://localhost:" + PORT);
});
```

- [ ] **Step 6: コミットする**

```bash
git add firebase-config.js index.html style.css .claude/launch.json scripts/dev-server.js
git commit -m "feat: add the firebase connection settings and page shell"
```

---

### Task 2: Googleログインと利用者の判定

**Files:**
- Create: `src/app/auth.js`
- Create: `src/app/main.js`

**Interfaces:**
- Consumes: `FIREBASE_CONFIG`, `ALLOWED_UID` (Task 1)
- Produces:
  - `Auth.app` — `initializeApp` の戻り値。`storage.js` が Firestore の初期化に用いる
  - `Auth.signIn(): Promise<void>`
  - `Auth.signOut(): Promise<void>`
  - `Auth.onChange(handler: (state) => void): void`
    — `state` は `{status: "signedOut"} | {status: "denied", email: string} | {status: "allowed", email: string}`

- [ ] **Step 1: 認証モジュールを実装する**

`src/app/auth.js` を作成する。

```javascript
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import {
  getAuth, GoogleAuthProvider, signInWithPopup, signOut as fbSignOut, onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { FIREBASE_CONFIG, ALLOWED_UID } from "../../firebase-config.js";

var app = initializeApp(FIREBASE_CONFIG);
var auth = getAuth(app);
var provider = new GoogleAuthProvider();

function signIn() {
  return signInWithPopup(auth, provider).catch(function (err) {
    // ポップアップを利用者自身が閉じた場合は異常ではない
    if (err && err.code === "auth/popup-closed-by-user") return;
    throw err;
  });
}

function signOut() {
  return fbSignOut(auth);
}

function onChange(handler) {
  onAuthStateChanged(auth, function (user) {
    if (!user) {
      handler({ status: "signedOut" });
      return;
    }
    if (user.uid !== ALLOWED_UID) {
      handler({ status: "denied", email: user.email || "(不明)" });
      return;
    }
    handler({ status: "allowed", email: user.email });
  });
}

export { app, signIn, signOut, onChange };
```

- [ ] **Step 2: 画面と結線する**

`src/app/main.js` を作成する。移行部分は Task 5 で足すため、この時点ではログイン状態の反映のみ。

```javascript
import * as Auth from "./auth.js";

var el = function (id) { return document.getElementById(id); };

function render(state) {
  var signedOut = state.status === "signedOut";
  var denied = state.status === "denied";
  var allowed = state.status === "allowed";

  el("signedOut").hidden = !signedOut;
  el("deniedPanel").hidden = !denied;
  el("signedIn").hidden = !allowed;
  el("signInBtn").hidden = !signedOut;
  el("signOutBtn").hidden = signedOut;

  el("userLabel").textContent = allowed ? state.email : "";

  if (denied) {
    el("deniedDetail").textContent =
      state.email + " ではアクセスできません。許可されたアカウントでログインし直してください。";
  }
}

el("signInBtn").addEventListener("click", function () {
  Auth.signIn().catch(function (err) {
    window.alert("ログインに失敗しました: " + (err && err.message ? err.message : err));
  });
});

el("signOutBtn").addEventListener("click", function () {
  Auth.signOut();
});

Auth.onChange(render);
```

- [ ] **Step 3: 画面を起動して確認する**

開発サーバを起動し、ブラウザで動作を確かめる。

1. `preview_start` で `pharmacy-log-dev` を起動する
2. 「Googleでログイン」ボタンが表示されていること
3. ボタンを押し、許可されたアカウントでログインする
4. ヘッダーにメールアドレスが表示され、「データの状況」と「過去データの移行」のカードが現れること
5. ブラウザのコンソールにエラーが出ていないこと (`read_console_messages` で確認)

**`auth/unauthorized-domain` というエラーが出た場合:** Firebase コンソールの
「Authentication」→「Settings」→「承認済みドメイン」に `localhost` を追加する。

- [ ] **Step 4: コミットする**

```bash
git add src/app/auth.js src/app/main.js
git commit -m "feat: restrict access to the owner's google account"
```

---

### Task 3: Firestore セキュリティルール

画面側の判定は表示の切り替えにすぎない。**実際の防御はここで行う。**
ルールを設定するまで、データベースは誰からも読み書きできない (本番環境モードの既定) か、
逆に開いたままになっている可能性がある。必ず設定すること。

**Files:**
- Create: `firestore.rules`

**Interfaces:**
- Consumes: なし
- Produces: なし (Firebase コンソールへ貼り付けて適用する)

- [ ] **Step 1: ルールを書く**

`firestore.rules` を作成する。

```
rules_version = '2';

service cloud.firestore {
  match /databases/{database}/documents {

    // 本人のGoogleアカウントだけを許可する。
    // メールアドレスが確認済みであることも条件に含める。
    function isOwner() {
      return request.auth != null
        && request.auth.uid == '(本人のUID)';
    }

    match /{document=**} {
      allow read, write: if isOwner();
    }
  }
}
```

- [ ] **Step 2: 利用者にルールを適用してもらう**

ブラウザでの操作のため利用者に依頼する。

1. Firebase コンソール →「構築」→「Firestore Database」→「ルール」タブ
2. エディタの内容を `firestore.rules` の中身で**すべて置き換える**
3. 「公開」をクリック

- [ ] **Step 3: ルールが効いていることを確認する**

Firebase コンソールの「ルール」タブにある **Rules Playground** で検証する。

| 検証内容 | 設定 | 期待 |
|---|---|---|
| 未ログインは読めない | 場所 `/dailyLogs/2026-08-24`、操作 `get`、認証 **オフ** | **拒否** |
| 別アカウントは読めない | 同上、認証オン、UID に別の値を指定 | **拒否** |
| 本人は読める | 同上、認証オン、UID に本人のUIDを指定 | **許可** |

3つすべてが期待どおりになるまで次へ進まない。

- [ ] **Step 4: コミットする**

```bash
git add firestore.rules
git commit -m "feat: allow firestore access only to the owner account"
```

---

### Task 4: Firestore アクセス層

**Files:**
- Create: `src/app/storage.js`

**Interfaces:**
- Consumes: `Auth.app` (Task 2)、`window.DailyLog` (フェーズ1)
- Produces:
  - `Storage.countLogs(): Promise<{count: number, first: string|null, last: string|null}>`
  - `Storage.saveLogs(logs: object[], onProgress: (done: number, total: number) => void): Promise<number>`
    — 日付をドキュメントIDとして書き込み、書き込んだ件数を返す
  - `Storage.saveMasters(masters: object): Promise<void>`
  - `Storage.getLog(date: string): Promise<object|null>`

Firestore の一括書き込みは1回あたり **500件** が上限のため、400件ずつに区切って送る。

- [ ] **Step 1: アクセス層を実装する**

`src/app/storage.js` を作成する。

```javascript
import {
  getFirestore, collection, doc, getDoc, getDocs, setDoc, writeBatch,
  query, orderBy, limit, getCountFromServer
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { app } from "./auth.js";

var db = getFirestore(app);

var LOGS = "dailyLogs";
var MASTERS = "masters";
var BATCH_SIZE = 400; // Firestore の上限は500。余裕を持たせる

// 全件を取得して数えると、データが増えるほど読み取り回数が膨らむ。
// 件数はサーバ側で数え、最初と最後の日付だけを1件ずつ取る (合計3回の読み取り)。
async function countLogs() {
  var col = collection(db, LOGS);
  var countSnap = await getCountFromServer(col);
  var count = countSnap.data().count;
  if (count === 0) return { count: 0, first: null, last: null };

  var firstSnap = await getDocs(query(col, orderBy("date"), limit(1)));
  var lastSnap = await getDocs(query(col, orderBy("date", "desc"), limit(1)));
  return {
    count: count,
    first: firstSnap.docs[0].id,
    last: lastSnap.docs[0].id
  };
}

async function saveLogs(logs, onProgress) {
  var written = 0;

  for (var start = 0; start < logs.length; start += BATCH_SIZE) {
    var slice = logs.slice(start, start + BATCH_SIZE);
    var batch = writeBatch(db);

    slice.forEach(function (log) {
      batch.set(doc(db, LOGS, log.date), withMeta(log));
    });

    await batch.commit();
    written += slice.length;
    if (onProgress) onProgress(written, logs.length);
  }

  return written;
}

function withMeta(log) {
  var copy = {};
  Object.keys(log).forEach(function (key) { copy[key] = log[key]; });
  copy._meta = {
    source: "migration",
    updatedAt: new Date().toISOString()
  };
  return copy;
}

async function saveMasters(masters) {
  await setDoc(doc(db, MASTERS, "current"), {
    members: masters.members || [],
    checklist: masters.checklist || {},
    premixes: masters.premixes || [],
    doctors: masters.doctors || [],
    updatedAt: new Date().toISOString()
  });
}

async function getLog(date) {
  var snap = await getDoc(doc(db, LOGS, date));
  return snap.exists() ? snap.data() : null;
}

export { countLogs, saveLogs, saveMasters, getLog };
```

- [ ] **Step 2: コミットする**

```bash
git add src/app/storage.js
git commit -m "feat: add the firestore access layer"
```

---

### Task 5: 過去データの移行

**Files:**
- Create: `src/app/migrate.js`
- Modify: `src/app/main.js` (移行パネルとの結線を追加)

**Interfaces:**
- Consumes: `Storage.*` (Task 4)、`window.AccumCsv`、`window.DailyLog` (フェーズ1)
- Produces:
  - `Migrate.inspect(file: File): Promise<{logs: object[], masters: object, invalid: Array}>`
  - `Migrate.run(parsed, onProgress): Promise<{logs: number}>`

**取り込み前に必ず検証する。** 1件でも検証に通らないレコードがあれば取り込まず、
何日のどの項目が問題かを画面に出す。壊れたデータを黙って入れないため。

- [ ] **Step 1: 移行モジュールを実装する**

`src/app/migrate.js` を作成する。

```javascript
import * as Storage from "./storage.js";

function readAsText(file) {
  return new Promise(function (resolve, reject) {
    var reader = new FileReader();
    reader.onload = function () { resolve(reader.result); };
    reader.onerror = function () { reject(reader.error); };
    // 蓄積CSVはBOM付きUTF-8。AccumCsv側でBOMを除去する
    reader.readAsText(file, "utf-8");
  });
}

async function inspect(file) {
  var text = await readAsText(file);
  var parsed = window.AccumCsv.parse(text);

  var invalid = [];
  parsed.logs.forEach(function (log) {
    var errors = window.DailyLog.validate(log);
    if (errors.length) {
      invalid.push({ date: log.date, errors: errors });
    }
  });

  return { logs: parsed.logs, masters: parsed.masters, invalid: invalid };
}

async function run(parsed, onProgress) {
  if (parsed.invalid.length) {
    throw new Error("検証に通らないレコードがあるため取り込めません");
  }
  var written = await Storage.saveLogs(parsed.logs, onProgress);
  await Storage.saveMasters(parsed.masters);
  return { logs: written };
}

export { inspect, run };
```

- [ ] **Step 2: 画面と結線する**

`src/app/main.js` を書き換える。Task 2 の内容に、DB状況の表示と移行パネルの処理を加える。

```javascript
import * as Auth from "./auth.js";
import * as Storage from "./storage.js";
import * as Migrate from "./migrate.js";

var el = function (id) { return document.getElementById(id); };
var parsed = null;

function render(state) {
  var signedOut = state.status === "signedOut";
  var denied = state.status === "denied";
  var allowed = state.status === "allowed";

  el("signedOut").hidden = !signedOut;
  el("deniedPanel").hidden = !denied;
  el("signedIn").hidden = !allowed;
  el("signInBtn").hidden = !signedOut;
  el("signOutBtn").hidden = signedOut;

  el("userLabel").textContent = allowed ? state.email : "";

  if (denied) {
    el("deniedDetail").textContent =
      state.email + " ではアクセスできません。許可されたアカウントでログインし直してください。";
  }
  if (allowed) {
    refreshStatus();
  }
}

async function refreshStatus() {
  el("dbStatus").textContent = "確認中…";
  try {
    var info = await Storage.countLogs();
    el("dbStatus").textContent = info.count === 0
      ? "データはまだありません。"
      : info.count + "件（" + info.first + " 〜 " + info.last + "）";
  } catch (err) {
    el("dbStatus").innerHTML = '<span class="err">読み取りに失敗しました: ' +
      (err && err.message ? err.message : err) + "</span>";
  }
}

el("signInBtn").addEventListener("click", function () {
  Auth.signIn().catch(function (err) {
    window.alert("ログインに失敗しました: " + (err && err.message ? err.message : err));
  });
});

el("signOutBtn").addEventListener("click", function () {
  Auth.signOut();
});

el("migrateFile").addEventListener("change", async function (event) {
  var file = event.target.files[0];
  parsed = null;
  el("migrateRunBtn").disabled = true;
  el("migrateResult").textContent = "";

  if (!file) {
    el("migratePreview").textContent = "";
    return;
  }

  el("migratePreview").textContent = "読み込み中…";
  try {
    var result = await Migrate.inspect(file);

    if (result.invalid.length) {
      el("migratePreview").innerHTML = '<span class="err">' +
        result.invalid.length + "件のレコードに問題があります。取り込みを中止しました。\n" +
        result.invalid.slice(0, 5).map(function (item) {
          return item.date + ": " + item.errors[0].field + " — " + item.errors[0].message;
        }).join("\n") + "</span>";
      return;
    }

    parsed = result;
    var first = result.logs[0], last = result.logs[result.logs.length - 1];
    el("migratePreview").innerHTML = '<span class="ok">' +
      result.logs.length + "件を読み取りました（" + first.date + " 〜 " + last.date + "）。" +
      "医師" + result.masters.doctors.length + "名、予製" + result.masters.premixes.length + "品目。</span>";
    el("migrateRunBtn").disabled = false;
  } catch (err) {
    el("migratePreview").innerHTML = '<span class="err">読み込みに失敗しました: ' +
      (err && err.message ? err.message : err) + "</span>";
  }
});

el("migrateRunBtn").addEventListener("click", async function () {
  if (!parsed) return;
  el("migrateRunBtn").disabled = true;
  el("migrateResult").innerHTML = '<span class="progress">取り込み中… 0 / ' + parsed.logs.length + "</span>";

  try {
    var result = await Migrate.run(parsed, function (done, total) {
      el("migrateResult").innerHTML = '<span class="progress">取り込み中… ' + done + " / " + total + "</span>";
    });
    el("migrateResult").innerHTML = '<span class="ok">' + result.logs + "件を取り込みました。</span>";
    await refreshStatus();
  } catch (err) {
    el("migrateResult").innerHTML = '<span class="err">取り込みに失敗しました: ' +
      (err && err.message ? err.message : err) + "</span>";
    el("migrateRunBtn").disabled = false;
  }
});

Auth.onChange(render);
```

- [ ] **Step 3: 実際に移行して確認する**

開発サーバを起動し、ブラウザで実行する。

1. ログインする
2. 「データの状況」が「データはまだありません。」と表示されること
3. ファイル選択で `C:\Users\GM\Desktop\業務日誌\pharmacy_accum_2026-08-24.csv` を選ぶ
4. **「97件を読み取りました（2026-04-01 〜 2026-08-24）。医師9名、予製9品目。」** と表示されること
5. 「取り込みを実行」を押す
6. 進捗が進み、「97件を取り込みました。」と表示されること
7. 「データの状況」が **「97件（2026-04-01 〜 2026-08-24）」** に変わること
8. コンソールにエラーが出ていないこと

- [ ] **Step 4: Firebase コンソールでデータを確認する**

利用者に確認してもらう。Firebase コンソール →「Firestore Database」→「データ」タブ。

- `dailyLogs` に 97 件のドキュメントがあり、IDが `2026-04-01` 形式であること
- `2026-08-21` を開くと `inquiries` に2件、`mrVisits` に2件入っていること
- `masters/current` に `doctors` 9件、`premixes` 9件があること

- [ ] **Step 5: コミットする**

```bash
git add src/app/migrate.js src/app/main.js
git commit -m "feat: migrate the accumulated csv history into firestore"
```

---

## フェーズ2a完了時の状態

- 本人のGoogleアカウントでのみアクセスできる Firestore が動いている
- 過去97日分のデータとマスタが Firestore に入っている
- ブラウザからCSVを取り込む経路ができており、フェーズ3の「今すぐ取込」でそのまま再利用できる
- 費用は発生しない (Spark プランのまま)

## 次のフェーズ

- **フェーズ2b: Webアプリの画面** — 日誌一覧、日誌詳細・編集、月報、マスタ設定
- **フェーズ3: 自動取込** — Excelテンプレート生成、Dropbox連携、GitHub Actions での定期実行
