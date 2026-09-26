// The lineage market (Worlds → Market): auctions and trading on Sepolia, signed by the player's
// passkey and paid for by UNMAPPED's gas station — no wallet anywhere, and no key in the app.

import type { Phrase } from "./phrase";

export const MARKET = {
  intro: {
    en: "Bid on and trade worlds on Sepolia. Your passkey signs every move and UNMAPPED's gas station pays the gas — no wallet, no ETH.",
    "zh-TW":
      "在 Sepolia 上競標、交易世界。每個動作都由你的 passkey 簽名，gas 由《無界之地》的代付站支付——不需要錢包，也不需要 ETH。",
    ja: "Sepolia で世界に入札し、売買します。操作はすべてパスキーで署名し、ガス代は UNMAPPED のガスステーションが払います。ウォレットも ETH も要りません。",
  },
  reading: { en: "Reading the market…", "zh-TW": "正在讀取市場…", ja: "マーケットを読み込み中…" },
  readOnly: {
    en: "This machine can read the market but not act on it: no gas station is set up.",
    "zh-TW": "這台機器可以讀取市場，但還沒設定代付站，無法送出動作。",
    ja: "この端末はマーケットを読めますが、ガスステーションが未設定のため操作は送れません。",
  },
  accountHeading: {
    en: "Your passkey account",
    "zh-TW": "你的 passkey 帳戶",
    ja: "パスキーのアカウント",
  },
  useBrowserPasskey: {
    en: "Use Touch ID (opens your browser)",
    "zh-TW": "用 Touch ID（在瀏覽器開啟）",
    ja: "Touch ID を使う（ブラウザが開きます）",
  },
  useBrowserNote: {
    en: "This app cannot show Touch ID itself, so your browser asks for it and hands the signature back. Your passkey stays in your own keychain.",
    "zh-TW":
      "這個 app 本身無法跳出 Touch ID，所以會由瀏覽器請你驗證，再把簽名交回 app。passkey 留在你自己的鑰匙圈裡。",
    ja: "このアプリは Touch ID を直接出せないため、ブラウザで確認して署名をアプリに戻します。パスキーはあなたのキーチェーンに残ります。",
  },
  useAppPasskey: {
    en: "Use a security key in the app",
    "zh-TW": "在 app 內使用安全金鑰",
    ja: "アプリ内でセキュリティキーを使う",
  },
  waitingBrowser: {
    en: "Finish in your browser…",
    "zh-TW": "請到瀏覽器完成…",
    ja: "ブラウザで続けてください…",
  },
  summaryBid: {
    en: "Bid {amount} {currency} in {name}",
    "zh-TW": "在 {name} 出價 {amount} {currency}",
    ja: "{name} に {amount} {currency} で入札",
  },
  summaryBuy: {
    en: "Buy {name} with {amount} USDC",
    "zh-TW": "用 {amount} USDC 買入 {name}",
    ja: "{amount} USDC で {name} を購入",
  },
  usePasskey: { en: "Use my passkey", "zh-TW": "使用我的 passkey", ja: "パスキーを使う" },
  usePasskeyNote: {
    en: "The first time, your passkey is asked twice so the app can learn its public key. After that, one prompt per action.",
    "zh-TW": "第一次會請 passkey 驗證兩次，讓 app 取得它的公鑰；之後每個動作只驗證一次。",
    ja: "初回だけ公開鍵を知るためにパスキーを 2 回求めます。以降は操作ごとに 1 回です。",
  },
  address: { en: "Account {address}", "zh-TW": "帳戶 {address}", ja: "アカウント {address}" },
  notDeployed: {
    en: "created on chain with your first action",
    "zh-TW": "第一個動作時才會在鏈上建立",
    ja: "最初の操作でチェーン上に作られます",
  },
  usdc: { en: "{amount} test USDC", "zh-TW": "{amount} 測試 USDC", ja: "テスト USDC {amount}" },
  faucet: {
    en: "Get 1,000 test USDC",
    "zh-TW": "領 1,000 測試 USDC",
    ja: "テスト USDC を 1,000 受け取る",
  },
  faucetDone: {
    en: "1,000 test USDC arrived in your account.",
    "zh-TW": "1,000 測試 USDC 已經進入你的帳戶。",
    ja: "テスト USDC 1,000 がアカウントに届きました。",
  },
  holding: { en: "{amount} {symbol}", "zh-TW": "{amount} {symbol}", ja: "{amount} {symbol}" },
  worldsHeading: { en: "Worlds on the market", "zh-TW": "市場上的世界", ja: "マーケットの世界" },
  noWorlds: {
    en: "No world has been launched on the market yet.",
    "zh-TW": "市場上還沒有發行任何世界。",
    ja: "マーケットにはまだ世界が出ていません。",
  },
  phaseLive: { en: "Auction live", "zh-TW": "競標中", ja: "オークション中" },
  phaseSoon: { en: "Starts soon", "zh-TW": "即將開始", ja: "まもなく開始" },
  phaseEnded: { en: "Auction ended", "zh-TW": "競標已結束", ja: "オークション終了" },
  phasePool: { en: "Trading", "zh-TW": "交易中", ja: "取引中" },
  blocksLeft: {
    en: "{n} {n|block|blocks} left (about {min} min)",
    "zh-TW": "剩 {n} 個區塊（約 {min} 分鐘）",
    ja: "残り {n} ブロック（約 {min} 分）",
  },
  clearing: {
    en: "Clearing price {price} {currency} per {symbol} (floor {floor})",
    "zh-TW": "成交價 {price} {currency}／{symbol}（底價 {floor}）",
    ja: "約定価格 {price} {currency}／{symbol}（最低価格 {floor}）",
  },
  raised: {
    en: "Raised {amount} {currency} from {n} {n|bid|bids}",
    "zh-TW": "已募 {amount} {currency}，共 {n} 筆出價",
    ja: "{n} 件の入札で {amount} {currency} を調達",
  },
  poolPrice: {
    en: "Uniswap pool price {price} {currency} per {symbol}",
    "zh-TW": "Uniswap 池價 {price} {currency}／{symbol}",
    ja: "Uniswap プール価格 {price} {currency}／{symbol}",
  },
  owner: { en: "Name held by {owner}", "zh-TW": "名字持有人 {owner}", ja: "名前の保有者 {owner}" },
  bidLabel: { en: "Bid ({currency})", "zh-TW": "出價（{currency}）", ja: "入札額（{currency}）" },
  bidButton: { en: "Bid with passkey", "zh-TW": "用 passkey 出價", ja: "パスキーで入札" },
  bidHelp: {
    en: "Everyone pays the same clearing price when the auction ends; what you bid above it comes back.",
    "zh-TW": "拍賣結束時所有人都付同一個成交價；多出的部分會退還給你。",
    ja: "終了時は全員が同じ約定価格を払い、それを超えた分は戻ってきます。",
  },
  bidNeedsParent: {
    en: "This remix is priced in {currency}: buy {currency} in its own world first, then bid here.",
    "zh-TW": "這個 remix 以 {currency} 計價：先到 {currency} 的世界買一些，再回來出價。",
    ja: "このリミックスは {currency} 建てです。先に {currency} の世界で買ってから、ここで入札してください。",
  },
  bidDone: {
    en: "Bid placed: {amount} {currency} in {name}.",
    "zh-TW": "已出價：在 {name} 出價 {amount} {currency}。",
    ja: "{name} に {amount} {currency} で入札しました。",
  },
  settle: { en: "Settle the auction", "zh-TW": "結算拍賣", ja: "オークションを精算" },
  settleHelp: {
    en: "The auction is over. Settling hands every bidder their tokens and opens the Uniswap pool.",
    "zh-TW": "拍賣已結束。結算會把代幣發給每位出價者，並開啟 Uniswap 池。",
    ja: "オークションは終わりました。精算すると入札者全員にトークンが渡り、Uniswap プールが開きます。",
  },
  settleDone: {
    en: "Settled in {n} {n|transaction|transactions}.",
    "zh-TW": "已結算，共 {n} 筆交易。",
    ja: "{n} 件のトランザクションで精算しました。",
  },
  buyLabel: { en: "Spend (USDC)", "zh-TW": "花費（USDC）", ja: "支払う額（USDC）" },
  buyButton: { en: "Buy with passkey", "zh-TW": "用 passkey 買入", ja: "パスキーで購入" },
  buyHelp: {
    en: "Buys through every ancestor ({path}); each hop pays a 1% royalty up the family tree.",
    "zh-TW": "沿著每一代祖先買入（{path}）；每一跳都會付 1% 分潤給上面的族譜。",
    ja: "祖先を順にたどって購入します（{path}）。各段で 1% のロイヤリティが系譜の上へ支払われます。",
  },
  buyDone: {
    en: "Bought {name} with {amount} USDC.",
    "zh-TW": "已用 {amount} USDC 買入 {name}。",
    ja: "{amount} USDC で {name} を購入しました。",
  },
  royalties: {
    en: "Royalties waiting: {token} {symbol} + {currency} {currencySymbol}",
    "zh-TW": "待發分潤：{token} {symbol} + {currency} {currencySymbol}",
    ja: "未払いのロイヤリティ：{token} {symbol} + {currency} {currencySymbol}",
  },
  payRoyalties: { en: "Pay out royalties", "zh-TW": "發放分潤", ja: "ロイヤリティを支払う" },
  royaltiesDone: {
    en: "Royalties paid to the name's holder.",
    "zh-TW": "分潤已付給名字持有人。",
    ja: "ロイヤリティを名前の保有者に支払いました。",
  },
  yourBids: { en: "Your bids here", "zh-TW": "你在這裡的出價", ja: "この世界での入札" },
  bidRow: {
    en: "#{id} · {amount} · {state}",
    "zh-TW": "#{id} · {amount} · {state}",
    ja: "#{id} · {amount} · {state}",
  },
  bidOpen: { en: "open", "zh-TW": "進行中", ja: "受付中" },
  bidExited: { en: "exited", "zh-TW": "已退出", ja: "退出済み" },
  bidClaimed: { en: "tokens claimed", "zh-TW": "已領代幣", ja: "受取済み" },
  signing: {
    en: "Waiting for your passkey…",
    "zh-TW": "等待 passkey 驗證…",
    ja: "パスキーを待っています…",
  },
  sending: { en: "Sending to Sepolia…", "zh-TW": "正在送到 Sepolia…", ja: "Sepolia に送信中…" },
  viewTx: { en: "View on Etherscan", "zh-TW": "在 Etherscan 查看", ja: "Etherscan で見る" },

  // ── ENS names for cartridges and saves (EnsNames.tsx) ──────────────────────────────────────
  notConfigured: {
    en: "No ENS tree is set up on this machine (UNWRITTEN_LINEAGE_* in .env).",
    "zh-TW": "這台機器還沒設定 ENS 名稱樹（.env 裡的 UNWRITTEN_LINEAGE_*）。",
    ja: "この端末には ENS の名前ツリーが設定されていません（.env の UNWRITTEN_LINEAGE_*）。",
  },
  nameChecking: { en: "asking Sepolia…", "zh-TW": "正在查詢 Sepolia…", ja: "Sepolia に照会中…" },
  nameFree: { en: "not named yet", "zh-TW": "尚未登記", ja: "まだ登録されていません" },
  nameCurrent: {
    en: "points at this version",
    "zh-TW": "指向這個版本",
    ja: "このバージョンを指しています",
  },
  nameOutdated: {
    en: "yours; points at {version}",
    "zh-TW": "你的名稱，目前指向 {version}",
    ja: "あなたの名前。{version} を指しています",
  },
  nameOtherVersion: {
    en: "held by {holder}; points at {version}",
    "zh-TW": "由 {holder} 持有，指向 {version}",
    ja: "{holder} が保有。{version} を指しています",
  },
  nameTaken: {
    en: "held by {holder} for another cartridge",
    "zh-TW": "已被 {holder} 用於另一個卡帶",
    ja: "{holder} が別のカートリッジに使っています",
  },
  nameRegister: {
    en: "Name it with your passkey",
    "zh-TW": "用 passkey 登記名稱",
    ja: "パスキーで名前を登録",
  },
  nameRepoint: {
    en: "Point it at this version",
    "zh-TW": "把名稱指到這個版本",
    ja: "このバージョンに向ける",
  },
  nameDone: {
    en: "{name} is written on ENS.",
    "zh-TW": "{name} 已寫上 ENS。",
    ja: "{name} を ENS に書き込みました。",
  },
  summaryNameCartridge: {
    en: "Name {name} → {ref}",
    "zh-TW": "登記 {name} → {ref}",
    ja: "{name} を登録 → {ref}",
  },
  summaryRecordSave: {
    en: "Record your save as {name}",
    "zh-TW": "把你的存檔記錄為 {name}",
    ja: "セーブを {name} として記録",
  },
  summaryUpdateSave: {
    en: "Move {name} to this checkpoint",
    "zh-TW": "把 {name} 更新到目前的進度",
    ja: "{name} をこのチェックポイントに更新",
  },
  saveHeading: {
    en: "ENS name for this save",
    "zh-TW": "這個存檔的 ENS 名稱",
    ja: "このセーブの ENS 名",
  },
  saveNote: {
    en: "The name is yours (your passkey's account holds it). It records only a hash of this save, the exact cartridge version and a line of progress — never the save itself.",
    "zh-TW":
      "名稱屬於你（由你的 passkey 帳戶持有）。上面只記錄這個存檔的雜湊、確切的卡帶版本和一行進度，存檔內容本身不會上鏈。",
    ja: "名前はあなたのもの（パスキーのアカウントが保有）です。記録するのはこのセーブのハッシュ、正確なカートリッジのバージョン、進行状況の一行だけで、セーブそのものは載りません。",
  },
  saveNeedsCartridge: {
    en: "A save hangs under its cartridge's name, and {name} has none yet.",
    "zh-TW": "存檔要掛在卡帶的名稱底下，但 {name} 還沒登記。",
    ja: "セーブはカートリッジの名前の下に付きますが、{name} はまだ登録されていません。",
  },
  saveNameCartridge: {
    en: "Name the cartridge first",
    "zh-TW": "先登記卡帶名稱",
    ja: "先にカートリッジを登録",
  },
  saveCartridgeTaken: {
    en: "{name} names another cartridge, so this save cannot hang under it.",
    "zh-TW": "{name} 已是另一個卡帶的名稱，這個存檔無法掛在底下。",
    ja: "{name} は別のカートリッジの名前なので、このセーブを付けられません。",
  },
  saveLabel: { en: "Save name", "zh-TW": "存檔名稱", ja: "セーブ名" },
  saveLocal: {
    en: "Now: {progress} · {hash}",
    "zh-TW": "目前：{progress} · {hash}",
    ja: "現在：{progress} · {hash}",
  },
  saveFree: {
    en: "{name} is free.",
    "zh-TW": "{name} 還沒有人使用。",
    ja: "{name} は空いています。",
  },
  saveCurrent: {
    en: "{name} records this save as it is now.",
    "zh-TW": "{name} 記錄的就是這個存檔目前的樣子。",
    ja: "{name} はこのセーブの現在の状態を記録しています。",
  },
  saveOutdated: {
    en: "{name} records an earlier checkpoint: {progress}.",
    "zh-TW": "{name} 記錄的是較早的進度：{progress}。",
    ja: "{name} は以前のチェックポイントを記録しています：{progress}。",
  },
  saveTaken: {
    en: "{name} is held by someone else. Pick another name.",
    "zh-TW": "{name} 已被別人使用，請換一個名稱。",
    ja: "{name} は他の人が使っています。別の名前にしてください。",
  },
  saveHeldBy: {
    en: "Held by the passkey account {holder}, not this machine's passkey.",
    "zh-TW": "由 passkey 帳戶 {holder} 持有，不是這台機器的 passkey。",
    ja: "パスキーのアカウント {holder} が保有しています（この端末のパスキーではありません）。",
  },
  saveRecord: { en: "Record with passkey", "zh-TW": "用 passkey 記錄", ja: "パスキーで記録" },
  saveUpdate: {
    en: "Update to this checkpoint",
    "zh-TW": "更新到目前進度",
    ja: "このチェックポイントに更新",
  },
  lookupSave: {
    en: "A save of {ref}: {progress} (checkpoint {hash}).",
    "zh-TW": "這是 {ref} 的一個存檔：{progress}（進度雜湊 {hash}）。",
    ja: "{ref} のセーブです：{progress}（チェックポイント {hash}）。",
  },

  // ── A cartridge's label, and putting it on the market (CartridgeEns.tsx, LaunchLine.tsx) ────
  cartridgeLabel: {
    en: "ENS label for “{world}”",
    "zh-TW": "「{world}」的 ENS 標籤",
    ja: "「{world}」の ENS ラベル",
  },
  labelPunycode: {
    en: "This world's name is not in Latin letters, so the label made from its id is hard to read. Pick a readable English label.",
    "zh-TW": "這個世界的名稱不是拉丁字母，由 id 轉出來的標籤很難讀。請改成好讀的英文標籤。",
    ja: "この世界の名前はラテン文字ではないため、ID から作ったラベルは読みにくくなります。読みやすい英語のラベルにしてください。",
  },
  labelInvalid: {
    en: "A label needs letters (a–z) or digits (0–9); hyphens may join them.",
    "zh-TW": "標籤需要英文字母（a–z）或數字（0–9），中間可以用連字號連接。",
    ja: "ラベルには英字（a–z）か数字（0–9）が必要です。間をハイフンでつなげます。",
  },
  labelTaken: {
    en: "That name belongs to another world. Pick another label.",
    "zh-TW": "這個名稱已屬於另一個世界，請換一個標籤。",
    ja: "その名前は別の世界のものです。別のラベルにしてください。",
  },
  labelFixed: {
    en: "The label is fixed once the name is registered; later versions keep the same name.",
    "zh-TW": "名稱登記後標籤就固定了，之後的版本都沿用同一個名稱。",
    ja: "名前を登録するとラベルは固定され、以後のバージョンも同じ名前を使います。",
  },
  launch: { en: "Put on the market", "zh-TW": "上架到市場", ja: "マーケットに出す" },
  launchTerms: {
    en: "{supply} tokens · half ({pool}) seeds the Uniswap pool · auction about {min} min ({blocks} blocks) · floor {floor} USDC per token · graduates after raising {raised} USDC",
    "zh-TW":
      "{supply} 枚代幣 · 一半（{pool}）注入 Uniswap 池 · 拍賣約 {min} 分鐘（{blocks} 個區塊）· 底價每枚 {floor} USDC · 募得 {raised} USDC 後轉入交易池",
    ja: "トークン {supply} 枚 · 半分（{pool}）を Uniswap プールに入れます · オークションは約 {min} 分（{blocks} ブロック）· 最低価格は 1 枚 {floor} USDC · {raised} USDC 集まるとプールに移ります",
  },
  launchTermsRemix: {
    en: "{supply} tokens · half ({pool}) seeds the Uniswap pool · auction about {min} min ({blocks} blocks) · floor {floor} of {parent}'s token per token · graduates after raising {raised} of {parent}'s token",
    "zh-TW":
      "{supply} 枚代幣 · 一半（{pool}）注入 Uniswap 池 · 拍賣約 {min} 分鐘（{blocks} 個區塊）· 底價每枚 {floor} 枚 {parent} 代幣 · 募得 {raised} 枚 {parent} 代幣後轉入交易池",
    ja: "トークン {supply} 枚 · 半分（{pool}）を Uniswap プールに入れます · オークションは約 {min} 分（{blocks} ブロック）· 最低価格は 1 枚 {parent} のトークン {floor} · {parent} のトークンが {raised} 集まるとプールに移ります",
  },
  launchOnMarket: {
    en: "On the market — find it in Worlds → Market.",
    "zh-TW": "已在市場上——到「世界 → 市場」查看。",
    ja: "マーケットに出ています。「ワールド → マーケット」で見られます。",
  },
  launchParentFirst: {
    en: "{parent} must go on the market first: a remix trades in its parent's token.",
    "zh-TW": "{parent} 要先上架：remix 以上一代世界的代幣交易。",
    ja: "先に {parent} をマーケットに出す必要があります。リミックスは親の世界のトークンで取引されます。",
  },
  launchDone: {
    en: "{name} is on the market; its auction has begun.",
    "zh-TW": "{name} 已上架，拍賣開始了。",
    ja: "{name} をマーケットに出しました。オークションが始まりました。",
  },
  summaryLaunch: {
    en: "Put {name} on the market",
    "zh-TW": "把 {name} 上架到市場",
    ja: "{name} をマーケットに出す",
  },

  // ── A save's door number on its name (EnsNames.tsx) ──────────────────────────────────────
  saveDoorNote: {
    en: "The name will carry this save's door number ({door}), so friends can walk in by it.",
    "zh-TW": "名稱會記上這個存檔的門牌（{door}），夥伴可以用名稱走進來。",
    ja: "名前にはこのセーブの扉番号（{door}）が載り、仲間は名前で入れます。",
  },
  saveDoor: {
    en: "Carries door {door} — friends can walk in by this name.",
    "zh-TW": "記著門牌 {door}——夥伴可以用這個名稱走進來。",
    ja: "扉番号 {door} が載っています。仲間はこの名前で入れます。",
  },
  saveDoorOther: {
    en: "Carries door {door}; this save's door is {own}.",
    "zh-TW": "記著門牌 {door}；這個存檔的門牌是 {own}。",
    ja: "載っている扉番号は {door}、このセーブの扉番号は {own} です。",
  },
  saveDoorNone: {
    en: "Carries no door yet; this save's door is {own}.",
    "zh-TW": "還沒有記上門牌；這個存檔的門牌是 {own}。",
    ja: "まだ扉番号が載っていません。このセーブの扉番号は {own} です。",
  },
  saveDoorButton: {
    en: "Put my door on this name",
    "zh-TW": "把我的門牌寫上名稱",
    ja: "扉番号を名前に載せる",
  },
  summaryDoor: {
    en: "Put door {door} on {name}",
    "zh-TW": "把門牌 {door} 寫上 {name}",
    ja: "{name} に扉番号 {door} を載せる",
  },
  saveCartridgeLabelHint: {
    en: "Its label comes from the world's id and is hard to read. To pick a readable one, name it in Worlds → Cartridges.",
    "zh-TW": "它的標籤由世界的 id 轉成，很難讀。想取個好讀的標籤，請到「世界 → 卡帶」登記。",
    ja: "ラベルは世界の ID から作られるため読みにくくなります。読みやすいラベルにするには「ワールド → カートリッジ」で登録してください。",
  },

  // ── The player's own name (PlayerName.tsx) ───────────────────────────────────────────────
  playerNeedsPasskey: {
    en: "Link your passkey to claim your own player name.",
    "zh-TW": "連結你的 passkey，就能認領自己的玩家名稱。",
    ja: "パスキーをつなぐと、自分のプレイヤー名を取得できます。",
  },
  playerNoDirectory: {
    en: "Player names are not set up on this deployment yet.",
    "zh-TW": "這個部署還沒有開放玩家名稱。",
    ja: "このデプロイではまだプレイヤー名が用意されていません。",
  },
  playerIntro: {
    en: "Claim your own name under {directory}. Your passkey's account holds it, and other players see it on a continent.",
    "zh-TW":
      "在 {directory} 底下認領你自己的名稱。它由你的 passkey 帳戶持有，其他玩家在大陸上會看到它。",
    ja: "{directory} の下に自分の名前を取得します。パスキーのアカウントが保有し、大陸では他のプレイヤーにこの名前が見えます。",
  },
  playerLabel: { en: "Your player name", "zh-TW": "你的玩家名稱", ja: "プレイヤー名" },
  playerClaim: { en: "Claim with passkey", "zh-TW": "用 passkey 認領", ja: "パスキーで取得" },
  playerFree: {
    en: "{name} is free.",
    "zh-TW": "{name} 還沒有人使用。",
    ja: "{name} は空いています。",
  },
  playerTaken: {
    en: "{name} is held by {holder}. Pick another.",
    "zh-TW": "{name} 已由 {holder} 持有，請換一個。",
    ja: "{name} は {holder} が保有しています。別の名前にしてください。",
  },
  playerClaimed: {
    en: "{name} is yours, and now your player name on this device.",
    "zh-TW": "{name} 是你的了，也已成為這台裝置上的玩家名稱。",
    ja: "{name} を取得し、この端末のプレイヤー名にしました。",
  },
  playerDeviceName: {
    en: "This device plays as “{name}”.",
    "zh-TW": "這台裝置目前以「{name}」遊玩。",
    ja: "この端末は「{name}」としてプレイしています。",
  },
  playerUseName: {
    en: "Use as my player name",
    "zh-TW": "設為我的玩家名稱",
    ja: "プレイヤー名にする",
  },
  summaryNamePlayer: {
    en: "Claim {name} as your player name",
    "zh-TW": "認領 {name} 作為你的玩家名稱",
    ja: "{name} をプレイヤー名として取得",
  },
} as const satisfies Record<string, Phrase>;
