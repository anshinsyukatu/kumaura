/*
 * クマうら Web版：PWA（ホーム画面追加）の仕上げ。
 * - Service Worker の登録
 * - インストール案内カードの表示制御（同意画面の #pwa-card-android / #pwa-card-ios）
 * 保存するのは「カードを閉じた」という UI フラグのみ（sessionStorage）。
 * 入力値・写真などの個人データは一切保存しない。
 */
(function () {
  "use strict";

  /* ---------- Service Worker ---------- */
  if ("serviceWorker" in navigator &&
      (location.protocol === "https:" || location.protocol === "http:")) {
    window.addEventListener("load", function () {
      navigator.serviceWorker.register("sw.js").catch(function () {
        /* 登録できなくてもサイト本体には影響しない */
      });
    });
  }

  /* ---------- インストール案内カード ---------- */
  var FLAG_KEY = "kumaura_install_card_closed";

  function isStandalone() {
    if (window.matchMedia &&
        window.matchMedia("(display-mode: standalone)").matches) return true;
    // iOS Safari のホーム画面起動
    if (window.navigator.standalone === true) return true;
    return false;
  }
  function dismissed() {
    try { return sessionStorage.getItem(FLAG_KEY) === "1"; }
    catch (e) { return false; }
  }
  function dismiss(card) {
    try { sessionStorage.setItem(FLAG_KEY, "1"); } catch (e) {}
    if (card) card.classList.add("hidden");
  }
  function isIos() {
    var ua = window.navigator.userAgent || "";
    if (/iPhone|iPad|iPod/.test(ua)) return true;
    // iPadOS 13以降は Mac と名乗るため、タッチ対応で補足判定
    return /Macintosh/.test(ua) && "ontouchend" in document;
  }
  function isIosSafari() {
    var ua = window.navigator.userAgent || "";
    if (!/Safari/.test(ua)) return false;
    // Chrome / Firefox / Edge / Opera の iOS 版やアプリ内ブラウザを除外
    if (/CriOS|FxiOS|EdgiOS|OPiOS|Mercury/.test(ua)) return false;
    return true;
  }

  var cardAndroid = document.getElementById("pwa-card-android");
  var cardIos = document.getElementById("pwa-card-ios");

  if (isStandalone() || dismissed()) return;

  /* --- Android / Chrome 系：標準のインストールダイアログを呼ぶ --- */
  var deferredPrompt = null;
  window.addEventListener("beforeinstallprompt", function (e) {
    e.preventDefault();
    deferredPrompt = e;
    if (cardAndroid && !dismissed() && !isStandalone()) {
      cardAndroid.classList.remove("hidden");
    }
  });
  window.addEventListener("appinstalled", function () {
    deferredPrompt = null;
    if (cardAndroid) cardAndroid.classList.add("hidden");
  });
  if (cardAndroid) {
    document.getElementById("pwa-btn-yes").addEventListener("click", function () {
      if (!deferredPrompt) { dismiss(cardAndroid); return; }
      var p = deferredPrompt;
      deferredPrompt = null;
      p.prompt();
      p.userChoice.then(function () {
        // 承諾・辞退のどちらでも、この訪問中はカードを閉じる
        dismiss(cardAndroid);
      });
    });
    document.getElementById("pwa-btn-no").addEventListener("click", function () {
      dismiss(cardAndroid);
    });
  }

  /* --- iOS Safari：プログラムからは追加できないので手順を出す --- */
  if (cardIos && isIos() && isIosSafari()) {
    cardIos.classList.remove("hidden");
    document.getElementById("pwa-btn-ios-close").addEventListener("click", function () {
      dismiss(cardIos);
    });
  }
})();
