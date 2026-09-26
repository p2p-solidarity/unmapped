// Errors of the land on its world's history (rev 6 phase 3, WP5): claims, writing into the
// history, the frozen legacy land and the player's own progress. English words stay at their
// source; these are what the screen shows.

import type { ErrorText } from "./errors";

const RELOAD = {
  en: "Reload the world; nothing was saved.",
  "zh-TW": "請重新載入這個世界；這次沒有存檔。",
  ja: "ワールドを読み込み直してください。今回は保存されていません。",
};

const INVITE = {
  en: "Ask the world's owner for an invite; walking and reading still work.",
  "zh-TW": "請向世界的主人要一份邀請；走動與閱讀仍然可以。",
  ja: "ワールドの持ち主に招待をもらってください。歩くことと読むことはできます。",
};

export const LAND_HISTORY_ERRORS: Record<string, ErrorText> = {
  "claim-refused": {
    message: {
      en: "Only invited friends write in this world.",
      "zh-TW": "只有受邀的朋友能在這個世界寫下新的內容。",
      ja: "このワールドに書けるのは、招待された友だちだけです。",
    },
    hint: INVITE,
  },
  "world-read-only": {
    message: {
      en: "This device reads this world but does not write it.",
      "zh-TW": "這台裝置能讀這個世界，但不能寫入。",
      ja: "この端末はこのワールドを読めますが、書き込めません。",
    },
    hint: INVITE,
  },
  "world-loading": {
    message: {
      en: "Reading this world's history…",
      "zh-TW": "正在讀取這個世界的歷史…",
      ja: "このワールドの歴史を読み込んでいます…",
    },
    hint: { en: "One moment.", "zh-TW": "請稍候。", ja: "少々お待ちください。" },
  },
  "world-not-open": {
    message: {
      en: "This world is not open.",
      "zh-TW": "這個世界尚未開啟。",
      ja: "このワールドは開かれていません。",
    },
    hint: {
      en: "Open it from Worlds → My worlds.",
      "zh-TW": "請到「世界 → 我的世界」開啟它。",
      ja: "「ワールド → マイワールド」から開いてください。",
    },
  },
  "legacy-land-changed": {
    message: {
      en: "This save's land now lives in its world's history; its old copy cannot change.",
      "zh-TW": "這個存檔的土地已移入世界的歷史；舊的那份不能再改動。",
      ja: "このセーブの土地は世界の歴史に移りました。古い写しは変更できません。",
    },
    hint: RELOAD,
  },
  "karma-not-append-only": {
    message: {
      en: "The ledger may only grow; this save would have lost lines.",
      "zh-TW": "紀錄只能增加；這次存檔會讓舊的紀錄消失。",
      ja: "記録は増えるだけです。この保存では過去の行が失われるところでした。",
    },
    hint: RELOAD,
  },
  "progress-world-mismatch": {
    message: {
      en: "That progress belongs to another world than this save's.",
      "zh-TW": "這份進度屬於另一個世界，不是這個存檔的。",
      ja: "その進行状況はこのセーブとは別のワールドのものです。",
    },
    hint: RELOAD,
  },
  "progress-no-world": {
    message: {
      en: "This save has no world history yet, so it keeps no world progress.",
      "zh-TW": "這個存檔還沒有世界的歷史，所以沒有世界進度。",
      ja: "このセーブにはまだワールドの歴史がないため、ワールドの進行状況はありません。",
    },
    hint: {
      en: "Play it once; its history is made then.",
      "zh-TW": "玩一次，它的歷史就會建立。",
      ja: "一度遊ぶと、歴史が作られます。",
    },
  },
  "chapter-told": {
    message: {
      en: "This chapter was told another way and is not played in the game.",
      "zh-TW": "這一章以別的方式講述過，不在遊戲中遊玩。",
      ja: "この章は別の形で語られたため、ゲーム内では遊べません。",
    },
  },
  "chapter-not-arrived": {
    message: {
      en: "Someone wrote this chapter, but it has not arrived yet.",
      "zh-TW": "有人寫好了這一章，但還沒傳到這裡。",
      ja: "誰かがこの章を書きましたが、まだ届いていません。",
    },
    hint: {
      en: "Retry in a moment.",
      "zh-TW": "請稍後再試。",
      ja: "少ししてから再試行してください。",
    },
  },
  "more-not-arrived": {
    message: {
      en: "Someone wrote the next chapter, but it has not arrived yet.",
      "zh-TW": "有人寫好了下一章，但還沒傳到這裡。",
      ja: "誰かが次の章を書きましたが、まだ届いていません。",
    },
  },
  "work-received": {
    message: {
      en: "That AI world arrived with someone else's world; it is not this device's to place.",
      "zh-TW": "這個 AI 世界是隨別人的世界一起來的，不能由這台裝置放置。",
      ja: "その AI ワールドは他の人のワールドと一緒に届いたもので、この端末から置くことはできません。",
    },
    hint: {
      en: "Place one of your own AI worlds, or write a new one in the workshop.",
      "zh-TW": "請放置你自己的 AI 世界，或在工坊寫一個新的。",
      ja: "自分の AI ワールドを置くか、工房で新しく書いてください。",
    },
  },
  "backup-history-diverged": {
    message: {
      en: "This device already holds another history of this world; both are kept.",
      "zh-TW": "這台裝置已有這個世界的另一段歷史；兩份都保留了。",
      ja: "この端末にはこの世界の別の歴史がすでにあります。両方とも残しました。",
    },
    hint: {
      en: "The backup's copy is kept aside as restored-<time>.jsonl; nothing was merged.",
      "zh-TW": "備份裡的那份另存為 restored-<時間>.jsonl，沒有合併。",
      ja: "バックアップ側の写しは restored-<時刻>.jsonl として別に残しました。統合はしていません。",
    },
  },
};
