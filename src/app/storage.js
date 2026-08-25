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

async function getLog(date) {
  var snap = await getDoc(doc(db, LOGS, date));
  return snap.exists() ? snap.data() : null;
}

export { countLogs, saveLogs, saveMasters, getLog };
