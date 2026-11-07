/*
 * クマうら Web版：OneSignal Web プッシュ用 Service Worker（更新用）。
 *
 * v16 では本体（OneSignalSDKWorker.js）と対で Updater 用ファイルも
 * 配布されるため、同じ push/ ディレクトリに用意する。中身は本体と
 * 同じく OneSignal のワーカー本体を取り込むだけ。
 * 配置場所・scope の考え方は OneSignalSDKWorker.js と同じ。
 */
importScripts("https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.sw.js");
