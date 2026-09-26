// The land on its world's history (rev 6 phase 3, WP5): what opening a save did to its world, and
// the land's own lines in the HUD. Plain words: no "history", "entries" or "service" for players.

import type { Phrase } from "./phrase";

export const LAND_HISTORY = {
  // ── Opening a save (world.ensure) ─────────────────────────────────────────────────────────
  reading: {
    en: "Opening this world…",
    "zh-TW": "正在打開這個世界…",
    ja: "このワールドを開いています…",
  },
  migrated: {
    en: "This world was brought up to date, so friends can share it now ({n} {n|thing|things} kept).",
    "zh-TW": "這個世界已經更新好，現在可以和朋友一起玩了（保留了 {n} 項）。",
    ja: "このワールドを新しくしました。友だちと一緒に遊べます（{n} 件を引き継ぎ）。",
  },
  caughtUp: {
    en: "An older version of the game changed this world: {n} {n|thing was|things were} added.",
    "zh-TW": "舊版的遊戲改動過這個世界：補上了 {n} 項。",
    ja: "古いバージョンのゲームがこのワールドを変えていました：{n} 件を追加しました。",
  },
  skipped: {
    en: "{n} {n|thing stays|things stay} on this device only; friends won't see {n|it|them}.",
    "zh-TW": "有 {n} 項只留在這台裝置上，朋友看不到。",
    ja: "{n} 件はこの端末だけに残り、友だちには見えません。",
  },
  adjusted: {
    en: "{n} {n|thing was|things were} moved a little on the way (a place, a note's link).",
    "zh-TW": "有 {n} 項稍微調整過（地點挪了一下、留言的連結等）。",
    ja: "{n} 件を少し調整しました（場所の移動、メモのリンクなど）。",
  },
  adopted: {
    en: "This world was made on another device; this one now keeps its own copy.",
    "zh-TW": "這個世界是在另一台裝置上建立的；現在這台裝置也有自己的一份。",
    ja: "このワールドは別の端末で作られました。この端末にも自分の写しができました。",
  },
  lost: {
    en: "{n} {n|piece|pieces} of progress could not be carried over to this device.",
    "zh-TW": "有 {n} 項進度沒辦法帶到這台裝置。",
    ja: "{n} 件の進行状況をこの端末に引き継げませんでした。",
  },
  // ── The HUD's land line ───────────────────────────────────────────────────────────────────
  provisional: {
    en: "Not sent to friends yet — it goes when you are back online.",
    "zh-TW": "還沒送給朋友 — 連上網路後就會送出。",
    ja: "まだ友だちに届いていません — つながったら送られます。",
  },
  writingElsewhere: {
    en: "A friend is drawing this place…",
    "zh-TW": "朋友正在畫出這裡…",
    ja: "友だちがこの場所を描いています…",
  },
} satisfies Record<string, Phrase>;
