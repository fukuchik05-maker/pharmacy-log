import * as Auth from "./auth.js";
import * as Storage from "./storage.js";
import * as Migrate from "./migrate.js";
import * as HospitalImport from "./hospital-import.js";

var el = function (id) { return document.getElementById(id); };
var parsed = null;
var currentMonth = null;
var currentLogs = [];
var loadSeq = 0;
var statusLoaded = false;
var currentView = "list"; // "list" | "report"
var deptReportCache = null; // compute() の戻り値。報告者切り替え時の再描画に使う
var deptReportInited = false;

// 合成検証用。ブラウザのコンソールから取込ロジックを直接叩けるようにする
// (ビュー群が root.*View で公開されているのと同じ発想。実害なし)。
window.HospitalImport = HospitalImport;
window.PharmacyStorage = Storage;

var hospParsed = null;

function esc(value) {
  return String(value === undefined || value === null ? "" : value)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function describeError(err) {
  return err && err.message ? err.message : String(err);
}

function today() {
  var now = new Date();
  return { y: now.getFullYear(), m: now.getMonth() + 1 };
}

function todayDateStr() {
  var now = new Date();
  var pad2 = function (v) { return v < 10 ? "0" + v : "" + v; };
  return now.getFullYear() + "-" + pad2(now.getMonth() + 1) + "-" + pad2(now.getDate());
}

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
    if (!currentMonth) currentMonth = today();
    showList();
  }
}

async function loadMonth() {
  var seq = ++loadSeq;
  var ym = currentMonth;

  el("monthLabel").textContent = window.Month.label(ym);
  el("listView").innerHTML = '<div class="empty">読み込み中…</div>';
  el("monthNotice").innerHTML = "";

  var logs;
  try {
    logs = await Storage.listLogsByMonth(ym);
  } catch (err) {
    if (seq !== loadSeq) return;
    el("listView").innerHTML = '<div class="card"><span class="err">読み取りに失敗しました: ' +
      describeError(err) + "</span></div>";
    return;
  }

  if (seq !== loadSeq) return;
  currentLogs = logs;

  renderCurrentView(ym);

  var byDate = {};
  currentLogs.forEach(function (log) { byDate[log.date] = log; });
  var missing = window.Month.missingDays(
    window.Month.daysOf(ym.y, ym.m), byDate, todayDateStr());

  if (missing.length) {
    el("monthNotice").innerHTML = '<div class="notice notice-warn">記録の無い平日が' +
      missing.length + "日あります：" + missing.join("、") + "</div>";
  }
}

function renderCurrentView(ym) {
  if (currentView === "report") {
    el("reportView").innerHTML = '<div class="empty">集計中…</div>';
    var report = window.MonthlyReport.compute(currentLogs, ym);
    window.ReportView.render(el("reportView"), report);
  } else {
    window.ListView.render(el("listView"), ym, currentLogs, showDetail);
  }
}

function showList() {
  currentView = "list";
  el("reportToggleBtn").textContent = "月報";
  el("listView").hidden = false;
  el("detailView").hidden = true;
  el("reportView").hidden = true;
  el("monthNotice").hidden = false;
  loadMonth();
}

function showReport() {
  currentView = "report";
  el("reportToggleBtn").textContent = "一覧";
  el("listView").hidden = true;
  el("detailView").hidden = true;
  el("reportView").hidden = false;
  el("monthNotice").hidden = false;
  loadMonth();
}

function showDetail(date) {
  var log = currentLogs.filter(function (x) { return x.date === date; })[0];
  if (!log) return;
  el("listView").hidden = true;
  el("monthNotice").hidden = true;
  el("detailView").hidden = false;
  window.DetailView.render(el("detailView"), log, showList, function () { showEdit(date); });
  window.scrollTo(0, 0);
}

function showEdit(date) {
  var log = currentLogs.filter(function (x) { return x.date === date; })[0];
  if (!log) return;
  window.EditView.render(el("detailView"), log,
    function (data) { saveEdit(date, data); },
    function () { showDetail(date); });
  window.scrollTo(0, 0);
}

