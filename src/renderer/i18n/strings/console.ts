// The F12 console (friends, world, karma, inference) and the mods panel.

import type { Phrase } from "./phrase";

export const CONSOLE = {
  // ── Frame and tabs ─────────────────────────────────────────────────────────────────────────
  title: { en: "CONSOLE", "zh-TW": "主控台", ja: "コンソール" },
  tabFriends: { en: "Friends", "zh-TW": "朋友", ja: "友だち" },
  tabWorld: { en: "World", "zh-TW": "世界", ja: "ワールド" },
  tabKarma: { en: "Karma", "zh-TW": "因果", ja: "カルマ" },
  tabInference: { en: "Inference", "zh-TW": "推論", ja: "推論" },

  // ── World tab (world.oui editor) ───────────────────────────────────────────────────────────
  issueCount: {
    en: "{code} · {n} {n|error|errors}",
    "zh-TW": "{code} · {n} 個錯誤",
    ja: "{code} · エラー {n} 件",
  },
  noStatementId: {
    en: "(no statement id)",
    "zh-TW": "（無敘述 id）",
    ja: "（ステートメント ID なし）",
  },
  unresolved: { en: "unresolved: {list}", "zh-TW": "未解析：{list}", ja: "未解決：{list}" },
  orphaned: { en: "orphaned: {list}", "zh-TW": "未被引用：{list}", ja: "孤立：{list}" },
  sceneImmutable: {
    en: "This scene belongs to a published version of the world. Remix it to edit.",
    "zh-TW": "這個場景屬於已發布的世界版本。請先 Remix 再編輯。",
    ja: "このシーンはワールドの公開済みの版です。編集するにはリミックスしてください。",
  },
  noWorldLoaded: {
    en: "No world is loaded, so world.oui was not written.",
    "zh-TW": "尚未載入世界，因此沒有寫入 world.oui。",
    ja: "ワールドが読み込まれていないため、world.oui は書き込まれませんでした。",
  },
  sceneApplied: {
    en: "world.oui applied and saved",
    "zh-TW": "已套用並儲存 world.oui",
    ja: "world.oui を適用して保存しました",
  },
  exportedTo: {
    en: "Exported to {path}",
    "zh-TW": "已匯出至 {path}",
    ja: "{path} に書き出しました",
  },
  unlockBeforeExport: {
    en: "Unlock your data before exporting an encrypted seed.",
    "zh-TW": "請先解鎖你的資料，才能匯出加密種子。",
    ja: "暗号化シードを書き出す前に、データのロックを解除してください。",
  },
  encryptedExportedTo: {
    en: "Encrypted seed exported to {path}",
    "zh-TW": "加密種子已匯出至 {path}",
    ja: "暗号化シードを {path} に書き出しました",
  },
  unlockBeforeImport: {
    en: "Unlock your data before importing an encrypted seed.",
    "zh-TW": "請先解鎖你的資料，才能匯入加密種子。",
    ja: "暗号化シードを読み込む前に、データのロックを解除してください。",
  },
  publishedScene: {
    en: "scene (published version)",
    "zh-TW": "場景（已發布版本）",
    ja: "シーン（公開済みの版）",
  },
  readOnly: { en: "read-only", "zh-TW": "唯讀", ja: "読み取り専用" },
  unsavedEdits: { en: "unsaved edits", "zh-TW": "有未儲存的修改", ja: "未保存の変更あり" },
  inSync: { en: "in sync with disk", "zh-TW": "與磁碟同步", ja: "ディスクと同期済み" },
  immutableNote: {
    en: "A published version never changes during play. Use REMIX in Worlds to edit its scenes; your progress (flags, inventory, karma) is saved with this world.",
    "zh-TW":
      "已發布的版本在遊玩中不會改變。要編輯場景，請在「世界」使用 REMIX；你的進度（旗標、背包、因果）會和這個世界一起儲存。",
    ja: "公開済みの版はプレイ中に変わりません。シーンを編集するには「ワールド」で REMIX を使ってください。進行（フラグ・持ち物・カルマ）はこのワールドと一緒に保存されます。",
  },
  format: { en: "Format", "zh-TW": "格式化", ja: "整形" },
  reloadFromDisk: {
    en: "Reload from disk",
    "zh-TW": "從磁碟重新載入",
    ja: "ディスクから再読み込み",
  },
  exportSeed: { en: "Export .seed", "zh-TW": "匯出 .seed", ja: ".seed を書き出す" },
  exportSeedEnc: { en: "Export .seed.enc", "zh-TW": "匯出 .seed.enc", ja: ".seed.enc を書き出す" },
  importSeedEnc: { en: "Import .seed.enc", "zh-TW": "匯入 .seed.enc", ja: ".seed.enc を読み込む" },

  // ── Karma tab ──────────────────────────────────────────────────────────────────────────────
  karmaCount: { en: "{n} {n|entry|entries}", "zh-TW": "{n} 筆", ja: "{n} 件" },
  karmaEmpty: {
    en: "Nothing recorded yet.",
    "zh-TW": "還沒有任何紀錄。",
    ja: "まだ記録はありません。",
  },
  karmaMeta: {
    en: "{time} · floor {floor} · {action}",
    "zh-TW": "{time} · 第 {floor} 層 · {action}",
    ja: "{time} · {floor} 階 · {action}",
  },

  // ── Inference tab ──────────────────────────────────────────────────────────────────────────
  provider: { en: "PROVIDER", "zh-TW": "供應商", ja: "プロバイダー" },
  readingConfig: {
    en: "Reading inference.json…",
    "zh-TW": "正在讀取 inference.json…",
    ja: "inference.json を読み込み中…",
  },
  fieldKind: { en: "kind", "zh-TW": "類型", ja: "種類" },
  fieldModel: { en: "model", "zh-TW": "模型", ja: "モデル" },
  fieldApiKeyEnv: {
    en: "apiKeyEnv (empty = no auth)",
    "zh-TW": "apiKeyEnv（留空 = 不驗證）",
    ja: "apiKeyEnv（空欄 = 認証なし）",
  },
  fieldBinaryPath: { en: "binaryPath", "zh-TW": "執行檔路徑", ja: "実行ファイルのパス" },
  fieldModelPath: {
    en: "modelPath (.gguf)",
    "zh-TW": "模型檔路徑（.gguf）",
    ja: "モデルファイルのパス（.gguf）",
  },
  fieldPort: { en: "port", "zh-TW": "連接埠", ja: "ポート" },
  fieldCtxSize: { en: "ctxSize", "zh-TW": "上下文長度", ja: "コンテキスト長" },
  llamaHint: {
    en: "`brew install llama.cpp` puts llama-server in your Homebrew bin directory; the model path is any .gguf file you downloaded.",
    "zh-TW":
      "`brew install llama.cpp` 會把 llama-server 裝進 Homebrew 的 bin 目錄；模型路徑填你下載的任一 .gguf 檔案。",
    ja: "`brew install llama.cpp` で llama-server が Homebrew の bin ディレクトリに入ります。モデルのパスにはダウンロードした .gguf ファイルを指定します。",
  },
  configSaved: {
    en: "inference.json saved",
    "zh-TW": "已儲存 inference.json",
    ja: "inference.json を保存しました",
  },
  configureSidecar: {
    en: "Configure llama-server sidecar",
    "zh-TW": "設定 llama-server 本機伺服器",
    ja: "llama-server サイドカーを設定",
  },
  removeSidecar: {
    en: "Remove sidecar config",
    "zh-TW": "移除本機伺服器設定",
    ja: "サイドカー設定を削除",
  },
  saving: { en: "Saving…", "zh-TW": "儲存中…", ja: "保存中…" },
  probeLabel: { en: "PROBE", "zh-TW": "連線偵測", ja: "接続確認" },
  probe: { en: "Probe", "zh-TW": "偵測", ja: "確認" },
  probeLoading: {
    en: "Calling /v1/models…",
    "zh-TW": "正在呼叫 /v1/models…",
    ja: "/v1/models を呼び出し中…",
  },
  reachable: { en: "reachable", "zh-TW": "可連線", ja: "接続可能" },
  unreachable: { en: "not reachable", "zh-TW": "無法連線", ja: "接続不可" },
  noModels: {
    en: "The server listed no models.",
    "zh-TW": "伺服器沒有列出任何模型。",
    ja: "サーバーにモデルが一つもありません。",
  },
  sidecarLabel: { en: "SIDECAR", "zh-TW": "本機伺服器", ja: "サイドカー" },
  sidecarIdle: {
    en: "No sidecar status reported yet.",
    "zh-TW": "尚未回報本機伺服器狀態。",
    ja: "サイドカーの状態はまだ届いていません。",
  },
  sidecarStopped: { en: "stopped", "zh-TW": "已停止", ja: "停止中" },
  sidecarStarting: { en: "starting", "zh-TW": "啟動中", ja: "起動中" },
  sidecarReady: { en: "ready", "zh-TW": "就緒", ja: "準備完了" },
  sidecarError: { en: "error", "zh-TW": "錯誤", ja: "エラー" },
  start: { en: "Start", "zh-TW": "啟動", ja: "起動" },

  // ── Mods panel ─────────────────────────────────────────────────────────────────────────────
  modsTitle: { en: "Mods", "zh-TW": "模組", ja: "MOD" },
  modsIntro: {
    en: "A mod is prompt text, skills and declarative tools — never code. Enabled mods mount into the open world.",
    "zh-TW": "模組是提示詞、技能與宣告式工具，絕不是程式碼。啟用的模組會掛載到目前開啟的世界。",
    ja: "MOD はプロンプト文・スキル・宣言的ツールで、コードは含みません。有効な MOD は開いているワールドに組み込まれます。",
  },
  modsPinned: {
    en: "This world uses its version’s locked rules. Use Create a mod revision to review and publish gameplay changes.",
    "zh-TW": "這個世界使用其版本鎖定的規則。請用「建立模組版本」檢視並發布玩法變更。",
    ja: "このワールドは版の固定ルールを使います。ゲームプレイの変更は「MOD 版を作成」で確認して公開してください。",
  },
  modsLoading: {
    en: "Reading the mods folder…",
    "zh-TW": "正在讀取模組資料夾…",
    ja: "MOD フォルダーを読み込み中…",
  },
  modsIdle: {
    en: "No mods folder yet.",
    "zh-TW": "還沒有模組資料夾。",
    ja: "MOD フォルダーはまだありません。",
  },
  modsEmpty: {
    en: "No mods installed. Install a .mod file or a mod folder to add one.",
    "zh-TW": "尚未安裝任何模組。安裝 .mod 檔案或模組資料夾即可加入。",
    ja: "MOD はインストールされていません。.mod ファイルか MOD フォルダーをインストールしてください。",
  },
  modsInstall: { en: "Install…", "zh-TW": "安裝…", ja: "インストール…" },
  modsOpenWorld: {
    en: "Open a world to choose which mods it runs.",
    "zh-TW": "開啟世界後，即可選擇它要執行哪些模組。",
    ja: "ワールドを開くと、使う MOD を選べます。",
  },
  modMeta: {
    en: "{author} · {sections} prompt {sections|section|sections} · {tools} {tools|tool|tools} · {skills} {skills|skill|skills}",
    "zh-TW": "{author} · {sections} 段提示詞 · {tools} 個工具 · {skills} 個技能",
    ja: "{author} · プロンプト {sections} 件 · ツール {tools} 件 · スキル {skills} 件",
  },
  modDeleteConfirm: {
    en: "Delete {name} from your mods folder?",
    "zh-TW": "要從模組資料夾刪除 {name} 嗎？",
    ja: "{name} を MOD フォルダーから削除しますか？",
  },
  modDeleteHint: {
    en: "This removes the files. Worlds that list it will report it missing.",
    "zh-TW": "這會刪除它的檔案。列出它的世界會回報找不到它。",
    ja: "ファイルが削除されます。この MOD を使うワールドでは見つからないと表示されます。",
  },
  modDeleteIt: { en: "Delete it", "zh-TW": "刪除", ja: "削除する" },
  modKeepIt: { en: "Keep it", "zh-TW": "保留", ja: "残す" },
  modEnabled: { en: "Enabled for this world", "zh-TW": "已在此世界啟用", ja: "このワールドで有効" },
  modEnable: {
    en: "Enable for this world",
    "zh-TW": "在此世界啟用",
    ja: "このワールドで有効にする",
  },
} as const satisfies Record<string, Phrase>;
