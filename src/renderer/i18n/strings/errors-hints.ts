// Hints that several error codes share, so every screen tells the player the same next step in
// the same words. Players choose their model in Title → Settings → Model.

import type { Phrase } from "./phrase";

export const HINT = {
  retryModel: {
    en: "Try again, or switch to a larger model in Settings → Model.",
    "zh-TW": "請再試一次，或到「設定 → 模型」換用較大的模型。",
    ja: "もう一度試すか、「設定 → モデル」でより大きなモデルに切り替えてください。",
  },
  otherModel: {
    en: "Choose another model in Settings → Model.",
    "zh-TW": "請到「設定 → 模型」改用其他模型。",
    ja: "「設定 → モデル」で別のモデルを選んでください。",
  },
  checkModel: {
    en: "Check the model in Settings → Model, then try again.",
    "zh-TW": "請到「設定 → 模型」檢查模型，然後再試一次。",
    ja: "「設定 → モデル」でモデルを確認してから、もう一度試してください。",
  },
  tryAgain: { en: "Try again.", "zh-TW": "請再試一次。", ja: "もう一度試してください。" },
  disk: {
    en: "Check free disk space and that the app's data folder can be written, then try again.",
    "zh-TW": "請確認磁碟還有空間，且應用程式的資料夾可以寫入，再試一次。",
    ja: "ディスクの空き容量と、アプリのデータフォルダーに書き込めるかを確認してから、もう一度試してください。",
  },
  readable: {
    en: "Check that the app's data folder can be read, then try again.",
    "zh-TW": "請確認應用程式的資料夾可以讀取，再試一次。",
    ja: "アプリのデータフォルダーを読み込めるか確認してから、もう一度試してください。",
  },
  otherFolder: {
    en: "Choose another folder, then try again.",
    "zh-TW": "請選擇其他資料夾，再試一次。",
    ja: "別のフォルダーを選んで、もう一度試してください。",
  },
  checkFile: {
    en: "Check the file, then try again.",
    "zh-TW": "請檢查檔案，然後再試一次。",
    ja: "ファイルを確認してから、もう一度試してください。",
  },
  backup: {
    en: "Restore it from a backup.",
    "zh-TW": "請從備份還原。",
    ja: "バックアップから復元してください。",
  },
  exportAgain: {
    en: "Export it again from UNMAPPED.",
    "zh-TW": "請從《無界之地》重新匯出。",
    ja: "UNMAPPED からもう一度書き出してください。",
  },
  repairCartridge: {
    en: "Repair it in a Remix workspace, or reinstall the cartridge.",
    "zh-TW": "請在 Remix 工作區修正，或重新安裝這張卡帶。",
    ja: "リミックスのワークスペースで直すか、カートリッジを入れ直してください。",
  },
  reinstall: {
    en: "Reinstall this cartridge from a trusted copy.",
    "zh-TW": "請從可信任的來源重新安裝這張卡帶。",
    ja: "信頼できるコピーからカートリッジを入れ直してください。",
  },
  exactRevision: {
    en: "Restore the exact cartridge version this save was made with.",
    "zh-TW": "請還原這個存檔所使用的那個卡帶版本。",
    ja: "このセーブが使っているカートリッジと同じ版を復元してください。",
  },
  writeAreaAgain: {
    en: "Try writing this area again.",
    "zh-TW": "請重新寫一次這個區塊。",
    ja: "このチャンクをもう一度書き直してください。",
  },
  reloadLand: {
    en: "Reload the land.",
    "zh-TW": "請重新載入大地。",
    ja: "大地を再読み込みしてください。",
  },
  bug: {
    en: "This is a bug; please report it.",
    "zh-TW": "這是程式錯誤，請回報。",
    ja: "不具合です。報告してください。",
  },
  sameAsHost: {
    en: "Open a save of the host's exact cartridge version, on the same version of UNMAPPED.",
    "zh-TW": "請開啟與房主相同卡帶版本的存檔，並使用相同版本的《無界之地》。",
    ja: "ホストと同じカートリッジの版のセーブを、同じバージョンの UNMAPPED で開いてください。",
  },
  askAgain: {
    en: "Describe the change again, more simply.",
    "zh-TW": "請換個更簡單的說法再描述一次。",
    ja: "変更内容を、もっと簡単な言い方でもう一度伝えてください。",
  },
} as const satisfies Record<string, Phrase>;
