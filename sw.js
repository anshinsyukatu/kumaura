/*
 * クマうら Web版 Service Worker（キャッシュ担当）：
 * サイトの静的資産だけをキャッシュし、オフラインでも開けるようにする。
 * 入力値・写真などの個人データは一切扱わない（元々ブラウザ内処理のみで、
 * この Service Worker も GET の静的ファイルしか対象にしない）。
 * 資産を変更したら CACHE_VERSION を上げること（古いキャッシュは activate で破棄）。
 *
 * このファイルは js/install.js が単独で登録する（scope はサイトルート
 * ＝ /kumaura/）。キャッシュに加えて、標準 Web Push の受信（push）と
 * 通知タップ時の遷移（notificationclick）もこのワーカーが担う。
 * プッシュの購読登録は js/notify.js、配信は Cloudflare Worker 側。
 */
"use strict";

var CACHE_VERSION = "v5";
var CACHE_NAME = "kumaura-cache-" + CACHE_VERSION;

var PRECACHE_URLS = [
  "./",
  "index.html",
  "manifest.json",
  "css/style.css",
  "js/engine.js",
  "js/kaisetsu.js",
  "js/seiyo.js",
  "js/tesou.js",
  "js/matome.js",
  "js/palm.js",
  "js/report.js",
  "js/app.js",
  "js/install.js",
  "js/notify.js",
  "img/favicon.svg",
  "img/favicon-32.png",
  "img/favicon-64.png",
  "img/favicon.ico",
  "img/apple-touch-icon.png",
  "img/icon-192.png",
  "img/icon-512.png",
  "img/og-image.png"
];

self.addEventListener("install", function (event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function (cache) {
      return cache.addAll(PRECACHE_URLS);
    }).then(function () {
      return self.skipWaiting();
    })
  );
});

self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (key) {
        if (key !== CACHE_NAME) return caches.delete(key);
        return Promise.resolve(false);
      }));
    }).then(function () {
      return self.clients.claim();
    })
  );
});

/* ---------- Web Push 受信 ---------- */
// ペイロードは JSON（{title, body, url}）。形式が崩れていても
// 通知そのものは必ず出す（userVisibleOnly の約束を守るため）。
self.addEventListener("push", function (event) {
  var data = {};
  if (event.data) {
    try {
      data = event.data.json() || {};
    } catch (e) {
      data = { body: event.data.text() };
    }
  }
  var title = data.title || "クマうら";
  var options = {
    body: data.body || "",
    icon: "img/icon-192.png",
    badge: "img/icon-192.png",
    data: { url: data.url || "./" }
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", function (event) {
  event.notification.close();
  var target = (event.notification.data && event.notification.data.url) || "./";
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then(function (list) {
      for (var i = 0; i < list.length; i++) {
        var client = list[i];
        if (client.url.indexOf("/kumaura/") !== -1 && "focus" in client) {
          if ("navigate" in client && client.url !== target) {
            return client.navigate(target).then(function () { return client.focus(); });
          }
          return client.focus();
        }
      }
      if (clients.openWindow) return clients.openWindow(target);
      return undefined;
    })
  );
});

self.addEventListener("fetch", function (event) {
  var req = event.request;
  if (req.method !== "GET") return;
  var url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    caches.match(req, { ignoreSearch: true }).then(function (cached) {
      if (cached) return cached;
      return fetch(req).then(function (res) {
        // 同一オリジンの静的資産は、取得できたらキャッシュにも入れておく
        if (res && res.ok) {
          var copy = res.clone();
          caches.open(CACHE_NAME).then(function (cache) {
            cache.put(req, copy);
          });
        }
        return res;
      }).catch(function () {
        // オフラインでページ遷移が失敗したらトップ（キャッシュ済み）を返す
        if (req.mode === "navigate") {
          return caches.match("index.html");
        }
        return Response.error();
      });
    })
  );
});
