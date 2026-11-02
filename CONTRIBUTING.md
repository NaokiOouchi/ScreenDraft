# 開発ガイド

ScreenDraftはElectron、React、TypeScriptで構成されています。画面の取り込みにはChrome拡張を使用します。

## 準備

Apple Silicon搭載のMac、Google Chrome、Node.js 24、npmを用意してください。AI編集を試す場合は利用者自身がClaude Codeをインストールしてください。ログインも必要です。

```sh
npm ci
npm run dev
```

ブラウザで`http://127.0.0.1:4173`を開いてください。Chrome拡張を使用する場合は別のターミナルで次のコマンドを実行します。Chromeの拡張機能管理画面で`dist-extension`フォルダを読み込んでください。

```sh
npm run build:extension
```

デスクトップ版を起動する場合は次のコマンドを使用します。

```sh
npm run desktop
```

## テストとビルド

```sh
npm test
npm run test:licenses
npm run test:signing
npm run build:desktop
```

`npm run desktop:dist`は未署名の検証用DMGを生成します。一般配布には使用しないでください。

## 配布用の署名と公証

配布用の署名にはDeveloper ID Application証明書が必要です。公証にはAppleの認証情報をキーチェーンのプロファイルへ登録してください。

```sh
export SCREENDRAFT_SIGNING_IDENTITY='Developer ID証明書の名前'
export APPLE_TEAM_ID='Apple DeveloperチームID'
export APPLE_KEYCHAIN_PROFILE='公証用プロファイル名'
npm run desktop:dist:signed
npm run desktop:notarize
```

署名名には`Developer ID Application:`より後の証明書名を指定します。公証後のDMGは`release-signed/`に生成されます。認証情報や証明書の秘密鍵はリポジトリに含めないでください。

## ソースの構成

- `src/`：アプリの画面と操作
- `server/`：保存、AI編集、書き出しの処理
- `desktop/`：Electronアプリの起動とデスクトップ機能
- `extension/`：Chrome拡張の画面と取り込み処理
- `shared/`：アプリと拡張で共有する処理
- `tests/`：自動テスト

## 変更の提案

不具合や変更の提案はGitHub Issuesで受け付けます。コードの変更は目的と確認した内容を添えてプルリクエストとして提案してください。取り込んだ画面や接続キーなどの非公開情報は投稿に含めないでください。

UIの変更には[表示仕様](DESIGN.md)を適用してください。アプリ本体のライセンスは[AGPL-3.0-only](LICENSE)です。