async function saveEdit(date, data) {
  var normalized = window.DailyLog.normalize(data);
  var errors = window.DailyLog.validate(normalized);
  var errorsEl = el("detailView").querySelector("#editErrors");

  if (errors.length) {
    errorsEl.innerHTML = '<div class="notice notice-err">入力内容にエラーがあります：<br>' +
      errors.map(function (e) { return esc(e.field) + "：" + esc(e.message); }).join("<br>") +
      "</div>";
    return;
  }

  var saveBtn = el("detailView").querySelector("#editSaveBtn");
  saveBtn.disabled = true;
  saveBtn.textContent = "保存中…";
  errorsEl.innerHTML = "";

  try {
    await Storage.saveLog(date, normalized);
  } catch (err) {
    errorsEl.innerHTML = '<div class="notice notice-err">保存に失敗しました: ' +
      describeError(err) + "</div>";
    saveBtn.disabled = false;
    saveBtn.textContent = "保存";
    return;
  }

  var existing = currentLogs.filter(function (x) { return x.date === date; })[0];
  if (existing) {
    currentLogs[currentLogs.indexOf(existing)] = normalized;
  } else {
    currentLogs.push(normalized);
  }
  showDetail(date);
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
      describeError(err) + "</span>";
  }
}

async function loadMasters() {
  el("mastersView").innerHTML = '<div class="empty">読み込み中…</div>';
  try {
    var masters = await Storage.getMasters();
    window.MastersView.render(el("mastersView"), masters, handleMastersSave);
  } catch (err) {
    el("mastersView").innerHTML = '<div class="card"><span class="err">読み取りに失敗しました: ' +
      describeError(err) + "</span></div>";
  }
}

async function handleMastersSave(data) {
  var saveBtn = el("mastersView").querySelector("#mastersSaveBtn");
  var msgEl = el("mastersView").querySelector("#mastersMessage");
  saveBtn.disabled = true;
  saveBtn.textContent = "保存中…";
  msgEl.innerHTML = "";

  try {
    await Storage.saveMasters(data);
    msgEl.innerHTML = '<span class="ok">保存しました。</span>';
  } catch (err) {
    msgEl.innerHTML = '<div class="notice notice-err">保存に失敗しました: ' +
      describeError(err) + "</div>";
  }
  saveBtn.disabled = false;
  saveBtn.textContent = "保存";
}

function fiscalYearOf(dateStr) {
  var y = Number(dateStr.split("-")[0]);
  var m = Number(dateStr.split("-")[1]);
  return m >= 4 ? y : y - 1;
}

function showDeptReport() {
  el("mainToolbar").hidden = true;
  el("monthNotice").hidden = true;
  el("listView").hidden = true;
  el("detailView").hidden = true;
  el("reportView").hidden = true;
  el("deptReportToolbar").hidden = false;
  el("deptReportView").hidden = false;

  if (!deptReportInited) {
    deptReportInited = true;
    initDeptReport();
  }
}

function backFromDeptReport() {
  el("deptReportToolbar").hidden = true;
  el("deptReportView").hidden = true;
  el("mainToolbar").hidden = false;
  showList();
}

async function initDeptReport() {
  el("deptReportView").innerHTML = '<div class="empty">読み込み中…</div>';
  try {
    var info = await Storage.countLogs();
    if (info.count === 0) {
      el("deptReportView").innerHTML = '<div class="card"><span class="err">データがありません。</span></div>';
      return;
    }

    var masters = await Storage.getMasters();
    var firstFY = fiscalYearOf(info.first);
    var lastFY = fiscalYearOf(info.last);
    var years = [];
    for (var y = lastFY; y >= firstFY; y--) years.push(y);

    el("deptReportYearSel").innerHTML = years.map(function (y) {
      return '<option value="' + y + '">' + y + "年度</option>";
    }).join("");
    el("deptReportAuthorSel").innerHTML = (masters.members || []).map(function (m) {
      return "<option>" + m + "</option>";
    }).join("");

    await loadDeptReport();
  } catch (err) {
    el("deptReportView").innerHTML = '<div class="card"><span class="err">読み取りに失敗しました: ' +
      describeError(err) + "</span></div>";
  }
}

async function loadDeptReport() {
  var fiscalYear = Number(el("deptReportYearSel").value);
  el("deptReportView").innerHTML = '<div class="empty">集計中…</div>';
  try {
    var logs = await Storage.listLogsByFiscalYear(fiscalYear);
    deptReportCache = window.DeptReport.compute(logs, fiscalYear);
    renderDeptReport();
  } catch (err) {
    el("deptReportView").innerHTML = '<div class="card"><span class="err">読み取りに失敗しました: ' +
      describeError(err) + "</span></div>";
  }
}

function renderDeptReport() {
  if (!deptReportCache) return;
  window.DeptReportView.render(el("deptReportView"), deptReportCache, {
    author: el("deptReportAuthorSel").value
  });
}

