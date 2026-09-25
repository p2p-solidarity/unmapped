// Words every screen shares. Taiwan usage for zh-TW (存檔, 載入, 設定, 連線), plain game-menu
// Japanese for ja. A screen-specific line belongs in that screen's namespace, not here.

import type { Phrase } from "./phrase";

export const COMMON = {
  // ── The game ───────────────────────────────────────────────────────────────────────────────
  // The name is 《無界之地》 / UNMAPPED in every language; only the line under it is translated.
  tagline: {
    en: "An Autonomous Open World",
    "zh-TW": "自主開放世界",
    ja: "自律するオープンワールド",
  },

  // ── Language ───────────────────────────────────────────────────────────────────────────────
  language: { en: "Language", "zh-TW": "語言", ja: "言語" },
  languageNote: {
    en: "Interface only. Anything the model writes stays in the language it was generated in.",
    "zh-TW": "只影響介面。模型寫的內容維持它生成時的語言。",
    ja: "UI のみ。モデルが書いた内容は生成時の言語のままです。",
  },

  // ── Loadable states ────────────────────────────────────────────────────────────────────────
  nothingYet: { en: "Nothing yet.", "zh-TW": "還沒有東西。", ja: "まだ何もありません。" },
  loading: { en: "Loading…", "zh-TW": "載入中…", ja: "読み込み中…" },
  errorCode: { en: "Error · {code}", "zh-TW": "錯誤 · {code}", ja: "エラー · {code}" },

  // ── Actions ────────────────────────────────────────────────────────────────────────────────
  back: { en: "Back", "zh-TW": "返回", ja: "戻る" },
  close: { en: "Close", "zh-TW": "關閉", ja: "閉じる" },
  cancel: { en: "Cancel", "zh-TW": "取消", ja: "キャンセル" },
  retry: { en: "Try again", "zh-TW": "再試一次", ja: "もう一度" },
  next: { en: "Next", "zh-TW": "下一步", ja: "次へ" },
  done: { en: "Done", "zh-TW": "完成", ja: "完了" },
  play: { en: "Play", "zh-TW": "開始玩", ja: "プレイ" },
  resume: { en: "Resume", "zh-TW": "繼續", ja: "再開" },
  save: { en: "Save", "zh-TW": "儲存", ja: "保存" },
  delete: { en: "Delete", "zh-TW": "刪除", ja: "削除" },
  remove: { en: "Remove", "zh-TW": "移除", ja: "削除" },
  apply: { en: "Apply", "zh-TW": "套用", ja: "適用" },
  discard: { en: "Discard", "zh-TW": "捨棄", ja: "破棄" },
  export: { en: "Export", "zh-TW": "匯出", ja: "書き出す" },
  import: { en: "Import", "zh-TW": "匯入", ja: "読み込む" },
  open: { en: "Open", "zh-TW": "開啟", ja: "開く" },
  copy: { en: "Copy", "zh-TW": "複製", ja: "コピー" },
  copied: { en: "Copied", "zh-TW": "已複製", ja: "コピーしました" },
  send: { en: "Send", "zh-TW": "送出", ja: "送信" },
  stop: { en: "Stop", "zh-TW": "停止", ja: "停止" },
  skip: { en: "Skip", "zh-TW": "略過", ja: "スキップ" },
  reload: { en: "Reload", "zh-TW": "重新載入", ja: "再読み込み" },
  leave: { en: "Leave", "zh-TW": "離開", ja: "離れる" },
  yes: { en: "Yes", "zh-TW": "是", ja: "はい" },
  no: { en: "No", "zh-TW": "否", ja: "いいえ" },

  // ── The model endpoint (shown on several screens) ─────────────────────────────────────────
  model: { en: "Model", "zh-TW": "模型", ja: "モデル" },
  endpoint: { en: "Endpoint", "zh-TW": "端點", ja: "エンドポイント" },
  status: { en: "Status", "zh-TW": "狀態", ja: "状態" },
  online: { en: "online", "zh-TW": "連線中", ja: "オンライン" },
  offline: { en: "offline", "zh-TW": "離線", ja: "オフライン" },
  probeAgain: { en: "Probe again", "zh-TW": "重新偵測", ja: "再確認" },
  probing: { en: "Probing…", "zh-TW": "偵測中…", ja: "確認中…" },
  notProbed: { en: "Not probed.", "zh-TW": "尚未偵測。", ja: "未確認。" },
} as const satisfies Record<string, Phrase>;
