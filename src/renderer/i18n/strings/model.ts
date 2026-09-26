import type { Phrase } from "./phrase";

export const MODEL = {
  heading: { en: "Model", "zh-TW": "模型", ja: "モデル" },
  cloud: { en: "Cloud API", "zh-TW": "雲端 API", ja: "クラウド API" },
  local: { en: "On this computer", "zh-TW": "這台電腦", ja: "このコンピュータ" },
  apple: { en: "Apple on-device", "zh-TW": "Apple 裝置端", ja: "Apple オンデバイス" },
  llama: { en: "llama.cpp · GGUF", "zh-TW": "llama.cpp · GGUF", ja: "llama.cpp · GGUF" },
  ollama: { en: "Ollama", "zh-TW": "Ollama", ja: "Ollama" },
  custom: { en: "Custom API", "zh-TW": "自訂 API", ja: "カスタム API" },
  checking: {
    en: "Checking this computer…",
    "zh-TW": "正在檢查這台電腦…",
    ja: "このコンピュータを確認中…",
  },
  available: {
    en: "Detected on this computer",
    "zh-TW": "已在這台電腦偵測到",
    ja: "このコンピュータで検出済み",
  },
  unavailable: { en: "Unavailable", "zh-TW": "無法使用", ja: "利用不可" },
  notInstalled: {
    en: "Not installed or running",
    "zh-TW": "尚未安裝或啟動",
    ja: "未インストール、または停止中",
  },
  appleReason: {
    en: "Apple model: {reason}",
    "zh-TW": "Apple 模型：{reason}",
    ja: "Apple モデル：{reason}",
  },
  installedModels: {
    en: "Installed models: {models}",
    "zh-TW": "已安裝模型：{models}",
    ja: "インストール済みモデル：{models}",
  },
  chooseFile: { en: "Choose a GGUF model…", "zh-TW": "選擇 GGUF 模型…", ja: "GGUF モデルを選択…" },
  modelFile: { en: "Model file", "zh-TW": "模型檔案", ja: "モデルファイル" },
  endpoint: { en: "API endpoint", "zh-TW": "API 位址", ja: "API エンドポイント" },
  modelId: { en: "Model ID", "zh-TW": "模型 ID", ja: "モデル ID" },
  contextSize: {
    en: "Context window (tokens)",
    "zh-TW": "上下文長度（token）",
    ja: "コンテキスト長（トークン）",
  },
  contextReading: {
    en: "{n} token context ({source})",
    "zh-TW": "{n} token 上下文（{source}）",
    ja: "{n} トークンのコンテキスト（{source}）",
  },
  budgetHint: {
    en: "Small local models may run out of room on long stories. The app checks each task's budget before sending it.",
    "zh-TW": "小型本地模型處理長篇故事時可能空間不足。程式會在送出前檢查每項任務的額度。",
    ja: "小さいローカルモデルでは長い物語が収まらない場合があります。送信前に各タスクの容量を確認します。",
  },
  apiKey: { en: "API key", "zh-TW": "API 金鑰", ja: "API キー" },
  keySaved: {
    en: "Key saved on this computer",
    "zh-TW": "金鑰已儲存在這台電腦",
    ja: "キーはこのコンピュータに保存済み",
  },
  keyEnv: { en: "Key from .env", "zh-TW": "金鑰來自 .env", ja: "キーは .env から読み込み" },
  keyMissing: { en: "No key set", "zh-TW": "尚未設定金鑰", ja: "キー未設定" },
  keyUnreadable: {
    en: "The saved key cannot be read on this computer — remove it and enter it again",
    "zh-TW": "這台電腦讀不到已存的金鑰——請移除後重新輸入",
    ja: "保存したキーをこのコンピュータで読めません。削除して入力し直してください",
  },
  keyBound: { en: "Sent only to {url}", "zh-TW": "只會送往 {url}", ja: "送信先は {url} のみ" },
  saveKey: { en: "Save key", "zh-TW": "儲存金鑰", ja: "キーを保存" },
  clearKey: { en: "Remove saved key", "zh-TW": "移除已存金鑰", ja: "保存したキーを削除" },
  keyNote: {
    en: "The key is encrypted using this computer's OS keychain. It is never shown again.",
    "zh-TW": "金鑰會用這台電腦的作業系統鑰匙圈加密，之後不會再顯示。",
    ja: "キーはこのコンピュータの OS キーチェーンで暗号化され、再表示されません。",
  },
  useModel: { en: "Use this model", "zh-TW": "使用這個模型", ja: "このモデルを使う" },
  active: { en: "Current model", "zh-TW": "目前使用", ja: "使用中のモデル" },
  saved: { en: "Model setting saved", "zh-TW": "模型設定已儲存", ja: "モデル設定を保存しました" },
  keyUpdated: {
    en: "Key setting updated",
    "zh-TW": "金鑰設定已更新",
    ja: "キー設定を更新しました",
  },
  probe: { en: "Check connection", "zh-TW": "檢查連線", ja: "接続を確認" },
  online: { en: "Connected · {ms} ms", "zh-TW": "已連線 · {ms} 毫秒", ja: "接続済み · {ms} ms" },
  offline: { en: "Model did not answer", "zh-TW": "模型沒有回應", ja: "モデルが応答しません" },
  start: { en: "Start local server", "zh-TW": "啟動本地伺服器", ja: "ローカルサーバーを起動" },
  stop: { en: "Stop local server", "zh-TW": "停止本地伺服器", ja: "ローカルサーバーを停止" },
  // ── The free allowance and where the next call goes (rev 6 phase 4, D2) ────────────────────────
  hosted: { en: "Free allowance", "zh-TW": "免費額度", ja: "無料枠" },
  hostedNote: {
    en: "Calls go through the UNMAPPED gateway and are counted against your account's allowance (Settings → Advanced settings → Account). An empty model ID uses the gateway's default.",
    "zh-TW":
      "呼叫會經由 UNMAPPED 閘道，並從你帳號的額度扣除（「設定 → 進階設定 → 帳號」）。模型 ID 留空則使用閘道的預設模型。",
    ja: "呼び出しは UNMAPPED ゲートウェイを通り、アカウントの枠から差し引かれます（「設定 → 詳細設定 → アカウント」）。モデル ID が空ならゲートウェイの既定モデルを使います。",
  },
  routeChecking: {
    en: "Checking where the next call goes…",
    "zh-TW": "正在確認下一次呼叫會送往哪裡…",
    ja: "次の呼び出しの行き先を確認中…",
  },
  routeLocal: {
    en: "Next call: {kind} · this computer · {model}",
    "zh-TW": "下一次呼叫：{kind} · 這台電腦 · {model}",
    ja: "次の呼び出し：{kind} · このコンピュータ · {model}",
  },
  routeSaved: {
    en: "Next call: {kind} · your saved key · {model}",
    "zh-TW": "下一次呼叫：{kind} · 你儲存的金鑰 · {model}",
    ja: "次の呼び出し：{kind} · 保存したキー · {model}",
  },
  routeEnv: {
    en: "Next call: {kind} · key from .env · {model}",
    "zh-TW": "下一次呼叫：{kind} · .env 的金鑰 · {model}",
    ja: "次の呼び出し：{kind} · .env のキー · {model}",
  },
  routeKeyless: {
    en: "Next call: {kind} · no key · {model}",
    "zh-TW": "下一次呼叫：{kind} · 不帶金鑰 · {model}",
    ja: "次の呼び出し：{kind} · キーなし · {model}",
  },
  routeNoKeyAllowance: {
    en: "Next call: {kind} · no key → free allowance · {model}",
    "zh-TW": "下一次呼叫：{kind} · 沒有金鑰 → 免費額度 · {model}",
    ja: "次の呼び出し：{kind} · キーなし → 無料枠 · {model}",
  },
  routeAllowance: {
    en: "Next call: free allowance · {model}",
    "zh-TW": "下一次呼叫：免費額度 · {model}",
    ja: "次の呼び出し：無料枠 · {model}",
  },
  routeNone: {
    en: "The next call cannot go anywhere yet: {reason}",
    "zh-TW": "下一次呼叫目前無處可送：{reason}",
    ja: "次の呼び出しはまだどこにも送れません：{reason}",
  },
} as const satisfies Record<string, Phrase>;
