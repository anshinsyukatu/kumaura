/*
 * クマうら Web版：統合 Service Worker の入口。
 *
 * 登録される Service Worker はこのファイル1本だけ（scope: /kumaura/）。
 * 中身は2つを importScripts で取り込んで統合している：
 *   1. OneSignal の Web プッシュ用ワーカー（通知の受信・表示を担当）
 *   2. 既存の sw.js（PWA のオフラインキャッシュを担当）
 * これにより、プッシュ通知とオフラインキャッシュが同じ登録で共存する。
 * sw.js 側のキャッシュ仕様・版番号は sw.js で管理する（このファイルは変更不要）。
 */
importScripts("https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.sw.js");
importScripts("sw.js");
