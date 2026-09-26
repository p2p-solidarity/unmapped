// The browser proof's shell (rev 6 phase 4, D7; renderer/mobile): join a shared world from an
// invite, walk its land, read what its history holds, leave a note where you stand, see sync and
// storage. Pad glyphs (A, Y) are
// printed on the controls and stay as they are; only the verbs are translated.

import type { Phrase } from "./phrase";

export const MOBILE = {
  // ── Joining ────────────────────────────────────────────────────────────────────────────────
  joinTitle: { en: "Join a world", "zh-TW": "加入一個世界", ja: "ワールドに参加する" },
  joinLead: {
    en: "Paste the invite link a friend sent you. Each link lets one device in.",
    "zh-TW": "貼上朋友傳給你的邀請連結。一個連結讓一台裝置加入。",
    ja: "友だちから届いた招待リンクを貼り付けてください。1 つのリンクで 1 台の端末が参加できます。",
  },
  inviteLabel: { en: "Invite link", "zh-TW": "邀請連結", ja: "招待リンク" },
  nameLabel: {
    en: "Your name in this world",
    "zh-TW": "你在這個世界的名字",
    ja: "このワールドでの名前",
  },
  joinAction: { en: "Join", "zh-TW": "加入", ja: "参加する" },
  joining: {
    en: "Checking the invite and the world's history…",
    "zh-TW": "正在確認邀請與世界的歷史…",
    ja: "招待とワールドの歴史を確かめています…",
  },
  joinAnother: { en: "Join another world", "zh-TW": "加入另一個世界", ja: "別のワールドに参加" },
  worldsTitle: {
    en: "Worlds on this browser",
    "zh-TW": "這個瀏覽器裡的世界",
    ja: "このブラウザのワールド",
  },

  // ── The land ───────────────────────────────────────────────────────────────────────────────
  openWorld: { en: "World", "zh-TW": "世界", ja: "ワールド" },
  backToLand: { en: "Back to the land", "zh-TW": "回到大地", ja: "大地に戻る" },
  landTitle: { en: "The land", "zh-TW": "大地", ja: "大地" },
  landMissing: {
    en: "The land is not drawn on this device. Reading and leaving notes still work below.",
    "zh-TW": "這台裝置上畫不出大地。下面仍然可以閱讀和留言。",
    ja: "この端末では大地を描けません。下で読むこととメモを残すことはできます。",
  },
  landHint: {
    en: "Stick: walk · Y: this world and its notes",
    "zh-TW": "搖桿：走動 · Y：這個世界和它的留言",
    ja: "スティック：歩く · Y：このワールドとメモ",
  },
  landLoading: {
    en: "Unpacking this world's land…",
    "zh-TW": "正在展開這個世界的大地…",
    ja: "このワールドの大地を広げています…",
  },
  positionUnkept: {
    en: "Where you stand was not kept on this device: {reason}",
    "zh-TW": "沒能在這台裝置上記下你站的位置：{reason}",
    ja: "立っている場所をこの端末に残せませんでした：{reason}",
  },

  // ── The world ──────────────────────────────────────────────────────────────────────────────
  madeBy: { en: "Made by {name}", "zh-TW": "由 {name} 建立", ja: "{name} がつくった世界" },
  someone: { en: "someone", "zh-TW": "某人", ja: "だれか" },
  role_owner: { en: "You own it", "zh-TW": "你是主人", ja: "あなたが持ち主" },
  role_member: { en: "You are a member", "zh-TW": "你是成員", ja: "メンバーです" },
  role_visitor: { en: "You are visiting", "zh-TW": "你是訪客", ja: "訪問中" },
  role_removed: {
    en: "The owner removed this device",
    "zh-TW": "主人已移除這台裝置",
    ja: "持ち主がこの端末を外しました",
  },
  link_local: { en: "Only on this device", "zh-TW": "只在這台裝置上", ja: "この端末だけ" },
  link_offline: {
    en: "Offline — what you write waits here",
    "zh-TW": "離線中——你寫的東西先留在這裡",
    ja: "オフライン — 書いたものはここで待ちます",
  },
  link_connecting: { en: "Connecting…", "zh-TW": "連線中…", ja: "接続中…" },
  link_online: { en: "Online", "zh-TW": "已連線", ja: "オンライン" },
  link_diverged: {
    en: "Stopped: this history differs from the service's",
    "zh-TW": "已停止：這份歷史和服務上的不同",
    ja: "停止中：この歴史はサービスのものと違います",
  },
  link_refused: {
    en: "The service refused this device",
    "zh-TW": "服務拒絕了這台裝置",
    ja: "サービスがこの端末を拒否しました",
  },
  syncLine: {
    en: "Entry {n} · {pending} waiting to send · {refused} refused",
    "zh-TW": "第 {n} 筆 · {pending} 則待送出 · {refused} 則被拒",
    ja: "{n} 件目 · 送信待ち {pending} · 拒否 {refused}",
  },
  historyMissing: {
    en: "This world's history is not on this device yet. It arrives once the service is reached.",
    "zh-TW": "這個世界的歷史還不在這台裝置上，連上服務後就會送達。",
    ja: "このワールドの歴史はまだこの端末にありません。サービスにつながると届きます。",
  },
  newer: {
    en: "{n} entries come from a newer build and are skipped here.",
    "zh-TW": "有 {n} 筆來自較新的版本，這裡先略過。",
    ja: "{n} 件は新しいビルドのもので、ここでは飛ばします。",
  },

  // ── What the history holds ─────────────────────────────────────────────────────────────────
  witnessedTitle: { en: "Places witnessed", "zh-TW": "被見證的地方", ja: "見届けられた場所" },
  witnessedEmpty: {
    en: "Nobody has witnessed a place here yet.",
    "zh-TW": "這裡還沒有人見證過任何地方。",
    ja: "まだだれもここで場所を見届けていません。",
  },
  fogged: { en: "returned to fog", "zh-TW": "已回到霧中", ja: "霧に還った" },
  placesTitle: { en: "Places to enter", "zh-TW": "可以進入的地方", ja: "入れる場所" },
  placesEmpty: {
    en: "No one has built a place here yet.",
    "zh-TW": "這裡還沒有人建造地方。",
    ja: "まだだれも場所をつくっていません。",
  },
  place_side: { en: "a climb", "zh-TW": "攀登", ja: "登る場所" },
  place_dungeon: { en: "a maze", "zh-TW": "迷宮", ja: "迷宮" },
  place_otherworld: { en: "an otherworld", "zh-TW": "異界", ja: "異界" },
  notesTitle: { en: "Notes", "zh-TW": "留言", ja: "メモ" },
  notesEmpty: { en: "No notes yet.", "zh-TW": "還沒有留言。", ja: "まだメモはありません。" },
  signpostsTitle: { en: "Signposts", "zh-TW": "路標", ja: "道しるべ" },
  signpostsEmpty: {
    en: "No signposts yet.",
    "zh-TW": "還沒有路標。",
    ja: "まだ道しるべはありません。",
  },
  chunkAt: { en: "at {cx}, {cz}", "zh-TW": "位於 {cx}, {cz}", ja: "{cx}, {cz}" },
  byName: { en: "— {name}", "zh-TW": "——{name}", ja: "— {name}" },
  notShared: { en: "not yet shared", "zh-TW": "尚未分享", ja: "まだ共有されていません" },
  toward: { en: "toward {cx}, {cz}", "zh-TW": "指向 {cx}, {cz}", ja: "{cx}, {cz} の方へ" },

  // ── Leaving a note ─────────────────────────────────────────────────────────────────────────
  noteTitle: { en: "Leave a note", "zh-TW": "留下一則留言", ja: "メモを残す" },
  noteLabel: { en: "Your note", "zh-TW": "你的留言", ja: "メモ" },
  noteHere: {
    en: "Left where you stand: {cx}, {cz} · tile {x}, {z}",
    "zh-TW": "留在你站的地方：{cx}, {cz} · 第 {x}, {z} 格",
    ja: "いま立っている所に残します：{cx}, {cz} · マス {x}, {z}",
  },
  noteNoLand: {
    en: "A note is left where you stand on the land, and the land is not drawn here yet.",
    "zh-TW": "留言會留在你在大地上站的地方，但這裡還沒畫出大地。",
    ja: "メモは大地の上で立っている所に残します。ここにはまだ大地が描かれていません。",
  },
  noteCount: { en: "{n} / {max}", "zh-TW": "{n} / {max}", ja: "{n} / {max}" },
  noteSend: { en: "Leave the note", "zh-TW": "留下留言", ja: "メモを残す" },
  noteSent: {
    en: "Left here. Friends see it once the service takes it.",
    "zh-TW": "已留下。服務收到後，朋友就看得到。",
    ja: "残しました。サービスが受け取ると友だちにも見えます。",
  },
  readOnly: {
    en: "You can read this world, but not write in it.",
    "zh-TW": "你可以閱讀這個世界，但不能在裡面寫東西。",
    ja: "このワールドは読めますが、書き込めません。",
  },

  // ── Refused ────────────────────────────────────────────────────────────────────────────────
  refusedTitle: {
    en: "The world refused these",
    "zh-TW": "世界拒收了這些",
    ja: "ワールドが受け取らなかったもの",
  },
  dismiss: { en: "Dismiss", "zh-TW": "知道了", ja: "閉じる" },

  // ── Storage ────────────────────────────────────────────────────────────────────────────────
  storageTitle: { en: "On this device", "zh-TW": "這台裝置上", ja: "この端末" },
  storageUse: {
    en: "{used} kept of {quota} the browser allows",
    "zh-TW": "已存 {used}，瀏覽器允許 {quota}",
    ja: "保存 {used} / ブラウザの上限 {quota}",
  },
  storageUnknown: {
    en: "This browser does not say how much it keeps.",
    "zh-TW": "這個瀏覽器沒有說明它保存了多少。",
    ja: "このブラウザは保存量を教えてくれません。",
  },
  storageSafe: {
    en: "The browser promised to keep it when space runs low.",
    "zh-TW": "瀏覽器答應空間不足時也會保留。",
    ja: "空きが少なくなってもブラウザは消さないと約束しました。",
  },
  storageUnsafe: {
    en: "The browser may clear it when space runs low.",
    "zh-TW": "空間不足時，瀏覽器可能會清掉它。",
    ja: "空きが少なくなるとブラウザが消すかもしれません。",
  },
  storageRisk: {
    en: "If this site's data is cleared, this browser starts over as a new device: what it shared stays in the world; notes not yet sent are lost.",
    "zh-TW":
      "如果清除了這個網站的資料，這個瀏覽器會變成一台新裝置：已分享的內容留在世界裡，尚未送出的留言會遺失。",
    ja: "このサイトのデータが消えると、このブラウザは新しい端末になります。共有したものはワールドに残り、未送信のメモは失われます。",
  },
} satisfies Record<string, Phrase>;
