# クマうら Web版

Androidアプリ「クマうら」（v3.17相当）のブラウザ版。静的サイトで、ビルド工程なしにそのまま動きます。
計算・文章は Android版から移植した JavaScript モジュールがブラウザ内で実行し、
入力した生年月日や写真がサーバーへ送信・保存されることは一切ありません（localStorage 等も不使用）。

## 構成

- `index.html` — 入口（同意ゲート／モード選択／入力／結果／相性の各画面）。OGP・ファビコン等のメタ情報も含む
- `img/` — OG画像（`og-image.png` 1200×630）とアイコン類（`favicon.svg` / `favicon.ico` / `favicon-32.png` / `apple-touch-icon.png` / `icon-192.png` / `icon-512.png`）。熊モチーフ＋Android版アイコンの紺（#2B2140）×金の配色
- `css/style.css` — スタイル（Android版の配色・部品を再現、ダークモード対応）
- `js/engine.js` — 計算エンジン（四柱推命・西洋占星術・都道府県座標・運気曲線・性別デフォルト・相性色・ホロスコープ角度）
- `js/kaisetsu.js` — 四柱推命の解釈文と合成（総評・本質・見通し等）
- `js/seiyo.js` — 西洋占星術と星めぐり占いの解釈文
- `js/tesou.js` — 手相の文章・特徴定義と総合診断
- `js/matome.js` — まとめ（特性・強み・弱み・アドバイス）と相性
- `js/palm.js` — 手相写真の自動読み取り（肌色セグメンテーション→手のマスク→線の探索）
- `js/report.js` — 鑑定全文（コピー用テキスト）の生成
- `js/app.js` — 画面構築・描画（命式表カード、ホロスコープ円図、運気グラフ、相性グラフ）・フロー制御
- `js/install.js` — PWA（ホーム画面追加）案内カードと Service Worker 登録
- `js/notify.js` — ウェブプッシュ通知（標準 Web Push）の受け取り側。同意画面の購読カードと、購読登録／停止（配信用 Cloudflare Worker への POST まで）
- `sw.js` — PWA の Service Worker（オフラインキャッシュ＋プッシュ受信・通知表示）。`js/install.js` が単独で登録する（scope はサイトルート `/kumaura/`）
- `test/` — Node で実行する移植一致テスト一式（`node test/*.test.js`）

## ウェブプッシュ通知（自前配信）の有効化手順

1. Cloudflare Worker（`~/workspace/uranai-push/worker.js`）をデプロイする。手順は `~/workspace/uranai-push/README.md` を参照
2. `js/notify.js` の `PUSH_WORKER_URL`（`"REPLACE_WITH_WORKER_URL"`）を、デプロイした Worker の URL に差し替える。プレースホルダの間は購読を開始しない（カードは表示され、ボタンは「準備中」を出す）
3. 許可ダイアログはサイト側の「通知を受け取る」ボタンのタップからのみ出す設計。ページを開いただけでは出ない
4. VAPID 公開鍵は `js/notify.js` の `VAPID_PUBLIC_KEY` に埋め込み済み。秘密鍵は `~/workspace/uranai-push/vapid-private.txt` にのみ保存し、Worker のシークレット `VAPID_PRIVATE_KEY` に登録する（サイト側には置かない）
5. 差し替え後に `preview/build-preview.py` でプレビューも再生成すること

## ローカルプレビュー

```sh
cd ~/workspace/uranai-web
python3 -m http.server 8000
# ブラウザで http://127.0.0.1:8000/ を開く
```

`index.html` を直接開いても動作しますが、ローカルサーバー経由が確実です。

## GitHub Pages への公開手順（要点）

1. GitHub にリポジトリを作成し、このフォルダ一式（`index.html` をルートに）をそのまま push する
2. リポジトリの Settings → Pages で、公開元ブランチ（例：main の `/ (root)`）を選んで有効化する
3. 数分後に `https://<ユーザー名>.github.io/<リポジトリ名>/` で公開される
4. 公開URLが決まったら、`index.html` の `og:image` と `twitter:image`（現在は相対指定 `img/og-image.png`）を絶対URL（`https://<ユーザー名>.github.io/<リポジトリ名>/img/og-image.png`）に差し替える（SNS側が相対指定を読めないため）。差し替え後に `preview/build-preview.py` でプレビューも再生成すること

- 無料の GitHub Pages ではリポジトリを Public にする必要があります（＝ソースも公開されます。ブラウザで動く以上、計算コードと文章は閲覧者にも見える前提です）
- 独自ドメインは不要です（必要になったら後から設定できます）

## 変更履歴

- 2026-11-19：くままバッジの右下に「©」ピルを追加（`css/style.css` の `.kuma-badge::after` で表示側に重ねる方式。同意画面・メイン画面の2か所に一括適用）。フッターに「© 2026 hiro」の行を追加。あわせて `sw.js` の CACHE_VERSION を v11 → v12 に更新。本人の指示（くままへのコピーライト表示）による変更。作業量：小（CSS 1ルール追加＋HTML 1行追加＋版上げのみ。鑑定機能・免責・BGMには変更なし）
