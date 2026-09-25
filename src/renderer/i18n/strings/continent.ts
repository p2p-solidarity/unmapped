// A continent: several players' worlds merged onto one land. The door's continent section, a
// foreign world's door card, and the HUD lines that say whose land the player stands on.

import type { Phrase } from "./phrase";

export const CONTINENT = {
  // ── The door at home ──────────────────────────────────────────────────────────────────────
  section: { en: "Continent", "zh-TW": "大陸", ja: "大陸" },
  yourPlate: {
    en: "This world's door number: {code}",
    "zh-TW": "這個世界的門牌：{code}",
    ja: "この世界の扉番号：{code}",
  },
  noPlate: {
    en: "This world has no door number — open a saved world with open land first.",
    "zh-TW": "這個世界沒有門牌 — 請先開啟一個有開放大地的存檔。",
    ja: "この世界には扉番号がありません — まず開かれた大地のあるセーブを開いてください。",
  },
  openHint: {
    en: "Open your door and every friend who walks through brings their world onto one continent with yours.",
    "zh-TW": "敞開你的門，每位穿過它的夥伴都會把自己的世界帶來，與你的世界連成一片大陸。",
    ja: "扉を開くと、くぐってきた仲間がそれぞれの世界を持ち寄り、あなたの世界とひとつの大陸になります。",
  },
  openDoor: { en: "Open my door to friends", "zh-TW": "向夥伴敞開我的門", ja: "仲間に扉を開く" },
  walkThrough: { en: "Walk through", "zh-TW": "穿過這扇門", ja: "くぐる" },
  code: {
    en: "Continent {code} — share this door number with friends.",
    "zh-TW": "大陸 {code} — 把這個門牌分享給夥伴。",
    ja: "大陸 {code} — この扉番号を仲間に伝えてください。",
  },
  connecting: { en: "Connecting…", "zh-TW": "連線中…", ja: "接続中…" },
  live: {
    en: "Live · {n} {n|peer|peers} here",
    "zh-TW": "已連線 · 有 {n} 位夥伴在",
    ja: "つながっています · {n} 人がいます",
  },
  yourOffset: {
    en: "This world's offset: {cx} · {cz}",
    "zh-TW": "這個世界的偏移：{cx} · {cz}",
    ja: "この世界のオフセット：{cx} · {cz}",
  },
  offsetPending: {
    en: "This world's offset is not settled yet.",
    "zh-TW": "這個世界的偏移還沒確定。",
    ja: "この世界のオフセットはまだ決まっていません。",
  },
  others: { en: "Other worlds", "zh-TW": "其他世界", ja: "ほかの世界" },
  noOthers: {
    en: "No other world has walked through yet.",
    "zh-TW": "還沒有其他世界穿過這扇門。",
    ja: "まだほかの世界はくぐってきていません。",
  },
  worldLine: {
    en: "{owner} · {title} · {cx} · {cz}",
    "zh-TW": "{owner} · {title} · {cx} · {cz}",
    ja: "{owner} · {title} · {cx} · {cz}",
  },
  untitled: { en: "an untitled world", "zh-TW": "無名的世界", ja: "名もない世界" },
  online: { en: "online", "zh-TW": "在線", ja: "オンライン" },
  offline: {
    en: "offline — as they left it",
    "zh-TW": "離線 — 維持離開時的樣子",
    ja: "オフライン — 去ったときのまま",
  },
  goToDoor: { en: "Go to their door", "zh-TW": "前往他們的門", ja: "その扉へ行く" },
  leave: { en: "Leave the continent", "zh-TW": "離開大陸", ja: "大陸を離れる" },

  // ── Another world's door ──────────────────────────────────────────────────────────────────
  doorOf: { en: "{owner}'s door", "zh-TW": "{owner} 的門", ja: "{owner} の扉" },
  offset: { en: "Offset {cx} · {cz}", "zh-TW": "偏移 {cx} · {cz}", ja: "オフセット {cx} · {cz}" },
  shelf: { en: "On their shelf", "zh-TW": "他們架上的紀念品", ja: "棚に飾られた記念品" },
  shelfEmpty: {
    en: "Nothing on the shelf yet.",
    "zh-TW": "架子上還沒有東西。",
    ja: "棚にはまだ何もありません。",
  },
  dials: { en: "Their dials", "zh-TW": "他們的轉盤", ja: "その扉のダイヤル" },
  gone: {
    en: "That world has left the continent.",
    "zh-TW": "那個世界已經離開大陸了。",
    ja: "その世界はもう大陸を離れました。",
  },

  // ── Where you stand ───────────────────────────────────────────────────────────────────────
  foreignLand: {
    en: "{owner}'s land · {title}",
    "zh-TW": "{owner} 的大地 · {title}",
    ja: "{owner} の大地 · {title}",
  },
  foreignUnwritten: {
    en: "Not yet witnessed — only {owner} can write it.",
    "zh-TW": "尚未見證 — 只有 {owner} 能書寫這裡。",
    ja: "まだ見届けられていません — ここを書けるのは {owner} だけです。",
  },
  hudConnecting: {
    en: "CONTINENT {code} · CONNECTING…",
    "zh-TW": "大陸 {code} · 連線中…",
    ja: "大陸 {code} · 接続中…",
  },
  hudLive: {
    en: "CONTINENT {code} · LIVE · {n} {n|PEER|PEERS}",
    "zh-TW": "大陸 {code} · 已連線 · {n} 位夥伴",
    ja: "大陸 {code} · 接続済み · {n} 人",
  },
  hudError: {
    en: "CONTINENT {code} · {reason}",
    "zh-TW": "大陸 {code} · {reason}",
    ja: "大陸 {code} · {reason}",
  },
  peerRejected: {
    en: "A world could not join this continent: {reason}",
    "zh-TW": "有個世界無法加入這片大陸：{reason}",
    ja: "ある世界がこの大陸に加われませんでした：{reason}",
  },
} as const satisfies Record<string, Phrase>;
