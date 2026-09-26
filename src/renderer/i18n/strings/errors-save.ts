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
      en: "Your worlds could not be listed.",
      "zh-TW": "無法列出你的世界。",
      ja: "マイワールドの一覧を読み込めませんでした。",
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
      en: "A new game could not be started.",
      "zh-TW": "無法開始新遊戲。",
      ja: "新しいゲームを始められませんでした。",
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
      en: "A world with this name already exists.",
      "zh-TW": "已經有同名的世界。",
      ja: "同じ名前のワールドがすでにあります。",
    },
    hint: {
      en: "Choose a different name, or try again later.",
      "zh-TW": "請換個名字，或稍後再試。",
      ja: "別の名前にするか、しばらくしてから試してください。",
    },
  },
  "instance-name-invalid": {
    message: {
      en: "The world needs a name.",
      "zh-TW": "世界需要名稱。",
      ja: "ワールドには名前が必要です。",
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
      en: "The save does not belong to this world.",
      "zh-TW": "這個存檔不屬於這個世界。",
      ja: "このセーブは、このワールドのものではありません。",
    },
    hint: SAVE_FILE_HINT,
  },
  "save-schema-mismatch": {
    message: {
      en: "The save format does not match its version of the world.",
      "zh-TW": "存檔格式和它的世界版本不符。",
      ja: "セーブの形式が、ワールドの版と一致しません。",
    },
    hint: {
      en: "Play it with the exact version of the world it was made with.",
      "zh-TW": "請用建立它時的那個世界版本來玩。",
      ja: "作成したときと同じ版のワールドで遊んでください。",
    },
  },
  "instance-legacy-format": {
    message: {
      en: "This save was made by an older version of UNMAPPED.",
      "zh-TW": "這個存檔是由舊版《無界之地》建立的。",
      ja: "このセーブは古いバージョンの UNMAPPED で作られました。",
    },
    hint: {
      en: "It is left untouched; import its exact version of the world, or restore it from a backup.",
      "zh-TW": "它保持原樣；請匯入它所用的世界版本，或從備份還原。",
      ja: "データはそのままです。同じ版のワールドを読み込むか、バックアップから復元してください。",
    },
  },
  "instance-cartridge-mismatch": {
    message: {
      en: "The installed version of the world does not match the one this save uses.",
      "zh-TW": "已安裝的世界版本和這個存檔使用的不符。",
      ja: "インストール済みのワールドの版が、このセーブのものと一致しません。",
    },
    hint: HINT.exactRevision,
  },
  "instance-scene-missing": {
    message: {
      en: "This save's current scene is missing from its world.",
      "zh-TW": "這個存檔目前所在的場景，在它的世界裡找不到。",
      ja: "このセーブの現在のシーンが、ワールドにありません。",
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
      en: "That version is not newer than the one this save uses.",
      "zh-TW": "那個版本並不比這個存檔所用的版本新。",
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
      en: "Start a new game on that version.",
      "zh-TW": "請用那個版本開始新遊戲。",
      ja: "その版ではじめから遊んでください。",
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
  "backup-too-large": {
    message: {
      en: "The .spire-backup is larger than a backup may be.",
      "zh-TW": ".spire-backup 超過備份允許的大小。",
      ja: ".spire-backup がバックアップの上限より大きすぎます。",
    },
    hint: {
      en: "Use a backup exported by UNMAPPED; a save this big is kept by copying its folder.",
      "zh-TW": "請使用《無界之地》匯出的備份；這麼大的存檔，請直接複製它的資料夾保存。",
      ja: "UNMAPPED が書き出したバックアップを使ってください。これほど大きなセーブは、フォルダーをそのままコピーして保管します。",
    },
  },
  "backup-land-invalid": {
    message: {
      en: "The land written in this save is damaged.",
      "zh-TW": "這個存檔裡已寫出的土地資料已損毀。",
      ja: "このセーブに記録された土地のデータが壊れています。",
    },
    hint: {
      en: "If it came from a backup file, export that backup again from the save it came from.",
      "zh-TW": "如果它來自備份檔，請從原本的存檔重新匯出那份備份。",
      ja: "バックアップファイルから来たものなら、元のセーブからもう一度書き出してください。",
    },
  },
  "backup-scene-missing": {
    message: {
      en: "The backup's current scene is missing from its world.",
      "zh-TW": "備份目前所在的場景，在它的世界裡找不到。",
      ja: "バックアップの現在のシーンが、ワールドにありません。",
    },
    hint: HINT.exactRevision,
  },
  "physics-newer": {
    message: {
      en: "This world was made by a newer version of the land's physics.",
      "zh-TW": "這個世界是用較新版的大地物理做出來的。",
      ja: "この世界は、より新しい版の大地の物理で作られています。",
    },
    hint: {
      en: "Update UNMAPPED to open it.",
      "zh-TW": "請更新《無界之地》再開啟。",
      ja: "UNMAPPEDを更新してから開いてください。",
    },
  },
  "physics-unsupported": {
    message: {
      en: "This world was made on land physics this build no longer reproduces.",
      "zh-TW": "這個世界所用的大地物理，這一版已經無法重現。",
      ja: "この世界の大地の物理は、この版ではもう再現できません。",
    },
    hint: {
      en: "Open it with the build it was made in.",
      "zh-TW": "請用當初建立它的版本開啟。",
      ja: "作られたときの版で開いてください。",
    },
  },
};
