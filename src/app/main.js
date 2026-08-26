import * as Auth from "./auth.js";
import * as Storage from "./storage.js";
import * as Migrate from "./migrate.js";

var el = function (id) { return document.getElementById(id); };
var parsed = null;
var currentMonth = null;
var currentLogs = [];
var loadSeq = 0;
var statusLoaded = false;
var currentView = "list"; // "list" | "report"
var deptReportCache = null; // compute() の戻り値。報告者切り替え時の再描画に使う
var deptReportInited = false;

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
  if (event.target.open && !statusLoaded) {
    statusLoaded = true;
    refreshStatus();
    loadMasters();
    window.ChangelogView.render(el("changelogView"));
  }
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

Auth.onChange(render);
