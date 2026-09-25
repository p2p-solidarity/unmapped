import type { Phrase } from "./phrase";

export const CREATE_STORY = {
  mapLabel: { en: "Chapter map", "zh-TW": "章節地圖", ja: "章のマップ" },
  mapHome: { en: "Start", "zh-TW": "起點", ja: "スタート" },
  storyReview: { en: "Review the story", "zh-TW": "審查故事", ja: "ストーリーを確認" },
  storyReviewNote: {
    en: "Edit a chapter, rewrite one, or add a chapter between its neighbours. Locked chapters stay untouched when you revise the whole story.",
    "zh-TW": "可修改或重寫單一章節，也可在章節之間插入新章。修改整個故事時，鎖定的章節不會變動。",
    ja: "章を編集・書き直したり、間に追加できます。ストーリー全体を直すとき、ロックした章は変わりません。",
  },
  logline: { en: "Story in one line", "zh-TW": "一句話故事", ja: "一行のあらすじ" },
  chapterTitle: { en: "Chapter title", "zh-TW": "章節標題", ja: "章の題名" },
  chapterWhere: { en: "Place", "zh-TW": "地點", ja: "場所" },
  chapterBrief: {
    en: "What happens and how it ends",
    "zh-TW": "發生什麼事、如何結束",
    ja: "何が起き、どう終わるか",
  },
  chapterN: { en: "Chapter {n}", "zh-TW": "第 {n} 章", ja: "第{n}章" },
  kindMeet: { en: "Meet", "zh-TW": "相遇", ja: "出会い" },
  kindSearch: { en: "Search", "zh-TW": "搜尋", ja: "探索" },
  kindFight: { en: "Fight", "zh-TW": "戰鬥", ja: "戦闘" },
  kindClimb: { en: "Climb", "zh-TW": "攀登", ja: "クライム" },
  kindMaze: { en: "Maze", "zh-TW": "迷宮", ja: "迷宮" },
  chapterNote: {
    en: "Note for this chapter (optional)",
    "zh-TW": "給這章的備註（選填）",
    ja: "この章への指示（任意）",
  },
  rewriteChapter: { en: "Rewrite chapter", "zh-TW": "重寫這章", ja: "章を書き直す" },
  insertChapter: { en: "Write a chapter here", "zh-TW": "在此撰寫新章", ja: "ここに章を書く" },
  removeChapter: { en: "Remove chapter", "zh-TW": "移除章節", ja: "章を削除" },
  lockChapter: { en: "Lock", "zh-TW": "鎖定", ja: "ロック" },
  unlockChapter: { en: "Unlock", "zh-TW": "解鎖", ja: "ロック解除" },
  storyNote: {
    en: "Note for the whole story",
    "zh-TW": "給整個故事的備註",
    ja: "ストーリー全体への指示",
  },
  rewriteUnlocked: {
    en: "Revise unlocked chapters",
    "zh-TW": "修改未鎖定的章節",
    ja: "ロックしていない章を書き直す",
  },
  storyStale: {
    en: "The idea or world changed. Update the story, or keep it if the language and play style still match.",
    "zh-TW": "構想或世界已變更。請更新故事；如果語言和玩法未變，也可以保留現有故事。",
    ja: "アイデアかワールドが変わりました。ストーリーを更新するか、言語と遊び方が同じなら現在の内容を残せます。",
  },
  updateStory: { en: "Write story again", "zh-TW": "重新撰寫故事", ja: "ストーリーを書き直す" },
  keepStory: { en: "Keep this story", "zh-TW": "保留這個故事", ja: "このストーリーを残す" },
  storyIncomplete: {
    en: "Finish all chapters before building. A story needs 3–8 complete chapters.",
    "zh-TW": "建立前請完成所有章節。故事需要 3–8 章完整內容。",
    ja: "作成前にすべての章を完成させてください。3〜8章が必要です。",
  },
  noUnlocked: {
    en: "Unlock a chapter to revise it.",
    "zh-TW": "先解鎖至少一章才能修改。",
    ja: "書き直す章のロックを解除してください。",
  },
  noFight: {
    en: "This play style has no fighting. Change fight chapters or choose a fighting style.",
    "zh-TW": "這個玩法沒有戰鬥。請修改戰鬥章節，或選擇戰鬥玩法。",
    ja: "この遊び方には戦闘がありません。戦闘の章を直すか、戦闘ありの遊び方を選んでください。",
  },
  kindUnknown: {
    en: "A chapter has a kind of play this game does not have. Pick meet, search, fight, climb or maze for it.",
    "zh-TW": "有章節的玩法種類是這個遊戲沒有的。請替它選擇相遇、搜尋、戰鬥、攀登或迷宮。",
    ja: "この遊びにない種類の章があります。出会い・探索・戦闘・クライム・迷宮から選んでください。",
  },
  gatesCaption: {
    en: "Where chapter gates will stand",
    "zh-TW": "章節入口的位置",
    ja: "章の入口の位置",
  },
} as const satisfies Record<string, Phrase>;
