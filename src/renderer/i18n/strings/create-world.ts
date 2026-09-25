import type { Phrase } from "./phrase";

export const CREATE_WORLD = {
  worldReview: { en: "Review the world", "zh-TW": "審查世界", ja: "ワールドを確認" },
  worldReviewNote: {
    en: "Edit each card or ask the model to rewrite just that card. Your other cards stay as they are.",
    "zh-TW": "可以直接修改各張卡片，或請模型只重寫其中一張；其他卡片會保留。",
    ja: "カードを編集するか、そのカードだけ書き直せます。他のカードは残ります。",
  },
  partPremise: { en: "Premise", "zh-TW": "世界前提", ja: "前提" },
  partTone: { en: "Tone", "zh-TW": "氛圍", ja: "雰囲気" },
  partRules: { en: "Everyday rules", "zh-TW": "日常規則", ja: "日常のルール" },
  partTaboos: { en: "What never appears", "zh-TW": "不會出現的事物", ja: "登場しないもの" },
  partNaming: { en: "Naming", "zh-TW": "命名方式", ja: "名前の付け方" },
  partVoice: { en: "How people speak", "zh-TW": "人物語氣", ja: "話し方" },
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
