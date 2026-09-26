// Errors of the browser proof (rev 6 phase 4, D7; src/browser): its device key, its storage, the
// calls it leaves to the desktop, and packs fetched by hash. English stays at the source.

import type { ErrorText } from "./errors";

const CLEAR = {
  en: "Allow this site to store data (not a private window), free some space, then reload.",
  "zh-TW": "請允許這個網站儲存資料（不要用無痕視窗），騰出一些空間，再重新整理。",
  ja: "このサイトにデータの保存を許可し（プライベートウィンドウ以外で）、空きをつくってから再読み込みしてください。",
};

export const BROWSER_ERRORS: Record<string, ErrorText> = {
  "not-on-this-client": {
    message: {
      en: "This is not available in the browser.",
      "zh-TW": "瀏覽器裡沒有這個功能。",
      ja: "ブラウザではこの機能を使えません。",
    },
    hint: {
      en: "Open this on the desktop app.",
      "zh-TW": "請在桌面版 App 開啟。",
      ja: "デスクトップ版アプリで開いてください。",
    },
  },
  "browser-crypto-unavailable": {
    message: {
      en: "This browser cannot make the key this device signs with.",
      "zh-TW": "這個瀏覽器無法產生這台裝置用來簽名的金鑰。",
      ja: "このブラウザは、この端末が署名に使う鍵をつくれません。",
    },
    hint: {
      en: "Open this page in a current Chrome, Safari or Firefox, over https or on localhost.",
      "zh-TW": "請用新版的 Chrome、Safari 或 Firefox，透過 https 或 localhost 開啟這個頁面。",
      ja: "最新の Chrome、Safari、Firefox で、https か localhost で開いてください。",
    },
  },
  "browser-key-extractable": {
    message: {
      en: "This browser's device key could be read out, so it is not used.",
      "zh-TW": "這個瀏覽器的裝置金鑰可以被讀出，所以不使用它。",
      ja: "この端末の鍵が読み出せる状態なので使いません。",
    },
  },
  "browser-key-invalid": {
    message: {
      en: "This browser's device key is not one UNMAPPED can use.",
      "zh-TW": "這個瀏覽器的裝置金鑰無法使用。",
      ja: "この端末の鍵は使えないものです。",
    },
  },
  "browser-storage-failed": {
    message: {
      en: "This browser would not store the world.",
      "zh-TW": "這個瀏覽器不肯儲存這個世界。",
      ja: "このブラウザはワールドを保存できませんでした。",
    },
    hint: CLEAR,
  },
  "browser-storage-full": {
    message: {
      en: "This browser's share of storage is full.",
      "zh-TW": "這個瀏覽器可用的儲存空間已滿。",
      ja: "このブラウザで使える保存領域がいっぱいです。",
    },
    hint: {
      en: "Go online so waiting notes can be sent, or clear this site's data.",
      "zh-TW": "連上網路讓待送的留言送出，或清除這個網站的資料。",
      ja: "オンラインにして待ちのメモを送るか、このサイトのデータを消してください。",
    },
  },
  "world-offline": {
    message: {
      en: "The world's service is not connected.",
      "zh-TW": "尚未連上世界的服務。",
      ja: "ワールドのサービスにつながっていません。",
    },
    hint: {
      en: "It reconnects by itself; what you write waits on this device.",
      "zh-TW": "它會自己重新連線；你寫的東西會先留在這台裝置上。",
      ja: "自動でつなぎ直します。書いたものはこの端末で待ちます。",
    },
  },
  "join-name": {
    message: {
      en: "A name holds 1 to 60 characters.",
      "zh-TW": "名字要有 1 到 60 個字。",
      ja: "名前は 1〜60 文字です。",
    },
    hint: {
      en: "Type the name friends know you by.",
      "zh-TW": "請輸入朋友認得的名字。",
      ja: "友だちが知っている名前を入れてください。",
    },
  },
  "blob-tampered": {
    message: {
      en: "The world's pack arrived altered.",
      "zh-TW": "世界的資料包在傳送途中被改動了。",
      ja: "ワールドのパックが書き換わって届きました。",
    },
    hint: {
      en: "Try again, or ask the owner to share the world again.",
      "zh-TW": "請再試一次，或請主人重新分享這個世界。",
      ja: "もう一度試すか、持ち主にもう一度共有してもらってください。",
    },
  },
  "blob-http-failed": {
    message: {
      en: "The world's pack could not be fetched.",
      "zh-TW": "無法取得世界的資料包。",
      ja: "ワールドのパックを取得できませんでした。",
    },
    hint: {
      en: "Check the connection. A service on another address must allow this page.",
      "zh-TW": "請檢查連線。位於其他位址的服務必須允許這個頁面。",
      ja: "接続を確かめてください。別のアドレスのサービスは、このページを許可している必要があります。",
    },
  },
  "browser-pack-none": {
    message: {
      en: "This world's maker has not shared the world's own pack yet.",
      "zh-TW": "這個世界的建立者還沒把世界本身的資料包分享出來。",
      ja: "このワールドをつくった人は、まだワールド本体のパックを共有していません。",
    },
    hint: {
      en: "Ask the world's owner to share the world again from the desktop app.",
      "zh-TW": "請世界的主人從桌面版 App 重新分享這個世界。",
      ja: "持ち主にデスクトップ版アプリからもう一度共有してもらってください。",
    },
  },
  "browser-pack-missing": {
    message: {
      en: "This world's land has not reached this browser yet.",
      "zh-TW": "這個世界的大地還沒送到這個瀏覽器。",
      ja: "このワールドの大地は、まだこのブラウザに届いていません。",
    },
    hint: {
      en: "Go online once so the land can be fetched; after that it draws offline too.",
      "zh-TW": "請先連上網路一次讓大地下載下來，之後離線也能畫出來。",
      ja: "一度オンラインにして大地を取り込んでください。その後はオフラインでも描けます。",
    },
  },
  "browser-pack-mismatch": {
    message: {
      en: "The world's pack is not the version this world was made on.",
      "zh-TW": "世界的資料包不是這個世界建立時用的版本。",
      ja: "ワールドのパックは、このワールドがつくられた版ではありません。",
    },
    hint: {
      en: "Ask the world's owner to share the world again from the desktop app.",
      "zh-TW": "請世界的主人從桌面版 App 重新分享這個世界。",
      ja: "持ち主にデスクトップ版アプリからもう一度共有してもらってください。",
    },
  },
  "browser-land-bounded": {
    message: {
      en: "This world starts in a bounded scene, which only the desktop app plays.",
      "zh-TW": "這個世界從一個有邊界的場景開始，只有桌面版 App 能玩。",
      ja: "このワールドは境界のある場面から始まり、デスクトップ版アプリでしか遊べません。",
    },
    hint: {
      en: "Open this world on the desktop app.",
      "zh-TW": "請在桌面版 App 開啟這個世界。",
      ja: "デスクトップ版アプリでこのワールドを開いてください。",
    },
  },
};
