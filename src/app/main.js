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
