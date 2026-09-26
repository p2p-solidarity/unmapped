// The lineage market (Worlds → Market) and the player's one passkey (its block there, Settings → Your
// passkey): auctions and trading on Sepolia, confirmed with the passkey and paid for by UNMAPPED's
// gas station — no wallet anywhere, and no key in the app. Every passkey-confirmed button reads the
// same way: "用 passkey 確認…" / "… with passkey" / "パスキーで…".

import type { Phrase } from "./phrase";

export const MARKET = {
  intro: {
    en: "Bid on and trade worlds on Sepolia. Your passkey confirms every move and UNMAPPED's gas station pays the fee — no wallet, no ETH.",
    "zh-TW":
      "在 Sepolia 上競標、交易世界。每一步都用你的 passkey 確認，手續費由《無界之地》的代付站支付——不需要錢包，也不需要 ETH。",
    ja: "Sepolia で世界に入札し、売買します。操作はすべてパスキーで確認し、手数料は UNMAPPED のガスステーションが払います。ウォレットも ETH も要りません。",
  },
  reading: { en: "Reading the market…", "zh-TW": "正在讀取市場…", ja: "マーケットを読み込み中…" },
  readOnly: {
    en: "This computer can look but not send anything yet: no gas station is set up.",
    "zh-TW": "這台電腦現在只能看、不能送出：還沒設定代付站。",
    ja: "このコンピューターは見るだけで、まだ送信できません。ガスステーションが未設定です。",
  },
  accountHeading: { en: "Your passkey", "zh-TW": "你的 passkey", ja: "あなたのパスキー" },
  accountMore: { en: "Advanced", "zh-TW": "進階", ja: "詳細" },
  setUpPasskey: { en: "Set up my passkey", "zh-TW": "設定我的 passkey", ja: "パスキーを設定" },
  useBrowserPasskey: {
    en: "Set up with Touch ID (opens your browser)",
    "zh-TW": "用 Touch ID 設定（會打開瀏覽器）",
    ja: "Touch ID で設定（ブラウザが開きます）",
  },
  useBrowserNote: {
    en: "Your browser opens: confirm with Touch ID there, then come back here. Your passkey stays on your own computer.",
    "zh-TW": "會打開瀏覽器：在那裡用 Touch ID 確認，再回到這裡。passkey 留在你自己的電腦裡。",
    ja: "ブラウザが開きます。そこで Touch ID で確認して、ここに戻ってください。パスキーはあなたのコンピューターに残ります。",
  },
  useAppHaveNote: {
    en: "This computer already has your passkey, so it is used right here. The first time it asks you twice.",
    "zh-TW": "這台電腦已經有你的 passkey，就直接用它。第一次會請你確認兩次。",
    ja: "このコンピューターにはもうあなたのパスキーがあるので、ここでそれを使います。初回だけ 2 回確認します。",
  },
  useAppPasskey: {
    en: "Set up with a security key",
    "zh-TW": "用安全金鑰設定",
    ja: "セキュリティキーで設定",
  },
  otherWayApp: {
    en: "Use a security key instead",
    "zh-TW": "改用安全金鑰",
    ja: "セキュリティキーを使う",
  },
  otherWayBrowser: { en: "Use Touch ID instead", "zh-TW": "改用 Touch ID", ja: "Touch ID を使う" },
  waitingBrowser: {
    en: "Confirm in your browser…",
    "zh-TW": "請到瀏覽器確認…",
    ja: "ブラウザで確認してください…",
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
  usePasskeyNote: {
    en: "Plug in your security key. The first time it asks you twice; after that, once per action.",
    "zh-TW": "插上你的安全金鑰。第一次會請你確認兩次，之後每次只要確認一次。",
    ja: "セキュリティキーを挿してください。初回は 2 回、その後は操作ごとに 1 回確認します。",
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
  phaseFailed: { en: "Auction fell short", "zh-TW": "競標未達門檻", ja: "オークション不成立" },
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
  raisedOf: {
    en: "Raised {amount} of the {required} {currency} it needs, from {n} {n|bid|bids}",
    "zh-TW": "已募 {amount}／門檻 {required} {currency}，共 {n} 筆出價",
    ja: "{n} 件の入札で {amount} {currency} を調達（必要額 {required} {currency}）",
  },
  poolPrice: {
    en: "Uniswap pool price {price} {currency} per {symbol}",
    "zh-TW": "Uniswap 池價 {price} {currency}／{symbol}",
    ja: "Uniswap プール価格 {price} {currency}／{symbol}",
  },
  owner: { en: "Name held by {owner}", "zh-TW": "名字持有人 {owner}", ja: "名前の保有者 {owner}" },
  bidLabel: { en: "Bid ({currency})", "zh-TW": "出價（{currency}）", ja: "入札額（{currency}）" },
  bidButton: { en: "Bid with passkey", "zh-TW": "用 passkey 確認出價", ja: "パスキーで入札" },
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
  failedHelp: {
    en: "The auction is over and did not raise what it needed, so it will not graduate: its Uniswap pool will not open.",
    "zh-TW":
      "拍賣已結束，募得金額沒有達到門檻，所以不會轉入交易池：這個世界的 Uniswap 池不會開啟。",
    ja: "オークションは終わりましたが必要額に届かなかったため、プールには移りません。Uniswap プールは開きません。",
  },
  refundHelp: {
    en: "Every bid here comes back in full. Refunding returns each open bid to its bidder; the gas station pays.",
    "zh-TW":
      "這裡的每筆出價都會全額退還。按下退款，每筆還沒退的出價都會回到出價者手上，gas 由代付站支付。",
    ja: "ここでの入札はすべて全額戻ります。返金すると未返金の入札がそれぞれ入札者に戻り、ガス代はガスステーションが払います。",
  },
  refund: { en: "Refund the bids", "zh-TW": "退還出價", ja: "入札を返金" },
  refundDone: {
    en: "Refunded in {n} {n|transaction|transactions}.",
    "zh-TW": "已退款，共 {n} 筆交易。",
    ja: "{n} 件のトランザクションで返金しました。",
  },
  buyLabel: { en: "Spend (USDC)", "zh-TW": "花費（USDC）", ja: "支払う額（USDC）" },
  buyButton: { en: "Buy with passkey", "zh-TW": "用 passkey 確認買入", ja: "パスキーで購入" },
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
  bidRefunded: { en: "refunded", "zh-TW": "已退款", ja: "返金済み" },
  bidClaimed: { en: "tokens claimed", "zh-TW": "已領代幣", ja: "受取済み" },
  signing: {
    en: "Confirm with your passkey…",
    "zh-TW": "請用 passkey 確認…",
    ja: "パスキーで確認してください…",
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
    en: "held by {holder} for another world",
    "zh-TW": "已被 {holder} 用在另一個世界",
    ja: "{holder} が別の世界に使っています",
  },
  nameRegister: {
    en: "Name it with passkey",
    "zh-TW": "用 passkey 確認取名",
    ja: "パスキーで名前を登録",
  },
  nameRepoint: {
    en: "Point it here with passkey",
    "zh-TW": "用 passkey 確認指到這個版本",
    ja: "パスキーでこのバージョンに向ける",
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
    en: "Record your world as {name}",
    "zh-TW": "把你的世界記錄為 {name}",
    ja: "ワールドを {name} として記録",
  },
  summaryUpdateSave: {
    en: "Update {name} to where you are now",
    "zh-TW": "把 {name} 更新到目前的進度",
    ja: "{name} を今の進み具合に更新",
  },
  saveHeading: {
    en: "ENS name for this world",
    "zh-TW": "這個世界的 ENS 名稱",
    ja: "このワールドの ENS 名",
  },
  saveNote: {
    en: "The name is yours (your passkey holds it). It records only a fingerprint of this world, its exact version and one line of progress — never the world itself.",
    "zh-TW":
      "名稱是你的（屬於你的 passkey）。上面只記著這個世界的指紋、它的確切版本和一行進度，世界的內容本身不會上鏈。",
    ja: "名前はあなたのもの（パスキーが保有）です。記録するのはこのワールドの指紋、正確なバージョン、進み具合の一行だけで、ワールドそのものは載りません。",
  },
  saveNeedsCartridge: {
    en: "Your world's name hangs under the original world's name, and {name} is not named yet.",
    "zh-TW": "你的世界名稱要掛在原版世界的名稱底下，但 {name} 還沒取名。",
    ja: "ワールドの名前は元の世界の名前の下に付きますが、{name} はまだ登録されていません。",
  },
  saveNameCartridge: {
    en: "Name the original world with passkey",
    "zh-TW": "用 passkey 確認原版世界的名稱",
    ja: "パスキーで元の世界の名前を登録",
  },
  saveCartridgeTaken: {
    en: "{name} belongs to another world, so this world cannot hang under it.",
    "zh-TW": "{name} 已是另一個世界的名稱，這個世界無法掛在底下。",
    ja: "{name} は別の世界の名前なので、このワールドを付けられません。",
  },
  saveLabel: { en: "World name", "zh-TW": "世界名稱", ja: "ワールド名" },
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
    en: "{name} records this world as it is now.",
    "zh-TW": "{name} 記錄的就是這個世界目前的樣子。",
    ja: "{name} はこのワールドの今の状態を記録しています。",
  },
  saveOutdated: {
    en: "{name} records an earlier point: {progress}.",
    "zh-TW": "{name} 記錄的是較早的進度：{progress}。",
    ja: "{name} は以前の進み具合を記録しています：{progress}。",
  },
  saveTaken: {
    en: "{name} is held by someone else. Pick another name.",
    "zh-TW": "{name} 已被別人使用，請換一個名稱。",
    ja: "{name} は他の人が使っています。別の名前にしてください。",
  },
  saveHeldBy: {
    en: "Held by {holder}, not by the passkey on this computer.",
    "zh-TW": "由 {holder} 持有，不是你這台電腦上的 passkey。",
    ja: "{holder} が保有しています（このコンピューターのパスキーではありません）。",
  },
  saveRecord: { en: "Record with passkey", "zh-TW": "用 passkey 確認記錄", ja: "パスキーで記録" },
  saveUpdate: {
    en: "Update with passkey",
    "zh-TW": "用 passkey 確認更新進度",
    ja: "パスキーで進み具合を更新",
  },
  lookupSave: {
    en: "A world of {ref}: {progress} (checkpoint {hash}).",
    "zh-TW": "這是 {ref} 裡的一個世界：{progress}（進度指紋 {hash}）。",
    ja: "{ref} のワールドです：{progress}（チェックポイント {hash}）。",
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
  launch: {
    en: "Put on the market with passkey",
    "zh-TW": "用 passkey 確認上架",
    ja: "パスキーでマーケットに出す",
  },
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
    en: "The name will carry this world's join code ({door}), so friends can join by it.",
    "zh-TW": "名稱會記上這個世界的加入碼（{door}），朋友可以用名稱加入。",
    ja: "名前にはこのワールドの参加コード（{door}）が載り、友だちは名前で参加できます。",
  },
  saveDoor: {
    en: "Carries join code {door} — friends can join by this name.",
    "zh-TW": "記著加入碼 {door}——朋友可以用這個名稱加入。",
    ja: "参加コード {door} が載っています。友だちはこの名前で参加できます。",
  },
  saveDoorOther: {
    en: "Carries join code {door}; this world's join code is {own}.",
    "zh-TW": "記著加入碼 {door}；這個世界的加入碼是 {own}。",
    ja: "載っている参加コードは {door}、このワールドの参加コードは {own} です。",
  },
  saveDoorNone: {
    en: "Carries no join code yet; this world's join code is {own}.",
    "zh-TW": "還沒有記上加入碼；這個世界的加入碼是 {own}。",
    ja: "まだ参加コードが載っていません。このワールドの参加コードは {own} です。",
  },
  saveDoorButton: {
    en: "Add my join code with passkey",
    "zh-TW": "用 passkey 確認寫上加入碼",
    ja: "パスキーで参加コードを載せる",
  },
  summaryDoor: {
    en: "Put join code {door} on {name}",
    "zh-TW": "把加入碼 {door} 寫上 {name}",
    ja: "{name} に参加コード {door} を載せる",
  },
  saveCartridgeLabelHint: {
    en: "Its label comes from the world's id and is hard to read. To pick a readable one, name the original world in Worlds → My worlds.",
    "zh-TW":
      "它的標籤由世界的 id 轉成，很難讀。想取個好讀的標籤，請到「世界 → 我的世界」幫原版世界取名。",
    ja: "ラベルは世界の ID から作られるため読みにくくなります。読みやすいラベルにするには「ワールド → マイワールド」で元の世界に名前を付けてください。",
  },

  // ── The player's own name (PlayerName.tsx) ───────────────────────────────────────────────
  playerNeedsPasskey: {
    en: "Set up your passkey to claim your own player name.",
    "zh-TW": "設定你的 passkey，就能取自己的玩家名稱。",
    ja: "パスキーを設定すると、自分のプレイヤー名を取得できます。",
  },
  playerNoDirectory: {
    en: "Player names are not set up on this deployment yet.",
    "zh-TW": "這個部署還沒有開放玩家名稱。",
    ja: "このデプロイではまだプレイヤー名が用意されていません。",
  },
  playerIntro: {
    en: "Pick a name of your own. Your passkey holds it, and friends see it in the game.",
    "zh-TW": "取一個你自己的名字。它屬於你的 passkey，朋友在遊戲裡會看到它。",
    ja: "自分の名前を決めましょう。パスキーが保有し、友だちはゲームの中でこの名前を見ます。",
  },
  playerLabel: { en: "Your player name", "zh-TW": "你的玩家名稱", ja: "プレイヤー名" },
  playerClaim: {
    en: "Claim with passkey",
    "zh-TW": "用 passkey 確認這個名字",
    ja: "パスキーで取得",
  },
  playerFree: {
    en: "{name} is free.",
    "zh-TW": "{name} 還沒有人使用。",
    ja: "{name} は空いています。",
  },
  playerTaken: {
    en: "{name} is taken. Pick another.",
    "zh-TW": "{name} 已經有人用了，請換一個。",
    ja: "{name} はもう使われています。別の名前にしてください。",
  },
  playerClaimed: {
    en: "{name} is yours, and now your player name on this device.",
    "zh-TW": "{name} 是你的了，也已成為這台裝置上的玩家名稱。",
    ja: "{name} を取得し、この端末のプレイヤー名にしました。",
  },
  playerDeviceName: {
    en: "This computer plays as “{name}”.",
    "zh-TW": "這台電腦目前用「{name}」這個名字玩。",
    ja: "このコンピューターは「{name}」としてプレイしています。",
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
