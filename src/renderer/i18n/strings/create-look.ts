// Create a game: the look step (concept pictures, the story written beside them) and the quote on
// the build step. Same `create.` namespace as create.ts.

import type { Phrase } from "./phrase";

export const CREATE_LOOK = {
  stepLook: { en: "Look", "zh-TW": "看樣子", ja: "見た目" },
  toLook: { en: "Continue to the look", "zh-TW": "前往看樣子", ja: "見た目へ進む" },
  lookTitle: {
    en: "How does this world look?",
    "zh-TW": "這個世界長什麼樣子？",
    ja: "このワールドはどんな見た目？",
  },
  lookNote: {
    en: "Three quick sketches drawn from the look card. Pick one and every later picture of this world is drawn to match it — or go on without one.",
    "zh-TW":
      "依「外觀風格」卡片畫出三張快速草圖。選一張，這個世界之後的每張圖都會照著它的樣子畫；也可以不選直接繼續。",
    ja: "「見た目」のカードから3枚のラフを描きます。1枚選ぶと、このワールドの以降の絵はすべてそれに合わせて描かれます。選ばずに進むこともできます。",
  },
  lookLoading: {
    en: "Opening the pictures…",
    "zh-TW": "正在開啟圖片…",
    ja: "絵を開いています…",
  },
  lookMissing: {
    en: "This picture could not be read.",
    "zh-TW": "無法讀取這張圖片。",
    ja: "この絵は読み込めません。",
  },
  lookPicture: { en: "Sketch {n}", "zh-TW": "草圖 {n}", ja: "ラフ {n}" },
  lookPick: { en: "Choose sketch {n}", "zh-TW": "選擇草圖 {n}", ja: "ラフ {n} を選ぶ" },
  lookChosen: { en: "Chosen look", "zh-TW": "已選的樣子", ja: "選んだ見た目" },
  lookDrawing: {
    en: "Drawing {n} {n|sketch|sketches}…",
    "zh-TW": "正在畫 {n} 張草圖…",
    ja: "ラフを {n} 枚描いています…",
  },
  lookCancel: { en: "Stop drawing", "zh-TW": "停止繪製", ja: "描くのをやめる" },
  lookDraw: { en: "Draw sketches", "zh-TW": "畫草圖", ja: "ラフを描く" },
  lookRedraw: {
    en: "Draw again (keeps the chosen one)",
    "zh-TW": "重新繪製（保留已選的那張）",
    ja: "描き直す（選んだ1枚は残す）",
  },
  lookWithout: {
    en: "You can still go on without a picture; the world is then published without one.",
    "zh-TW": "你仍然可以不選圖片直接繼續；世界發布時就不會附上樣子圖。",
    ja: "絵なしでも先へ進めます。その場合、ワールドは絵なしで公開されます。",
  },
  lookSkip: {
    en: "Continue without a picture",
    "zh-TW": "不選圖片，繼續",
    ja: "絵なしで進む",
  },
  lookContinueDrawing: {
    en: "Continue to the story (the sketches keep drawing)",
    "zh-TW": "前往故事（草圖會繼續畫）",
    ja: "ストーリーへ進む（ラフは描き続けます）",
  },
  storyAheadReady: {
    en: "The story is ready: {n} {n|chapter|chapters}.",
    "zh-TW": "故事寫好了：共 {n} 章。",
    ja: "ストーリーができました：全 {n} 章。",
  },
  storyAheadNote: {
    en: "The story is being written meanwhile, so it is ready when you are.",
    "zh-TW": "同時也在寫故事，等你準備好時就能看。",
    ja: "その間にストーリーを書いています。準備ができたら読めます。",
  },
  storyAheadCancel: {
    en: "Stop writing the story",
    "zh-TW": "停止撰寫故事",
    ja: "ストーリーを書くのをやめる",
  },
  writeStory: { en: "Write the story", "zh-TW": "撰寫故事", ja: "ストーリーを書く" },
  buildLook: {
    en: "This picture is published with the world as its look.",
    "zh-TW": "這張圖會作為世界的樣子一起發布。",
    ja: "この絵がワールドの見た目として一緒に公開されます。",
  },
  buildNoLook: {
    en: "No look picture: the world is published without one.",
    "zh-TW": "沒有樣子圖：世界發布時不附圖片。",
    ja: "見た目の絵なし：ワールドは絵なしで公開されます。",
  },

  // ── The quote ──────────────────────────────────────────────────────────────────────────────
  quoteTitle: {
    en: "What building asks the model for (estimate)",
    "zh-TW": "建立時會向模型請求的內容（估計）",
    ja: "作成時にモデルへ頼むこと（見積もり）",
  },
  quoteLoading: {
    en: "Checking the model that will build…",
    "zh-TW": "正在檢查負責建立的模型…",
    ja: "作成に使うモデルを確認しています…",
  },
  quoteCalls: {
    en: "1 call to write the place you wake in, plus up to {repairs} repairs if it has to be fixed · {provider} · {model}",
    "zh-TW": "寫出你醒來的地方：1 次呼叫，需要修正時最多再 {repairs} 次 · {provider} · {model}",
    ja: "目覚める場所を書く呼び出し1回、直しが必要なら最大 {repairs} 回の修正 · {provider} · {model}",
  },
  quoteBridge: {
    en: "The starting place is written on this Mac by Apple's on-device model; its prompt is not counted here.",
    "zh-TW": "起點場景由這台 Mac 上的 Apple 裝置端模型撰寫；它的提示詞不在此計算。",
    ja: "開始地点はこの Mac 上の Apple オンデバイスモデルが書きます。そのプロンプトはここでは数えません。",
  },
  quoteFirst: {
    en: "First call: about {input} input tokens (measured from its prompt), at most {output} output tokens",
    "zh-TW": "第一次呼叫：約 {input} 個輸入 token（依實際提示詞估算），最多 {output} 個輸出 token",
    ja: "1回目：入力 約 {input} トークン（実際のプロンプトから推定）、出力 最大 {output} トークン",
  },
  quoteWorst: {
    en: "If both repairs are needed: {calls} calls, up to about {input} input and {output} output tokens",
    "zh-TW": "兩次修正都用上時：{calls} 次呼叫，最多約 {input} 個輸入 token、{output} 個輸出 token",
    ja: "修正を2回とも使う場合：{calls} 回の呼び出し、入力 最大 約 {input}、出力 最大 {output} トークン",
  },
  quoteFree: {
    en: "Cost: free — this model runs on your own machine.",
    "zh-TW": "費用：免費——這個模型在你自己的電腦上執行。",
    ja: "費用：無料（このモデルはあなたのマシンで動きます）。",
  },
  quotePriceUnknown: {
    en: "Cost: price unknown for {model}.",
    "zh-TW": "費用：{model} 的價格未知。",
    ja: "費用：{model} の価格は不明です。",
  },
  quoteMoney: {
    en: "Cost: about {first} for the first call, at most about {worst} with both repairs ({model} list price as of {date}, {source}).",
    "zh-TW":
      "費用：第一次呼叫約 {first}，兩次修正都用上時最多約 {worst}（{model} 於 {date} 的公開價格，{source}）。",
    ja: "費用：1回目は約 {first}、修正を2回とも使うと最大 約 {worst}（{model} の {date} 時点の公開価格、{source}）。",
  },
  quoteUsd: { en: "US$ {amount}", "zh-TW": "{amount} 美元", ja: "{amount} 米ドル" },
  quoteUnderCent: {
    en: "under US$0.01",
    "zh-TW": "不到 0.01 美元",
    ja: "0.01 米ドル未満",
  },
  quoteChapter: {
    en: "Then, once you are in, chapter 1 is written in the background: 1 call plus up to {repairs} repairs, at most {output} output tokens each. It is counted in the world's usage, not in this estimate.",
    "zh-TW":
      "進入遊戲後，第 1 章會在背景撰寫：1 次呼叫，最多再修正 {repairs} 次，每次最多 {output} 個輸出 token。它會算進這個世界的用量，不在這份估計內。",
    ja: "入った後、第1章がバックグラウンドで書かれます：呼び出し1回＋最大 {repairs} 回の修正、それぞれ出力 最大 {output} トークン。これはワールドの使用量に数えられ、この見積もりには含みません。",
  },
  quoteEstimate: {
    en: "An estimate: tokens are counted roughly (about one per CJK character, one per 3.4 other characters); the real numbers are recorded after each call.",
    "zh-TW":
      "這是估計值：token 以粗略方式計算（中日韓文字約每字 1 個，其他約每 3.4 個字元 1 個）；實際數字會在每次呼叫後記錄。",
    ja: "見積もりです：トークンはおおまかに数えています（漢字・かな1文字あたり約1、それ以外は3.4文字あたり約1）。実際の数値は呼び出しのたびに記録されます。",
  },
} as const satisfies Record<string, Phrase>;
