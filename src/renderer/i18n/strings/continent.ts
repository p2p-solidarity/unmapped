// Playing with friends on one shared land (in code: a continent; players never see that word — they
// invite friends and join a world). The door's friends' worlds list, a friend's door card, and the
// HUD lines that say whose land the player stands on.

import type { Phrase } from "./phrase";

export const CONTINENT = {
  // ── The door at home ──────────────────────────────────────────────────────────────────────
  section: { en: "Friends' worlds", "zh-TW": "朋友的世界", ja: "友だちのワールド" },
  yourPlate: {
    en: "This world's join code: {code}",
    "zh-TW": "這個世界的加入碼：{code}",
    ja: "このワールドの参加コード：{code}",
  },
  noPlate: {
    en: "This world has no join code yet — open one of your worlds and step out onto its land first.",
    "zh-TW": "這個世界還沒有加入碼 — 請先開啟你的一個世界，走到它的大地上。",
    ja: "このワールドにはまだ参加コードがありません — まずワールドを開いて、その大地に出てください。",
  },
  openHint: {
    en: "Press it, then tell your friend the name or code that appears.",
    "zh-TW": "按下後，把畫面上出現的名稱或加入碼告訴朋友。",
    ja: "押したら、表示される名前か参加コードを友だちに伝えてください。",
  },
  openDoor: { en: "Invite friends", "zh-TW": "邀請朋友", ja: "友だちを招待" },
  walkThrough: { en: "Join", "zh-TW": "加入", ja: "参加" },
  resolvingName: {
    en: "Looking up the name…",
    "zh-TW": "正在查詢名稱…",
    ja: "名前を調べています…",
  },
  nameReading: {
    en: "Reading this world's ENS name…",
    "zh-TW": "正在讀取這個世界的 ENS 名稱…",
    ja: "このワールドの ENS 名を読み込んでいます…",
  },
  nameCarriesDoor: {
    en: "Friends can also join by its ENS name: {name}",
    "zh-TW": "朋友也可以用 ENS 名稱加入：{name}",
    ja: "友だちは ENS 名でも参加できます：{name}",
  },
  nameNeedsDoor: {
    en: "{name} does not carry this world's join code yet. Record it again in Worlds → My worlds to add it.",
    "zh-TW": "{name} 還沒有記上這個世界的加入碼。到「世界 → 我的世界」再記錄一次，就會加上。",
    ja: "{name} にはまだこのワールドの参加コードが載っていません。「ワールド → マイワールド」で記録し直すと加わります。",
  },
  code: {
    en: "Join code {code} — tell your friends.",
    "zh-TW": "加入碼 {code} — 告訴你的朋友。",
    ja: "参加コード {code} — 友だちに伝えてください。",
  },
  connecting: { en: "Connecting…", "zh-TW": "連線中…", ja: "接続中…" },
  live: {
    en: "Open · {n} {n|friend|friends} here",
    "zh-TW": "已開放 · {n} 位朋友在這裡",
    ja: "開いています · 友だち {n} 人",
  },
  others: { en: "Friends' worlds", "zh-TW": "朋友的世界", ja: "友だちのワールド" },
  noOthers: {
    en: "No friend has joined yet.",
    "zh-TW": "還沒有朋友加入。",
    ja: "まだ友だちは参加していません。",
  },
  worldLine: {
    en: "{owner} · {title}",
    "zh-TW": "{owner} · {title}",
    ja: "{owner} · {title}",
  },
  untitled: { en: "an untitled world", "zh-TW": "無名的世界", ja: "名もない世界" },
  online: { en: "here now", "zh-TW": "在線", ja: "オンライン" },
  offline: {
    en: "away — as they left it",
    "zh-TW": "離線 — 維持離開時的樣子",
    ja: "オフライン — 去ったときのまま",
  },
  goToDoor: { en: "Go to their door", "zh-TW": "前往他們的門", ja: "その扉へ行く" },
  leave: { en: "Leave", "zh-TW": "離開", ja: "離れる" },

  // ── A friend's door ───────────────────────────────────────────────────────────────────────
  doorOf: { en: "{owner}'s door", "zh-TW": "{owner} 的門", ja: "{owner} の扉" },
  shelf: { en: "On their shelf", "zh-TW": "他們架上的紀念品", ja: "棚に飾られた記念品" },
  shelfEmpty: {
    en: "Nothing on the shelf yet.",
    "zh-TW": "架子上還沒有東西。",
    ja: "棚にはまだ何もありません。",
  },
  dials: { en: "Their quick travel", "zh-TW": "他們的快速移動", ja: "その扉のクイック移動" },
  gone: {
    en: "That friend has left.",
    "zh-TW": "那位朋友已經離開了。",
    ja: "その友だちはもういません。",
  },

  // ── Where you stand ───────────────────────────────────────────────────────────────────────
  foreignLand: {
    en: "{owner}'s land · {title}",
    "zh-TW": "{owner} 的土地 · {title}",
    ja: "{owner} の土地 · {title}",
  },
  foreignUnwritten: {
    en: "Not yet seen — only {owner} can write it.",
    "zh-TW": "還沒有人見證 — 只有 {owner} 能書寫這裡。",
    ja: "まだ見届けられていません — ここを書けるのは {owner} だけです。",
  },
  hudConnecting: {
    en: "WITH FRIENDS · CODE {code} · CONNECTING…",
    "zh-TW": "和朋友一起 · 加入碼 {code} · 連線中…",
    ja: "友だちと · 参加コード {code} · 接続中…",
  },
  hudLive: {
    en: "WITH FRIENDS · CODE {code} · {n} {n|FRIEND|FRIENDS}",
    "zh-TW": "和朋友一起 · 加入碼 {code} · {n} 位朋友",
    ja: "友だちと · 参加コード {code} · {n} 人",
  },
  hudError: {
    en: "WITH FRIENDS · CODE {code} · {reason}",
    "zh-TW": "和朋友一起 · 加入碼 {code} · {reason}",
    ja: "友だちと · 参加コード {code} · {reason}",
  },
  peerRejected: {
    en: "A friend could not join: {reason}",
    "zh-TW": "有位朋友無法加入：{reason}",
    ja: "友だちが参加できませんでした：{reason}",
  },
} as const satisfies Record<string, Phrase>;
