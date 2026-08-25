// Firebase プロジェクトの接続設定。
// apiKey は秘密鍵ではなくプロジェクトの識別子であり、公開されることを前提とした値。
// データの保護は firestore.rules のセキュリティルールが担う。
export const FIREBASE_CONFIG = {
  apiKey: "AIzaSyCTXKRpQ1zkddJgm6kjNHs9Hq_HBzKyQXM",
  authDomain: "pharmacy-log-2026.firebaseapp.com",
  projectId: "pharmacy-log-2026",
  storageBucket: "pharmacy-log-2026.firebasestorage.app",
  messagingSenderId: "780054306634",
  appId: "1:780054306634:web:5765e4b654114f505bebb3"
};

// アクセスを許可する利用者の Firebase UID。
// メールアドレスではなく UID で判定することで、公開リポジトリに個人情報を残さない。
// ここでの判定は画面表示の切り替えにすぎない。実際の防御は firestore.rules が担う。
export const ALLOWED_UID = "T0LwgXmrDTXtlI2mdSweuBp197c2";
