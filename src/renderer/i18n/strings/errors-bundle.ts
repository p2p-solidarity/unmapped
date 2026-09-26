// Errors about `.world` files and moving a world between services (rev 6 phase 4, D5). English
// words stay at their source (main, the service, `verifyWorldBundle`); these are what the screen
// shows, a report's problems included.

import type { ErrorText } from "./errors";

const FRESH_EXPORT = {
  en: "Nothing was imported. Ask for a fresh export of the world.",
  "zh-TW": "什麼都沒有匯入。請對方重新匯出這個世界。",
  ja: "何も取り込んでいません。ワールドを書き出し直してもらってください。",
};

const ALTERED = {
  en: "The file was altered or damaged after it was exported.",
  "zh-TW": "這個檔案在匯出後被改動或損壞了。",
  ja: "ファイルは書き出し後に変更されたか壊れています。",
};

const problem = (en: string, zh: string, ja: string): ErrorText => ({
  message: { en, "zh-TW": zh, ja },
  hint: FRESH_EXPORT,
});

export const BUNDLE_ERRORS: Record<string, ErrorText> = {
  "bundle-invalid": {
    message: {
      en: "This .world file does not verify.",
      "zh-TW": "這個 .world 檔沒有通過驗證。",
      ja: "この .world ファイルは検証に通りません。",
    },
    hint: FRESH_EXPORT,
  },
  "bundle-too-large": {
    message: {
      en: "This file is larger than a .world may be.",
      "zh-TW": "這個檔案超過 .world 的大小上限。",
      ja: "このファイルは .world の上限を超えています。",
    },
    hint: {
      en: "A .world holds at most an 80 MiB history and 256 MiB of packs (32 MiB each).",
      "zh-TW": ".world 最多容納 80 MiB 的歷史與 256 MiB 的內容包（每個 32 MiB）。",
      ja: ".world に入るのは最大 80 MiB の歴史と 256 MiB のパック（1 つ 32 MiB）までです。",
    },
  },
  "world-too-large": {
    message: {
      en: "This world's history is too large for a .world file.",
      "zh-TW": "這個世界的歷史太大，放不進 .world 檔。",
      ja: "このワールドの歴史は .world ファイルに収まりません。",
    },
    hint: {
      en: "A .world holds at most an 80 MiB history and 256 MiB of packs (32 MiB each).",
      "zh-TW": ".world 最多容納 80 MiB 的歷史與 256 MiB 的內容包（每個 32 MiB）。",
      ja: ".world に入るのは最大 80 MiB の歴史と 256 MiB のパック（1 つ 32 MiB）までです。",
    },
  },
  "bundle-archive-invalid": problem(
    "This is not a readable .world file.",
    "這不是可讀取的 .world 檔。",
    "読み取れる .world ファイルではありません。",
  ),
  "bundle-entry-unknown": problem(
    "The file holds something a .world never does.",
    "這個檔案裡有 .world 不該有的東西。",
    "このファイルには .world にないはずのものが入っています。",
  ),
  "bundle-unreadable": {
    message: {
      en: "The file cannot be read.",
      "zh-TW": "無法讀取這個檔案。",
      ja: "ファイルを読み取れません。",
    },
    hint: { en: "Choose it again.", "zh-TW": "請重新選擇。", ja: "もう一度選んでください。" },
  },
  "bundle-token-unknown": {
    message: {
      en: "That file is no longer open here.",
      "zh-TW": "那個檔案已經不在這裡了。",
      ja: "そのファイルはもう開かれていません。",
    },
    hint: { en: "Choose it again.", "zh-TW": "請重新選擇。", ja: "もう一度選んでください。" },
  },
  "bundle-write-failed": {
    message: {
      en: "The .world file could not be written.",
      "zh-TW": "無法寫入 .world 檔。",
      ja: ".world ファイルを書き出せませんでした。",
    },
    hint: {
      en: "Choose another folder with free space.",
      "zh-TW": "請改選一個還有空間的資料夾。",
      ja: "空きのある別のフォルダーを選んでください。",
    },
  },
  "bundle-blob-missing": {
    message: {
      en: "A pack this world names is not in the file, or not on this device.",
      "zh-TW": "這個世界需要的某個內容包不在檔案裡，或不在這台裝置上。",
      ja: "このワールドが必要とするパックが、ファイルにもこの端末にもありません。",
    },
    hint: {
      en: "Open the world online once so everything it names arrives, then export again.",
      "zh-TW": "請先連線打開這個世界一次，讓它需要的內容都到齊，再重新匯出。",
      ja: "一度オンラインでワールドを開いて必要なものをそろえてから、書き出し直してください。",
    },
  },
  "bundle-physics-mismatch": problem(
    "The file's description and its history name different physics.",
    "檔案的描述與它的歷史記載的物理版本不同。",
    "ファイルの説明と歴史とで物理のバージョンが違います。",
  ),
  "bundle-protocol-understated": problem(
    "The file states an older world protocol than its history needs.",
    "檔案宣告的世界協定版本比它的歷史需要的舊。",
    "ファイルが示すワールドプロトコルが、歴史に必要な版より古くなっています。",
  ),
  "import-physics-pin": {
    message: {
      en: "This world keeps physics this build would not give a new save.",
      "zh-TW": "這個世界使用的物理版本，和這個版本建立新存檔時用的不同。",
      ja: "このワールドの物理は、このビルドが新しいセーブに使うものと違います。",
    },
    hint: {
      en: "Import it with a build made for that physics.",
      "zh-TW": "請用支援那個物理版本的 UNMAPPED 匯入。",
      ja: "その物理に対応したビルドで取り込んでください。",
    },
  },
  "world-history-diverged": {
    message: {
      en: "This device already holds another history of this world; both are kept.",
      "zh-TW": "這台裝置已經有這個世界的另一段歷史；兩份都保留。",
      ja: "この端末にはこのワールドの別の歴史があります。両方を残しました。",
    },
    hint: {
      en: "The file's copy is kept beside it; nothing was merged.",
      "zh-TW": "檔案裡的那份另外保存在旁邊，沒有合併任何東西。",
      ja: "ファイルの写しは横に保存しました。何も混ぜていません。",
    },
  },
  "world-mirror-only": {
    message: {
      en: "That service holds a copy of this world but does not write it.",
      "zh-TW": "那個服務只保存這個世界的副本，不會寫入。",
      ja: "そのサービスはこのワールドの写しを持つだけで、書き込みません。",
    },
    hint: {
      en: "An owner moves the world there first (Worlds → World files).",
      "zh-TW": "請主人先把世界搬過去（世界 → 世界檔案）。",
      ja: "先に持ち主がワールドを移してください（ワールド → ワールドファイル）。",
    },
  },
  "move-link-invalid": {
    message: {
      en: "That is not a move link.",
      "zh-TW": "這不是搬家連結。",
      ja: "引っ越しリンクではありません。",
    },
    hint: {
      en: "Paste the whole unmapped://world?… link the world's owner sent.",
      "zh-TW": "請貼上主人傳來的完整 unmapped://world?… 連結。",
      ja: "持ち主から届いた unmapped://world?… のリンクを丸ごと貼ってください。",
    },
  },
  "move-not-rehosted": {
    message: {
      en: "That service holds this world, but no owner has moved it there yet.",
      "zh-TW": "那個服務有這個世界，但還沒有主人把它搬過去。",
      ja: "そのサービスはこのワールドを持っていますが、まだ持ち主が移していません。",
    },
    hint: {
      en: "Follow the link again once an owner has moved the world.",
      "zh-TW": "等主人把世界搬過去之後，再開一次這個連結。",
      ja: "持ち主がワールドを移したあとで、もう一度リンクを開いてください。",
    },
  },
  "move-world-missing": {
    message: {
      en: "This world is not on this device.",
      "zh-TW": "這台裝置上沒有這個世界。",
      ja: "このワールドはこの端末にありません。",
    },
    hint: {
      en: "Join it with an invite link, or import its .world file.",
      "zh-TW": "請用邀請連結加入，或匯入它的 .world 檔。",
      ja: "招待リンクで参加するか、.world ファイルを取り込んでください。",
    },
  },
  "move-local-only": {
    message: {
      en: "This world was never shared, so there is nothing to move.",
      "zh-TW": "這個世界從未分享過，沒有東西可以搬。",
      ja: "このワールドは共有されたことがないので、移すものがありません。",
    },
    hint: {
      en: "Share it on a world service from the device that made it.",
      "zh-TW": "請在建立它的裝置上，把它分享到世界服務。",
      ja: "つくった端末から、ワールドサービスで共有してください。",
    },
  },
  // ── A report's problems (verifyWorldBundle) ──────────────────────────────────────────────
  "bundle-manifest-invalid": problem(
    "world.json is missing or does not read.",
    "world.json 不見了或無法讀取。",
    "world.json がないか、読み取れません。",
  ),
  "bundle-hash-mismatch": {
    message: {
      en: "A file does not match its listed hash.",
      "zh-TW": "有檔案和清單上的雜湊不符。",
      ja: "一覧のハッシュと合わないファイルがあります。",
    },
    hint: ALTERED,
  },
  "bundle-file-unlisted": {
    message: {
      en: "The file holds something world.json does not list.",
      "zh-TW": "檔案裡有 world.json 沒列出的東西。",
      ja: "world.json に載っていないものが入っています。",
    },
    hint: ALTERED,
  },
  "bundle-file-missing": {
    message: {
      en: "Something world.json lists is not in the file.",
      "zh-TW": "world.json 列出的東西不在檔案裡。",
      ja: "world.json に載っているものが入っていません。",
    },
    hint: ALTERED,
  },
  "bundle-files-order": {
    message: {
      en: "world.json's file list is out of order.",
      "zh-TW": "world.json 的檔案清單順序不對。",
      ja: "world.json のファイル一覧の順序が違います。",
    },
    hint: ALTERED,
  },
  "bundle-signature-invalid": {
    message: {
      en: "The exporter's signature does not verify.",
      "zh-TW": "匯出者的簽章驗證失敗。",
      ja: "書き出した人の署名が検証できません。",
    },
    hint: ALTERED,
  },
  "bundle-signature-missing": {
    message: {
      en: "The file carries no exporter's signature.",
      "zh-TW": "檔案沒有匯出者的簽章。",
      ja: "書き出した人の署名がありません。",
    },
    hint: ALTERED,
  },
  "bundle-head-mismatch": {
    message: {
      en: "world.json names another last entry than the history's.",
      "zh-TW": "world.json 記的最後一筆和歷史不同。",
      ja: "world.json の最後の記録が歴史と違います。",
    },
    hint: ALTERED,
  },
  "bundle-services-mismatch": {
    message: {
      en: "world.json names other services than the history's.",
      "zh-TW": "world.json 記的服務和歷史不同。",
      ja: "world.json のサービスが歴史と違います。",
    },
    hint: ALTERED,
  },
  "bundle-entry-ignored": {
    message: {
      en: "An entry of the history does not fold.",
      "zh-TW": "歷史中有一筆紀錄無法折疊進世界。",
      ja: "歴史の記録のうち、ワールドに畳み込めないものがあります。",
    },
    hint: ALTERED,
  },
  "bundle-beat-mismatch": {
    message: {
      en: "A beat does not recompute from the history before it.",
      "zh-TW": "有一次脈動無法由之前的歷史重算出來。",
      ja: "脈動のひとつが、それまでの歴史から再計算できません。",
    },
    hint: ALTERED,
  },
  "bundle-genesis-pack-missing": {
    message: {
      en: "The file carries no cartridge pack.",
      "zh-TW": "檔案沒有附上卡匣內容包。",
      ja: "カートリッジのパックが入っていません。",
    },
    hint: FRESH_EXPORT,
  },
  "bundle-genesis-pack-mismatch": {
    message: {
      en: "The cartridge pack is another revision than the world's.",
      "zh-TW": "卡匣內容包不是這個世界的那個版本。",
      ja: "カートリッジのパックがワールドの版と違います。",
    },
    hint: ALTERED,
  },
  "bundle-genesis-pack-not-announced": {
    message: {
      en: "The cartridge pack is not the one the world announced.",
      "zh-TW": "卡匣內容包不是世界宣告的那一個。",
      ja: "カートリッジのパックがワールドの告げたものと違います。",
    },
    hint: ALTERED,
  },
  "bundle-work-pack-mismatch": {
    message: {
      en: "An AI world's pack is another revision than its place names.",
      "zh-TW": "有個 AI 世界的內容包和地點記載的版本不同。",
      ja: "AI ワールドのパックが場所の記す版と違います。",
    },
    hint: ALTERED,
  },
  "bundle-blob-unreferenced": {
    message: {
      en: "The file carries a pack nothing in it names.",
      "zh-TW": "檔案裡有沒被任何地方引用的內容包。",
      ja: "どこからも参照されないパックが入っています。",
    },
    hint: ALTERED,
  },
  "bundle-blob-name": {
    message: {
      en: "A pack is not named by its own hash.",
      "zh-TW": "有個內容包的名稱不是它自己的雜湊。",
      ja: "自分のハッシュで名付けられていないパックがあります。",
    },
    hint: ALTERED,
  },
  "bundle-log-invalid": {
    message: {
      en: "The history in the file does not read.",
      "zh-TW": "檔案裡的歷史無法讀取。",
      ja: "ファイルの歴史が読み取れません。",
    },
    hint: ALTERED,
  },
  "bundle-log-missing": {
    message: {
      en: "The file carries no history.",
      "zh-TW": "檔案裡沒有歷史。",
      ja: "ファイルに歴史が入っていません。",
    },
    hint: ALTERED,
  },
  "bundle-no-genesis": {
    message: {
      en: "The history does not start with its world.",
      "zh-TW": "歷史不是從這個世界的創世開始。",
      ja: "歴史がワールドの始まりから始まっていません。",
    },
    hint: ALTERED,
  },
};
