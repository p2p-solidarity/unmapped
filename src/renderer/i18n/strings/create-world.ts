import type { Phrase } from "./phrase";

export const CREATE_WORLD = {
  worldReview: { en: "Review the world", "zh-TW": "確認世界", ja: "ワールドを確認" },
  worldReviewNote: {
    en: "Edit any card or have the model rewrite it. Lock the cards you like, and they are never rewritten.",
    "zh-TW": "可以直接修改卡片，或請模型重寫。鎖定喜歡的卡片，它們就不會被改寫。",
    ja: "カードは直接直すことも、モデルに書き直してもらうこともできます。気に入ったカードはロックすると書き換えられません。",
  },
  worldNameNote: {
    en: "Renaming the world keeps every card as it is.",
    "zh-TW": "改名不會影響任何卡片。",
    ja: "名前を変えてもカードはそのままです。",
  },
  cardsNote: {
    en: "Note for every unlocked card (optional)",
    "zh-TW": "給所有未鎖定卡片的備註（選填）",
    ja: "ロックしていないカード全体への指示（任意）",
  },
  rewriteUnlockedCards: {
    en: "Rewrite the {n} unlocked {n|card|cards}",
    "zh-TW": "重寫 {n} 張未鎖定的卡片",
    ja: "ロックしていない {n} 枚を書き直す",
  },
  cardLocked: {
    en: "Locked: the model keeps this card exactly as it is.",
    "zh-TW": "已鎖定：模型會完全保留這張卡片。",
    ja: "ロック中：モデルはこのカードをそのまま残します。",
  },
  partPremise: { en: "Premise", "zh-TW": "世界前提", ja: "前提" },
  partTone: { en: "Tone", "zh-TW": "氛圍", ja: "雰囲気" },
  partRules: { en: "Everyday rules", "zh-TW": "日常規則", ja: "日常のルール" },
  partTaboos: { en: "What never appears", "zh-TW": "不會出現的事物", ja: "登場しないもの" },
  partNaming: { en: "Naming", "zh-TW": "命名方式", ja: "名前の付け方" },
  partVoice: { en: "How people speak", "zh-TW": "人物語氣", ja: "話し方" },
  partLook: { en: "How it looks", "zh-TW": "外觀風格", ja: "見た目" },
  streamWriting: { en: "Writing…", "zh-TW": "正在寫…", ja: "書いています…" },
  cardNote: {
    en: "Note for this card (optional)",
    "zh-TW": "給這張卡片的備註（選填）",
    ja: "このカードへの指示（任意）",
  },
  rewriteCard: { en: "Rewrite this card", "zh-TW": "重寫這張卡片", ja: "このカードを書き直す" },
  worldStale: {
    en: "The idea changed. Update this world, or keep it if the language and play style still match.",
    "zh-TW": "構想已變更。請更新世界設定；如果語言和玩法未變，也可以保留現有設定。",
    ja: "アイデアが変わりました。ワールドを更新するか、言語と遊び方が同じなら現在の内容を残せます。",
  },
  updateWorld: { en: "Write world again", "zh-TW": "重新撰寫世界", ja: "ワールドを書き直す" },
  keepWorld: { en: "Keep this world", "zh-TW": "保留這個世界", ja: "このワールドを残す" },
  worldIncomplete: {
    en: "Finish the world cards before continuing. Rules need at least 3 items; what never appears needs at least 2.",
    "zh-TW": "請先完成世界卡片。日常規則至少 3 項，不會出現的事物至少 2 項。",
    ja: "先にカードを完成させてください。ルールは3項目以上、登場しないものは2項目以上必要です。",
  },
  onePerLine: { en: "One item per line", "zh-TW": "每行一項", ja: "1行に1項目" },
} as const satisfies Record<string, Phrase>;
