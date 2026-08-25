import * as Auth from "./auth.js";
import * as Storage from "./storage.js";
import * as Migrate from "./migrate.js";

var el = function (id) { return document.getElementById(id); };
var parsed = null;

function describeError(err) {
  return err && err.message ? err.message : String(err);
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
      describeError(err) + "</span>";
  }
}

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
  } catch (err) {
    el("migrateResult").innerHTML = '<span class="err">取り込みに失敗しました: ' +
      describeError(err) + "</span>";
    el("migrateRunBtn").disabled = false;
  }
});

Auth.onChange(render);
