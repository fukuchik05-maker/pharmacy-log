import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, signInAnonymously } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import {
  getFirestore, doc, getDoc, collection, addDoc, query, where, getDocs
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { FIREBASE_CONFIG } from "../../firebase-config.js";

var app = initializeApp(FIREBASE_CONFIG);
var auth = getAuth(app);
var db = getFirestore(app);
var el = function (id) { return document.getElementById(id); };
var masters = null;

function esc(v) {
  return String(v === undefined || v === null ? "" : v)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function describe(err) { return err && err.message ? err.message : String(err); }

function showFatal(message) {
  el("formWrap").hidden = true;
  el("fatal").hidden = false;
  el("fatal").querySelector(".err").textContent = message;
}

async function boot() {
  try {
    await signInAnonymously(auth);
  } catch (e) {
    showFatal("この端末はネットに接続されていないか、設定が未完了です（" + describe(e) + "）");
    return;
  }
  var uid = auth.currentUser.uid;

  try {
    var snap = await getDoc(doc(db, "masters", "current"));
    masters = snap.exists() ? snap.data()
      : { members: [], checklist: {}, premixes: [], doctors: [] };
  } catch (e) {
    showFatal("マスタの取得に失敗しました（" + describe(e) + "）");
    return;
  }

  window.EntryForm.render(el("form"), masters);
  el("submitBtn").addEventListener("click", function () { submit(uid); });
  el("refreshMineBtn").addEventListener("click", function () { refreshMine(uid); });
  el("againBtn").addEventListener("click", function () {
    el("done").hidden = true;
    el("formWrap").hidden = false;
    window.EntryForm.render(el("form"), masters);
  });
  await refreshMine(uid);
}

async function submit(uid) {
  var picked = window.EntryForm.collect(el("form"));
  var problems = [];
  if (!picked.author) problems.push("記入者を選んでください");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(picked.date)) problems.push("日付が正しくありません");
  if (!Object.keys(picked.payload).length) problems.push("記入したセクションがありません");
  if (problems.length) {
    el("submitMsg").innerHTML = '<span class="err">' + problems.join(" / ") + "</span>";
    return;
  }

  el("submitBtn").disabled = true;
  el("submitMsg").textContent = "送信中…";
  try {
    await addDoc(collection(db, "draftEntries"), {
      schemaVersion: 1,
      uid: uid,
      date: picked.date,
      author: picked.author,
      createdAt: new Date().toISOString(),
      status: "pending",
      payload: picked.payload
    });
    el("formWrap").hidden = true;
    el("done").hidden = false;
    el("submitBtn").disabled = false;
    el("submitMsg").textContent = "";
    await refreshMine(uid);
  } catch (e) {
    el("submitMsg").innerHTML = '<span class="err">送信に失敗しました: ' + describe(e) + "</span>";
    el("submitBtn").disabled = false;
  }
}

async function refreshMine(uid) {
  el("mine").textContent = "読み込み中…";
  try {
    var snap = await getDocs(query(collection(db, "draftEntries"), where("uid", "==", uid)));
    var rows = [];
    snap.forEach(function (d) { rows.push(d.data()); });
    rows.sort(function (a, b) { return (a.createdAt < b.createdAt) ? 1 : -1; });
    if (!rows.length) {
      el("mine").textContent = "この端末からの未承認の下書きはありません。";
      return;
    }
    el("mine").innerHTML = rows.map(function (r) {
      var labels = window.EntrySections.sectionLabelsOf(r.payload || {});
      var t = (r.createdAt || "").slice(11, 16);
      return '<div style="padding:4px 0;border-bottom:1px solid #EDF0F5">' +
        esc(r.date) + " ・ 記入者:" + esc(r.author) + " ・ 送信 " + esc(t) +
        " ・ " + labels.map(function (x) { return "[" + esc(x) + "]"; }).join("") + "</div>";
    }).join("");
  } catch (e) {
    el("mine").innerHTML = '<span class="err">一覧の取得に失敗しました: ' + describe(e) + "</span>";
  }
}

boot();
