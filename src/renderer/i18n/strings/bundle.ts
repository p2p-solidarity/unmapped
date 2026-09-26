// World files (rev 6 phase 4, D5): Worlds → World files (export, move, import a `.world`) and the
// move link in Worlds → Join a world.

import type { Phrase } from "./phrase";

export const BUNDLE = {
  section: { en: "World files", "zh-TW": "世界檔案", ja: "ワールドファイル" },
  intro: {
    en: "A .world file holds a world's whole history and the packs it needs, and none of your own progress. Anyone can check it offline and bring the world back up — in this app, or on any world service.",
    "zh-TW":
      ".world 檔收著一個世界的完整歷史與它需要的內容包，不含你自己的進度。任何人都能離線驗證它，並把世界重新架起來——在這個 App 裡，或在任何世界服務上。",
    ja: ".world ファイルには、ワールドの歴史のすべてと必要なパックが入っていて、あなた自身の進み具合は入っていません。誰でもオフラインで確かめ、このアプリやどのワールドサービスでもワールドを立て直せます。",
  },
  listHeading: {
    en: "Worlds on this device",
    "zh-TW": "這台裝置上的世界",
    ja: "この端末のワールド",
  },
  reading: {
    en: "Reading the worlds on this device…",
    "zh-TW": "正在讀取這台裝置上的世界…",
    ja: "この端末のワールドを読み込み中…",
  },
  none: {
    en: "No world on this device has a history yet. Open a save's land once and it gets one.",
    "zh-TW": "這台裝置上還沒有任何世界有歷史。打開一個存檔的大地一次，它就會有。",
    ja: "この端末にはまだ歴史を持つワールドがありません。セーブの大地を一度開くとできます。",
  },
  rowShared: {
    en: "{entries} {entries|entry|entries} · on {service}",
    "zh-TW": "{entries} 筆紀錄 · 在 {service}",
    ja: "{entries} 件の記録 · {service}",
  },
  rowLocal: {
    en: "{entries} {entries|entry|entries} · on this device only",
    "zh-TW": "{entries} 筆紀錄 · 只在這台裝置",
    ja: "{entries} 件の記録 · この端末のみ",
  },
  rowOwner: { en: "You own it", "zh-TW": "你是主人", ja: "あなたが持ち主" },
  export: { en: "Export .world", "zh-TW": "匯出 .world", ja: ".world を書き出す" },
  exporting: { en: "Writing the file…", "zh-TW": "正在寫入檔案…", ja: "ファイルを書き出し中…" },
  exported: {
    en: "Wrote {file} ({size} KiB).",
    "zh-TW": "已寫入 {file}（{size} KiB）。",
    ja: "{file} を書き出しました（{size} KiB）。",
  },
  moveHeading: {
    en: "Move to another service",
    "zh-TW": "搬到另一個世界服務",
    ja: "別のサービスへ移す",
  },
  moveIntro: {
    en: "If this world's service is gone, import its .world file into another world service, then move the world there. Your members follow with the move link.",
    "zh-TW":
      "如果這個世界的服務已經不在，把它的 .world 檔匯入另一個世界服務，再把世界搬過去。成員用搬家連結跟上。",
    ja: "このワールドのサービスがなくなったら、.world ファイルを別のワールドサービスに取り込み、ワールドをそこへ移してください。メンバーは引っ越しリンクで追いかけられます。",
  },
  moveTo: { en: "Move to {service}", "zh-TW": "搬到 {service}", ja: "{service} へ移す" },
  moveAddress: {
    en: "World service address",
    "zh-TW": "世界服務位址",
    ja: "ワールドサービスのアドレス",
  },
  moveGo: { en: "Move here", "zh-TW": "搬到這裡", ja: "ここへ移す" },
  moving: { en: "Moving the world…", "zh-TW": "正在搬移世界…", ja: "ワールドを移動中…" },
  moved: {
    en: "The world now lives on {service}. Send your members this move link:",
    "zh-TW": "世界現在在 {service}。把這個搬家連結傳給成員：",
    ja: "ワールドは {service} に移りました。メンバーにこの引っ越しリンクを送ってください：",
  },
  moveLink: { en: "Move link", "zh-TW": "搬家連結", ja: "引っ越しリンク" },
  importHeading: { en: "Import a .world", "zh-TW": "匯入 .world", ja: ".world を取り込む" },
  importIntro: {
    en: "Choose a .world file. It is checked offline first; nothing is written until you bring it in.",
    "zh-TW": "選一個 .world 檔。會先離線驗證，按下「帶進來」之前什麼都不會寫入。",
    ja: ".world ファイルを選んでください。先にオフラインで確かめ、取り込むまで何も書き込みません。",
  },
  choose: { en: "Choose a .world file", "zh-TW": "選擇 .world 檔", ja: ".world ファイルを選ぶ" },
  checking: { en: "Checking the file…", "zh-TW": "正在驗證檔案…", ja: "ファイルを確認中…" },
  reportEntries: {
    en: "{entries} {entries|entry|entries}, up to #{head} · physics {physics}",
    "zh-TW": "{entries} 筆紀錄，到第 {head} 筆 · 物理 {physics}",
    ja: "{entries} 件の記録（#{head} まで）· 物理 {physics}",
  },
  reportOwners: {
    en: "{owners} {owners|owner|owners} · {authors} {authors|writer|writers} · {beats} {beats|beat|beats} · {works} AI {works|world|worlds}",
    "zh-TW": "{owners} 位主人 · {authors} 位書寫者 · {beats} 次脈動 · {works} 個 AI 世界",
    ja: "持ち主 {owners} · 書き手 {authors} · 脈動 {beats} · AI ワールド {works}",
  },
  reportServices: {
    en: "Sequenced by: {services}",
    "zh-TW": "排序服務：{services}",
    ja: "順序づけたサービス：{services}",
  },
  reportLocal: {
    en: "Never shared on a world service.",
    "zh-TW": "從未在世界服務上分享。",
    ja: "ワールドサービスで共有されたことはありません。",
  },
  reportSigned: {
    en: "Exported {at}, signed by {key}.",
    "zh-TW": "{at} 匯出，由 {key} 簽署。",
    ja: "{at} に書き出し、{key} が署名。",
  },
  reportNewer: {
    en: "{n} {n|entry|entries} from a newer build {n|is|are} kept and skipped.",
    "zh-TW": "有 {n} 筆來自較新版本的紀錄，會保留但略過。",
    ja: "新しいビルドの記録 {n} 件は残したまま読み飛ばします。",
  },
  reportOk: {
    en: "Every check passed: hashes, chain, receipts, verdicts, beats and packs.",
    "zh-TW": "全部檢查通過：雜湊、鏈、收據、判定、脈動與內容包。",
    ja: "すべての確認に合格：ハッシュ、チェーン、受領、判定、脈動、パック。",
  },
  reportProblems: {
    en: "{n} {n|problem|problems} — this file cannot be brought in:",
    "zh-TW": "有 {n} 個問題——這個檔案不能帶進來：",
    ja: "問題が {n} 件——このファイルは取り込めません：",
  },
  problemLine: {
    en: "Check {check}: {text}",
    "zh-TW": "檢查 {check}：{text}",
    ja: "確認 {check}：{text}",
  },
  playerName: {
    en: "Your name in this world",
    "zh-TW": "你在這個世界的名字",
    ja: "このワールドでのあなたの名前",
  },
  importGo: { en: "Bring it in", "zh-TW": "帶進來", ja: "取り込む" },
  importing: {
    en: "Bringing the world in…",
    "zh-TW": "正在把世界帶進來…",
    ja: "ワールドを取り込み中…",
  },
  imported: {
    en: "{name} is on this device.",
    "zh-TW": "{name} 已經在這台裝置上。",
    ja: "{name} をこの端末に取り込みました。",
  },
  importedAdopted: {
    en: "{name} was never shared, so it is now a world of this device.",
    "zh-TW": "{name} 從未分享過，所以現在它是這台裝置自己的世界。",
    ja: "{name} は共有されたことがないので、この端末のワールドになりました。",
  },
  moveDetected: {
    en: "This is a move link: the world moved to another world service.",
    "zh-TW": "這是搬家連結：世界已搬到另一個世界服務。",
    ja: "これは引っ越しリンクです。ワールドは別のワールドサービスへ移りました。",
  },
  moveFollow: { en: "Follow the world", "zh-TW": "跟著世界搬過去", ja: "ワールドを追いかける" },
  moveFollowing: {
    en: "Following the world to its new service…",
    "zh-TW": "正在跟著世界搬到新的服務…",
    ja: "新しいサービスへワールドを追いかけています…",
  },
  moveFollowed: {
    en: "The world now syncs with {service} ({added} new {added|entry|entries}).",
    "zh-TW": "世界現在與 {service} 同步（新增 {added} 筆紀錄）。",
    ja: "ワールドは {service} と同期しています（新しい記録 {added} 件）。",
  },
} as const satisfies Record<string, Phrase>;
