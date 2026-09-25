// Errors about playing with friends (rooms, signaling, the runtime handshake with the host) and the
// optional on-chain ledger.

import type { ErrorText } from "./errors";
import { HINT } from "./errors-hints";

const NETWORK = {
  en: "Check the network connection and try again.",
  "zh-TW": "請檢查網路連線，再試一次。",
  ja: "ネットワーク接続を確認して、もう一度試してください。",
};

const REJOIN = {
  en: "Rejoin the room.",
  "zh-TW": "請重新加入房間。",
  ja: "ルームに参加し直してください。",
};

export const NET_ERRORS: Record<string, ErrorText> = {
  // ── Rooms ──────────────────────────────────────────────────────────────────────────────────
  "room-bad-code": {
    message: {
      en: "That is not a join code.",
      "zh-TW": "這不是加入代碼。",
      ja: "それは参加コードではありません。",
    },
    hint: {
      en: "Join codes are 6 letters and digits.",
      "zh-TW": "加入代碼由 6 個英文字母與數字組成。",
      ja: "参加コードは英字と数字の 6 文字です。",
    },
  },
  "room-failed": {
    message: {
      en: "The connection to the room could not be opened.",
      "zh-TW": "無法建立與房間的連線。",
      ja: "ルームへの接続を開けませんでした。",
    },
    hint: NETWORK,
  },
  "room-no-signaling": {
    message: {
      en: "No signaling server is set up.",
      "zh-TW": "沒有設定信令伺服器。",
      ja: "シグナリングサーバーが設定されていません。",
    },
  },
  "signaling-unreachable": {
    message: {
      en: "No signaling server answered.",
      "zh-TW": "沒有任何信令伺服器回應。",
      ja: "どのシグナリングサーバーも応答しませんでした。",
    },
    hint: NETWORK,
  },
  "continent-signaling-unreachable": {
    message: {
      en: "No signaling server answered, so no other world can find this continent.",
      "zh-TW": "沒有任何信令伺服器回應，其他世界找不到這片大陸。",
      ja: "どのシグナリングサーバーも応答しないため、ほかの世界はこの大陸を見つけられません。",
    },
    hint: {
      en: "On the title screen open Settings → Signaling servers, test them and save one that answers, then open the continent again. It turns live by itself if a server answers first.",
      "zh-TW":
        "請在標題畫面開啟「設定 → 信令伺服器」，測試後儲存一個有回應的伺服器，再重新開啟大陸。若伺服器先回應，會自動恢復連線。",
      ja: "タイトル画面で「設定 → シグナリングサーバー」を開き、テストして応答するサーバーを保存してから、大陸を開き直してください。先にサーバーが応答すれば自動でつながります。",
    },
  },

  // ── Signaling servers (Settings → Signaling servers) ────────────────────────────────────────
  "signaling-bad-url": {
    message: {
      en: "That is not a signaling server address.",
      "zh-TW": "這不是信令伺服器的位址。",
      ja: "それはシグナリングサーバーのアドレスではありません。",
    },
    hint: {
      en: "A signaling server looks like wss://example.com.",
      "zh-TW": "信令伺服器的位址長得像 wss://example.com。",
      ja: "シグナリングサーバーのアドレスは wss://example.com のような形です。",
    },
  },
  "signaling-timeout": {
    message: {
      en: "The signaling server did not answer in time.",
      "zh-TW": "信令伺服器沒有及時回應。",
      ja: "シグナリングサーバーが時間内に応答しませんでした。",
    },
    hint: {
      en: "The server may be down, asleep or blocked on this network. Test it again, or use another server.",
      "zh-TW": "伺服器可能已關閉、正在休眠，或被這個網路封鎖。請再測試一次，或改用其他伺服器。",
      ja: "サーバーが停止中、休止中、またはこのネットワークで遮断されている可能性があります。もう一度テストするか、別のサーバーを使ってください。",
    },
  },
  "signaling-closed": {
    message: {
      en: "The signaling server could not be reached.",
      "zh-TW": "無法連上信令伺服器。",
      ja: "シグナリングサーバーに接続できませんでした。",
    },
    hint: {
      en: "Check the address and this network; the server may be down.",
      "zh-TW": "請檢查位址與這個網路；伺服器也可能已關閉。",
      ja: "アドレスとこのネットワークを確認してください。サーバーが停止している可能性もあります。",
    },
  },
  "signaling-no-relay": {
    message: {
      en: "The server accepted the connection but did not relay a test message.",
      "zh-TW": "伺服器接受了連線，卻沒有轉送測試訊息。",
      ja: "サーバーは接続を受け付けましたが、テストメッセージを中継しませんでした。",
    },
    hint: {
      en: "It may not be a y-webrtc signaling server. Use one that runs y-webrtc's signaling server.",
      "zh-TW": "它可能不是 y-webrtc 信令伺服器。請改用執行 y-webrtc 信令伺服器的位址。",
      ja: "y-webrtc のシグナリングサーバーではない可能性があります。y-webrtc のシグナリングサーバーを動かしているものを使ってください。",
    },
  },
  "signaling-not-saved": {
    message: {
      en: "This device's signaling servers could not be saved.",
      "zh-TW": "無法儲存這台裝置的信令伺服器。",
      ja: "この端末のシグナリングサーバーを保存できませんでした。",
    },
    hint: {
      en: "Storage may be disabled for this app; the servers in use did not change.",
      "zh-TW": "這個應用程式的儲存空間可能被停用；目前使用的伺服器沒有改變。",
      ja: "このアプリのストレージが無効になっている可能性があります。使用中のサーバーは変わっていません。",
    },
  },
  "room-instance-required": {
    message: {
      en: "Choose a save before opening a room.",
      "zh-TW": "開房間之前，請先選擇一個存檔。",
      ja: "ルームを開く前に、セーブを選んでください。",
    },
    hint: {
      en: "Both players need a save of the same cartridge version.",
      "zh-TW": "兩位玩家都需要同一個卡帶版本的存檔。",
      ja: "二人とも、同じ版のカートリッジのセーブが必要です。",
    },
  },
  "room-chunk-invalid": {
    message: {
      en: "Land that arrived over the network could not be read.",
      "zh-TW": "從網路傳來的大地無法讀取。",
      ja: "ネットワーク越しに届いた大地を読み込めませんでした。",
    },
    hint: {
      en: "Ask whoever that land belongs to (the host, or the world's owner) to rejoin.",
      "zh-TW": "請那片大地的主人（房主或那個世界的擁有者）重新加入。",
      ja: "その大地の持ち主（ホスト、またはその世界の持ち主）に参加し直してもらってください。",
    },
  },

  // ── Continents ─────────────────────────────────────────────────────────────────────────────
  "continent-physics-mismatch": {
    message: {
      en: "That world was made on another version of the land's physics.",
      "zh-TW": "那個世界是用另一版的大地物理做出來的。",
      ja: "その世界は、別の版の大地の物理で作られています。",
    },
    hint: {
      en: "Both worlds need the same version to share land; update the older build.",
      "zh-TW": "兩個世界要同一版才能共享大地；請更新較舊的那一方。",
      ja: "大地を共有するには同じ版が必要です。古いほうを更新してください。",
    },
  },
  "continent-protocol-mismatch": {
    message: {
      en: "That world speaks another continent protocol.",
      "zh-TW": "那個世界使用不同版本的大陸協定。",
      ja: "その世界は別の版の大陸プロトコルを使っています。",
    },
    hint: {
      en: "Both players need the same build of UNMAPPED.",
      "zh-TW": "兩位玩家需要使用同一版的《無界之地》。",
      ja: "両方のプレイヤーが同じ版の UNMAPPED を使う必要があります。",
    },
  },
  "continent-same-world": {
    message: {
      en: "This same world is already on the continent from another window or machine.",
      "zh-TW": "同一個世界已經從另一個視窗或另一台電腦加入這片大陸了。",
      ja: "同じ世界が、別のウィンドウか別の端末からすでに大陸にいます。",
    },
    hint: {
      en: "Leave the continent there first.",
      "zh-TW": "請先在那邊離開大陸。",
      ja: "先にそちらで大陸を離れてください。",
    },
  },
  "continent-no-land": {
    message: {
      en: "Only a world with open land can join a continent.",
      "zh-TW": "只有擁有開放大地的世界才能加入大陸。",
      ja: "大陸に加われるのは、開かれた大地のある世界だけです。",
    },
    hint: {
      en: "Open a saved world and step out onto its land first.",
      "zh-TW": "請先開啟一個存檔，走到它的大地上。",
      ja: "まずセーブを開いて、その大地に出てください。",
    },
  },
  "continent-in-room": {
    message: {
      en: "This world is already in a shared room.",
      "zh-TW": "這個世界已經在共享房間裡了。",
      ja: "この世界はすでに共有ルームに入っています。",
    },
    hint: {
      en: "Leave the room in Console → Multiplayer first.",
      "zh-TW": "請先到 主控台 → 多人連線 離開房間。",
      ja: "先に コンソール → マルチプレイ でルームを抜けてください。",
    },
  },
  "room-open-land": {
    message: {
      en: "Open land is shared as a continent, not through a room.",
      "zh-TW": "開放大地是以大陸共享的，不經由房間。",
      ja: "開けた大地は、ルームではなく大陸として共有します。",
    },
    hint: {
      en: "Play the world, open the Door at home and choose “Open my door to friends”.",
      "zh-TW": "進入這個世界，打開家裡的門，選擇「向夥伴打開我的門」。",
      ja: "世界で遊び、家の扉を開いて「仲間に扉を開く」を選んでください。",
    },
  },
  "session-v2-required": {
    message: {
      en: "Multiplayer needs a v2 cartridge.",
      "zh-TW": "多人連線需要 v2 卡帶。",
      ja: "マルチプレイには v2 のカートリッジが必要です。",
    },
    hint: {
      en: "Open a v2 save, or migrate and publish this cartridge first.",
      "zh-TW": "請開啟 v2 的存檔，或先轉換並發布這張卡帶。",
      ja: "v2 のセーブを開くか、先にこのカートリッジを移行して公開してください。",
    },
  },

  // ── The handshake with the host ────────────────────────────────────────────────────────────
  "session-id-mismatch": {
    message: {
      en: "This room belongs to a different session.",
      "zh-TW": "這個房間屬於另一個工作階段。",
      ja: "このルームは別のセッションのものです。",
    },
    hint: HINT.sameAsHost,
  },
  "session-cartridge-mismatch": {
    message: {
      en: "This room is playing a different cartridge version.",
      "zh-TW": "這個房間正在玩不同版本的卡帶。",
      ja: "このルームは別の版のカートリッジを遊んでいます。",
    },
    hint: HINT.sameAsHost,
  },
  "session-content-mismatch": {
    message: {
      en: "This room's cartridge content is different.",
      "zh-TW": "這個房間的卡帶內容不同。",
      ja: "このルームのカートリッジの内容が異なります。",
    },
    hint: HINT.sameAsHost,
  },
  "session-module-lock-mismatch": {
    message: {
      en: "This room uses different capability modules.",
      "zh-TW": "這個房間使用不同的功能模組。",
      ja: "このルームは別のモジュールを使っています。",
    },
    hint: HINT.sameAsHost,
  },
  "session-mod-lock-mismatch": {
    message: {
      en: "This room uses different mods.",
      "zh-TW": "這個房間使用不同的模組。",
      ja: "このルームは別の MOD を使っています。",
    },
    hint: HINT.sameAsHost,
  },
  "session-profile-mismatch": {
    message: {
      en: "This room runs the game with different settings.",
      "zh-TW": "這個房間以不同的設定執行遊戲。",
      ja: "このルームは別の設定でゲームを動かしています。",
    },
    hint: HINT.sameAsHost,
  },
  "session-effective-mismatch": {
    message: {
      en: "This room's game rules differ from yours.",
      "zh-TW": "這個房間的遊戲規則和你的不同。",
      ja: "このルームのゲームのルールが、あなたのものと違います。",
    },
    hint: HINT.sameAsHost,
  },
  "session-engine-version-mismatch": {
    message: {
      en: "This room runs a different version of the game engine.",
      "zh-TW": "這個房間使用不同版本的遊戲引擎。",
      ja: "このルームは別のバージョンのゲームエンジンで動いています。",
    },
    hint: HINT.sameAsHost,
  },
  "session-network-version-mismatch": {
    message: {
      en: "This room uses a different network protocol version.",
      "zh-TW": "這個房間使用不同版本的網路協定。",
      ja: "このルームは別のバージョンの通信プロトコルを使っています。",
    },
    hint: HINT.sameAsHost,
  },
  "session-hello-invalid": {
    message: {
      en: "The other player sent a mismatched cartridge identity.",
      "zh-TW": "對方傳來的卡帶識別資料前後不一致。",
      ja: "相手から届いたカートリッジの識別情報が食い違っています。",
    },
    hint: HINT.sameAsHost,
  },
  "session-authority-mismatch": {
    message: {
      en: "Each room needs exactly one host.",
      "zh-TW": "每個房間只能有一位房主。",
      ja: "ルームのホストは一人だけです。",
    },
    hint: {
      en: "Leave, then have one player open the room while the other joins.",
      "zh-TW": "請先離開，由一位玩家開房間，另一位加入。",
      ja: "いったん退出し、一人がルームを開いて、もう一人が参加してください。",
    },
  },
  "session-profile-invalid": {
    message: {
      en: "The other player did not identify themselves.",
      "zh-TW": "對方沒有提供玩家檔案。",
      ja: "相手がプレイヤープロフィールを示しませんでした。",
    },
    hint: {
      en: "Ask them to rejoin.",
      "zh-TW": "請對方重新加入。",
      ja: "相手に参加し直してもらってください。",
    },
  },
  "session-not-verified": {
    message: {
      en: "The connection with the other player is not confirmed yet.",
      "zh-TW": "和對方的連線還沒有確認完成。",
      ja: "相手との接続の確認がまだ終わっていません。",
    },
    hint: {
      en: "Wait a moment for the handshake to finish.",
      "zh-TW": "請稍候，等交握完成。",
      ja: "ハンドシェイクが終わるまで、少しお待ちください。",
    },
  },
  "session-authority-violation": {
    message: {
      en: "That message is not allowed for this player's role in the room.",
      "zh-TW": "以這位玩家在房間裡的身分，不能送出這則訊息。",
      ja: "このルームでのこのプレイヤーの役割では、そのメッセージは送れません。",
    },
  },
  "session-sequence-invalid": {
    message: {
      en: "The host's updates arrived out of order.",
      "zh-TW": "房主的更新順序錯亂。",
      ja: "ホストからの更新が、正しい順番で届きませんでした。",
    },
    hint: REJOIN,
  },

  // ── The on-chain ledger ────────────────────────────────────────────────────────────────────
  "ledger-not-configured": {
    message: {
      en: "No on-chain ledger is set up.",
      "zh-TW": "尚未設定鏈上帳本。",
      ja: "オンチェーン台帳が設定されていません。",
    },
    hint: {
      en: "Set UNWRITTEN_RPC_URL and UNWRITTEN_LEDGER_ADDRESS in .env (and UNWRITTEN_PRIVATE_KEY to publish).",
      "zh-TW":
        "請在 .env 設定 UNWRITTEN_RPC_URL 與 UNWRITTEN_LEDGER_ADDRESS（要發布還需要 UNWRITTEN_PRIVATE_KEY）。",
      ja: ".env に UNWRITTEN_RPC_URL と UNWRITTEN_LEDGER_ADDRESS を設定してください（公開するには UNWRITTEN_PRIVATE_KEY も必要です）。",
    },
  },
  "ledger-read-only": {
    message: {
      en: "This machine has no signing key for the ledger.",
      "zh-TW": "這台電腦沒有鏈上帳本的簽署金鑰。",
      ja: "このマシンにはオンチェーン台帳の署名鍵がありません。",
    },
    hint: {
      en: "Set UNWRITTEN_PRIVATE_KEY in .env to publish; reading works without it.",
      "zh-TW": "要發布請在 .env 設定 UNWRITTEN_PRIVATE_KEY；只讀取的話不需要。",
      ja: "公開するには .env に UNWRITTEN_PRIVATE_KEY を設定してください。読み取りだけなら不要です。",
    },
  },
  "ledger-read-failed": {
    message: {
      en: "The ledger could not be read.",
      "zh-TW": "無法讀取鏈上帳本。",
      ja: "オンチェーン台帳を読み込めませんでした。",
    },
    hint: {
      en: "Check UNWRITTEN_RPC_URL and your network connection.",
      "zh-TW": "請檢查 UNWRITTEN_RPC_URL 與網路連線。",
      ja: "UNWRITTEN_RPC_URL とネットワーク接続を確認してください。",
    },
  },
  "ledger-write-failed": {
    message: {
      en: "The chain refused the transaction.",
      "zh-TW": "鏈拒絕了這筆交易。",
      ja: "チェーンがトランザクションを拒否しました。",
    },
    hint: {
      en: "Check the balance, the address, and whether this hash was already published.",
      "zh-TW": "請檢查餘額、位址，以及這個雜湊值是否已經發布過。",
      ja: "残高とアドレス、そしてこのハッシュがすでに公開済みでないかを確認してください。",
    },
  },
  "ledger-bad-hash": {
    message: {
      en: "That is not a valid content hash.",
      "zh-TW": "這不是有效的內容雜湊值。",
      ja: "正しいコンテンツハッシュではありません。",
    },
  },
  "ledger-uri-too-long": {
    message: {
      en: "That link is longer than the ledger accepts.",
      "zh-TW": "這個連結超過鏈上帳本能接受的長度。",
      ja: "そのリンクは台帳が受け付ける長さを超えています。",
    },
    hint: {
      en: "Use a shorter link (an ipfs:// or https:// address), or leave it empty.",
      "zh-TW": "請改用較短的連結（ipfs:// 或 https:// 位址），或留白。",
      ja: "短いリンク（ipfs:// や https:// のアドレス）を使うか、空欄にしてください。",
    },
  },
};
