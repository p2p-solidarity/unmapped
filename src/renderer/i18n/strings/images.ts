// Settings → Images (rev 6 phase 4, D4): which model draws this computer's pictures, the licence
// each one draws under, and whether commercial mode lets it draw.

import type { Phrase } from "./phrase";

export const IMAGES = {
  heading: { en: "Images", "zh-TW": "圖片", ja: "画像" },
  intro: {
    en: "Which model draws pictures on this computer. Every picture keeps the licence of the model that drew it.",
    "zh-TW": "由哪個模型在這台電腦上畫圖。每張圖片都會記下畫出它的模型的授權。",
    ja: "このコンピュータで画像を描くモデル。どの画像にも、描いたモデルのライセンスが記録されます。",
  },
  reading: {
    en: "Reading the image settings…",
    "zh-TW": "正在讀取圖片設定…",
    ja: "画像の設定を読み込み中…",
  },
  commercialBuild: {
    en: "Commercial mode is on (this build): only providers whose licence allows commercial use can draw.",
    "zh-TW": "商業模式已開啟（這個版本）：只有授權允許商業使用的提供者能畫圖。",
    ja: "商用モードがオンです（このビルド）：商用利用できるライセンスのプロバイダーだけが描けます。",
  },
  commercialGateway: {
    en: "Commercial mode is on (the gateway): only providers whose licence allows commercial use can draw.",
    "zh-TW": "商業模式已開啟（閘道）：只有授權允許商業使用的提供者能畫圖。",
    ja: "商用モードがオンです（ゲートウェイ）：商用利用できるライセンスのプロバイダーだけが描けます。",
  },
  commercialOff: {
    en: "Commercial mode is off: every provider can draw.",
    "zh-TW": "商業模式未開啟：每個提供者都能畫圖。",
    ja: "商用モードはオフです：どのプロバイダーでも描けます。",
  },
  selfHosted: { en: "self-hosted", "zh-TW": "自行架設", ja: "セルフホスト" },
  localityLocal: { en: "On this computer", "zh-TW": "在這台電腦上", ja: "このコンピュータ上" },
  localityDirect: {
    en: "Direct, with your key",
    "zh-TW": "直接連線，使用你的金鑰",
    ja: "自分のキーで直接",
  },
  localityHosted: { en: "Through the gateway", "zh-TW": "透過閘道", ja: "ゲートウェイ経由" },
  server: { en: "Server: {url}", "zh-TW": "伺服器：{url}", ja: "サーバー：{url}" },
  licence: { en: "Licence: {name}", "zh-TW": "授權：{name}", ja: "ライセンス：{name}" },
  commercialYes: {
    en: "Commercial use: allowed",
    "zh-TW": "商業使用：允許",
    ja: "商用利用：可",
  },
  commercialNo: {
    en: "Commercial use: not allowed",
    "zh-TW": "商業使用：不允許",
    ja: "商用利用：不可",
  },
  source: {
    en: "Source: {source} · checked {date}",
    "zh-TW": "來源：{source}・查核於 {date}",
    ja: "出典：{source}・確認日 {date}",
  },
  openSource: { en: "Open the source", "zh-TW": "開啟來源", ja: "出典を開く" },
  keySaved: {
    en: "Key: saved on this computer",
    "zh-TW": "金鑰：已存在這台電腦",
    ja: "キー：このコンピュータに保存済み",
  },
  keyEnv: { en: "Key: from .env", "zh-TW": "金鑰：來自 .env", ja: "キー：.env から" },
  keyUnreadable: {
    en: "Key: the saved key cannot be read",
    "zh-TW": "金鑰：無法讀取已儲存的金鑰",
    ja: "キー：保存したキーを読み取れません",
  },
  keyNone: { en: "Key: none", "zh-TW": "金鑰：沒有", ja: "キー：なし" },
  keyNotNeeded: {
    en: "Key: not needed on this computer",
    "zh-TW": "金鑰：在這台電腦上不需要",
    ja: "キー：このコンピュータでは不要",
  },
  use: { en: "Use for pictures", "zh-TW": "用來畫圖", ja: "画像に使う" },
  inUse: { en: "In use", "zh-TW": "使用中", ja: "使用中" },
  notInCommercial: {
    en: "Not available in commercial mode",
    "zh-TW": "商業模式下無法使用",
    ja: "商用モードでは使えません",
  },
  chosenRefused: {
    en: "The chosen provider cannot draw in commercial mode; choose another.",
    "zh-TW": "目前選擇的提供者在商業模式下不能畫圖，請改選其他提供者。",
    ja: "選んだプロバイダーは商用モードでは描けません。別のものを選んでください。",
  },
  test: { en: "Test", "zh-TW": "測試", ja: "テスト" },
  testing: { en: "Testing…", "zh-TW": "測試中…", ja: "テスト中…" },
  untested: { en: "Not tested yet", "zh-TW": "尚未測試", ja: "未テスト" },
  answered: {
    en: "Answered in {ms} ms",
    "zh-TW": "{ms} 毫秒內回應",
    ja: "{ms} ミリ秒で応答",
  },
  served: {
    en: "serves {model}",
    "zh-TW": "提供 {model}",
    ja: "{model} を提供中",
  },
  notServed: {
    en: "does not serve {model} (it serves: {models})",
    "zh-TW": "沒有提供 {model}（它提供：{models}）",
    ja: "{model} を提供していません（提供中：{models}）",
  },
  editsYes: {
    en: "can draw over a reference picture",
    "zh-TW": "可以依參考圖作畫",
    ja: "参照画像に合わせて描けます",
  },
  editsNo: {
    en: "cannot use a reference picture (pictures are drawn without the world's look)",
    "zh-TW": "無法使用參考圖（畫圖時不會參照世界的外觀）",
    ja: "参照画像を使えません（世界の見た目なしで描かれます）",
  },
  saved: { en: "Saved.", "zh-TW": "已儲存。", ja: "保存しました。" },
} as const satisfies Record<string, Phrase>;
