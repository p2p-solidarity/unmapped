// Errors about saves (playthroughs pinned to a cartridge version): reading, writing, upgrading, and
// .spire-backup export and restore.

import type { ErrorText } from "./errors";
import { HINT } from "./errors-hints";

const SAVE_FILE_HINT = {
  en: "Restore it from a backup, or export the backup again.",
  "zh-TW": "請從備份還原，或重新匯出備份。",
  ja: "バックアップから復元するか、バックアップを書き出し直してください。",
};

export const SAVE_ERRORS: Record<string, ErrorText> = {
  // ── Reading and writing saves ──────────────────────────────────────────────────────────────
  "instance-list-failed": {
    message: {
      en: "Your saves could not be listed.",
      "zh-TW": "無法列出你的存檔。",
      ja: "セーブの一覧を読み込めませんでした。",
    },
    hint: HINT.readable,
  },
  "instance-read-failed": {
    message: {
      en: "This save could not be read.",
      "zh-TW": "無法讀取這個存檔。",
      ja: "このセーブを読み込めませんでした。",
    },
    hint: HINT.backup,
  },
  "instance-create-failed": {
    message: {
      en: "A new save could not be created.",
      "zh-TW": "無法建立新的存檔。",
      ja: "新しいセーブを作成できませんでした。",
    },
    hint: HINT.disk,
  },
  "instance-save-failed": {
    message: {
      en: "The game could not be saved.",
      "zh-TW": "無法存檔。",
      ja: "セーブできませんでした。",
    },
    hint: HINT.disk,
  },
  "instance-checkpoint-failed": {
    message: {
      en: "The checkpoint could not be saved.",
      "zh-TW": "無法儲存檢查點。",
      ja: "チェックポイントを保存できませんでした。",
    },
    hint: HINT.disk,
  },
  "instance-save-conflict": {
    message: {
      en: "This save changed after it was loaded.",
      "zh-TW": "這個存檔在載入之後被改動過。",
      ja: "このセーブは読み込んだ後に変更されています。",
    },
    hint: {
      en: "Reload it before saving again.",
      "zh-TW": "請先重新載入，再存檔。",
      ja: "再読み込みしてから、もう一度セーブしてください。",
    },
  },
  "instance-exists": {
    message: {
      en: "A save with this name already exists.",
      "zh-TW": "已經有同名的存檔。",
      ja: "同じ名前のセーブがすでにあります。",
    },
    hint: {
      en: "Choose a different name, or try again later.",
      "zh-TW": "請換個名字，或稍後再試。",
      ja: "別の名前にするか、しばらくしてから試してください。",
    },
  },
  "instance-name-invalid": {
    message: {
      en: "The save needs a name.",
      "zh-TW": "存檔需要名稱。",
      ja: "セーブには名前が必要です。",
    },
  },
  "instance-id-invalid": {
    message: {
      en: "That save id is not valid.",
      "zh-TW": "存檔 id 無效。",
      ja: "セーブ ID が正しくありません。",
    },
  },
  "instance-identity-mismatch": {
    message: {
      en: "This save does not match the folder it is stored in.",
      "zh-TW": "這個存檔和它所在的資料夾對不上。",
      ja: "このセーブが、保存されているフォルダーと一致しません。",
    },
    hint: HINT.backup,
  },
  "instance-invalid": {
    message: {
      en: "The save's record is not valid.",
      "zh-TW": "存檔的紀錄無效。",
      ja: "セーブの記録が正しくありません。",
    },
    hint: SAVE_FILE_HINT,
  },
  "save-invalid": {
    message: {
      en: "The save file is not valid.",
      "zh-TW": "存檔檔案無效。",
      ja: "セーブファイルが正しくありません。",
    },
    hint: SAVE_FILE_HINT,
  },
  "save-identity-mismatch": {
    message: {
      en: "The save does not belong to this playthrough and cartridge.",
      "zh-TW": "這個存檔不屬於這個遊玩進度與卡帶。",
      ja: "このセーブは、このプレイとカートリッジのものではありません。",
    },
    hint: SAVE_FILE_HINT,
  },
  "save-schema-mismatch": {
    message: {
      en: "The save format does not match its cartridge version.",
      "zh-TW": "存檔格式和它的卡帶版本不符。",
      ja: "セーブの形式が、カートリッジの版と一致しません。",
    },
    hint: {
      en: "Play it with the exact cartridge version it was made with.",
      "zh-TW": "請用建立它時的那個卡帶版本來玩。",
      ja: "作成したときと同じ版のカートリッジで遊んでください。",
    },
  },
  "instance-legacy-format": {
    message: {
      en: "This save was made by an older version of Unwritten Land.",
      "zh-TW": "這個存檔是由舊版 Unwritten Land 建立的。",
      ja: "このセーブは古いバージョンの Unwritten Land で作られました。",
    },
    hint: {
      en: "It is left untouched on disk. Import its exact cartridge version, or restore it from a backup.",
      "zh-TW": "它在磁碟上保持原樣。請匯入它所用的卡帶版本，或從備份還原。",
      ja: "ディスク上のデータはそのままです。同じ版のカートリッジを読み込むか、バックアップから復元してください。",
    },
  },
  "instance-cartridge-mismatch": {
    message: {
      en: "The installed cartridge does not match the one this save uses.",
      "zh-TW": "已安裝的卡帶和這個存檔使用的不符。",
      ja: "インストール済みのカートリッジが、このセーブのものと一致しません。",
    },
    hint: HINT.exactRevision,
  },
  "instance-scene-missing": {
    message: {
      en: "This save's current scene is missing from its cartridge.",
      "zh-TW": "這個存檔目前所在的場景，在它的卡帶裡找不到。",
      ja: "このセーブの現在のシーンが、カートリッジにありません。",
    },
    hint: HINT.exactRevision,
  },
  "instance-scene-invalid": {
    message: {
      en: "This save's current scene cannot be read.",
      "zh-TW": "無法讀取這個存檔目前所在的場景。",
      ja: "このセーブの現在のシーンを読み込めません。",
    },
    hint: HINT.exactRevision,
  },

  // ── Moving a save to a newer cartridge version ─────────────────────────────────────────────
  "upgrade-version-not-newer": {
    message: {
      en: "That cartridge version is not newer than the one this save uses.",
      "zh-TW": "那個卡帶版本並不比這個存檔所用的版本新。",
      ja: "その版は、このセーブが使っている版より新しくありません。",
    },
    hint: {
      en: "Choose a newer installed version.",
      "zh-TW": "請選擇已安裝的較新版本。",
      ja: "インストール済みの新しい版を選んでください。",
    },
  },
  "upgrade-scene-missing": {
    message: {
      en: "The newer version no longer has the scene this save is in.",
      "zh-TW": "新版本已經沒有這個存檔目前所在的場景。",
      ja: "新しい版には、このセーブが今いるシーンがありません。",
    },
    hint: {
      en: "Finish or leave the current scene on the old version, then upgrade.",
      "zh-TW": "請先在舊版本完成或離開目前的場景，再升級。",
      ja: "古い版で今のシーンを終えるか出てから、アップグレードしてください。",
    },
  },
  "upgrade-runtime-migration-required": {
    message: {
      en: "The newer version changes how the game runs, so this save cannot move to it.",
      "zh-TW": "新版本改變了遊戲的運作方式，這個存檔無法轉移過去。",
      ja: "新しい版はゲームの動き方が変わるため、このセーブは移行できません。",
    },
    hint: {
      en: "Start a new playthrough on that version.",
      "zh-TW": "請用那個版本開始新的遊玩進度。",
      ja: "その版で新しいプレイを始めてください。",
    },
  },
  "upgrade-snapshot-failed": {
    message: {
      en: "A safety copy of the save could not be made before upgrading.",
      "zh-TW": "升級前無法建立存檔的備份。",
      ja: "アップグレード前にセーブの控えを作れませんでした。",
    },
    hint: HINT.disk,
  },

  // ── .spire-backup export and restore ───────────────────────────────────────────────────────
  "backup-read-failed": {
    message: {
      en: "The backup file could not be read.",
      "zh-TW": "無法讀取備份檔案。",
      ja: "バックアップファイルを読み込めませんでした。",
    },
    hint: HINT.checkFile,
  },
  "backup-write-failed": {
    message: {
      en: "The backup file could not be written.",
      "zh-TW": "無法寫入備份檔案。",
      ja: "バックアップファイルを書き込めませんでした。",
    },
    hint: HINT.otherFolder,
  },
  "backup-pack-failed": {
    message: {
      en: "The save could not be packed into a backup.",
      "zh-TW": "無法把存檔打包成備份。",
      ja: "セーブをバックアップにまとめられませんでした。",
    },
    hint: HINT.tryAgain,
  },
  "backup-restore-failed": {
    message: {
      en: "The backup could not be restored.",
      "zh-TW": "無法還原備份。",
      ja: "バックアップを復元できませんでした。",
    },
    hint: HINT.disk,
  },
  "backup-unreadable": {
    message: {
      en: "That file is not a readable .spire-backup.",
      "zh-TW": "這個檔案不是可讀取的 .spire-backup。",
      ja: "そのファイルは読み込める .spire-backup ではありません。",
    },
    hint: HINT.exportAgain,
  },
  "backup-duplicate": {
    message: {
      en: "The .spire-backup archive is damaged.",
      "zh-TW": ".spire-backup 封存檔已損毀。",
      ja: ".spire-backup のアーカイブが壊れています。",
    },
    hint: HINT.exportAgain,
  },
  "backup-unsafe": {
    message: {
      en: "The .spire-backup contains an unsafe file path, so it was refused.",
      "zh-TW": ".spire-backup 裡含有不安全的檔案路徑，因此已拒絕。",
      ja: ".spire-backup に安全でないファイルパスが含まれているため、拒否しました。",
    },
    hint: HINT.exportAgain,
  },
  "backup-unknown-file": {
    message: {
      en: "The .spire-backup contains files a backup should not have.",
      "zh-TW": ".spire-backup 裡有備份不該有的檔案。",
      ja: ".spire-backup に、バックアップにはないはずのファイルがあります。",
    },
    hint: HINT.exportAgain,
  },
  "backup-incomplete": {
    message: {
      en: "The .spire-backup is missing some of its files.",
      "zh-TW": ".spire-backup 缺少部分檔案。",
      ja: ".spire-backup のファイルが一部足りません。",
    },
    hint: HINT.exportAgain,
  },
  "backup-scene-missing": {
    message: {
      en: "The backup's current scene is missing from its cartridge.",
      "zh-TW": "備份目前所在的場景，在它的卡帶裡找不到。",
      ja: "バックアップの現在のシーンが、カートリッジにありません。",
    },
    hint: HINT.exactRevision,
  },
};
