/*
 * クマうら Web版 Service Worker：
 * サイトの静的資産だけをキャッシュし、オフラインでも開けるようにする。
 * 入力値・写真などの個人データは一切扱わない（元々ブラウザ内処理のみで、
 * この Service Worker も GET の静的ファイルしか対象にしない）。
 * 資産を変更したら CACHE_VERSION を上げること（古いキャッシュは activate で破棄）。
 */
"use strict";

var CACHE_VERSION = "v1";
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
