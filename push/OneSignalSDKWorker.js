/*
 * クマうら Web版：OneSignal Web プッシュ用 Service Worker。
 *
 * OneSignal 公式ドキュメント（Custom Code setup）の推奨に従い、
 * PWA 用の sw.js とは別ディレクトリ（push/）に置く。scope はこの
 * ディレクトリ（/kumaura/push/）だけに限定され、sw.js（scope:
 * /kumaura/）とは衝突しない。
 * 登録は OneSignal SDK（js/notify.js の init）が行う。
 */
importScripts("https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.sw.js");
