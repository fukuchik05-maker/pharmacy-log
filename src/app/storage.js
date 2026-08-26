import {
  getFirestore, collection, doc, getDoc, getDocs, setDoc, writeBatch,
  query, orderBy, limit, where, getCountFromServer
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

function withMeta(log) {
  var copy = {};
  Object.keys(log).forEach(function (key) { copy[key] = log[key]; });
  copy._meta = {
    source: "migration",
    updatedAt: new Date().toISOString()
  };
  return copy;
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

async function saveMasters(masters) {
  await setDoc(doc(db, MASTERS, "current"), {
    members: masters.members || [],
    checklist: masters.checklist || {},
    premixes: masters.premixes || [],
    doctors: masters.doctors || [],
    updatedAt: new Date().toISOString()
  });
}

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

async function getLog(date) {
  var snap = await getDoc(doc(db, LOGS, date));
  return snap.exists() ? snap.data() : null;
}

// 月単位でまとめて取得する。ドキュメントIDと date フィールドが同じ形式のため、
// date への範囲検索で足りる (複合インデックスは不要)。
async function listLogsByMonth(ym) {
  var range = window.Month.key(ym);
  var snap = await getDocs(query(
    collection(db, LOGS),
    where("date", ">=", range.from),
    where("date", "<=", range.to),
    orderBy("date")
  ));
  var logs = [];
  snap.forEach(function (d) { logs.push(d.data()); });
  return logs;
}

// Web画面からの編集を1日分だけ上書き保存する。移行(migration)と区別するため
// _meta.source を "web" にする。
async function saveLog(date, data) {
  var copy = {};
  Object.keys(data).forEach(function (key) { copy[key] = data[key]; });
  copy._meta = {
    source: "web",
    webEditedAt: new Date().toISOString()
  };
  await setDoc(doc(db, LOGS, date), copy);
}

// 年度(4月始まり)単位でまとめて取得する。listLogsByMonth と同じ単一フィールド範囲検索。
async function listLogsByFiscalYear(fiscalYear) {
  var from = fiscalYear + "-04-01";
  var to = (fiscalYear + 1) + "-03-31";
  var snap = await getDocs(query(
    collection(db, LOGS),
    where("date", ">=", from),
    where("date", "<=", to),
    orderBy("date")
  ));
  var logs = [];
  snap.forEach(function (d) { logs.push(d.data()); });
  return logs;
}

export {
  countLogs, saveLogs, saveMasters, getMasters, getLog,
  listLogsByMonth, saveLog, listLogsByFiscalYear
};
