// ENS in Play: the player card's name line (hud/EnsChip.tsx) and the offer after a cleared chapter
// to record the run, or move its name forward (land/ChapterNameOffer.tsx). Spread into HUD by
// ./hud.ts. Names themselves (`<save>.<cartridge>.unmapped.eth`) are never translated.

import type { Phrase } from "./phrase";

export const HUD_ENS = {
  // ── The name line on the player card ───────────────────────────────────────────────────────
  ensLoadingTitle: {
    en: "Asking Sepolia for this run's ENS name…",
    "zh-TW": "正在向 Sepolia 查詢這趟旅程的 ENS 名稱…",
    ja: "この冒険の ENS 名を Sepolia に照会中…",
  },
  ensError: { en: "ENS unavailable", "zh-TW": "ENS 無法讀取", ja: "ENS を読めません" },
  ensNoneTitle: {
    en: "Neither this world nor this run has an ENS name yet. Name it in Worlds → My worlds.",
    "zh-TW": "這個世界和這趟旅程都還沒有 ENS 名稱。可以在「世界 → 我的世界」取名。",
    ja: "このワールドにもこの冒険にも、まだ ENS 名がありません。ワールド → マイワールドで名前を付けられます。",
  },
  ensOlder: {
    en: "ENS name is on an older checkpoint",
    "zh-TW": "ENS 名稱記的是較早的進度",
    ja: "ENS 名は以前の記録のままです",
  },
  ensSaveTitle: {
    en: "This run's ENS name: {name} — it records {progress}.",
    "zh-TW": "這趟旅程的 ENS 名稱：{name}——記錄的是 {progress}。",
    ja: "この冒険の ENS 名：{name}——記録している進行：{progress}。",
  },
  ensOlderTitle: {
    en: "This run's ENS name: {name} — it records an earlier checkpoint: {progress}.",
    "zh-TW": "這趟旅程的 ENS 名稱：{name}——記錄的是較早的進度：{progress}。",
    ja: "この冒険の ENS 名：{name}——以前のチェックポイントを記録しています：{progress}。",
  },
  ensWorldTitle: {
    en: "This world's ENS name: {name}. This run has no name of its own yet.",
    "zh-TW": "這個世界的 ENS 名稱：{name}。這趟旅程還沒有自己的名稱。",
    ja: "このワールドの ENS 名：{name}。この冒険にはまだ自分の名前がありません。",
  },

  // ── The offer after a cleared chapter ──────────────────────────────────────────────────────
  ensOfferLabel: {
    en: "CHAPTER CLEARED · ENS",
    "zh-TW": "章節完成 · ENS",
    ja: "章クリア · ENS",
  },
  ensOfferRecord: {
    en: "Record this run on ENS as {name}?",
    "zh-TW": "要把這趟旅程記錄到 ENS，名稱為 {name} 嗎？",
    ja: "この冒険を {name} として ENS に記録しますか？",
  },
  ensOfferUpdate: {
    en: "Chapter cleared — move {name} to this checkpoint?",
    "zh-TW": "章節完成——要把 {name} 更新到目前的進度嗎？",
    ja: "章をクリアしました——{name} をこのチェックポイントに更新しますか？",
  },
  ensOfferProgress: {
    en: "This checkpoint: {progress}",
    "zh-TW": "目前的進度：{progress}",
    ja: "このチェックポイント：{progress}",
  },
  ensOfferRecorded: {
    en: "On ENS now: {progress}",
    "zh-TW": "ENS 上目前記錄：{progress}",
    ja: "ENS の現在の記録：{progress}",
  },
  ensOfferNote: {
    en: "Your passkey signs and the gas station pays — no wallet. Only a fingerprint of this save, its world's version, a line of progress and its join code go on chain.",
    "zh-TW":
      "由你的 passkey 簽名，代付站支付 gas，不需要錢包。上鏈的只有這個存檔的指紋、世界的版本、一行進度和加入碼。",
    ja: "パスキーで署名し、ガス代はガスステーションが払います（ウォレット不要）。チェーンに載るのはこのセーブの指紋、ワールドのバージョン、進行状況の一行、参加コードだけです。",
  },
  ensOfferRecordButton: {
    en: "Record with passkey",
    "zh-TW": "用 passkey 記錄",
    ja: "パスキーで記録",
  },
  ensOfferUpdateButton: {
    en: "Update with passkey",
    "zh-TW": "用 passkey 更新",
    ja: "パスキーで更新",
  },
  ensOfferNotNow: { en: "Not now", "zh-TW": "稍後再說", ja: "今はしない" },
} as const satisfies Record<string, Phrase>;
