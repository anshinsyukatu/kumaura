/*
* クマうら Web版：ウェブプッシュ通知（標準 Web Push）の受け取り側。
* - 毎朝5時の「今日の一言」配信のための購読入口（同意画面の #push-card）
* - 通知許可は「通知を受け取る」ボタンのタップをきっかけにだけ求める。
* ページを開いただけでは許可ダイアログを出さない。
* - 購読は PWA 用の Service Worker（sw.js、install.js が登録）の
* PushManager で行い、購読情報は配信用の Cloudflare Worker に送る。
* 送るのは購読に必要な情報（この端末の通知の宛先と鍵）だけ。
* 鑑定の入力内容（生年月日・写真など）は従来どおり送信・保存されない。
* - 失敗した段階ごとに #push-status へ理由を出す。無言で止まらない。
*
* PUSH_WORKER_URL を Cloudflare Worker の URL に差し替えること。
* プレースホルダの間は購読を開始せず、カードに「準備中」と出す。
*/
(function () {
"use strict";

var VAPID_PUBLIC_KEY = "BOe6TKNFbzEBJtb3m4m3HzA9EdYnxPKPxDo97yGF7lTF5RXue5o0gvQraKQdoOp-FIrDV5MF2pE2omje4gvWuCw";
var PUSH_WORKER_URL = "https://kumaura-push.anshin-syukatu.workers.dev";
var PLACEHOLDER = PUSH_WORKER_URL === "REPLACE_WITH_WORKER_URL";

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
if (!pushCapable && !isIos()) return;

// iPhone でホーム画面に追加していない場合は、その一言を添える
if (isIos() && !isStandalone() && iosNote) {
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

/* ---------- 補助関数 ---------- */
function urlBase64ToUint8Array(base64String) {
var padding = "=".repeat((4 - (base64String.length % 4)) % 4);
var base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
var rawData = window.atob(base64);
var outputArray = new Uint8Array(rawData.length);
for (var i = 0; i < rawData.length; ++i) {
outputArray[i] = rawData.charCodeAt(i);
}
return outputArray;
}

// sw.js の登録が active になるのを待つ（install.js が登録している）。
// 待ちすぎて無言にならないよう、10秒で見切って理由を出す。
function waitForRegistration() {
if (!("serviceWorker" in navigator)) {
return Promise.reject(new Error("no-service-worker"));
}
var timeout = new Promise(function (resolve, reject) {
setTimeout(function () { reject(new Error("sw-timeout")); }, 10000);
});
return Promise.race([navigator.serviceWorker.ready, timeout]);
}

function postToWorker(path, body) {
return fetch(PUSH_WORKER_URL + path, {
method: "POST",
headers: { "Content-Type": "application/json" },
body: JSON.stringify(body)
}).then(function (res) {
if (!res.ok) throw new Error("worker-" + res.status);
return res;
});
}

var currentSub = null; // この端末の現在の購読（あれば）

function refresh() {
if (typeof Notification !== "undefined" && Notification.permission === "denied") {
showBlocked();
return;
}
if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
showDefault();
return;
}
navigator.serviceWorker.ready.then(function (reg) {
return reg.pushManager.getSubscription();
}).then(function (sub) {
currentSub = sub;
if (sub) showSubscribed();
else showDefault();
}).catch(function () {
showDefault();
});
}

/* ---------- 購読の開始 ---------- */
function startSubscribe() {
if (PLACEHOLDER) {
setStatus("通知機能は準備中です。開始までもう少しお待ちください。");
return;
}
if (!("PushManager" in window) || !("serviceWorker" in navigator)) {
if (isIos() && !isStandalone()) {
setStatus("iPhoneでは、ホーム画面に追加して、追加したアイコンから開くと通知を受け取れます。");
} else {
setStatus("このブラウザでは通知を受け取れません。対応ブラウザでお試しください。");
}
return;
}
setStatus("準備をしています…");
waitForRegistration().then(function (reg) {
setStatus("確認画面を表示しています…");
return Notification.requestPermission().then(function (permission) {
if (permission !== "granted") {
showDefault();
setStatus("通知の許可が得られませんでした。ブラウザの設定で通知を許可してから、もう一度お試しください。");
throw new Error("permission-" + permission);
}
setStatus("通知を登録しています…");
return reg.pushManager.subscribe({
userVisibleOnly: true,
applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
});
});
}).then(function (sub) {
currentSub = sub;
return postToWorker("/subscribe", sub.toJSON());
}).then(function () {
showSubscribed();
}).catch(function (err) {
if (err && err.message === "sw-timeout") {
showDefault();
setStatus("準備に時間がかかっています。ページを開き直してから、もう一度お試しください。");
} else if (err && err.message === "no-service-worker") {
showDefault();
setStatus("このブラウザでは通知を受け取れません。対応ブラウザでお試しください。");
} else if (err && err.message.indexOf("permission-") === 0) {
// 許可が得られなかった理由は表示済み
} else if (err && err.message.indexOf("worker-") === 0) {
showDefault();
setStatus("配信の仕組みへの登録に失敗しました。通信環境を確認して、もう一度お試しください。");
} else {
showDefault();
setStatus("通知の登録に失敗しました。通信環境を確認して、もう一度お試しください。");
}
});
}

/* ---------- 購読の停止 ---------- */
function stopSubscribe() {
var sub = currentSub;
if (!sub) { refresh(); return; }
var endpoint = sub.endpoint;
setStatus("通知を止めています…");
sub.unsubscribe().then(function () {
currentSub = null;
showDefault();
if (!PLACEHOLDER) {
postToWorker("/unsubscribe", { endpoint: endpoint }).catch(function () {
// 端末側の停止は完了しているので、画面は通常表示に戻す
});
}
}).catch(function () {
setStatus("通知を止める処理に失敗しました。もう一度お試しください。");
});
}

/* ---------- ボタンの動作（必ずユーザーのタップから） ---------- */
if (btn) {
btn.addEventListener("click", function () {
if (currentSub) stopSubscribe();
else startSubscribe();
});
}

refresh();
})();
