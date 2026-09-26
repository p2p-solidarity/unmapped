// Playing a shared world together (rev 6 phase 3, D12, D16, D17): watching a place being written,
// emotes, and the notes continent visitors leave, waiting for the owner to keep them.

import type { Phrase } from "./phrase";

export const TOGETHER = {
  // ── Witnessing together ───────────────────────────────────────────────────────────────────
  title: {
    en: "Being written together",
    "zh-TW": "大家一起見證",
    ja: "みんなで立ち会う",
  },
  writingBy: {
    en: "{name} is writing this",
    "zh-TW": "{name} 正在寫下這裡",
    ja: "{name} がここを書いています",
  },
  writingMine: {
    en: "You are writing this; everyone here reads it as it arrives",
    "zh-TW": "你正在寫下這裡；在場的每個人都會同步讀到",
    ja: "あなたがここを書いています。ここにいる全員が届いたそばから読めます",
  },
  targetChunk: {
    en: "The land at {cx} · {cz}",
    "zh-TW": "大地 {cx} · {cz}",
    ja: "大地 {cx} · {cz}",
  },
  targetChapter: { en: "Chapter {id}", "zh-TW": "章節 {id}", ja: "章 {id}" },
  targetMore: {
    en: "The next chapter ({id})",
    "zh-TW": "下一章（{id}）",
    ja: "次の章（{id}）",
  },
  targetRumors: { en: "Rumors", "zh-TW": "傳聞", ja: "噂" },
  arriving: { en: "Writing…", "zh-TW": "書寫中…", ja: "書いています…" },
  nothingYet: {
    en: "Nothing has arrived yet.",
    "zh-TW": "還沒有任何內容傳來。",
    ja: "まだ何も届いていません。",
  },
  people: { en: "People", "zh-TW": "人們", ja: "人々" },
  said: { en: "“{words}”", "zh-TW": "「{words}」", ja: "「{words}」" },
  told: { en: "What is told here", "zh-TW": "這裡流傳的事", ja: "ここで語られること" },
  errand: { en: "Someone asks", "zh-TW": "有人拜託", ja: "頼みごと" },
  foes: {
    en: "{n} {n|foe|foes}",
    "zh-TW": "{n} 個敵人",
    ja: "敵 {n} 体",
  },
  treasures: {
    en: "{n} {n|treasure|treasures}",
    "zh-TW": "{n} 個寶物",
    ja: "宝物 {n} 個",
  },
  chars: {
    en: "{n} characters so far",
    "zh-TW": "目前 {n} 個字元",
    ja: "ここまで {n} 文字",
  },
  watch: { en: "Watch", "zh-TW": "觀看", ja: "見る" },
  keepWalking: { en: "Keep walking", "zh-TW": "繼續走", ja: "歩き続ける" },

  // ── Emotes ────────────────────────────────────────────────────────────────────────────────
  emoteTitle: { en: "Emote", "zh-TW": "表情動作", ja: "エモート" },
  emote_wave: { en: "Wave", "zh-TW": "揮手", ja: "手を振る" },
  emote_bow: { en: "Bow", "zh-TW": "鞠躬", ja: "お辞儀" },
  emote_cheer: { en: "Cheer", "zh-TW": "歡呼", ja: "歓声" },
  emote_laugh: { en: "Laugh", "zh-TW": "大笑", ja: "笑う" },
  emote_heart: { en: "Heart", "zh-TW": "愛心", ja: "ハート" },
  emote_sit: { en: "Sit", "zh-TW": "坐下", ja: "座る" },

  // ── A continent visitor's notes ───────────────────────────────────────────────────────────
  visitorNotes: {
    en: "Notes visitors left on your land",
    "zh-TW": "訪客留在你大地上的留言",
    ja: "訪問者があなたの大地に残したメモ",
  },
  visitorNote: {
    en: "Left by {name}, not kept yet",
    "zh-TW": "{name} 留下的，尚未收下",
    ja: "{name} が残したもの、まだ残していません",
  },
  keepNote: { en: "Keep it", "zh-TW": "收下", ja: "残す" },
  notNow: { en: "Not now", "zh-TW": "先不要", ja: "今はやめる" },
  noteKept: {
    en: "{name}'s note is now part of your world.",
    "zh-TW": "{name} 的留言已成為你世界的一部分。",
    ja: "{name} のメモがあなたの世界の一部になりました。",
  },
  noteArrived: {
    en: "{name} left a note on your land. Keep it from the door.",
    "zh-TW": "{name} 在你的大地上留了言，可以在門那裡收下。",
    ja: "{name} があなたの大地にメモを残しました。扉から残せます。",
  },
  moreTomorrow: {
    en: "{n} more from them wait until tomorrow.",
    "zh-TW": "他們另有 {n} 則要等到明天。",
    ja: "残り {n} 件は明日まで待ちます。",
  },
} as const satisfies Record<string, Phrase>;
