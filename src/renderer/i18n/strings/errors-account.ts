// Errors from the generation gateway and its account and billing (rev 6 phase 4, D1–D3): reaching
// it, the allowance, pairing and device statements, and the plans. The source keeps the gateway's
// English words (with the exact reset date, model or limit); the screen shows these, with the
// original kept underneath in other languages.

import type { ErrorText } from "./errors";
import { HINT } from "./errors-hints";

const SIGN_IN_AGAIN = {
  en: "Sign in again in Settings → Advanced settings → Account.",
  "zh-TW": "請到「設定 → 進階設定 → 帳號」重新登入。",
  ja: "「設定 → 詳細設定 → アカウント」でもう一度サインインしてください。",
};

const ASK_OPERATOR = {
  en: "Try again later; if it keeps happening, tell the gateway's operator. Your own key or a local model (Settings → Model) works meanwhile.",
  "zh-TW":
    "請稍後再試；若一直發生，請告知閘道的營運者。這段期間可用自己的金鑰或本地模型（「設定 → 模型」）。",
  ja: "しばらくしてからもう一度試してください。続く場合はゲートウェイの運営者に伝えてください。その間は自分のキーかローカルモデル（「設定 → モデル」）が使えます。",
};

const FRESH_CODE = {
  en: "Ask the new device for a fresh pairing code (codes last ten minutes) and compare the fingerprints.",
  "zh-TW": "請新裝置重新取得配對碼（每組有效十分鐘），並比對兩邊的指紋。",
  ja: "新しいデバイスで新しいペアリングコードを取得し（有効期間は10分）、フィンガープリントを見比べてください。",
};