el("prevMonthBtn").addEventListener("click", function () {
  currentMonth = window.Month.shift(currentMonth, -1);
  showList();
});

el("nextMonthBtn").addEventListener("click", function () {
  currentMonth = window.Month.shift(currentMonth, 1);
  showList();
});

el("thisMonthBtn").addEventListener("click", function () {
  currentMonth = today();
  showList();
});

el("reportToggleBtn").addEventListener("click", function () {
  if (currentView === "report") {
    showList();
  } else {
    showReport();
  }
});

el("deptReportToggleBtn").addEventListener("click", showDeptReport);

el("deptReportBackBtn").addEventListener("click", backFromDeptReport);

el("deptReportYearSel").addEventListener("change", loadDeptReport);

el("deptReportAuthorSel").addEventListener("change", renderDeptReport);

el("deptReportPrintBtn").addEventListener("click", function () {
  window.print();
});

el("toolsDetails").addEventListener("toggle", function (event) {
  if (!event.target.open) return;
  if (!statusLoaded) {
    statusLoaded = true;
    refreshStatus();
    loadMasters();
    window.ChangelogView.render(el("changelogView"));
  }
  loadDrafts();
});

el("signInBtn").addEventListener("click", function () {
  Auth.signIn().catch(function (err) {
    window.alert("ログインに失敗しました: " + describeError(err));
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

    if (!result.logs.length) {
      el("migratePreview").innerHTML =
        '<span class="err">レコードが1件も読み取れませんでした。ファイルを確認してください。</span>';
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
      describeError(err) + "</span>";
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
    showList();
  } catch (err) {
    el("migrateResult").innerHTML = '<span class="err">取り込みに失敗しました: ' +
      describeError(err) + "</span>";
    el("migrateRunBtn").disabled = false;
  }
});

var HOSP_KIND_LABELS = {
  teiki: "定期", rinji: "臨時", taiin: "退院", meds: "持参薬", ippoka: "1包化", total: "合計"
};

function hospPairText(pair) {
  return ((pair && pair.cnt) || 0) + "/" + ((pair && pair.dose) || 0);
}

// wardRx を「病棟 × 6区分」の表にする。existingWardRx があれば
// 値が変わるセルだけ「既存 → 新」を太字で併記する。
function hospPreviewTable(wardRx, existingWardRx) {
  var kinds = window.DailyLog.RX_KINDS;
  var head = "<tr><th>病棟</th>" + kinds.map(function (k) {
    return '<th class="num">' + HOSP_KIND_LABELS[k] + "</th>";
  }).join("") + "</tr>";
  var prevByName = {};
  (existingWardRx || []).forEach(function (r) { prevByName[r.name] = r; });
  var body = wardRx.map(function (row) {
    var cells = kinds.map(function (k) {
      var next = hospPairText(row[k]);
      var prevRow = prevByName[row.name];
      if (!prevRow) return '<td class="num">' + esc(next) + "</td>";
      var prev = hospPairText(prevRow[k]);
      if (prev === next) return '<td class="num">' + esc(next) + "</td>";
      return '<td class="num"><strong>' + esc(prev) + " → " + esc(next) + "</strong></td>";
    }).join("");
    return "<tr><td>" + esc(row.name) + "</td>" + cells + "</tr>";
  }).join("");
  return '<div class="tbl-wrap"><table class="tbl"><thead>' + head +
    "</thead><tbody>" + body + "</tbody></table></div>";
}

// 取込成功後、その日の詳細画面へ移動する。showDetail は currentLogs
// (現在ロード中の月) から日を引くため、先に対象月をロードする。
async function hospGotoImportedDay(date) {
  currentMonth = { y: +date.slice(0, 4), m: +date.slice(5, 7) };
  currentView = "list";
  el("reportToggleBtn").textContent = "月報";
  el("listView").hidden = false;
  el("detailView").hidden = true;
  el("reportView").hidden = true;
  el("monthNotice").hidden = false;
  await loadMonth();
  showDetail(date);
}

el("hospCsvFile").addEventListener("change", async function (event) {
  var file = event.target.files[0];
  hospParsed = null;
  el("hospCsvRunBtn").disabled = true;
  el("hospCsvResult").textContent = "";

  if (!file) {
    el("hospCsvPreview").textContent = "";
    return;
  }

  el("hospCsvPreview").textContent = "読み込み中…";
  try {
    var result = await HospitalImport.inspect(file);

    if (result.errors.length) {
      el("hospCsvPreview").innerHTML = '<span class="err">' +
        result.errors.length + "件の問題があります。取り込みを中止しました。\n" +
        result.errors.slice(0, 5).map(function (e) {
          return e.field + " — " + e.message;
        }).join("\n") + "</span>";
      return;
    }

    hospParsed = result;
    var lead = result.exists
      ? esc(result.date) + " — この日の wardRx を上書きします"
      : esc(result.date) + " — 新規作成します（記入者は空。あとで編集画面で補完してください）";
    el("hospCsvPreview").innerHTML = '<span class="ok">' + lead + "</span>" +
      hospPreviewTable(result.wardRx, result.existingWardRx);
    el("hospCsvRunBtn").disabled = false;
  } catch (err) {
    el("hospCsvPreview").innerHTML = '<span class="err">読み込みに失敗しました: ' +
      esc(describeError(err)) + "</span>";
  }
});

el("hospCsvRunBtn").addEventListener("click", async function () {
  if (!hospParsed) return;
  el("hospCsvRunBtn").disabled = true;
  el("hospCsvResult").innerHTML = '<span class="progress">取り込み中…</span>';

  try {
    var result = await HospitalImport.run(hospParsed);
    el("hospCsvResult").innerHTML = '<span class="ok">' + esc(result.date) + " を取り込みました。</span>";
    hospParsed = null;
    el("hospCsvFile").value = "";
    el("hospCsvPreview").textContent = "";
    await refreshStatus();
    await hospGotoImportedDay(result.date);
  } catch (err) {
    el("hospCsvResult").innerHTML = '<span class="err">取り込みに失敗しました: ' +
      esc(describeError(err)) + "</span>";
    el("hospCsvRunBtn").disabled = false;
  }
});

async function loadDrafts() {
  el("draftsView").innerHTML = '<div class="empty">読み込み中…</div>';
  try {
    var drafts = await Storage.listDrafts();
    window.DraftsView.render(el("draftsView"), drafts, {
      onApprove: approveDraft,
      onReject: rejectDraft
    });
  } catch (err) {
    el("draftsView").innerHTML = '<div class="sec-title">モバイル下書きの承認</div>' +
      '<span class="err">読み取りに失敗しました: ' + esc(describeError(err)) + "</span>";
  }
}

async function approveDraft(id) {
  var msgEl = el("draftsView").querySelector('[data-draft="' + id + '"] [data-draft-msg]');
  var drafts;
  try {
    drafts = await Storage.listDrafts();
  } catch (err) {
    if (msgEl) msgEl.innerHTML = '<span class="err">' + esc(describeError(err)) + "</span>";
    return;
  }
  var draft = drafts.filter(function (d) { return d.id === id; })[0];
  if (!draft) { loadDrafts(); return; }

  var fields = Object.assign({ author: draft.author }, draft.payload);
  var merged = window.DraftMerge.mergeDraftIntoLog(null, {
    date: draft.date, author: draft.author, payload: draft.payload
  });
  var errors = window.DailyLog.validate(merged);
  if (errors.length) {
    if (msgEl) {
      msgEl.innerHTML = '<span class="err">検証エラー:<br>' +
        errors.map(function (e) { return esc(e.field) + "：" + esc(e.message); }).join("<br>") + "</span>";
    }
    return;
  }

  try {
    await Storage.saveDailyEntry(draft.date, fields);
  } catch (err) {
    if (msgEl) msgEl.innerHTML = '<span class="err">反映に失敗しました: ' + esc(describeError(err)) + "</span>";
    return;
  }
  try {
    await Storage.deleteDraft(id);
  } catch (err) {
    if (msgEl) {
      msgEl.innerHTML = '<span class="err">反映しましたが下書きの削除に失敗しました。もう一度却下してください。</span>';
    }
    await refreshStatus();
    await hospGotoImportedDay(draft.date);
    return;
  }
  await refreshStatus();
  await hospGotoImportedDay(draft.date);
}

async function rejectDraft(id) {
  try {
    await Storage.deleteDraft(id);
  } catch (err) {
    var msgEl = el("draftsView").querySelector('[data-draft="' + id + '"] [data-draft-msg]');
    if (msgEl) msgEl.innerHTML = '<span class="err">削除に失敗しました: ' + esc(describeError(err)) + "</span>";
    return;
  }
  loadDrafts();
}

Auth.onChange(render);
