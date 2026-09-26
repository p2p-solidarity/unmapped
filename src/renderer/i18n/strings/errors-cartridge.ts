// Errors about cartridges: the library, .cartridge import and export, publishing, and the checks a
// revision must pass before it is installed or played. The player calls a cartridge a world and a
// revision a version (docs/plans/simplify-together.md), so these words say "world".

import type { ErrorText } from "./errors";
import { HINT } from "./errors-hints";

export const CARTRIDGE_ERRORS: Record<string, ErrorText> = {
  // ── Library, import and export ─────────────────────────────────────────────────────────────
  "cartridge-list-failed": {
    message: {
      en: "The list of installed worlds could not be read.",
      "zh-TW": "無法讀取已安裝的世界清單。",
      ja: "インストール済みのワールドの一覧を読み込めませんでした。",
    },
    hint: HINT.readable,
  },
  "cartridge-read-failed": {
    message: {
      en: "A world could not be read.",
      "zh-TW": "無法讀取世界。",
      ja: "ワールドを読み込めませんでした。",
    },
    hint: {
      en: "Check the file or the app's data folder, then try again.",
      "zh-TW": "請檢查檔案或應用程式的資料夾，然後再試一次。",
      ja: "ファイルかアプリのデータフォルダーを確認してから、もう一度試してください。",
    },
  },
  "cartridge-write-failed": {
    message: {
      en: "The .cartridge file could not be written.",
      "zh-TW": "無法寫入 .cartridge 檔案。",
      ja: ".cartridge ファイルを書き込めませんでした。",
    },
    hint: HINT.otherFolder,
  },
  "cartridge-pack-failed": {
    message: {
      en: "The world could not be packed for export.",
      "zh-TW": "無法打包世界以供匯出。",
      ja: "ワールドを書き出し用にまとめられませんでした。",
    },
    hint: HINT.tryAgain,
  },
  "cartridge-publish-failed": {
    message: {
      en: "The world could not be published.",
      "zh-TW": "無法發布世界。",
      ja: "ワールドを公開できませんでした。",
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
      en: "The .cartridge file is damaged.",
      "zh-TW": ".cartridge 檔案已損毀。",
      ja: ".cartridge ファイルが壊れています。",
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
      en: "The .cartridge contains files a world should not have.",
      "zh-TW": ".cartridge 裡有世界不該有的檔案。",
      ja: ".cartridge に、ワールドにはないはずのファイルがあります。",
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
      en: "The .cartridge is larger than a world may be, so it was not opened.",
      "zh-TW": "這個 .cartridge 超過世界允許的大小，因此沒有開啟。",
      ja: ".cartridge が許可されたサイズを超えているため、開きませんでした。",
    },
    hint: {
      en: "A world may be at most 32 MiB; ask for a smaller export.",
      "zh-TW": "一個世界最多 32 MiB；請對方匯出較小的版本。",
      ja: "ワールドは最大 32 MiB です。小さく書き出してもらってください。",
    },
  },
  "cartridge-manifest-invalid": {
    message: {
      en: "The world's list of contents is not valid.",
      "zh-TW": "世界的內容清單無效。",
      ja: "ワールドの中身の一覧が正しくありません。",
    },
    hint: HINT.repairCartridge,
  },
  "cartridge-integrity-failed": {
    message: {
      en: "The world's files are not the ones that were published.",
      "zh-TW": "世界的檔案和發布時的不一樣。",
      ja: "ワールドのファイルが、公開したときのものと違います。",
    },
    hint: {
      en: "Reinstall it from a fresh export.",
      "zh-TW": "請用重新匯出的檔案再安裝一次。",
      ja: "新しく書き出したものから入れ直してください。",
    },
  },
  "cartridge-files-invalid": {
    message: {
      en: "The world's folder holds files it did not declare.",
      "zh-TW": "世界的資料夾裡有不該有的檔案。",
      ja: "ワールドのフォルダーに、あるはずのないファイルがあります。",
    },
    hint: HINT.reinstall,
  },
  "cartridge-identity-mismatch": {
    message: {
      en: "The world does not match the folder it is stored in.",
      "zh-TW": "世界和它所在的資料夾對不上。",
      ja: "ワールドが、保存されているフォルダーと一致しません。",
    },
    hint: HINT.reinstall,
  },
  "cartridge-version-conflict": {
    message: {
      en: "This version of the world already exists with different content.",
      "zh-TW": "這個世界的這個版本已經存在，而且內容不同。",
      ja: "このワールドのこの版はすでにあり、内容が異なります。",
    },
    hint: {
      en: "Publish under a new version number; published versions are never overwritten.",
      "zh-TW": "請用新的版本號發布；已發布的版本永遠不會被覆寫。",
      ja: "新しいバージョン番号で公開してください。公開済みの版は上書きされません。",
    },
  },
  "cartridge-engine-unsupported": {
    message: {
      en: "This world needs a newer UNMAPPED.",
      "zh-TW": "這個世界需要較新版本的《無界之地》。",
      ja: "このワールドには、より新しい UNMAPPED が必要です。",
    },
    hint: {
      en: "Update UNMAPPED to play it.",
      "zh-TW": "請更新《無界之地》再遊玩。",
      ja: "UNMAPPED を更新してから遊んでください。",
    },
  },
  "cartridge-save-unsupported": {
    message: {
      en: "This world saves progress in a way this UNMAPPED does not support.",
      "zh-TW": "這個世界的存檔格式，這個版本的《無界之地》不支援。",
      ja: "このワールドのセーブ形式に、この UNMAPPED は対応していません。",
    },
    hint: {
      en: "Use a compatible version of UNMAPPED.",
      "zh-TW": "請使用相容版本的《無界之地》。",
      ja: "対応しているバージョンの UNMAPPED を使ってください。",
    },
  },
  "cartridge-missing": {
    message: {
      en: "The version of the world this save was made with is not installed.",
      "zh-TW": "這個存檔所用的世界版本沒有安裝。",
      ja: "このセーブで使っているワールドの版がインストールされていません。",
    },
    hint: {
      en: "Import that exact version of the world first; a save never moves to another version on restore.",
      "zh-TW": "請先匯入那個世界版本；還原時存檔不會改用其他版本。",
      ja: "先にその版のワールドを読み込んでください。復元時にセーブが別の版へ移ることはありません。",
    },
  },
  "cartridge-id-invalid": {
    message: {
      en: "The world id is not valid.",
      "zh-TW": "世界 id 無效。",
      ja: "ワールド ID が正しくありません。",
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
      en: "The rules this save recorded do not match the installed version of the world.",
      "zh-TW": "存檔記錄的規則和已安裝的世界版本不符。",
      ja: "セーブに記録されたルールが、インストール済みのワールドの版と一致しません。",
    },
    hint: {
      en: "Restore that exact version of the world, or start a new game.",
      "zh-TW": "請還原那個世界版本，或開始新遊戲。",
      ja: "同じ版のワールドを復元するか、はじめから遊んでください。",
    },
  },

  // ── Checks a revision must pass ────────────────────────────────────────────────────────────
  "cartridge-rules-empty": {
    message: {
      en: "The world has no gameplay rules.",
      "zh-TW": "世界沒有遊戲規則。",
      ja: "ワールドにゲームのルールがありません。",
    },
    hint: HINT.repairCartridge,
  },
  "cartridge-rules-invalid": {
    message: {
      en: "The world's gameplay rules cannot be read.",
      "zh-TW": "無法讀取世界的遊戲規則。",
      ja: "ワールドのゲームのルールを読み込めません。",
    },
    hint: HINT.repairCartridge,
  },
  "cartridge-scene-invalid": {
    message: {
      en: "A scene in this world is not valid.",
      "zh-TW": "這個世界裡有無效的場景。",
      ja: "このワールドに正しくないシーンがあります。",
    },
    hint: HINT.repairCartridge,
  },
  "cartridge-scenes-invalid": {
    message: {
      en: "The world's scene ids are not valid.",
      "zh-TW": "世界的場景 id 無效。",
      ja: "ワールドのシーン ID が正しくありません。",
    },
    hint: HINT.repairCartridge,
  },
  "cartridge-scenes-mismatch": {
    message: {
      en: "The world's scenes do not match its list of scenes.",
      "zh-TW": "世界的場景和它的場景清單對不上。",
      ja: "ワールドのシーンが、シーンの一覧と一致しません。",
    },
    hint: HINT.repairCartridge,
  },
  "cartridge-story-mismatch": {
    message: {
      en: "The world's scene plan does not match its scenes.",
      "zh-TW": "世界的場景規劃和場景對不上。",
      ja: "ワールドのシーン構成が、シーンと一致しません。",
    },
    hint: HINT.repairCartridge,
  },
  "cartridge-entry-missing": {
    message: {
      en: "The world's first scene is not one of its scenes.",
      "zh-TW": "世界的起始場景不在它的場景之中。",
      ja: "ワールドの最初のシーンが、シーンの中にありません。",
    },
    hint: HINT.repairCartridge,
  },
  "cartridge-ending-missing": {
    message: {
      en: "The world's ending is missing.",
      "zh-TW": "世界缺少結局。",
      ja: "ワールドにエンディングがありません。",
    },
    hint: HINT.repairCartridge,
  },
  "cartridge-route-invalid": {
    message: {
      en: "The world's exits lead nowhere or never reach an ending.",
      "zh-TW": "世界的出口通往不存在的地方，或永遠到不了結局。",
      ja: "ワールドの出口に行き先がないか、エンディングにたどり着きません。",
    },
    hint: HINT.repairCartridge,
  },
  "cartridge-contract-invalid": {
    message: {
      en: "A scene's contract does not match the world.",
      "zh-TW": "有場景的合約和世界對不上。",
      ja: "シーンの契約が、ワールドと一致しません。",
    },
    hint: HINT.repairCartridge,
  },
  "cartridge-kit-missing": {
    message: {
      en: "A scene needs gameplay the world's rules do not set up.",
      "zh-TW": "有場景需要的玩法，世界的規則沒有設定。",
      ja: "シーンに必要な遊び方が、ワールドのルールに設定されていません。",
    },
    hint: HINT.repairCartridge,
  },
  "cartridge-module-missing": {
    message: {
      en: "A scene needs a capability module the world does not include.",
      "zh-TW": "有場景需要世界沒有包含的功能模組。",
      ja: "シーンに、ワールドに含まれていないモジュールが必要です。",
    },
    hint: HINT.repairCartridge,
  },
  "cartridge-module-lock-invalid": {
    message: {
      en: "The world's list of capability modules is not valid.",
      "zh-TW": "世界的功能模組清單無效。",
      ja: "ワールドのモジュール一覧が正しくありません。",
    },
    hint: HINT.repairCartridge,
  },
  "cartridge-module-lock-untrusted": {
    message: {
      en: "The world needs a capability module this UNMAPPED does not have.",
      "zh-TW": "世界需要這個版本的《無界之地》沒有的功能模組。",
      ja: "ワールドに、この UNMAPPED にはないモジュールが必要です。",
    },
    hint: {
      en: "Update UNMAPPED, or publish with the modules this version has.",
      "zh-TW": "請更新《無界之地》，或只用這個版本有的功能模組來發布。",
      ja: "UNMAPPED を更新するか、このバージョンにあるモジュールだけで公開してください。",
    },
  },
  "cartridge-mod-lock-invalid": {
    message: {
      en: "The world's list of mods is not valid.",
      "zh-TW": "世界的模組清單無效。",
      ja: "ワールドの MOD 一覧が正しくありません。",
    },
    hint: HINT.repairCartridge,
  },
  "cartridge-profile-invalid": {
    message: {
      en: "The world's capability settings are not valid.",
      "zh-TW": "世界的功能設定無效。",
      ja: "ワールドの機能設定が正しくありません。",
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
      en: "A scene is not the one that was published.",
      "zh-TW": "有場景和發布時的不一樣。",
      ja: "シーンが、公開したときのものと違います。",
    },
    hint: HINT.repairCartridge,
  },
  "cartridge-bible-invalid": {
    message: {
      en: "The world's bible is empty or too long.",
      "zh-TW": "世界設定集是空的或太長。",
      ja: "ワールドの世界設定が空か、長すぎます。",
    },
    hint: HINT.repairCartridge,
  },
  "cartridge-dialogue-invalid": {
    message: {
      en: "A stored conversation in this world is not valid.",
      "zh-TW": "這個世界裡有無效的已存對話。",
      ja: "このワールドに保存された会話が正しくありません。",
    },
    hint: HINT.repairCartridge,
  },

  // ── Assets ─────────────────────────────────────────────────────────────────────────────────
  "cartridge-assets-invalid": {
    message: {
      en: "The world lists a picture or sound more than once.",
      "zh-TW": "世界重複列出了同一個素材。",
      ja: "ワールドが同じ素材を二回以上載せています。",
    },
    hint: HINT.repairCartridge,
  },
  "cartridge-assets-mismatch": {
    message: {
      en: "The world uses pictures or sounds it does not list.",
      "zh-TW": "世界用到了沒有列出的素材。",
      ja: "ワールドが、一覧にない素材を使っています。",
    },
    hint: HINT.repairCartridge,
  },
  "cartridge-asset-path-invalid": {
    message: {
      en: "The world has an unsafe file path for a picture or sound.",
      "zh-TW": "世界含有不安全的素材路徑。",
      ja: "ワールドに安全でない素材のパスがあります。",
    },
    hint: HINT.reinstall,
  },
  "asset-pack-missing": {
    message: {
      en: "An asset pack this world needs is not installed.",
      "zh-TW": "這個世界需要的素材包沒有安裝。",
      ja: "このワールドに必要な素材パックがインストールされていません。",
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
