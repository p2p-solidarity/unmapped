// Errors about files outside a save: Remix workspaces, legacy worlds and their migration, player
// profiles, and the app's own file dialogs, links and background process.

import type { ErrorText } from "./errors";
import { HINT } from "./errors-hints";

const FROM_SEED = {
  en: "Restore it from a .seed export.",
  "zh-TW": "請用匯出的 .seed 還原。",
  ja: "書き出した .seed から復元してください。",
};

const PICK_WORLD = {
  en: "It may have been deleted; pick a world from the list.",
  "zh-TW": "它可能已被刪除，請從清單中選一個世界。",
  ja: "削除された可能性があります。一覧からワールドを選んでください。",
};

const BAD_REQUEST: ErrorText = {
  message: {
    en: "The app rejected a malformed request.",
    "zh-TW": "應用程式拒絕了格式錯誤的請求。",
    ja: "アプリが不正な形式のリクエストを拒否しました。",
  },
  hint: HINT.bug,
};

export const FILE_ERRORS: Record<string, ErrorText> = {
  // ── Remix workspaces ───────────────────────────────────────────────────────────────────────
  "workspace-list-failed": {
    message: {
      en: "Your workspaces could not be listed.",
      "zh-TW": "無法列出你的工作區。",
      ja: "ワークスペースの一覧を読み込めませんでした。",
    },
    hint: HINT.readable,
  },
  "workspace-read-failed": {
    message: {
      en: "This workspace could not be read.",
      "zh-TW": "無法讀取這個工作區。",
      ja: "このワークスペースを読み込めませんでした。",
    },
    hint: HINT.readable,
  },
  "workspace-write-failed": {
    message: {
      en: "The workspace could not be saved.",
      "zh-TW": "無法儲存工作區。",
      ja: "ワークスペースを保存できませんでした。",
    },
    hint: HINT.disk,
  },
  "workspace-create-failed": {
    message: {
      en: "The workspace could not be created.",
      "zh-TW": "無法建立工作區。",
      ja: "ワークスペースを作成できませんでした。",
    },
    hint: HINT.disk,
  },
  "workspace-exists": {
    message: {
      en: "A workspace with this id already exists.",
      "zh-TW": "已經有相同 id 的工作區。",
      ja: "同じ ID のワークスペースがすでにあります。",
    },
  },
  "workspace-invalid": {
    message: {
      en: "This workspace's record is damaged.",
      "zh-TW": "這個工作區的紀錄已損毀。",
      ja: "このワークスペースの記録が壊れています。",
    },
  },
  "workspace-id-invalid": {
    message: {
      en: "That workspace id is not valid.",
      "zh-TW": "工作區 id 無效。",
      ja: "ワークスペース ID が正しくありません。",
    },
  },
  "workspace-identity-mismatch": {
    message: {
      en: "The workspace does not match the folder it is stored in.",
      "zh-TW": "工作區和它所在的資料夾對不上。",
      ja: "ワークスペースが、保存されているフォルダーと一致しません。",
    },
  },
  "workspace-cartridge-id-invalid": {
    message: {
      en: "The new world id is not valid.",
      "zh-TW": "新的世界 id 無效。",
      ja: "新しいワールド ID が正しくありません。",
    },
    hint: {
      en: "Use lowercase letters, digits and hyphens.",
      "zh-TW": "請只使用小寫英文字母、數字與連字號。",
      ja: "英小文字・数字・ハイフンだけを使ってください。",
    },
  },
  "workspace-mode-invalid": {
    message: {
      en: "A new version keeps its world id; a remix needs a new one.",
      "zh-TW": "新版本沿用原本的世界 id；改編版則需要新的 id。",
      ja: "新しい版はワールド ID をそのまま使い、リミックスには新しい ID が必要です。",
    },
  },
  "workspace-kit-missing": {
    message: {
      en: "The rules must set up every kind of gameplay this workspace needs.",
      "zh-TW": "規則必須設定這個工作區需要的所有玩法。",
      ja: "ルールには、このワークスペースに必要なすべての遊び方を設定する必要があります。",
    },
  },
  "workspace-scene-invalid": {
    message: {
      en: "A scene in this workspace is not valid.",
      "zh-TW": "這個工作區裡有無效的場景。",
      ja: "このワークスペースに正しくないシーンがあります。",
    },
    hint: {
      en: "Fix the scene and keep its id unchanged.",
      "zh-TW": "請修正這個場景，並保持它的 id 不變。",
      ja: "シーンを直し、ID は変えないでください。",
    },
  },
  "workspace-scene-unknown": {
    message: {
      en: "This workspace does not declare that scene.",
      "zh-TW": "這個工作區沒有宣告這個場景。",
      ja: "このワークスペースはそのシーンを宣言していません。",
    },
  },
  "workspace-source-invalid": {
    message: {
      en: "This older workspace is missing its source.",
      "zh-TW": "這個舊版工作區缺少原始定義。",
      ja: "旧形式のワークスペースに元の定義がありません。",
    },
  },
  "workspace-validation-failed": {
    message: {
      en: "The workspace is not ready to publish.",
      "zh-TW": "工作區還不能發布。",
      ja: "ワークスペースはまだ公開できません。",
    },
    hint: {
      en: "Run Validate & Preview and fix every failed check before publishing.",
      "zh-TW": "請執行「驗證並預覽」，修正所有沒通過的檢查後再發布。",
      ja: "「検証してプレビュー」を実行し、失敗したチェックをすべて直してから公開してください。",
    },
  },

  // ── Legacy worlds and their migration ──────────────────────────────────────────────────────
  "world-missing": {
    message: {
      en: "That world does not exist.",
      "zh-TW": "這個世界不存在。",
      ja: "そのワールドは存在しません。",
    },
    hint: PICK_WORLD,
  },
  "world-id-invalid": {
    message: {
      en: "That world id is not valid.",
      "zh-TW": "世界 id 無效。",
      ja: "ワールド ID が正しくありません。",
    },
    hint: PICK_WORLD,
  },
  "world-exists": {
    message: {
      en: "A world folder with this name already exists.",
      "zh-TW": "已經有同名的世界資料夾。",
      ja: "同じ名前のワールドフォルダーがすでにあります。",
    },
    hint: {
      en: "Rename the world, or try again in a moment.",
      "zh-TW": "請替世界改名，或稍後再試。",
      ja: "ワールドの名前を変えるか、少し待ってから試してください。",
    },
  },
  "world-file-missing": {
    message: {
      en: "A world file could not be read.",
      "zh-TW": "無法讀取世界的某個檔案。",
      ja: "ワールドのファイルを読み込めませんでした。",
    },
    hint: {
      en: "The world folder may have been changed outside the app; restore it from a .seed export.",
      "zh-TW": "世界資料夾可能在應用程式外被改動過；請用匯出的 .seed 還原。",
      ja: "ワールドのフォルダーがアプリの外で変更された可能性があります。書き出した .seed から復元してください。",
    },
  },
  "world-file-invalid": {
    message: {
      en: "A world file is not valid.",
      "zh-TW": "世界的某個檔案無效。",
      ja: "ワールドのファイルが正しくありません。",
    },
    hint: {
      en: "Fix it in the world folder, or restore it from a .seed export.",
      "zh-TW": "請在世界資料夾裡修正，或用匯出的 .seed 還原。",
      ja: "ワールドのフォルダーで直すか、書き出した .seed から復元してください。",
    },
  },
  "world-meta-missing": {
    message: {
      en: "This world's meta.json could not be read.",
      "zh-TW": "無法讀取這個世界的 meta.json。",
      ja: "このワールドの meta.json を読み込めませんでした。",
    },
    hint: FROM_SEED,
  },
  "world-write-failed": {
    message: {
      en: "The world could not be saved.",
      "zh-TW": "無法儲存世界。",
      ja: "ワールドを保存できませんでした。",
    },
    hint: HINT.disk,
  },
  "world-remove-failed": {
    message: {
      en: "The world could not be deleted.",
      "zh-TW": "無法刪除世界。",
      ja: "ワールドを削除できませんでした。",
    },
    hint: HINT.tryAgain,
  },
  "worlds-dir-failed": {
    message: {
      en: "The worlds folder could not be read.",
      "zh-TW": "無法讀取世界資料夾。",
      ja: "ワールドのフォルダーを読み込めませんでした。",
    },
    hint: HINT.readable,
  },
  "world-incomplete": {
    message: {
      en: "The world did not return all of its files.",
      "zh-TW": "世界沒有回傳所有的檔案。",
      ja: "ワールドのファイルがすべて返ってきませんでした。",
    },
    hint: {
      en: "Reopen the world.",
      "zh-TW": "請重新開啟這個世界。",
      ja: "ワールドを開き直してください。",
    },
  },
  "migration-exit-missing": {
    message: {
      en: "This floor has no exit, so it cannot become the world's ending.",
      "zh-TW": "這一層沒有出口，所以無法成為世界的結局。",
      ja: "この階には出口がないため、ワールドのエンディングにできません。",
    },
    hint: {
      en: "Add one Exit to world.oui; reaching it will finish the migrated world.",
      "zh-TW": "請在 world.oui 加上一個 Exit；抵達它就會完成轉換後的世界。",
      ja: "world.oui に Exit を 1 つ追加してください。そこに着くと、移行したワールドをクリアできます。",
    },
  },
  "migration-scene-invalid": {
    message: {
      en: "world.oui cannot be read, so the world cannot be migrated.",
      "zh-TW": "無法讀取 world.oui，所以無法轉換這個世界。",
      ja: "world.oui を読み込めないため、ワールドを移行できません。",
    },
    hint: {
      en: "Fix world.oui in the console (F12) first; migration keeps it exactly as it is.",
      "zh-TW": "請先在主控台（F12）修正 world.oui；轉換時會原封不動地保留它。",
      ja: "先にコンソール（F12）で world.oui を直してください。移行では内容をそのまま保ちます。",
    },
  },
  "migration-version-exhausted": {
    message: {
      en: "This world has been migrated too many times.",
      "zh-TW": "這個世界轉換的次數太多了。",
      ja: "このワールドは移行の回数が多すぎます。",
    },
    hint: {
      en: "Delete unused migrated versions from the cartridges folder.",
      "zh-TW": "請從 cartridges 資料夾刪除用不到的轉換版本。",
      ja: "cartridges フォルダーから、使っていない移行版を削除してください。",
    },
  },
  "migration-receipt-failed": {
    message: {
      en: "The migration record could not be saved.",
      "zh-TW": "無法儲存轉換紀錄。",
      ja: "移行の記録を保存できませんでした。",
    },
    hint: HINT.disk,
  },

  // ── Player profiles ────────────────────────────────────────────────────────────────────────
  "profile-missing": {
    message: {
      en: "This player profile does not exist.",
      "zh-TW": "這個玩家檔案不存在。",
      ja: "このプレイヤープロフィールは存在しません。",
    },
  },
  "profile-invalid": {
    message: {
      en: "This player profile is damaged.",
      "zh-TW": "這個玩家檔案已損毀。",
      ja: "このプレイヤープロフィールが壊れています。",
    },
  },
  "profile-id-invalid": {
    message: {
      en: "That player profile id is not valid.",
      "zh-TW": "玩家檔案 id 無效。",
      ja: "プレイヤープロフィールの ID が正しくありません。",
    },
  },
  "profile-identity-mismatch": {
    message: {
      en: "The player profile does not match the folder it is stored in.",
      "zh-TW": "玩家檔案和它所在的資料夾對不上。",
      ja: "プレイヤープロフィールが、保存されているフォルダーと一致しません。",
    },
  },
  "profile-list-failed": {
    message: {
      en: "Player profiles could not be listed.",
      "zh-TW": "無法列出玩家檔案。",
      ja: "プレイヤープロフィールの一覧を読み込めませんでした。",
    },
    hint: HINT.readable,
  },
  "profile-read-failed": {
    message: {
      en: "The player profile could not be read.",
      "zh-TW": "無法讀取玩家檔案。",
      ja: "プレイヤープロフィールを読み込めませんでした。",
    },
    hint: HINT.readable,
  },
  "profile-write-failed": {
    message: {
      en: "The player profile could not be saved.",
      "zh-TW": "無法儲存玩家檔案。",
      ja: "プレイヤープロフィールを保存できませんでした。",
    },
    hint: HINT.disk,
  },
  "profile-remove-failed": {
    message: {
      en: "The player profile could not be removed.",
      "zh-TW": "無法移除玩家檔案。",
      ja: "プレイヤープロフィールを削除できませんでした。",
    },
    hint: HINT.tryAgain,
  },

  // ── The app itself ─────────────────────────────────────────────────────────────────────────
  "app-info-failed": {
    message: {
      en: "The build information could not be read.",
      "zh-TW": "無法讀取版本資訊。",
      ja: "ビルド情報を読み込めませんでした。",
    },
  },
  "open-external-failed": {
    message: {
      en: "The link could not be opened.",
      "zh-TW": "無法開啟連結。",
      ja: "リンクを開けませんでした。",
    },
    hint: HINT.tryAgain,
  },
  "url-not-allowed": {
    message: {
      en: "Only web links can be opened.",
      "zh-TW": "只能開啟網頁連結。",
      ja: "開けるのは Web のリンクだけです。",
    },
    hint: {
      en: "Only http:// and https:// links open in your browser.",
      "zh-TW": "只有 http:// 與 https:// 連結會在瀏覽器中開啟。",
      ja: "ブラウザーで開けるのは http:// と https:// のリンクだけです。",
    },
  },
  "pick-file-failed": {
    message: {
      en: "The file picker could not be opened.",
      "zh-TW": "無法開啟檔案選擇視窗。",
      ja: "ファイル選択画面を開けませんでした。",
    },
    hint: HINT.tryAgain,
  },
  "save-file-failed": {
    message: {
      en: "The file could not be saved.",
      "zh-TW": "無法儲存檔案。",
      ja: "ファイルを保存できませんでした。",
    },
    hint: HINT.otherFolder,
  },
  "ipc-failed": {
    message: {
      en: "The app's main process did not answer.",
      "zh-TW": "應用程式的主處理程序沒有回應。",
      ja: "アプリのメインプロセスが応答しませんでした。",
    },
    hint: {
      en: "Try again; if it keeps happening, restart UNMAPPED.",
      "zh-TW": "請再試一次；如果一直發生，請重新啟動《無界之地》。",
      ja: "もう一度試してください。何度も起きる場合は UNMAPPED を再起動してください。",
    },
  },
  "ipc-invalid": BAD_REQUEST,
  "invalid-payload": BAD_REQUEST,
  "preload-unavailable": {
    message: {
      en: "This only works inside the UNMAPPED app.",
      "zh-TW": "這只能在《無界之地》應用程式裡使用。",
      ja: "これは UNMAPPED アプリの中でのみ使えます。",
    },
  },
  // ── Create a game: look pictures and the quote ─────────────────────────────────────────────
  "create-look-no-card": {
    message: {
      en: "The world has no look card yet.",
      "zh-TW": "這個世界還沒有外觀風格卡。",
      ja: "この世界にはまだ見た目のカードがありません。",
    },
    hint: {
      en: "Write the look card on the world step first.",
      "zh-TW": "請先在「世界」步驟寫好外觀風格卡。",
      ja: "先に「世界」の段階で見た目のカードを書いてください。",
    },
  },
  "create-look-full": {
    message: {
      en: "This draft already keeps as many pictures as it can.",
      "zh-TW": "這份草稿保存的圖片已經到上限。",
      ja: "この下書きに保存できる絵はもう上限です。",
    },
    hint: {
      en: "Draw again: it replaces every picture but the one you chose.",
      "zh-TW": "按「重新繪製」：除了已選的那張，其他圖片都會被換掉。",
      ja: "「描き直す」を押すと、選んだ一枚以外の絵がすべて置き換わります。",
    },
  },
  "create-look-invalid": {
    message: {
      en: "The picture is not a PNG within 4 MB.",
      "zh-TW": "這張圖片不是 4 MB 以內的 PNG。",
      ja: "この絵は 4 MB 以内の PNG ではありません。",
    },
    hint: HINT.tryAgain,
  },
  "create-look-missing": {
    message: {
      en: "The chosen picture could not be read.",
      "zh-TW": "讀不到已選的圖片。",
      ja: "選んだ絵を読み込めませんでした。",
    },
    hint: {
      en: "Pick another picture, or go on without one.",
      "zh-TW": "請改選另一張，或不選圖片繼續。",
      ja: "別の絵を選ぶか、絵なしで進んでください。",
    },
  },
  "create-look-write-failed": {
    message: {
      en: "The picture could not be saved with the draft.",
      "zh-TW": "無法把圖片存進草稿。",
      ja: "絵を下書きに保存できませんでした。",
    },
    hint: HINT.disk,
  },
  "create-look-read-failed": {
    message: {
      en: "The draft's pictures could not be read.",
      "zh-TW": "讀不到草稿的圖片。",
      ja: "下書きの絵を読み込めませんでした。",
    },
    hint: HINT.readable,
  },
  "create-look-remove-failed": {
    message: {
      en: "The old pictures could not be removed.",
      "zh-TW": "無法移除舊的圖片。",
      ja: "古い絵を削除できませんでした。",
    },
    hint: HINT.disk,
  },
  "create-quote-failed": {
    message: {
      en: "The estimate could not be worked out.",
      "zh-TW": "無法算出預估。",
      ja: "見積もりを計算できませんでした。",
    },
    hint: {
      en: "You can still build; the usage panel shows what it really used.",
      "zh-TW": "仍然可以建立；實際用量會顯示在用量面板。",
      ja: "作成はできます。実際の使用量は使用量パネルに表示されます。",
    },
  },
};
