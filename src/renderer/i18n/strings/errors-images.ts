// Errors about image providers and picture licences (rev 6 phase 4, D4): the device's choice in
// Settings → Images, commercial mode, the self-hosted Qwen-Image server, and publishing a revision
// whose new pictures need redrawing. The original English (with the server address, the start
// command or the list of pictures) stays visible as the error's detail.

import type { ErrorText } from "./errors";

export const IMAGES_ERRORS: Record<string, ErrorText> = {
  "image-licence-noncommercial": {
    message: {
      en: "This image provider's licence does not allow commercial use, and commercial mode is on.",
      "zh-TW": "這個圖片提供者的授權不允許商業使用，而目前是商業模式。",
      ja: "この画像プロバイダーのライセンスは商用利用を認めておらず、商用モードがオンです。",
    },
    hint: {
      en: "Choose an image provider whose licence allows commercial use in Settings → Images.",
      "zh-TW": "請到「設定 → 圖片」選擇授權允許商業使用的圖片提供者。",
      ja: "「設定 → 画像」で商用利用できるライセンスの画像プロバイダーを選んでください。",
    },
  },
  "image-licence-redraw": {
    message: {
      en: "Commercial mode is on: some new pictures must be redrawn before this can be published.",
      "zh-TW": "目前是商業模式：有些新圖片必須重畫後才能發布。",
      ja: "商用モードがオンです：公開する前に、いくつかの新しい画像を描き直す必要があります。",
    },
    hint: {
      en: "Draw them again with a provider whose licence allows commercial use (Settings → Images), or use your own files.",
      "zh-TW": "請用授權允許商業使用的提供者重畫（設定 → 圖片），或改用你自己的檔案。",
      ja: "商用利用できるライセンスのプロバイダーで描き直すか（設定 → 画像）、自分のファイルを使ってください。",
    },
  },
  "image-server-unreachable": {
    message: {
      en: "The image server did not answer.",
      "zh-TW": "圖片伺服器沒有回應。",
      ja: "画像サーバーが応答しませんでした。",
    },
    hint: {
      en: "Start the image server, or check its address and the connection, then try again.",
      "zh-TW": "請啟動圖片伺服器，或檢查它的位址與連線後再試一次。",
      ja: "画像サーバーを起動するか、アドレスと接続を確認してからもう一度試してください。",
    },
  },
  "image-model-not-served": {
    message: {
      en: "The image server does not serve this provider's model.",
      "zh-TW": "圖片伺服器沒有提供這個提供者的模型。",
      ja: "画像サーバーはこのプロバイダーのモデルを提供していません。",
    },
    hint: {
      en: "Start the server with this model: a picture carries the licence of the model that drew it.",
      "zh-TW": "請用這個模型啟動伺服器：圖片帶著畫出它的模型的授權。",
      ja: "このモデルでサーバーを起動してください。画像には描いたモデルのライセンスが付きます。",
    },
  },
  "image-no-alpha": {
    message: {
      en: "The picture came back without transparency.",
      "zh-TW": "畫出來的圖片沒有透明背景。",
      ja: "画像が透過なしで返ってきました。",
    },
    hint: {
      en: "Use a server that honours a transparent background, or draw with another image provider.",
      "zh-TW": "請改用支援透明背景的伺服器，或換一個圖片提供者。",
      ja: "透過背景に対応したサーバーを使うか、別の画像プロバイダーで描いてください。",
    },
  },
  "image-endpoint-not-allowed": {
    message: {
      en: "The image server's address is neither https:// nor on this computer.",
      "zh-TW": "圖片伺服器的位址既不是 https://，也不在這台電腦上。",
      ja: "画像サーバーのアドレスが https:// でも、このコンピュータ上でもありません。",
    },
    hint: {
      en: "Serve it over https://, or on http://127.0.0.1, and set QWEN_IMAGE_BASE_URL in .env.",
      "zh-TW":
        "請透過 https:// 提供，或放在 http://127.0.0.1，並在 .env 設定 QWEN_IMAGE_BASE_URL。",
      ja: "https:// か http://127.0.0.1 で提供し、.env に QWEN_IMAGE_BASE_URL を設定してください。",
    },
  },
  "key-endpoint-not-allowed": {
    message: {
      en: "A key may only go to an https:// address or to one on this computer.",
      "zh-TW": "金鑰只能送往 https:// 位址，或這台電腦上的位址。",
      ja: "キーは https:// のアドレスか、このコンピュータ上のアドレスにしか送れません。",
    },
  },
  "image-choice-invalid": {
    message: {
      en: "The saved image-provider choice could not be used.",
      "zh-TW": "無法使用已儲存的圖片提供者選擇。",
      ja: "保存された画像プロバイダーの選択を使えませんでした。",
    },
    hint: {
      en: "Choose an image provider in Settings → Images.",
      "zh-TW": "請到「設定 → 圖片」選擇圖片提供者。",
      ja: "「設定 → 画像」で画像プロバイダーを選んでください。",
    },
  },
  "image-choice-write-failed": {
    message: {
      en: "The image-provider choice could not be saved.",
      "zh-TW": "無法儲存圖片提供者的選擇。",
      ja: "画像プロバイダーの選択を保存できませんでした。",
    },
    hint: {
      en: "Check the app's data folder, then choose again.",
      "zh-TW": "請檢查應用程式的資料夾後再選一次。",
      ja: "アプリのデータフォルダを確認してから、もう一度選んでください。",
    },
  },
  "images-unready": {
    message: {
      en: "The image settings are not open yet.",
      "zh-TW": "圖片設定還沒準備好。",
      ja: "画像の設定はまだ開いていません。",
    },
    hint: {
      en: "Restart UNMAPPED.",
      "zh-TW": "請重新啟動《無界之地》。",
      ja: "UNMAPPED を再起動してください。",
    },
  },
};
