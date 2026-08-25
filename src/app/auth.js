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
