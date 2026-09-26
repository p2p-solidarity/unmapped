// Settings → Account and Settings → Plan (rev 6 phase 4, D1, D3): the generation gateway's account
// of device keys, its allowance, pairing a second device, and the billing provider's plans. Numbers
// are the gateway's and the provider's own; the allowance is shown as a share plus tokens and calls,
// never as money.

import type { Phrase } from "./phrase";

export const ACCOUNT = {
  heading: { en: "Account", "zh-TW": "帳號", ja: "アカウント" },
  intro: {
    en: "An account on the generation gateway holds this device's key and its free allowance. Your own key and local models work without one.",
    "zh-TW": "生成閘道上的帳號記著這台裝置的金鑰和免費額度。使用自己的金鑰或本地模型不需要帳號。",
    ja: "生成ゲートウェイのアカウントには、このデバイスのキーと無料枠が記録されます。自分のキーやローカルモデルならアカウントは不要です。",
  },
  reading: {
    en: "Asking the gateway…",
    "zh-TW": "正在詢問閘道…",
    ja: "ゲートウェイに問い合わせ中…",
  },
  gateway: { en: "Gateway: {url}", "zh-TW": "閘道：{url}", ja: "ゲートウェイ：{url}" },
  thisDevice: {
    en: "This device: {fingerprint}",
    "zh-TW": "這台裝置：{fingerprint}",
    ja: "このデバイス：{fingerprint}",
  },
  signedOut: {
    en: "Not signed in on this device.",
    "zh-TW": "這台裝置尚未登入。",
    ja: "このデバイスはサインインしていません。",
  },
  ended: {
    en: "The gateway no longer accepts this device's sign-in (revoked or expired). Sign in again, or put a token in UNMAPPED_GATEWAY_KEY in .env.",
    "zh-TW":
      "閘道已不再接受這台裝置的登入（已撤銷或過期）。請重新登入，或在 .env 的 UNMAPPED_GATEWAY_KEY 放入權杖。",
    ja: "ゲートウェイはこのデバイスのサインインを受け付けなくなりました（取り消しまたは期限切れ）。もう一度サインインするか、.env の UNMAPPED_GATEWAY_KEY にトークンを入れてください。",
  },
  signInNote: {
    en: "Signing in signs the gateway's challenge with this device's key. A key that is in no account starts a new one.",
    "zh-TW": "登入時會用這台裝置的金鑰簽署閘道的挑戰。還不屬於任何帳號的金鑰會建立新帳號。",
    ja: "サインインでは、このデバイスのキーでゲートウェイのチャレンジに署名します。どのアカウントにも属さないキーは新しいアカウントを作ります。",
  },
  signIn: {
    en: "Sign in with this device",
    "zh-TW": "用這台裝置登入",
    ja: "このデバイスでサインイン",
  },
  signOut: { en: "Sign out", "zh-TW": "登出", ja: "サインアウト" },
  signedIn: {
    en: "Signed in · account {account}",
    "zh-TW": "已登入 · 帳號 {account}",
    ja: "サインイン済み · アカウント {account}",
  },
  signedInEnv: {
    en: "Signed in with UNMAPPED_GATEWAY_KEY from .env · account {account}. Remove it from .env to sign out.",
    "zh-TW": "以 .env 的 UNMAPPED_GATEWAY_KEY 登入 · 帳號 {account}。要登出請從 .env 移除它。",
    ja: ".env の UNMAPPED_GATEWAY_KEY でサインイン中 · アカウント {account}。サインアウトするには .env から削除してください。",
  },
  // ── Pairing a second device ──────────────────────────────────────────────────────────────────
  joinIntro: {
    en: "Already have an account on another device? Join it with a pairing code instead of signing in here, which would start a second account.",
    "zh-TW": "已經在別的裝置上有帳號？請用配對碼加入，不要在這裡登入，否則會多出第二個帳號。",
    ja: "別のデバイスにアカウントがありますか？ここでサインインすると2つ目のアカウントになるので、ペアリングコードで参加してください。",
  },
  requestCode: { en: "Get a pairing code", "zh-TW": "取得配對碼", ja: "ペアリングコードを取得" },
  codeHeading: {
    en: "Pairing code (until {time})",
    "zh-TW": "配對碼（有效至 {time}）",
    ja: "ペアリングコード（{time} まで）",
  },
  codeSteps: {
    en: "On a device already in the account, open Settings → Account and enter this code. Approve there only if it shows this same fingerprint.",
    "zh-TW":
      "在已加入帳號的裝置上打開「設定 → 帳號」並輸入這組配對碼。只有當它顯示和這裡相同的指紋時才核准。",
    ja: "アカウントに入っているデバイスで「設定 → アカウント」を開き、このコードを入力してください。同じフィンガープリントが表示された場合だけ承認してください。",
  },
  fingerprint: { en: "Fingerprint", "zh-TW": "指紋", ja: "フィンガープリント" },
  waiting: {
    en: "Waiting for approval…",
    "zh-TW": "等待核准中…",
    ja: "承認を待っています…",
  },
  cancelCode: { en: "Cancel pairing", "zh-TW": "取消配對", ja: "ペアリングを取り消す" },
  approveHeading: {
    en: "Add another device",
    "zh-TW": "加入另一台裝置",
    ja: "別のデバイスを追加",
  },
  approveNote: {
    en: "Type the code the new device shows and look it up. Approve only if the fingerprint below matches the one on its screen.",
    "zh-TW": "輸入新裝置顯示的配對碼並查詢。只有下方指紋與它畫面上的相同時才核准。",
    ja: "新しいデバイスに表示されたコードを入力して照会してください。下のフィンガープリントがその画面と一致する場合だけ承認してください。",
  },
  codeField: { en: "Pairing code", "zh-TW": "配對碼", ja: "ペアリングコード" },
  lookUp: { en: "Look up this code", "zh-TW": "查詢這組配對碼", ja: "このコードを照会" },
  lookedUp: {
    en: "The device asking with this code: {fingerprint}",
    "zh-TW": "用這組配對碼申請的裝置：{fingerprint}",
    ja: "このコードを申請したデバイス：{fingerprint}",
  },
  approve: { en: "Approve this device", "zh-TW": "核准這台裝置", ja: "このデバイスを承認" },
  approved: {
    en: "Device added to the account.",
    "zh-TW": "已把裝置加入帳號。",
    ja: "デバイスをアカウントに追加しました。",
  },
  coOwnerOffer: {
    en: "Also make the new device a co-owner of the {n} shared {n|world|worlds} this device owns? Then either device can keep them going if the other is lost.",
    "zh-TW":
      "也要讓新裝置成為這台裝置擁有的 {n} 個共享世界的共同擁有者嗎？這樣其中一台遺失時，另一台仍能讓世界繼續。",
    ja: "このデバイスが所有する共有ワールド {n} 個の共同所有者にも新しいデバイスを加えますか？どちらかを失っても、もう一方でワールドを続けられます。",
  },
  coOwnerYes: {
    en: "Make it a co-owner",
    "zh-TW": "設為共同擁有者",
    ja: "共同所有者にする",
  },
  coOwnerNo: { en: "Not now", "zh-TW": "暫時不要", ja: "今はしない" },
  coOwnerDone: {
    en: "Co-owner of {n} {n|world|worlds}; each change is sent when that world next syncs.",
    "zh-TW": "已成為 {n} 個世界的共同擁有者；每項變更會在該世界下次同步時送出。",
    ja: "{n} 個のワールドの共同所有者になりました。変更は各ワールドの次の同期で送られます。",
  },
  // ── Devices ──────────────────────────────────────────────────────────────────────────────────
  devicesHeading: {
    en: "Devices in this account",
    "zh-TW": "這個帳號裡的裝置",
    ja: "このアカウントのデバイス",
  },
  deviceLine: {
    en: "{fingerprint} · added {date}",
    "zh-TW": "{fingerprint} · 加入於 {date}",
    ja: "{fingerprint} · {date} に追加",
  },
  thisComputer: { en: "this computer", "zh-TW": "這台電腦", ja: "このコンピュータ" },
  removeDevice: { en: "Remove", "zh-TW": "移除", ja: "削除" },
  // ── The allowance ────────────────────────────────────────────────────────────────────────────
  quotaHeading: {
    en: "Allowance this month ({period})",
    "zh-TW": "本月額度（{period}）",
    ja: "今月の枠（{period}）",
  },
  quotaLeft: {
    en: "{percent}% of the allowance left",
    "zh-TW": "額度還剩 {percent}%",
    ja: "枠の残り {percent}%",
  },
  quotaNone: {
    en: "No allowance granted for this month.",
    "zh-TW": "本月沒有核發額度。",
    ja: "今月の枠は付与されていません。",
  },
  quotaCredits: {
    en: "{used} of {granted} gateway credits used · {reserved} held for calls running · resets {date}",
    "zh-TW": "已用閘道點數 {used} / {granted} · 進行中的呼叫保留 {reserved} · {date} 重置",
    ja: "ゲートウェイのクレジット {used} / {granted} を使用 · 実行中の呼び出しに {reserved} を確保 · {date} にリセット",
  },
  quotaDevice: {
    en: "This computer this month: {calls} {calls|call|calls} through the gateway, {input} input and {output} output tokens",
    "zh-TW": "這台電腦本月：經由閘道 {calls} 次呼叫，輸入 {input}、輸出 {output} 個 token",
    ja: "このコンピュータの今月：ゲートウェイ経由の呼び出し {calls} 回、入力 {input}・出力 {output} トークン",
  },
  quotaUnreported: {
    en: "{n} {n|call|calls} without reported tokens",
    "zh-TW": "{n} 次呼叫沒有回報 token",
    ja: "トークン未報告の呼び出し {n} 回",
  },
  quotaPlan: { en: "Plan: {plan}", "zh-TW": "方案：{plan}", ja: "プラン：{plan}" },
  // ── Plans (Settings → Plan) ──────────────────────────────────────────────────────────────────
  planHeading: { en: "Plan", "zh-TW": "方案", ja: "プラン" },
  planReading: {
    en: "Asking for the plans…",
    "zh-TW": "正在讀取方案…",
    ja: "プランを取得中…",
  },
  planProvider: {
    en: "Plans from {provider}, as it names and prices them.",
    "zh-TW": "以下方案來自 {provider}，名稱和價格皆依其提供。",
    ja: "{provider} のプランです（名前と価格はその表記どおり）。",
  },
  planTestMode: {
    en: "Test mode: no real money is charged.",
    "zh-TW": "測試模式：不會收取真實款項。",
    ja: "テストモード：実際の料金は請求されません。",
  },
  planNone: {
    en: "The provider lists no plans yet.",
    "zh-TW": "供應商目前沒有列出方案。",
    ja: "プロバイダーにはまだプランがありません。",
  },
  planPerDay: { en: "{price} a day", "zh-TW": "每天 {price}", ja: "1日 {price}" },
  planPerWeek: { en: "{price} a week", "zh-TW": "每週 {price}", ja: "1週間 {price}" },
  planPerMonth: { en: "{price} a month", "zh-TW": "每月 {price}", ja: "月額 {price}" },
  planPerYear: { en: "{price} a year", "zh-TW": "每年 {price}", ja: "年額 {price}" },
  planEvery: {
    en: "{price} every {n} {unit}",
    "zh-TW": "每 {n} {unit} {price}",
    ja: "{n}{unit}ごとに {price}",
  },
  unitDays: { en: "days", "zh-TW": "天", ja: "日" },
  unitWeeks: { en: "weeks", "zh-TW": "週", ja: "週間" },
  unitMonths: { en: "months", "zh-TW": "個月", ja: "か月" },
  unitYears: { en: "years", "zh-TW": "年", ja: "年" },
  planCredits: {
    en: "{credits} gateway credits each period",
    "zh-TW": "每期 {credits} 閘道點數",
    ja: "各期間 {credits} ゲートウェイクレジット",
  },
  planCurrent: { en: "Your plan", "zh-TW": "目前方案", ja: "現在のプラン" },
  subscribe: { en: "Subscribe", "zh-TW": "訂閱", ja: "購読する" },
  manage: {
    en: "Manage subscription",
    "zh-TW": "管理訂閱",
    ja: "サブスクリプションを管理",
  },
  opened: {
    en: "Opened in your browser. Come back here when you are done.",
    "zh-TW": "已在瀏覽器開啟。完成後回到這裡。",
    ja: "ブラウザーで開きました。終わったらここに戻ってください。",
  },
} as const satisfies Record<string, Phrase>;
