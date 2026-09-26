// What model calls cost: the world total on the HUD and in Create, and the breakdown panel.

import type { Phrase } from "./phrase";

export const USAGE = {
  title: { en: "AI usage", "zh-TW": "AI 用量", ja: "AI 使用量" },
  worldLine: {
    en: "This world: {calls} {calls|call|calls} · {input} in / {output} out · {cached} cached",
    "zh-TW": "本世界：{calls} 次 · 輸入 {input} / 輸出 {output} · 快取 {cached}",
    ja: "この世界：{calls} 回 · 入力 {input} / 出力 {output} · キャッシュ {cached}",
  },
  draftLine: {
    en: "This draft: {calls} {calls|call|calls} · {input} in / {output} out · {cached} cached",
    "zh-TW": "這份草稿：{calls} 次 · 輸入 {input} / 輸出 {output} · 快取 {cached}",
    ja: "この下書き：{calls} 回 · 入力 {input} / 出力 {output} · キャッシュ {cached}",
  },
  none: {
    en: "No model calls counted for this world yet.",
    "zh-TW": "本世界還沒有任何模型呼叫。",
    ja: "この世界ではまだモデルを呼び出していません。",
  },
  draftNone: {
    en: "No model calls for this draft yet.",
    "zh-TW": "這份草稿還沒有任何模型呼叫。",
    ja: "この下書きではまだモデルを呼び出していません。",
  },
  unanswered: {
    en: "Not counted as calls: {n} that ended without an answer ({failed} refused or failed, {aborted} cancelled). No tokens were recorded for them.",
    "zh-TW":
      "未計入呼叫次數：{n} 次沒有得到回答（{failed} 次被拒絕或失敗，{aborted} 次已取消），沒有為它們記錄任何 token。",
    ja: "呼び出し回数に含めていません：応答なしで終わった {n} 回（拒否・失敗 {failed} 回、キャンセル {aborted} 回）。これらのトークンは記録されていません。",
  },
  loading: { en: "Reading usage…", "zh-TW": "正在讀取用量…", ja: "使用量を読み込み中…" },
  unreported: {
    en: "{n} {n|call|calls} without token counts from the provider (not counted as zero).",
    "zh-TW": "有 {n} 次呼叫供應商沒有回報 token 數（不當作 0）。",
    ja: "{n} 回はプロバイダがトークン数を返しませんでした（0 とは数えません）。",
  },
  skipped: {
    en: "{n} unreadable ledger {n|line|lines} skipped.",
    "zh-TW": "略過 {n} 行無法讀取的紀錄。",
    ja: "読めない記録 {n} 行を飛ばしました。",
  },
  open: { en: "Usage", "zh-TW": "用量", ja: "使用量" },
  close: { en: "Close", "zh-TW": "關閉", ja: "閉じる" },
  byPurpose: { en: "By purpose", "zh-TW": "依用途", ja: "用途別" },
  recent: { en: "Recent calls", "zh-TW": "最近的呼叫", ja: "最近の呼び出し" },
  colPurpose: { en: "Purpose", "zh-TW": "用途", ja: "用途" },
  colCalls: { en: "Calls", "zh-TW": "次數", ja: "回数" },
  colInput: { en: "In", "zh-TW": "輸入", ja: "入力" },
  colOutput: { en: "Out", "zh-TW": "輸出", ja: "出力" },
  colCached: { en: "Cached", "zh-TW": "快取", ja: "キャッシュ" },
  colTime: { en: "Time", "zh-TW": "時間", ja: "時間" },
  seconds: { en: "{s} s", "zh-TW": "{s} 秒", ja: "{s} 秒" },
  recentLine: {
    en: "{when} · {purpose} · {model} · {tokens} · {s} s · {outcome}",
    "zh-TW": "{when} · {purpose} · {model} · {tokens} · {s} 秒 · {outcome}",
    ja: "{when} · {purpose} · {model} · {tokens} · {s} 秒 · {outcome}",
  },
  tokens: {
    en: "{input} in / {output} out",
    "zh-TW": "輸入 {input} / 輸出 {output}",
    ja: "入力 {input} / 出力 {output}",
  },
  tokensUnknown: { en: "tokens not reported", "zh-TW": "未回報 token", ja: "トークン未報告" },
  outcomeDone: { en: "done", "zh-TW": "完成", ja: "完了" },
  outcomeFailed: { en: "failed", "zh-TW": "失敗", ja: "失敗" },
  outcomeAborted: { en: "cancelled", "zh-TW": "已取消", ja: "キャンセル" },

  purposeWitness: { en: "Witnessing", "zh-TW": "顯影", ja: "観測" },
  purposeChapter: { en: "Chapter", "zh-TW": "章節", ja: "章" },
  purposePlace: { en: "Place", "zh-TW": "地點", ja: "場所" },
  purposeDialogue: { en: "Dialogue", "zh-TW": "對話", ja: "会話" },
  purposeItem: { en: "Item", "zh-TW": "物品", ja: "アイテム" },
  purposeScene: { en: "Scene", "zh-TW": "場景", ja: "シーン" },
  purposeOrigin: { en: "Starting place", "zh-TW": "起點", ja: "はじまりの場所" },
  purposeBible: { en: "World cards", "zh-TW": "世界卡片", ja: "ワールドカード" },
  purposeStory: { en: "Story plan", "zh-TW": "故事計畫", ja: "物語の計画" },
  purposeStoryEdit: { en: "Chapter edits", "zh-TW": "章節修改", ja: "章の修正" },
  purposeResolve: { en: "Turn", "zh-TW": "回合", ja: "ターン" },
  purposeMod: { en: "Mod proposal", "zh-TW": "模組提案", ja: "Mod 提案" },
  purposeTweak: { en: "Rule tweak", "zh-TW": "規則調整", ja: "ルール調整" },
  purposeWork: { en: "AI world", "zh-TW": "AI 世界", ja: "AI ワールド" },
  purposeImage: { en: "Picture", "zh-TW": "圖片", ja: "画像" },
} as const satisfies Record<string, Phrase>;
