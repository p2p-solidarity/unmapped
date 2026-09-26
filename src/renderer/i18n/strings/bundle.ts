// `.world` files (rev 6 phase 4, D5) as the player meets them: 匯出 .world in a world's 更多 (My
// worlds), 從 .world 檔加入 and the move link in Join a world. No service address is ever shown.

import type { Phrase } from "./phrase";

export const BUNDLE = {
  export: { en: "Export .world", "zh-TW": "匯出 .world", ja: ".world を書き出す" },
  exported: {
    en: "Wrote {file} ({size} KiB).",
    "zh-TW": "已寫入 {file}（{size} KiB）。",
    ja: "{file} を書き出しました（{size} KiB）。",
  },
  importHeading: {
    en: "Join from a .world file",
    "zh-TW": "從 .world 檔加入",
    ja: ".world ファイルから参加",
  },
  importIntro: {
    en: "A friend can send you a whole world as a .world file. It is checked first; nothing is written until you bring it in.",
    "zh-TW": "朋友可以把整個世界存成 .world 檔傳給你。會先檢查，按下「帶進來」之前什麼都不會寫入。",
    ja: "友だちはワールドまるごとを .world ファイルで送れます。先に確かめ、取り込むまで何も書き込みません。",
  },
  choose: { en: "Choose a .world file", "zh-TW": "選擇 .world 檔", ja: ".world ファイルを選ぶ" },
  checking: { en: "Checking the file…", "zh-TW": "正在檢查檔案…", ja: "ファイルを確認中…" },
  reportEntries: {
    en: "{entries} {entries|entry|entries} in its history",
    "zh-TW": "歷史中有 {entries} 筆紀錄",
    ja: "歴史の記録 {entries} 件",
  },
  reportOwners: {
    en: "{owners} {owners|owner|owners} · {authors} {authors|person has|people have} written in it",
    "zh-TW": "{owners} 位主人 · {authors} 個人寫過這個世界",
    ja: "持ち主 {owners} 人 · 書いた人 {authors} 人",
  },
  reportShared: {
    en: "Has been shared with friends.",
    "zh-TW": "曾經和朋友共享。",
    ja: "友だちと共有されたことがあります。",
  },
  reportLocal: {
    en: "Never shared with friends.",
    "zh-TW": "從未和朋友共享。",
    ja: "友だちと共有されたことはありません。",
  },
  reportSigned: {
    en: "Exported {at}.",
    "zh-TW": "{at} 匯出。",
    ja: "{at} に書き出し。",
  },
  reportNewer: {
    en: "{n} {n|entry|entries} from a newer app {n|is|are} kept and skipped.",
    "zh-TW": "有 {n} 筆來自較新版本 App 的紀錄，會保留但略過。",
    ja: "新しいアプリの記録 {n} 件は残したまま読み飛ばします。",
  },
  reportOk: {
    en: "Every check passed.",
    "zh-TW": "全部檢查通過。",
    ja: "すべての確認に合格しました。",
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
    en: "This is a move link: the world has moved.",
    "zh-TW": "這是搬家連結：這個世界搬家了。",
    ja: "これは引っ越しリンクです。ワールドが引っ越しました。",
  },
  moveFollow: { en: "Follow the world", "zh-TW": "跟著世界搬過去", ja: "ワールドを追いかける" },
  moveFollowing: {
    en: "Following the world…",
    "zh-TW": "正在跟著世界搬家…",
    ja: "ワールドを追いかけています…",
  },
  moveFollowed: {
    en: "Caught up with the world ({added} new {added|entry|entries}).",
    "zh-TW": "已經跟上這個世界（新增 {added} 筆紀錄）。",
    ja: "ワールドに追いつきました（新しい記録 {added} 件）。",
  },
} as const satisfies Record<string, Phrase>;
