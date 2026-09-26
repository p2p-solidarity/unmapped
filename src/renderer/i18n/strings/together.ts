// Playing together (rev 6 phase 3, D12, D16, D17; simplify-together): watching a place being
// written, emotes, the notes visiting friends leave, inviting friends and joining a friend's world
// (the door and F12 → Friends), the friends online, and the chat box.

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

  // ── Invite friends (the door and F12) ─────────────────────────────────────────────────────
  invite: { en: "Invite friends", "zh-TW": "邀請朋友", ja: "友だちを招待" },
  inviteHint: {
    en: "Press it, then tell your friend the name or code that appears.",
    "zh-TW": "按下後，把畫面上出現的名稱或加入碼告訴朋友。",
    ja: "押したら、表示される名前か参加コードを友だちに伝えてください。",
  },
  inviteNoLand: {
    en: "Step out onto this world's land first, then you can invite friends.",
    "zh-TW": "先走到這個世界的大地上，才能邀請朋友。",
    ja: "まずこのワールドの大地に出ると、友だちを招待できます。",
  },
  inviteShared: {
    en: "This world is already shared with friends. To invite more: walk to your door at home, press E, open “Advanced” and make an invite link.",
    "zh-TW": "這個世界已經和朋友共享。想再邀請朋友：走到家門按 E，打開「進階」，建立邀請連結。",
    ja: "このワールドはもう友だちと共有しています。さらに招待するには、家の扉で E を押し、「詳細」を開いて招待リンクを作ってください。",
  },
  inviteSharedHere: {
    en: "This world is already shared with friends. To invite more: open “Advanced” below and make an invite link.",
    "zh-TW": "這個世界已經和朋友共享。想再邀請朋友：打開下面的「進階」，建立邀請連結。",
    ja: "このワールドはもう友だちと共有しています。さらに招待するには、下の「詳細」を開いて招待リンクを作ってください。",
  },
  tellFriend: {
    en: "Tell your friend this:",
    "zh-TW": "把這個告訴朋友：",
    ja: "これを友だちに伝えてください：",
  },
  tellMoreFriends: {
    en: "You are in a friend's world. Other friends can join with this code:",
    "zh-TW": "你正在朋友的世界裡。其他朋友也可以用這個加入碼加入：",
    ja: "友だちのワールドにいます。ほかの友だちもこの参加コードで参加できます：",
  },
  ensName: { en: "ENS name", "zh-TW": "ENS 名稱", ja: "ENS 名" },
  joinCode: { en: "Join code", "zh-TW": "加入碼", ja: "参加コード" },
  copy: { en: "Copy", "zh-TW": "複製", ja: "コピー" },
  copied: { en: "Copied.", "zh-TW": "已複製。", ja: "コピーしました。" },
  copyFailed: {
    en: "Could not copy it. Write it down instead.",
    "zh-TW": "無法複製，請直接抄下來。",
    ja: "コピーできませんでした。書き写してください。",
  },
  inviteConnecting: { en: "Opening…", "zh-TW": "正在開放…", ja: "開いています…" },
  inviteWaiting: {
    en: "Open · waiting for friends",
    "zh-TW": "已開放 · 等朋友加入",
    ja: "開いています · 友だちを待っています",
  },
  inviteLive: {
    en: "Open · {n} {n|friend|friends} here",
    "zh-TW": "已開放 · {n} 位朋友在這裡",
    ja: "開いています · 友だち {n} 人",
  },
  friendsHere: {
    en: "{n} {n|friend|friends} here",
    "zh-TW": "{n} 位朋友在這裡",
    ja: "友だち {n} 人",
  },
  friendWaiting: {
    en: "Waiting for your friend…",
    "zh-TW": "等朋友上線中…",
    ja: "友だちを待っています…",
  },
  inviteClose: { en: "Close", "zh-TW": "關閉", ja: "閉じる" },
  leaveFriend: { en: "Leave", "zh-TW": "離開", ja: "離れる" },

  // ── Join a world (the door and F12) ───────────────────────────────────────────────────────
  joinTitle: { en: "Join a world", "zh-TW": "加入世界", ja: "ワールドに参加" },
  joinField: {
    en: "Friend's ENS name or join code",
    "zh-TW": "朋友的 ENS 名稱或加入碼",
    ja: "友だちの ENS 名または参加コード",
  },
  join: { en: "Join", "zh-TW": "加入", ja: "参加" },
  joinLooking: { en: "Looking it up…", "zh-TW": "正在查詢…", ja: "調べています…" },
  joined: {
    en: "You joined your friend's world.",
    "zh-TW": "已加入朋友的世界。",
    ja: "友だちのワールドに参加しました。",
  },

  // ── F12 → Friends ─────────────────────────────────────────────────────────────────────────
  bringFriends: { en: "Bring friends in", "zh-TW": "拉朋友進來", ja: "友だちを呼ぶ" },
  friendsOnline: { en: "Friends online", "zh-TW": "在線的朋友", ja: "オンラインの友だち" },
  friendsNone: {
    en: "No friends online yet.",
    "zh-TW": "還沒有朋友在線",
    ja: "まだオンラインの友だちはいません。",
  },
  friendPlace: {
    en: "Position {x}, {z} · {n} {n|step|steps} from you",
    "zh-TW": "位置 {x}, {z} · 距離你 {n} 步",
    ja: "位置 {x}, {z} · あなたから {n} 歩",
  },
  friendPosition: { en: "Position {x}, {z}", "zh-TW": "位置 {x}, {z}", ja: "位置 {x}, {z}" },
  friendOnLand: {
    en: "On {owner}'s land",
    "zh-TW": "在 {owner} 的土地上",
    ja: "{owner} の土地にいます",
  },
  friendOnYours: { en: "On your land", "zh-TW": "在你的土地上", ja: "あなたの土地にいます" },
  friendInWorld: { en: "In this world", "zh-TW": "在這個世界裡", ja: "このワールドにいます" },

  // ── Chat ──────────────────────────────────────────────────────────────────────────────────
  chat: { en: "Chat", "zh-TW": "聊天", ja: "チャット" },
  chatHint: { en: "Press Enter to talk", "zh-TW": "按 Enter 說話", ja: "Enter で話す" },
  chatPlaceholder: {
    en: "Say something to your friends…",
    "zh-TW": "對朋友說點什麼…",
    ja: "友だちに話しかける…",
  },
  chatKeys: {
    en: "Enter to send · Esc to close",
    "zh-TW": "Enter 送出 · Esc 關閉",
    ja: "Enter で送信 · Esc で閉じる",
  },
  chatYou: { en: "You", "zh-TW": "你", ja: "あなた" },
  chatFriend: { en: "Friend", "zh-TW": "朋友", ja: "友だち" },
} as const satisfies Record<string, Phrase>;
