// The title screen (Continue · Worlds · Create World · Settings), the Settings panel, and the lines
// the Worlds library shows inside a world's 更多 (a new adventure's seed, a world's versions,
// drafts, files and backups) and in the archive; also the workspace.

import type { Phrase } from "./phrase";

export const TITLE = {
  // ── Main menu ──────────────────────────────────────────────────────────────────────────────
  mainMenu: { en: "Main menu", "zh-TW": "主選單", ja: "メインメニュー" },
  menuContinue: { en: "Continue", "zh-TW": "繼續", ja: "つづきから" },
  menuWorlds: { en: "Worlds", "zh-TW": "世界", ja: "ワールド" },
  menuCreate: { en: "Create World", "zh-TW": "創造世界", ja: "世界をつくる" },
  menuSettings: { en: "Settings", "zh-TW": "設定", ja: "設定" },
  hintSelect: { en: "Select", "zh-TW": "選擇", ja: "選択" },
  hintConfirm: { en: "Confirm", "zh-TW": "確定", ja: "決定" },
  leaveRoomFailed: {
    en: "Could not stop playing with friends: {reason}",
    "zh-TW": "無法結束和朋友一起玩：{reason}",
    ja: "友だちとのプレイを終えられませんでした：{reason}",
  },

  // ── New Game (seed) ────────────────────────────────────────────────────────────────────────
  preparingLand: { en: "Preparing the land…", "zh-TW": "正在準備大地…", ja: "大地を準備中…" },
  seedIntro: {
    en: "Every seed is a different land of the same game. The same seed is the same land for anyone who types it. Leave it empty for a new land.",
    "zh-TW":
      "每個種子都是同一款遊戲裡的另一片大地。任何人輸入相同的種子，都會走進同一片大地。留白就是一片新的大地。",
    ja: "シードごとに、同じゲームの別の大地が生まれます。同じシードを入力すれば、誰でも同じ大地に立てます。空欄なら新しい大地です。",
  },
  seedLabel: { en: "Seed (optional)", "zh-TW": "指定種子（選填）", ja: "シード（任意）" },
  landLanguage: {
    en: "Language — everyone you meet on this land speaks it",
    "zh-TW": "語言——這片大地上遇見的每個人都說這種語言",
    ja: "言語：この大地で出会う人は、みなこの言語で話します",
  },
  roll: { en: "Roll", "zh-TW": "隨機", ja: "ランダム" },
  seedInvalid: {
    en: "A seed is {n} letters and digits (no I, O, 0 or 1).",
    "zh-TW": "種子由 {n} 個英文字母與數字組成（不含 I、O、0、1）。",
    ja: "シードは英数字 {n} 文字です（I・O・0・1 は使えません）。",
  },
  openingLand: { en: "Opening the land…", "zh-TW": "正在開啟大地…", ja: "大地を開いています…" },
  start: { en: "Start", "zh-TW": "開始", ja: "始める" },

  // ── A world's 更多 (My worlds) ─────────────────────────────────────────────────────────────
  oldSaves: {
    en: "{n} {n|world|worlds} from an older app can't be opened by this one and {n|was|were} left untouched: {names}",
    "zh-TW": "有 {n} 個舊版 App 的世界無法用這個版本開啟，已原封不動保留：{names}",
    ja: "古いアプリのワールド {n} 件はこのアプリでは開けないため、そのまま残してあります：{names}",
  },
  needsEngine: {
    en: "Needs a newer app (engine {version})",
    "zh-TW": "要更新 App 才能玩（引擎 {version}）",
    ja: "アプリの更新が必要です（エンジン {version}）",
  },
  needsSaveSchema: {
    en: "Needs a newer app (data format {version})",
    "zh-TW": "要更新 App 才能玩（資料格式 {version}）",
    ja: "アプリの更新が必要です（データ形式 {version}）",
  },
  originalRevision: { en: "original revision", "zh-TW": "原始版本", ja: "オリジナル版" },
  lineageOf: { en: "{kind} of {parent}", "zh-TW": "{parent} 的{kind}", ja: "{parent} の{kind}" },
  lineageRevision: { en: "revision", "zh-TW": "修訂版", ja: "改訂版" },
  lineageRemix: { en: "remix", "zh-TW": "改編版", ja: "リミックス" },
  lineageLegacyImport: { en: "legacy import", "zh-TW": "舊格式匯入", ja: "旧形式からの移行" },
  edit: { en: "Edit", "zh-TW": "編輯", ja: "編集" },
  remix: { en: "Remix", "zh-TW": "改編", ja: "リミックス" },
  exportCartridge: {
    en: "Export this world (.cartridge)",
    "zh-TW": "匯出這個世界（.cartridge）",
    ja: "このワールドを書き出す（.cartridge）",
  },
  backupSave: { en: "Back up", "zh-TW": "備份", ja: "バックアップ" },
  upgradeTo: { en: "Upgrade to {version}", "zh-TW": "升級到 {version}", ja: "{version} に更新" },
  newId: { en: "New ID", "zh-TW": "新 ID", ja: "新しい ID" },
  titleField: { en: "Title", "zh-TW": "標題", ja: "タイトル" },
  author: { en: "Author", "zh-TW": "作者", ja: "作者" },
  create: { en: "Create", "zh-TW": "建立", ja: "作成" },
  importCartridge: {
    en: "Import a world (.cartridge)",
    "zh-TW": "匯入世界（.cartridge）",
    ja: "ワールドを読み込む（.cartridge）",
  },
  restoreBackup: { en: "Restore backup", "zh-TW": "還原備份", ja: "バックアップから復元" },
  exportedTo: {
    en: "Exported to {path}",
    "zh-TW": "已匯出到 {path}",
    ja: "{path} に書き出しました",
  },
  imported: { en: "Imported {name}", "zh-TW": "已匯入 {name}", ja: "{name} を読み込みました" },
  restored: { en: "Restored {name}", "zh-TW": "已還原 {name}", ja: "{name} を復元しました" },
  upgraded: {
    en: "Upgraded to {version}",
    "zh-TW": "已升級到 {version}",
    ja: "{version} に更新しました",
  },

  // ── Archive (legacy worlds) ────────────────────────────────────────────────────────────────
  readingArchive: {
    en: "Reading archive…",
    "zh-TW": "正在讀取封存…",
    ja: "アーカイブを読み込み中…",
  },
  archiveMeta: {
    en: "{archetype} · floor {floor} · {date}",
    "zh-TW": "{archetype} · 第 {floor} 層 · {date}",
    ja: "{archetype} · {floor} 階 · {date}",
  },
  exportSeed: { en: "Export .seed", "zh-TW": "匯出 .seed", ja: ".seed を書き出す" },
  importSeed: { en: "Import .seed", "zh-TW": "匯入 .seed", ja: ".seed を読み込む" },
  migrate: { en: "Migrate", "zh-TW": "轉換格式", ja: "移行" },
  migratedTo: { en: "Migrated to {ref}", "zh-TW": "已轉換為 {ref}", ja: "{ref} に移行しました" },
  deleteForever: { en: "Delete forever", "zh-TW": "永久刪除", ja: "完全に削除" },

  // ── System ─────────────────────────────────────────────────────────────────────────────────
  readingBuild: {
    en: "Reading build…",
    "zh-TW": "正在讀取版本資訊…",
    ja: "ビルド情報を読み込み中…",
  },
  version: { en: "Version", "zh-TW": "版本", ja: "バージョン" },
  platform: { en: "Platform", "zh-TW": "平台", ja: "動作環境" },
  worldsFolder: { en: "Worlds", "zh-TW": "世界資料夾", ja: "ワールド保存先" },

  // ── Settings → Advanced settings → Signaling servers (a per-device preference) ──────────────────────────────────
  signalingHeading: {
    en: "Signaling servers",
    "zh-TW": "信令伺服器",
    ja: "シグナリングサーバー",
  },
  signalingIntro: {
    en: "Friends find each other through a signaling server before their worlds connect directly. Two machines meet only if they share at least one server. This list is for this device only.",
    "zh-TW":
      "朋友們會先透過信令伺服器找到彼此，世界才會直接相連。兩台機器至少要共用一個伺服器才能相遇。這份清單只屬於這台裝置。",
    ja: "友だち同士はまずシグナリングサーバーを通じて互いを見つけ、それから世界が直接つながります。2 台の端末は、少なくとも 1 つのサーバーを共有しているときだけ出会えます。このリストはこの端末だけの設定です。",
  },
  signalingUsingDefault: {
    en: "This device uses the default servers.",
    "zh-TW": "這台裝置使用預設的伺服器。",
    ja: "この端末は既定のサーバーを使っています。",
  },
  signalingUsingOwn: {
    en: "This device uses its own list.",
    "zh-TW": "這台裝置使用自己的清單。",
    ja: "この端末は独自のリストを使っています。",
  },
  signalingField: {
    en: "Servers — ws:// or wss://, one per line",
    "zh-TW": "伺服器 — ws:// 或 wss://，每行一個",
    ja: "サーバー — ws:// または wss://、1 行に 1 つ",
  },
  signalingInvalid: {
    en: "Not a ws:// or wss:// address: {entries}",
    "zh-TW": "不是 ws:// 或 wss:// 位址：{entries}",
    ja: "ws:// または wss:// のアドレスではありません：{entries}",
  },
  signalingEmpty: {
    en: "Add at least one server, or go back to the default.",
    "zh-TW": "請至少加入一個伺服器，或恢復預設。",
    ja: "少なくとも 1 つサーバーを追加するか、既定に戻してください。",
  },
  signalingTest: { en: "Test connection", "zh-TW": "測試連線", ja: "接続をテスト" },
  signalingSave: { en: "Save for this device", "zh-TW": "儲存到這台裝置", ja: "この端末に保存" },
  signalingUseDefault: { en: "Use default", "zh-TW": "使用預設", ja: "既定に戻す" },
  signalingUntested: { en: "not tested", "zh-TW": "尚未測試", ja: "未テスト" },
  signalingTesting: { en: "testing…", "zh-TW": "測試中…", ja: "テスト中…" },
  signalingReachable: {
    en: "reachable · handshake {handshake} ms · relay {relay} ms",
    "zh-TW": "可連線 · 握手 {handshake} ms · 轉送 {relay} ms",
    ja: "接続可能 · ハンドシェイク {handshake} ms · 中継 {relay} ms",
  },
  signalingSaved: {
    en: "Saved for this device.",
    "zh-TW": "已儲存到這台裝置。",
    ja: "この端末に保存しました。",
  },
  signalingApplyNote: {
    en: "Changes apply the next time you invite friends or join a world.",
    "zh-TW": "變更會在下次邀請朋友或加入世界時生效。",
    ja: "変更は、次に友だちを招待するかワールドに参加したときに反映されます。",
  },

  // ── Workspace (remix / revision editor) ────────────────────────────────────────────────────
  openingWorkspace: {
    en: "Opening workspace…",
    "zh-TW": "正在開啟工作區…",
    ja: "ワークスペースを開いています…",
  },
  files: { en: "Files", "zh-TW": "檔案", ja: "ファイル" },
  rulesFile: { en: "Rules", "zh-TW": "規則", ja: "ルール" },
  sourceEditor: { en: "OpenUI source", "zh-TW": "OpenUI 原始碼", ja: "OpenUI ソース" },
  saveDraft: { en: "Save draft", "zh-TW": "儲存草稿", ja: "下書きを保存" },
  validatePreview: { en: "Validate & Preview", "zh-TW": "驗證並預覽", ja: "検証してプレビュー" },
  validating: {
    en: "Validating every scene…",
    "zh-TW": "正在驗證所有場景…",
    ja: "すべてのシーンを検証中…",
  },
  publish: { en: "Publish", "zh-TW": "發布", ja: "公開" },
  fileSaved: { en: "{file} saved", "zh-TW": "已儲存 {file}", ja: "{file} を保存しました" },
  published: { en: "Published {ref}", "zh-TW": "已發布 {ref}", ja: "{ref} を公開しました" },

  // ── Saving and hot reload of world files ───────────────────────────────────────────────────
  fileNotSaved: {
    en: "{file} could not be saved: {reason}",
    "zh-TW": "無法儲存 {file}：{reason}",
    ja: "{file} を保存できませんでした：{reason}",
  },
  fileRereadFailed: {
    en: "{file} could not be re-read: {reason}",
    "zh-TW": "無法重新讀取 {file}：{reason}",
    ja: "{file} を再読み込みできませんでした：{reason}",
  },
  fileReloaded: {
    en: "{file} reloaded",
    "zh-TW": "已重新載入 {file}",
    ja: "{file} を再読み込みしました",
  },
  karmaSkipped: {
    en: "karma.jsonl: skipped {n} unreadable {n|line|lines}",
    "zh-TW": "karma.jsonl：略過 {n} 行無法讀取的內容",
    ja: "karma.jsonl：読み取れない {n} 行をスキップしました",
  },
  sceneParseFailed: {
    en: "world.oui did not parse — open the console (F12) to see the errors",
    "zh-TW": "world.oui 無法解析 — 按 F12 開啟主控台查看錯誤",
    ja: "world.oui を解析できませんでした — F12 でコンソールを開いてエラーを確認してください",
  },

  // ── A world's ENS name (Sepolia ENSv2) ──────────────────────────────────────────────────────
  ensName: { en: "ENS", "zh-TW": "ENS", ja: "ENS" },
} as const satisfies Record<string, Phrase>;
