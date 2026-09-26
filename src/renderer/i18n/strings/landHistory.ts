// The land on its world's history (rev 6 phase 3, WP5): what opening a save did to its world, and
// the land's own history lines in the HUD.

import type { Phrase } from "./phrase";

export const LAND_HISTORY = {
  // ── Opening a save (world.ensure) ─────────────────────────────────────────────────────────
  reading: {
    en: "Reading this world's history…",
    "zh-TW": "正在讀取這個世界的歷史…",
    ja: "この世界の歴史を読み込んでいます…",
  },
  migrated: {
    en: "This save's land now lives in its world's history ({n} {n|entry|entries}).",
    "zh-TW": "這個存檔的土地已移入世界的歷史（{n} 筆）。",
    ja: "このセーブの土地は世界の歴史に移りました（{n} 件）。",
  },
  caughtUp: {
    en: "An older build changed this save: {n} {n|thing|things} added to its world.",
    "zh-TW": "較舊的版本改動過這個存檔：世界補上了 {n} 項。",
    ja: "古いビルドがこのセーブを変更していました：世界に {n} 件を追加しました。",
  },
  skipped: {
    en: "{n} {n|thing stays|things stay} on this device only and {n|is|are} not in the shared history.",
    "zh-TW": "有 {n} 項只留在這台裝置上，沒有進入共享的歷史。",
    ja: "{n} 件はこの端末だけに残り、共有の歴史には入っていません。",
  },
  adjusted: {
    en: "{n} {n|thing was|things were} adjusted on the way in (a place moved, a note's link dropped).",
    "zh-TW": "移入時調整了 {n} 項（地點挪位、手記的連結失效等）。",
    ja: "移行時に {n} 件を調整しました（場所の移動、手記のリンク切れなど）。",
  },
  adopted: {
    en: "This world was made on another device; this device now keeps its own copy of it.",
    "zh-TW": "這個世界是在另一台裝置上建立的；現在這台裝置保有它自己的一份。",
    ja: "この世界は別の端末で作られました。この端末は自分の写しを持つようになりました。",
  },
  lost: {
    en: "{n} {n|progress entry|progress entries} could not be carried over to this device's copy.",
    "zh-TW": "有 {n} 筆進度無法帶到這台裝置的副本。",
    ja: "{n} 件の進行状況をこの端末の写しに引き継げませんでした。",
  },
  // ── The HUD's land line ───────────────────────────────────────────────────────────────────
  legacyOnly: {
    en: "Kept on this device only — not in the world's shared history.",
    "zh-TW": "只存在這台裝置 — 不在世界共享的歷史中。",
    ja: "この端末だけに保存 — 世界の共有の歴史にはありません。",
  },
  provisional: {
    en: "Not shared yet — waiting for the world's service.",
    "zh-TW": "尚未分享 — 等待世界服務。",
    ja: "未共有 — 世界サービスを待っています。",
  },
  writingElsewhere: {
    en: "Someone else is writing this place…",
    "zh-TW": "有人正在寫下這個地方…",
    ja: "誰かがこの場所を書いています…",
  },
} satisfies Record<string, Phrase>;
