// Errors about cartridges: the library, .cartridge import and export, publishing, and the checks a
// revision must pass before it is installed or played.

import type { ErrorText } from "./errors";
import { HINT } from "./errors-hints";

export const CARTRIDGE_ERRORS: Record<string, ErrorText> = {
  // ── Library, import and export ─────────────────────────────────────────────────────────────
  "cartridge-list-failed": {
    message: {
      en: "The cartridge library could not be read.",
      "zh-TW": "無法讀取卡帶收藏庫。",
      ja: "カートリッジのライブラリを読み込めませんでした。",
    },
    hint: HINT.readable,
  },
  "cartridge-read-failed": {
    message: {
      en: "A cartridge could not be read.",
      "zh-TW": "無法讀取卡帶。",
      ja: "カートリッジを読み込めませんでした。",
    },
    hint: {
      en: "Check the file or the app's data folder, then try again.",
      "zh-TW": "請檢查檔案或應用程式的資料夾，然後再試一次。",
      ja: "ファイルかアプリのデータフォルダーを確認してから、もう一度試してください。",
    },
  },
  "cartridge-write-failed": {
    message: {
      en: "The cartridge file could not be written.",
      "zh-TW": "無法寫入卡帶檔案。",
      ja: "カートリッジのファイルを書き込めませんでした。",
    },
    hint: HINT.otherFolder,
  },
  "cartridge-pack-failed": {
    message: {
      en: "The cartridge could not be packed for export.",
      "zh-TW": "無法打包卡帶以供匯出。",
      ja: "カートリッジを書き出し用にまとめられませんでした。",
    },
    hint: HINT.tryAgain,
  },
  "cartridge-publish-failed": {
    message: {
      en: "The cartridge could not be published.",
      "zh-TW": "無法發布卡帶。",
      ja: "カートリッジを公開できませんでした。",
    },
    hint: HINT.disk,
  },
  "cartridge-pack-unreadable": {
    message: {
      en: "That file is not a readable .cartridge.",
      "zh-TW": "這個檔案不是可讀取的 .cartridge。",
      ja: "そのファイルは読み込める .cartridge ではありません。",
    },
    hint: HINT.exportAgain,
  },
  "cartridge-pack-duplicate": {
    message: {
      en: "The .cartridge archive is damaged.",
      "zh-TW": ".cartridge 封存檔已損毀。",
      ja: ".cartridge のアーカイブが壊れています。",
    },
    hint: HINT.exportAgain,
  },
  "cartridge-pack-unsafe": {
    message: {
      en: "The .cartridge contains an unsafe file path, so it was refused.",
      "zh-TW": ".cartridge 裡含有不安全的檔案路徑，因此已拒絕。",
      ja: ".cartridge に安全でないファイルパスが含まれているため、拒否しました。",
    },
    hint: HINT.exportAgain,
  },
  "cartridge-pack-unknown-file": {
    message: {
      en: "The .cartridge contains files a cartridge should not have.",
      "zh-TW": ".cartridge 裡有卡帶不該有的檔案。",
      ja: ".cartridge に、カートリッジにはないはずのファイルがあります。",
    },
    hint: HINT.exportAgain,
  },
  "cartridge-pack-incomplete": {
    message: {
      en: "The .cartridge is missing some of its files.",
      "zh-TW": ".cartridge 缺少部分檔案。",
      ja: ".cartridge のファイルが一部足りません。",
    },
    hint: HINT.exportAgain,
  },
  "cartridge-pack-too-large": {
    message: {
      en: "The .cartridge is larger than a cartridge may be, so it was not opened.",
      "zh-TW": "這個 .cartridge 超過卡帶允許的大小，因此沒有開啟。",
      ja: ".cartridge が許可されたサイズを超えているため、開きませんでした。",
    },
    hint: {
      en: "A cartridge travels as one pack of at most 32 MiB; ask for a smaller export.",
      "zh-TW": "卡帶以單一封包傳送，最多 32 MiB；請對方匯出較小的版本。",
      ja: "カートリッジは最大 32 MiB の一つのパックで届きます。小さく書き出してもらってください。",
    },
  },
  "cartridge-manifest-invalid": {
    message: {
      en: "The cartridge's manifest is not valid.",
      "zh-TW": "卡帶的資訊清單（manifest）無效。",
      ja: "カートリッジのマニフェストが正しくありません。",
    },
    hint: HINT.repairCartridge,
  },
  "cartridge-integrity-failed": {
    message: {
      en: "The cartridge's files do not match its content hash.",
      "zh-TW": "卡帶的檔案和它的內容雜湊值不符。",
      ja: "カートリッジのファイルが、コンテンツのハッシュと一致しません。",
    },
    hint: {
      en: "The files were changed after publishing; reinstall it from a fresh export.",
      "zh-TW": "檔案在發布後被改動過；請用重新匯出的檔案再安裝一次。",
      ja: "公開後にファイルが変更されています。新しく書き出したものから入れ直してください。",
    },
  },
  "cartridge-files-invalid": {
    message: {
      en: "The cartridge folder holds files it did not declare.",
      "zh-TW": "卡帶資料夾裡有未宣告的檔案。",
      ja: "カートリッジのフォルダーに、宣言されていないファイルがあります。",
    },
    hint: HINT.reinstall,
  },
  "cartridge-identity-mismatch": {
    message: {
      en: "The cartridge does not match the folder it is stored in.",
      "zh-TW": "卡帶和它所在的資料夾對不上。",
      ja: "カートリッジが、保存されているフォルダーと一致しません。",
    },
    hint: HINT.reinstall,
  },
  "cartridge-version-conflict": {
    message: {
      en: "This cartridge version already exists with different content.",
      "zh-TW": "這個卡帶版本已經存在，而且內容不同。",
      ja: "このカートリッジの版はすでにあり、内容が異なります。",
    },
    hint: {
      en: "Publish under a new version number; published versions are never overwritten.",
      "zh-TW": "請用新的版本號發布；已發布的版本永遠不會被覆寫。",
      ja: "新しいバージョン番号で公開してください。公開済みの版は上書きされません。",
    },
  },
  "cartridge-engine-unsupported": {
    message: {
      en: "This cartridge needs a newer UNMAPPED.",
      "zh-TW": "這張卡帶需要較新版本的《無界之地》。",
      ja: "このカートリッジには、より新しい UNMAPPED が必要です。",
    },
    hint: {
      en: "Update UNMAPPED to play it.",
      "zh-TW": "請更新《無界之地》再遊玩。",
      ja: "UNMAPPED を更新してから遊んでください。",
    },
  },
  "cartridge-save-unsupported": {
    message: {
      en: "This cartridge uses a save format this version does not support.",
      "zh-TW": "這張卡帶使用的存檔格式，這個版本不支援。",
      ja: "このカートリッジのセーブ形式に、このバージョンは対応していません。",
    },
    hint: {
      en: "Use a compatible version of UNMAPPED.",
      "zh-TW": "請使用相容版本的《無界之地》。",
      ja: "対応しているバージョンの UNMAPPED を使ってください。",
    },
  },
  "cartridge-missing": {
    message: {
      en: "The cartridge this save was made with is not installed.",
      "zh-TW": "這個存檔所使用的卡帶沒有安裝。",
      ja: "このセーブで使っているカートリッジがインストールされていません。",
    },
    hint: {
      en: "Import that exact cartridge version first; a save never moves to another version on restore.",
      "zh-TW": "請先匯入那個卡帶版本；還原時存檔不會改用其他版本。",
      ja: "先にその版のカートリッジを読み込んでください。復元時にセーブが別の版へ移ることはありません。",
    },
  },
  "cartridge-id-invalid": {
    message: {
      en: "The cartridge id is not valid.",
      "zh-TW": "卡帶 id 無效。",
      ja: "カートリッジ ID が正しくありません。",
    },
    hint: {
      en: "Use lowercase letters, digits and hyphens.",
      "zh-TW": "請只使用小寫英文字母、數字與連字號。",
      ja: "英小文字・数字・ハイフンだけを使ってください。",
    },
  },
  "cartridge-version-invalid": {
    message: {
      en: "The version number is not valid.",
      "zh-TW": "版本號無效。",
      ja: "バージョン番号が正しくありません。",
    },
    hint: {
      en: "Use a version like 1.0.0.",
      "zh-TW": "請使用像 1.0.0 這樣的版本號。",
      ja: "1.0.0 のような形式にしてください。",
    },
  },
  "runtime-pin-mismatch": {
    message: {
      en: "The rules this save recorded do not match the installed cartridge.",
      "zh-TW": "存檔記錄的規則和已安裝的卡帶不符。",
      ja: "セーブに記録されたルールが、インストール済みのカートリッジと一致しません。",
    },
    hint: {
      en: "Restore the exact cartridge version, or start a new playthrough.",
      "zh-TW": "請還原那個卡帶版本，或開始新的遊玩進度。",
      ja: "同じ版のカートリッジを復元するか、新しいプレイを始めてください。",
    },
  },

  // ── Checks a revision must pass ────────────────────────────────────────────────────────────
  "cartridge-rules-empty": {
    message: {
      en: "The cartridge has no gameplay rules.",
      "zh-TW": "卡帶沒有遊戲規則。",
      ja: "カートリッジにゲームのルールがありません。",
    },
    hint: HINT.repairCartridge,
  },
  "cartridge-rules-invalid": {
    message: {
      en: "The cartridge's gameplay rules cannot be read.",
      "zh-TW": "無法讀取卡帶的遊戲規則。",
      ja: "カートリッジのゲームのルールを読み込めません。",
    },
    hint: HINT.repairCartridge,
  },
  "cartridge-scene-invalid": {
    message: {
      en: "A scene in this cartridge is not valid.",
      "zh-TW": "這張卡帶裡有無效的場景。",
      ja: "このカートリッジに正しくないシーンがあります。",
    },
    hint: HINT.repairCartridge,
  },
  "cartridge-scenes-invalid": {
    message: {
      en: "The cartridge's scene ids are not valid.",
      "zh-TW": "卡帶的場景 id 無效。",
      ja: "カートリッジのシーン ID が正しくありません。",
    },
    hint: HINT.repairCartridge,
  },
  "cartridge-scenes-mismatch": {
    message: {
      en: "The cartridge's scenes do not match its list of scenes.",
      "zh-TW": "卡帶的場景和它的場景清單對不上。",
      ja: "カートリッジのシーンが、シーンの一覧と一致しません。",
    },
    hint: HINT.repairCartridge,
  },
  "cartridge-story-mismatch": {
    message: {
      en: "The cartridge's scene plan does not match its scenes.",
      "zh-TW": "卡帶的場景規劃和場景對不上。",
      ja: "カートリッジのシーン構成が、シーンと一致しません。",
    },
    hint: HINT.repairCartridge,
  },
  "cartridge-entry-missing": {
    message: {
      en: "The cartridge's first scene is not one of its scenes.",
      "zh-TW": "卡帶的起始場景不在它的場景之中。",
      ja: "カートリッジの最初のシーンが、シーンの中にありません。",
    },
    hint: HINT.repairCartridge,
  },
  "cartridge-ending-missing": {
    message: {
      en: "The cartridge's ending is missing.",
      "zh-TW": "卡帶缺少結局。",
      ja: "カートリッジにエンディングがありません。",
    },
    hint: HINT.repairCartridge,
  },
  "cartridge-route-invalid": {
    message: {
      en: "The cartridge's exits lead nowhere or never reach an ending.",
      "zh-TW": "卡帶的出口通往不存在的地方，或永遠到不了結局。",
      ja: "カートリッジの出口に行き先がないか、エンディングにたどり着きません。",
    },
    hint: HINT.repairCartridge,
  },
  "cartridge-contract-invalid": {
    message: {
      en: "A scene's contract does not match the cartridge.",
      "zh-TW": "有場景的合約和卡帶對不上。",
      ja: "シーンの契約が、カートリッジと一致しません。",
    },
    hint: HINT.repairCartridge,
  },
  "cartridge-kit-missing": {
    message: {
      en: "A scene needs gameplay the cartridge's rules do not set up.",
      "zh-TW": "有場景需要的玩法，卡帶的規則沒有設定。",
      ja: "シーンに必要な遊び方が、カートリッジのルールに設定されていません。",
    },
    hint: HINT.repairCartridge,
  },
  "cartridge-module-missing": {
    message: {
      en: "A scene needs a capability module the cartridge does not include.",
      "zh-TW": "有場景需要卡帶沒有包含的功能模組。",
      ja: "シーンに、カートリッジに含まれていないモジュールが必要です。",
    },
    hint: HINT.repairCartridge,
  },
  "cartridge-module-lock-invalid": {
    message: {
      en: "The cartridge's list of capability modules is not valid.",
      "zh-TW": "卡帶的功能模組清單無效。",
      ja: "カートリッジのモジュール一覧が正しくありません。",
    },
    hint: HINT.repairCartridge,
  },
  "cartridge-module-lock-untrusted": {
    message: {
      en: "The cartridge needs a capability module this version does not have.",
      "zh-TW": "卡帶需要這個版本沒有的功能模組。",
      ja: "カートリッジに、このバージョンにはないモジュールが必要です。",
    },
    hint: {
      en: "Update UNMAPPED, or publish with the modules this version has.",
      "zh-TW": "請更新《無界之地》，或只用這個版本有的功能模組來發布。",
      ja: "UNMAPPED を更新するか、このバージョンにあるモジュールだけで公開してください。",
    },
  },
  "cartridge-mod-lock-invalid": {
    message: {
      en: "The cartridge's list of mods is not valid.",
      "zh-TW": "卡帶的模組清單無效。",
      ja: "カートリッジの MOD 一覧が正しくありません。",
    },
    hint: HINT.repairCartridge,
  },
  "cartridge-profile-invalid": {
    message: {
      en: "The cartridge's capability settings are not valid.",
      "zh-TW": "卡帶的功能設定無效。",
      ja: "カートリッジの機能設定が正しくありません。",
    },
    hint: HINT.repairCartridge,
  },
  "cartridge-prerequisite-invalid": {
    message: {
      en: "A scene needs something no earlier scene can give.",
      "zh-TW": "有場景需要的條件，之前的場景都給不了。",
      ja: "シーンに必要な条件を、それより前のシーンが与えられません。",
    },
    hint: HINT.repairCartridge,
  },
  "cartridge-scene-hash-mismatch": {
    message: {
      en: "A scene does not match its recorded hash.",
      "zh-TW": "有場景和它記錄的雜湊值不符。",
      ja: "シーンが、記録されたハッシュと一致しません。",
    },
    hint: HINT.repairCartridge,
  },
  "cartridge-bible-invalid": {
    message: {
      en: "The cartridge's world bible is empty or too long.",
      "zh-TW": "卡帶的世界設定集是空的或太長。",
      ja: "カートリッジの世界設定が空か、長すぎます。",
    },
    hint: HINT.repairCartridge,
  },
  "cartridge-dialogue-invalid": {
    message: {
      en: "A stored conversation in this cartridge is not valid.",
      "zh-TW": "這張卡帶裡有無效的已存對話。",
      ja: "このカートリッジに保存された会話が正しくありません。",
    },
    hint: HINT.repairCartridge,
  },

  // ── Assets ─────────────────────────────────────────────────────────────────────────────────
  "cartridge-assets-invalid": {
    message: {
      en: "The cartridge declares an asset more than once.",
      "zh-TW": "卡帶重複宣告了同一個素材。",
      ja: "カートリッジが同じ素材を二回以上宣言しています。",
    },
    hint: HINT.repairCartridge,
  },
  "cartridge-assets-mismatch": {
    message: {
      en: "The cartridge uses assets it does not declare.",
      "zh-TW": "卡帶用到了沒有宣告的素材。",
      ja: "カートリッジが、宣言していない素材を使っています。",
    },
    hint: HINT.repairCartridge,
  },
  "cartridge-asset-path-invalid": {
    message: {
      en: "The cartridge has an unsafe asset path.",
      "zh-TW": "卡帶含有不安全的素材路徑。",
      ja: "カートリッジに安全でない素材のパスがあります。",
    },
    hint: HINT.reinstall,
  },
  "asset-pack-missing": {
    message: {
      en: "An asset pack this cartridge needs is not installed.",
      "zh-TW": "這張卡帶需要的素材包沒有安裝。",
      ja: "このカートリッジに必要な素材パックがインストールされていません。",
    },
    hint: HINT.repairCartridge,
  },
  "asset-missing": {
    message: {
      en: "That asset is not installed.",
      "zh-TW": "這個素材沒有安裝。",
      ja: "その素材はインストールされていません。",
    },
    hint: {
      en: "Choose an installed built-in asset.",
      "zh-TW": "請選擇已安裝的內建素材。",
      ja: "インストール済みの内蔵素材を選んでください。",
    },
  },
  "asset-hash-mismatch": {
    message: {
      en: "An asset does not match its installed version.",
      "zh-TW": "素材和已安裝的版本不符。",
      ja: "素材がインストール済みの版と一致しません。",
    },
    hint: {
      en: "Generate it again with the installed asset pack.",
      "zh-TW": "請用已安裝的素材包重新生成。",
      ja: "インストール済みの素材パックで生成し直してください。",
    },
  },
  "cartridge-look-invalid": {
    message: {
      en: "This world's look picture is not a PNG within 4 MB.",
      "zh-TW": "這個世界的外觀圖片不是 4 MB 以內的 PNG。",
      ja: "この世界の見た目の絵は 4 MB 以内の PNG ではありません。",
    },
    hint: {
      en: "Its pictures are drawn without a reference.",
      "zh-TW": "它的圖片會在沒有參考圖的情況下繪製。",
      ja: "この世界の絵は参考画像なしで描かれます。",
    },
  },
};
