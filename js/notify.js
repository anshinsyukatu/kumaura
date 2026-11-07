/*
* クマうら Web版：ウェブプッシュ通知（OneSignal）の受け取り側。
* - 毎朝5時の「今日の一言」配信のための購読入口（同意画面の #push-card）
* - 通知許可は「通知を受け取る」ボタンのタップをきっかけにだけ求める。
* ページを開いただけでは許可ダイアログを出さない。
* - 購読情報（この端末の購読IDなど）は配信サービス OneSignal に送られる。
* 鑑定の入力内容（生年月日・写真など）は従来どおり送信・保存されない。
* - Service Worker は PWA 用とプッシュ用で分離している。PWA 用は
* sw.js（install.js が登録、scope はサイトルート /kumaura/)、プッシュ用は
* push/OneSignalSDKWorker.js（scope は /kumaura/push/ のみ）で、登録は
* 下の init を通じて OneSignal SDK が行う（ここでは直接登録しない）。
* scope を分けるのは OneSignal 公式ドキュメントの推奨構成。
*
* ONESIGNAL_APP_ID を OneSignal 管理画面
* （Settings > Keys & IDs）の App ID に差し替えること。
* プレースホルダの間は SDK を初期化せず、カードだけ表示される。
*/
(function () {
"use strict";

var ONESIGNAL_APP_ID = "41c3df38-c074-4412-b3ee-74745dcd0ad9";
var PLACEHOLDER = ONESIGNAL_APP_ID === "REPLACE_WITH_APP_ID";

var card = document.getElementById("push-card");
if (!card) return;
var textEl = document.getElementById("push-card-text");
var btn = document.getElementById("push-btn");
var statusEl = document.getElementById("push-status");
var iosNote = document.getElementById("push-ios-note");

/* ---------- 環境判定（install.js と同じ考え方） ---------- */
function isStandalone() {
if (window.matchMedia &&
window.matchMedia("(display-mode: standalone)").matches) return true;
if (window.navigator.standalone === true) return true; // iOS のホーム画面起動
return false;
}
function isIos() {
var ua = window.navigator.userAgent || "";
if (/iPhone|iPad|iPod/.test(ua)) return true;
return /Macintosh/.test(ua) && "ontouchend" in document;
}

// プッシュ非対応の環境ではカード自体を出さない。
// ただし iPhone の通常タブは PushManager が見えないため、
// 「ホーム画面に追加すると使える」案内として出す。
var pushCapable = ("PushManager" in window) || ("Notification" in window);
if (!pushCapable &&!isIos()) return;

// iPhone でホーム画面に追加していない場合は、その一言を添える
if (isIos() &&!isStandalone() && iosNote) {
iosNote.classList.remove("hidden");
}
card.classList.remove("hidden");

/* ---------- 状態表示 ---------- */
function setStatus(msg) {
if (!statusEl) return;
if (msg) {
statusEl.textContent = msg;
statusEl.classList.remove("hidden");
} else {
statusEl.textContent = "";
statusEl.classList.add("hidden");
}
}
function showDefault() {
if (textEl) textEl.textContent = "毎朝5時に『今日の一言』をお届けします";
if (btn) {
btn.textContent = "通知を受け取る";
btn.classList.remove("hidden");
}
setStatus(null);
}
function showSubscribed() {
if (textEl) textEl.textContent = "毎朝5時の『今日の一言』を受け取り中です";
if (btn) {
btn.textContent = "通知を止める";
btn.classList.remove("hidden");
}
setStatus(null);
}
function showBlocked() {
if (textEl) textEl.textContent = "毎朝5時に『今日の一言』をお届けします";
if (btn) btn.classList.add("hidden");
setStatus("通知がブロックされています。ブラウザの設定でこのサイトの通知を許可すると、受け取れるようになります。");
}

var osRef = null; // 初期化済みの OneSignal インスタンス

function refresh() {
if (!osRef) { showDefault(); return;}
try {
if (osRef.User.PushSubscription.optedIn) { showSubscribed(); return;}
if (typeof Notification!== "undefined" && Notification.permission === "denied") {
showBlocked(); return;
}
showDefault();
} catch (e) {
showDefault();
}
}

/* ---------- OneSignal SDK の初期化 ---------- */
window.OneSignalDeferred = window.OneSignalDeferred || [];
if (!PLACEHOLDER) {
window.OneSignalDeferred.push(function (OneSignal) {
return OneSignal.init({
appId: ONESIGNAL_APP_ID,
// プッシュ用ワーカーは PWA 用 sw.js と scope が衝突しないよう
// push/ サブディレクトリに分離する（公式ドキュメントの推奨構成）。
// serviceWorkerPath はサイトルートからの相対指定、scope は push/ のみ。
serviceWorkerPath: "kumaura/push/OneSignalSDKWorker.js",
serviceWorkerParam: { scope: "/kumaura/push/"}
}).then(function () {
osRef = OneSignal;
try {
OneSignal.User.PushSubscription.addEventListener("change", refresh);
} catch (e) { /* 状態変化の自動反映が無くても手動表示で足りる */}
refresh();
}).catch(function () {
// 初期化できなくてもサイト本体・鑑定には影響しない
osRef = null;
showDefault();
});
});
}

/* ---------- ボタンの動作（必ずユーザーのタップから） ---------- */
if (btn) {
btn.addEventListener("click", function () {
if (PLACEHOLDER) {
setStatus("通知機能は準備中です。開始までもう少しお待ちください。");
return;
}
// 購読済みなら、このボタンは「止める」動作
if (osRef && osRef.User.PushSubscription.optedIn) {
try {
Promise.resolve(osRef.User.PushSubscription.optOut()).then(refresh, refresh);
} catch (e) { refresh();}
return;
}
setStatus("確認画面を表示しています…");
// SDK の読み込み完了を待ってから許可を求める（初期化の直後でも動くよう
// Deferred 経由で実行する）。許可ダイアログはこのタップが起点になる。
window.OneSignalDeferred.push(function (OneSignal) {
return OneSignal.Notifications.requestPermission().then(function (granted) {
if (granted === false &&
typeof Notification!== "undefined" && Notification.permission!== "granted") {
refresh();
return undefined;
}
return OneSignal.User.PushSubscription.optIn();
}).then(function () {
osRef = OneSignal;
refresh();
}).catch(function () {
setStatus("この環境では通知を受け取れませんでした。対応ブラウザでホーム画面に追加してからお試しください。");
});
});
});
}

refresh();
})();