export const ACCOUNT_ERRORS: Record<string, ErrorText> = {
  // ── Reaching the gateway ────────────────────────────────────────────────────────────────────
  "gateway-not-configured": {
    message: {
      en: "This build has no generation gateway.",
      "zh-TW": "這個版本沒有設定生成閘道。",
      ja: "このビルドには生成ゲートウェイが設定されていません。",
    },
    hint: {
      en: "Set UNMAPPED_GATEWAY_URL in .env and restart, or use your own key or a local model in Settings → Model.",
      "zh-TW":
        "請在 .env 設定 UNMAPPED_GATEWAY_URL 後重新啟動，或到「設定 → 模型」改用自己的金鑰或本地模型。",
      ja: ".env に UNMAPPED_GATEWAY_URL を設定して再起動するか、「設定 → モデル」で自分のキーかローカルモデルを使ってください。",
    },
  },
  "gateway-url-not-allowed": {
    message: {
      en: "The gateway address in .env is not allowed.",
      "zh-TW": ".env 裡的閘道位址不被允許。",
      ja: ".env のゲートウェイのアドレスは使えません。",
    },
    hint: {
      en: "Use an https:// address (or http://127.0.0.1:<port> for a gateway on this computer) in UNMAPPED_GATEWAY_URL, then restart.",
      "zh-TW":
        "UNMAPPED_GATEWAY_URL 請用 https:// 位址（這台電腦上的閘道可用 http://127.0.0.1:<埠>），然後重新啟動。",
      ja: "UNMAPPED_GATEWAY_URL には https:// のアドレス（このコンピュータ上なら http://127.0.0.1:<ポート>）を使い、再起動してください。",
    },
  },
  "gateway-unreachable": {
    message: {
      en: "Could not reach the generation gateway.",
      "zh-TW": "無法連線到生成閘道。",
      ja: "生成ゲートウェイに接続できません。",
    },
    hint: {
      en: "Check your connection and UNMAPPED_GATEWAY_URL, then try again.",
      "zh-TW": "請檢查網路連線與 UNMAPPED_GATEWAY_URL，再試一次。",
      ja: "接続と UNMAPPED_GATEWAY_URL を確認してから、もう一度試してください。",
    },
  },
  "gateway-answer-invalid": {
    message: {
      en: "The gateway answered in a way this app does not read.",
      "zh-TW": "閘道的回應是這個程式讀不懂的格式。",
      ja: "ゲートウェイの応答をこのアプリは読めませんでした。",
    },
    hint: ASK_OPERATOR,
  },
  "gateway-internal": {
    message: {
      en: "The gateway failed on that request.",
      "zh-TW": "閘道處理這個請求時失敗了。",
      ja: "ゲートウェイがこのリクエストの処理に失敗しました。",
    },
    hint: ASK_OPERATOR,
  },
  "gateway-request-id": {
    message: {
      en: "A hosted call went out without a valid request id.",
      "zh-TW": "有一個託管呼叫沒有帶有效的請求 ID。",
      ja: "ホスト型の呼び出しに有効なリクエスト ID がありませんでした。",
    },
    hint: HINT.tryAgain,
  },
  // ── The account token ───────────────────────────────────────────────────────────────────────
  "account-signed-out": {
    message: {
      en: "This device is not signed in to the generation gateway.",
      "zh-TW": "這台裝置沒有登入生成閘道。",
      ja: "このデバイスは生成ゲートウェイにサインインしていません。",
    },
    hint: {
      en: "Sign in in Settings → Advanced settings → Account, add UNMAPPED_GATEWAY_KEY to .env, or use your own key or a local model in Settings → Model.",
      "zh-TW":
        "請到「設定 → 進階設定 → 帳號」登入、在 .env 加入 UNMAPPED_GATEWAY_KEY，或到「設定 → 模型」改用自己的金鑰或本地模型。",
      ja: "「設定 → 詳細設定 → アカウント」でサインインするか、.env に UNMAPPED_GATEWAY_KEY を追加するか、「設定 → モデル」で自分のキーかローカルモデルを使ってください。",
    },
  },
  "auth-challenge-invalid": {
    message: {
      en: "The gateway's sign-in challenge expired.",
      "zh-TW": "閘道的登入挑戰已過期。",
      ja: "ゲートウェイのサインインのチャレンジが期限切れになりました。",
    },
    hint: HINT.tryAgain,
  },
  "auth-signature-invalid": {
    message: {
      en: "The gateway did not accept this device's signature.",
      "zh-TW": "閘道不接受這台裝置的簽章。",
      ja: "ゲートウェイはこのデバイスの署名を受け付けませんでした。",
    },
    hint: HINT.tryAgain,
  },
  // ── The allowance ───────────────────────────────────────────────────────────────────────────
  "quota-exhausted": {
    message: {
      en: "The allowance for this month is used up.",
      "zh-TW": "本月的額度已經用完。",
      ja: "今月の枠を使い切りました。",
    },
    hint: {
      en: "Use your own key or a local model (Settings → Model), subscribe (Settings → Advanced settings → Plan), or wait for the reset.",
      "zh-TW":
        "可改用自己的金鑰或本地模型（「設定 → 模型」）、訂閱方案（「設定 → 進階設定 → 方案」），或等額度重置。",
      ja: "自分のキーかローカルモデル（「設定 → モデル」）を使うか、購読する（「設定 → 詳細設定 → プラン」）か、リセットを待ってください。",
    },
  },
  "gateway-busy": {
    message: {
      en: "The gateway is busy for this account right now.",
      "zh-TW": "閘道目前為這個帳號處理的請求太多。",
      ja: "ゲートウェイはこのアカウントの処理で混み合っています。",
    },
    hint: {
      en: "Wait a moment and try again.",
      "zh-TW": "請稍候再試一次。",
      ja: "少し待ってからもう一度試してください。",
    },
  },
  "request-in-flight": {
    message: {
      en: "That call is still running on the gateway.",
      "zh-TW": "這個呼叫還在閘道上執行。",
      ja: "その呼び出しはまだゲートウェイで実行中です。",
    },
    hint: {
      en: "Wait for it to finish; a new attempt starts a new call.",
      "zh-TW": "請等它結束；重新嘗試會是一個新的呼叫。",
      ja: "終わるまで待ってください。やり直すと新しい呼び出しになります。",
    },
  },
  "request-settled": {
    message: {
      en: "That call already ran on the gateway and is not run again.",
      "zh-TW": "這個呼叫已在閘道上執行過，不會再執行一次。",
      ja: "その呼び出しはすでにゲートウェイで実行済みで、もう一度は実行されません。",
    },
    hint: HINT.tryAgain,
  },
  "gateway-max-tokens": {
    message: {
      en: "This call asks for a longer answer than the gateway gives.",
      "zh-TW": "這個呼叫要求的回答長度超過閘道的上限。",
      ja: "この呼び出しはゲートウェイの上限より長い回答を求めています。",
    },
    hint: {
      en: "Use your own key or a local model in Settings → Model for this task.",
      "zh-TW": "這項任務請到「設定 → 模型」改用自己的金鑰或本地模型。",
      ja: "この作業には「設定 → モデル」で自分のキーかローカルモデルを使ってください。",
    },
  },
  "gateway-stream-cap": {
    message: {
      en: "The call ran past the gateway's time limit and was cut.",
      "zh-TW": "這個呼叫超過閘道的時間上限，已被中斷。",
      ja: "呼び出しがゲートウェイの制限時間を超えたため打ち切られました。",
    },
    hint: {
      en: "Nothing was charged beyond what it used; try again.",
      "zh-TW": "只會計算實際用掉的部分；請再試一次。",
      ja: "使った分以外は請求されていません。もう一度試してください。",
    },
  },
  "gateway-model-unavailable": {
    message: {
      en: "The gateway does not serve that model.",
      "zh-TW": "閘道不提供這個模型。",
      ja: "ゲートウェイはそのモデルを提供していません。",
    },
    hint: {
      en: "Leave the model empty in Settings → Model to use the gateway's default.",
      "zh-TW": "請在「設定 → 模型」把模型留空，改用閘道的預設模型。",
      ja: "「設定 → モデル」でモデルを空欄にすると、ゲートウェイの既定モデルを使います。",
    },
  },
  "gateway-model-unpriced": {
    message: {
      en: "The gateway has no dated cost for that model, so it does not serve it.",
      "zh-TW": "閘道沒有這個模型的註明日期成本紀錄，因此不提供它。",
      ja: "ゲートウェイにそのモデルの日付付きコスト記録がないため、提供されません。",
    },
    hint: ASK_OPERATOR,
  },
  "gateway-upstream-auth": {
    message: {
      en: "The gateway's own key for its model service was refused.",
      "zh-TW": "閘道本身對模型服務的金鑰被拒絕了。",
      ja: "ゲートウェイ自身のモデル提供元キーが拒否されました。",
    },
    hint: {
      en: "Your account is fine; the gateway's operator has to fix it. Your own key or a local model works meanwhile.",
      "zh-TW": "你的帳號沒有問題，需由閘道營運者修正。這段期間可用自己的金鑰或本地模型。",
      ja: "アカウントは問題ありません。ゲートウェイの運営者が直す必要があります。その間は自分のキーかローカルモデルが使えます。",
    },
  },
  "gateway-upstream": {
    message: {
      en: "The gateway's model service failed on this call.",
      "zh-TW": "閘道的模型服務處理這個呼叫時失敗了。",
      ja: "ゲートウェイのモデル提供元がこの呼び出しで失敗しました。",
    },
    hint: ASK_OPERATOR,
  },
  "gateway-upstream-unreachable": {
    message: {
      en: "The gateway could not reach its model service.",
      "zh-TW": "閘道連不上它的模型服務。",
      ja: "ゲートウェイがモデル提供元に接続できませんでした。",
    },
    hint: ASK_OPERATOR,
  },
  "gateway-upstream-model": {
    message: {
      en: "The gateway's model service does not serve the model it was asked for.",
      "zh-TW": "閘道的模型服務沒有提供所要求的模型。",
      ja: "ゲートウェイのモデル提供元は求められたモデルを提供していません。",
    },
    hint: ASK_OPERATOR,
  },
  "gateway-upstream-refused": {
    message: {
      en: "The gateway's model service refused this request.",
      "zh-TW": "閘道的模型服務拒絕了這個請求。",
      ja: "ゲートウェイのモデル提供元がこのリクエストを拒否しました。",
    },
    hint: HINT.retryModel,
  },
  // ── Pairing and devices ─────────────────────────────────────────────────────────────────────
  "pairing-code-invalid": {
    message: {
      en: "A pairing code is 8 letters and digits.",
      "zh-TW": "配對碼是 8 個英文字母與數字。",
      ja: "ペアリングコードは英字と数字の8文字です。",
    },
    hint: {
      en: "Type the code the new device shows; dashes and spaces do not matter.",
      "zh-TW": "請輸入新裝置顯示的配對碼；連字號和空格不影響。",
      ja: "新しいデバイスに表示されたコードを入力してください。ハイフンや空白は無視されます。",
    },
  },
  "pairing-key-invalid": {
    message: {
      en: "That is not a device key.",
      "zh-TW": "這不是裝置金鑰。",
      ja: "それはデバイスのキーではありません。",
    },
    hint: {
      en: "Copy the whole key the new device shows under its code.",
      "zh-TW": "請複製新裝置在配對碼下方顯示的完整金鑰。",
      ja: "新しいデバイスのコードの下に表示されたキーを丸ごとコピーしてください。",
    },
  },
  "pairing-code-unknown": {
    message: {
      en: "That pairing code is unknown, already used or expired.",
      "zh-TW": "這組配對碼不存在、已用過或已過期。",
      ja: "そのペアリングコードは不明、使用済み、または期限切れです。",
    },
    hint: FRESH_CODE,
  },
  "pairing-code-other-key": {
    message: {
      en: "That code was asked for by another device key.",
      "zh-TW": "這組配對碼是由另一把裝置金鑰申請的。",
      ja: "そのコードは別のデバイスのキーが申請したものです。",
    },
    hint: FRESH_CODE,
  },
  "pairing-key-in-account": {
    message: {
      en: "This device key already belongs to an account.",
      "zh-TW": "這把裝置金鑰已經屬於某個帳號。",
      ja: "このデバイスのキーはすでにアカウントに属しています。",
    },
    hint: {
      en: "Sign in instead; accounts never merge.",
      "zh-TW": "請改用登入；帳號不會合併。",
      ja: "代わりにサインインしてください。アカウントは統合されません。",
    },
  },
  "account-unknown-key": {
    message: {
      en: "This device key is in no account yet.",
      "zh-TW": "這把裝置金鑰還不屬於任何帳號。",
      ja: "このデバイスのキーはまだどのアカウントにもありません。",
    },
    hint: {
      en: "Approve its pairing code on a device already in the account.",
      "zh-TW": "請在已加入帳號的裝置上核准它的配對碼。",
      ja: "アカウントに入っているデバイスでペアリングコードを承認してください。",
    },
  },
  "account-key-not-member": {
    message: {
      en: "This device's key is not in the account it is signed in to.",
      "zh-TW": "這台裝置的金鑰不在它登入的帳號裡。",
      ja: "このデバイスのキーは、サインインしているアカウントに入っていません。",
    },
    hint: {
      en: "Approve devices from a device in the account (a token from .env cannot sign for this one).",
      "zh-TW": "請在帳號內的裝置上核准（.env 的權杖無法替這台裝置簽署）。",
      ja: "アカウント内のデバイスから承認してください（.env のトークンではこのデバイスの署名になりません）。",
    },
  },
  "account-statement-invalid": {
    message: {
      en: "The gateway did not accept this device's signed statement.",
      "zh-TW": "閘道不接受這台裝置簽署的聲明。",
      ja: "ゲートウェイはこのデバイスの署名付きの申告を受け付けませんでした。",
    },
    hint: HINT.tryAgain,
  },
  "account-last-key": {
    message: {
      en: "That is the last device of this account.",
      "zh-TW": "這是這個帳號的最後一台裝置。",
      ja: "それはこのアカウント最後のデバイスです。",
    },
    hint: {
      en: "Pair another device first; with no device left nobody could sign in to it again.",
      "zh-TW": "請先配對另一台裝置；沒有裝置的帳號就再也無法登入。",
      ja: "先に別のデバイスをペアリングしてください。デバイスがなくなると誰もサインインできなくなります。",
    },
  },
  "account-key-unknown": {
    message: {
      en: "That device is not in this account.",
      "zh-TW": "那台裝置不在這個帳號裡。",
      ja: "そのデバイスはこのアカウントにありません。",
    },
    hint: SIGN_IN_AGAIN,
  },
  // ── Plans ───────────────────────────────────────────────────────────────────────────────────
  "billing-not-configured": {
    message: {
      en: "This gateway sells no plans.",
      "zh-TW": "這個閘道沒有販售方案。",
      ja: "このゲートウェイではプランを販売していません。",
    },
    hint: {
      en: "The free allowance, your own key and local models still work.",
      "zh-TW": "免費額度、自己的金鑰和本地模型仍可使用。",
      ja: "無料枠、自分のキー、ローカルモデルは引き続き使えます。",
    },
  },
  "billing-provider": {
    message: {
      en: "The payment service could not answer.",
      "zh-TW": "付款服務無法回應。",
      ja: "決済サービスが応答できませんでした。",
    },
    hint: ASK_OPERATOR,
  },
  "billing-provider-unreachable": {
    message: {
      en: "The gateway could not reach its payment service.",
      "zh-TW": "閘道連不上它的付款服務。",
      ja: "ゲートウェイが決済サービスに接続できませんでした。",
    },
    hint: ASK_OPERATOR,
  },
  "billing-plan-unknown": {
    message: {
      en: "The payment service does not offer that plan any more.",
      "zh-TW": "付款服務已不再提供這個方案。",
      ja: "決済サービスはそのプランをもう提供していません。",
    },
    hint: {
      en: "Reopen Settings → Advanced settings → Plan and choose again.",
      "zh-TW": "請重新打開「設定 → 進階設定 → 方案」再選一次。",
      ja: "「設定 → 詳細設定 → プラン」を開き直して、もう一度選んでください。",
    },
  },
  "billing-no-customer": {
    message: {
      en: "This account has never subscribed.",
      "zh-TW": "這個帳號從未訂閱過。",
      ja: "このアカウントは購読したことがありません。",
    },
    hint: {
      en: "Subscribe to a plan first; then the subscription can be managed here.",
      "zh-TW": "請先訂閱一個方案，之後就能在這裡管理訂閱。",
      ja: "先にプランを購読すると、ここで管理できるようになります。",
    },
  },
  "billing-page-refused": {
    message: {
      en: "The gateway answered a billing page that is not safe to open.",
      "zh-TW": "閘道回傳的付款頁面不安全，因此沒有開啟。",
      ja: "ゲートウェイが返した決済ページは安全でないため開きませんでした。",
    },
    hint: ASK_OPERATOR,
  },
  "billing-return-page-failed": {
    message: {
      en: "The page to come back to after paying could not start.",
      "zh-TW": "付款完成後要返回的頁面無法啟動。",
      ja: "支払い後に戻るページを開始できませんでした。",
    },
    hint: HINT.tryAgain,
  },
};
