// The Worlds library (title → Worlds): My worlds (one list of worlds), Join a world, and the words
// they share. Plain words for anyone: a world, a join code, a friend; the machinery (versions,
// seeds, files, names) is folded behind 更多 and keeps its `title.*` / `bundle.*` keys.

import type { Phrase } from "./phrase";

export const LIBRARY = {
  heading: { en: "Worlds", "zh-TW": "世界", ja: "ワールド" },
  sections: { en: "Library sections", "zh-TW": "收藏分類", ja: "ライブラリの分類" },
  backToTitle: { en: "← Title", "zh-TW": "← 標題畫面", ja: "← タイトル" },

  // ── Sections (the nav on the left) ─────────────────────────────────────────────────────────
  sectionMine: { en: "My worlds", "zh-TW": "我的世界", ja: "マイワールド" },
  sectionArchive: { en: "Archive", "zh-TW": "封存", ja: "アーカイブ" },
  sectionMarket: { en: "Market", "zh-TW": "市場", ja: "マーケット" },

  // ── Folding ────────────────────────────────────────────────────────────────────────────────
  more: { en: "More", "zh-TW": "更多", ja: "もっと" },
  less: { en: "Less", "zh-TW": "收起", ja: "閉じる" },

  // ── My worlds ──────────────────────────────────────────────────────────────────────────────
  mineIntro: {
    en: "Press Resume to go back to a world, or start a new adventure.",
    "zh-TW": "按「繼續」回到你的世界，或開始新的冒險。",
    ja: "「再開」でワールドに戻るか、新しい冒険をはじめましょう。",
  },
  readingSaves: {
    en: "Reading your worlds…",
    "zh-TW": "正在讀取你的世界…",
    ja: "ワールドを読み込み中…",
  },
  newAdventure: {
    en: "Start a new adventure",
    "zh-TW": "開始新的冒險",
    ja: "新しい冒険をはじめる",
  },
  numbered: {
    en: "{name} (no. {n})",
    "zh-TW": "{name}（第 {n} 個）",
    ja: "{name}（{n} つ目）",
  },
  needsUpdate: {
    en: "Needs a newer version of this app",
    "zh-TW": "要更新這個 App 才能玩",
    ja: "このアプリの更新が必要です",
  },
  lastPlayed: {
    en: "Last played {date}",
    "zh-TW": "上次遊玩：{date}",
    ja: "最後に遊んだ日：{date}",
  },
  aboutWorld: { en: "About this world", "zh-TW": "關於這個世界", ja: "このワールドについて" },
  versionsHeading: {
    en: "Start it from the beginning",
    "zh-TW": "從頭開始玩",
    ja: "最初から遊ぶ",
  },
  versionRow: { en: "Version {version}", "zh-TW": "版本 {version}", ja: "バージョン {version}" },
  draftRow: { en: "Draft: {name}", "zh-TW": "草稿：{name}", ja: "下書き：{name}" },
  listMore: {
    en: "More: restore a backup, import a world",
    "zh-TW": "更多：還原備份、匯入世界",
    ja: "もっと：バックアップから復元、ワールドを読み込む",
  },
  orphanDrafts: {
    en: "Drafts of worlds no longer here",
    "zh-TW": "已不在這裡的世界的草稿",
    ja: "もうないワールドの下書き",
  },

  // ── Inviting friends (a world's 更多) ──────────────────────────────────────────────────────
  inviteFriends: { en: "Invite friends", "zh-TW": "邀請朋友", ja: "友だちを招待" },
  inviteOpened: {
    en: "Friends can join your world with the join code {code}.",
    "zh-TW": "朋友可以用加入碼 {code} 加入你的世界。",
    ja: "友だちは参加コード {code} であなたのワールドに参加できます。",
  },
  inviteShared: {
    en: "This world is already shared with friends. To invite more: walk to your door at home, press E, open “Advanced” and make an invite link.",
    "zh-TW": "這個世界已經和朋友共享。想再邀請朋友：走到家門按 E，打開「進階」，建立邀請連結。",
    ja: "このワールドはもう友だちと共有しています。さらに招待するには、家の扉で E を押し、「詳細」を開いて招待リンクを作ってください。",
  },

  // ── Join a world ───────────────────────────────────────────────────────────────────────────
  joinButton: { en: "Join", "zh-TW": "加入", ja: "参加する" },
  kindCode: {
    en: "This is a friend's join code.",
    "zh-TW": "這是朋友的加入碼。",
    ja: "友だちの参加コードです。",
  },
  kindName: { en: "This is an ENS name.", "zh-TW": "這是 ENS 名稱。", ja: "ENS 名です。" },
  kindInvite: {
    en: "This is an invite link.",
    "zh-TW": "這是邀請連結。",
    ja: "招待リンクです。",
  },
  kindUnknown: {
    en: "A join code is {n} letters and digits. An ENS name has a dot in it (like friend.unmapped.eth). An invite link starts with unmapped://.",
    "zh-TW":
      "加入碼是 {n} 個英文字母或數字。ENS 名稱中間有一個點（例如 friend.unmapped.eth）。邀請連結以 unmapped:// 開頭。",
    ja: "参加コードは英数字 {n} 文字です。ENS 名にはドットが入ります（例：friend.unmapped.eth）。招待リンクは unmapped:// で始まります。",
  },
  nameChecking: {
    en: "Looking up this name…",
    "zh-TW": "正在查詢這個名稱…",
    ja: "この名前を調べています…",
  },
  opening: {
    en: "Opening your world…",
    "zh-TW": "正在打開你的世界…",
    ja: "ワールドを開いています…",
  },
  bringing: { en: "Bringing: {name}", "zh-TW": "帶著：{name}", ja: "連れていく：{name}" },
  bringChange: { en: "Change", "zh-TW": "更換", ja: "変更" },
  bringNew: { en: "a new land", "zh-TW": "一片新的大地", ja: "新しい大地" },
  bringPick: {
    en: "Which of your worlds will you bring?",
    "zh-TW": "要帶哪一個世界去？",
    ja: "どのワールドを連れていきますか？",
  },
  bringNote: {
    en: "Your world walks over to your friend's; it keeps its own land and progress.",
    "zh-TW": "你的世界會走到朋友的世界旁邊，你的大地和進度都保留。",
    ja: "あなたのワールドが友だちのワールドの隣に行きます。大地も進み具合もそのままです。",
  },
  ensWorld: {
    en: "This name is a world: {name}",
    "zh-TW": "這個名稱是一個世界：{name}",
    ja: "この名前はワールドです：{name}",
  },
  playThisWorld: { en: "Play this world", "zh-TW": "開始玩這個世界", ja: "このワールドで遊ぶ" },
  ensWorldMissing: {
    en: "You don't have this world yet. Ask your friend for its .cartridge file, then import it here.",
    "zh-TW": "你還沒有這個世界。請朋友把它的 .cartridge 檔傳給你，再從這裡匯入。",
    ja: "このワールドはまだありません。友だちに .cartridge ファイルをもらい、ここから読み込んでください。",
  },
  joinMore: {
    en: "More: join from a .world file",
    "zh-TW": "更多：從 .world 檔加入",
    ja: "もっと：.world ファイルから参加",
  },
} as const satisfies Record<string, Phrase>;
