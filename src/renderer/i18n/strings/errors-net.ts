// Errors about playing with friends (inviting, joining, signaling, the older rooms and their
// runtime handshake with the host) and the optional on-chain ledger.

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
      "zh-TW": "這不是加入碼。",
      ja: "それは参加コードではありません。",
    },
    hint: {
      en: "A join code is 6 letters and digits; ask your friend for theirs.",
      "zh-TW": "加入碼由 6 個英文字母與數字組成，請向朋友要他們的加入碼。",
      ja: "参加コードは英字と数字の 6 文字です。友だちに聞いてください。",
    },
  },
  "room-failed": {
    message: {
      en: "The connection to your friends could not be opened.",
      "zh-TW": "無法建立和朋友的連線。",
      ja: "友だちとの接続を開けませんでした。",
    },
    hint: NETWORK,
  },
  "room-no-signaling": {
    message: {
      en: "No signaling server is set up.",
      "zh-TW": "沒有設定信令伺服器。",
      ja: "シグナリングサーバーが設定されていません。",
    },
    hint: {
      en: "On the title screen open Settings → Advanced settings → Signaling servers and reset them.",
      "zh-TW": "請在標題畫面開啟「設定 → 進階設定 → 信令伺服器」，把它們重設。",
      ja: "タイトル画面で「設定 → 詳細設定 → シグナリングサーバー」を開き、リセットしてください。",
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
  "continent-peer-unreachable": {
    message: {
      en: "Your friend was found, but the connection could not open.",
      "zh-TW": "找到朋友了，但連不上。",
      ja: "友だちは見つかりましたが、つながりませんでした。",
    },
    hint: {
      en: "A VPN or firewall may be blocking it. Try turning the VPN off or another network; it keeps trying and connects by itself.",
      "zh-TW": "可能被 VPN 或防火牆擋住了。試著關掉 VPN 或換個網路；它會一直重試，一通就自動連上。",
      ja: "VPN やファイアウォールが妨げているかもしれません。VPN を切るか別のネットワークを試してください。自動で再試行し、つながりしだい接続します。",
    },
  },
  "continent-signaling-unreachable": {
    message: {
      en: "Friends cannot find this world: no connection server answered.",
      "zh-TW": "朋友找不到這個世界：沒有任何連線伺服器回應。",
      ja: "友だちがこのワールドを見つけられません。どの接続サーバーも応答しませんでした。",
    },
    hint: {
      en: "Check the internet connection. If it keeps failing, open Settings → Advanced settings → Signaling servers on the title screen and test them. It connects by itself as soon as a server answers.",
      "zh-TW":
        "請檢查網路。若一直失敗，請在標題畫面開啟「設定 → 進階設定 → 信令伺服器」測試看看。伺服器一回應就會自動連上。",
      ja: "インターネット接続を確認してください。失敗が続くときは、タイトル画面で「設定 → 詳細設定 → シグナリングサーバー」を開いてテストしてください。サーバーが応答すれば自動でつながります。",
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
      en: "That friend's game is a different version.",
      "zh-TW": "那位朋友的遊戲版本不同。",
      ja: "その友だちのゲームは別の版です。",
    },
    hint: {
      en: "Both players need the same build of UNMAPPED.",
      "zh-TW": "兩位玩家需要使用同一版的《無界之地》。",
      ja: "両方のプレイヤーが同じ版の UNMAPPED を使う必要があります。",
    },
  },
  "continent-same-world": {
    message: {
      en: "This same world is already playing with these friends from another window or computer.",
      "zh-TW": "同一個世界已經從另一個視窗或另一台電腦和這些朋友一起玩了。",
      ja: "同じワールドが、別のウィンドウか別の端末ですでにこの友だちと遊んでいます。",
    },
    hint: {
      en: "Leave there first.",
      "zh-TW": "請先在那邊離開。",
      ja: "先にそちらで離れてください。",
    },
  },
  "continent-no-land": {
    message: {
      en: "Only a world with open land can play with friends.",
      "zh-TW": "只有擁有開放大地的世界才能和朋友一起玩。",
      ja: "友だちと遊べるのは、開かれた大地のあるワールドだけです。",
    },
    hint: {
      en: "Open one of your worlds and step out onto its land first.",
      "zh-TW": "請先開啟你的一個世界，走到它的大地上。",
      ja: "まずワールドを開いて、その大地に出てください。",
    },
  },
  "continent-in-room": {
    message: {
      en: "This world is already in an older kind of shared game.",
      "zh-TW": "這個世界已經在舊式的共享遊戲裡。",
      ja: "このワールドはすでに古い形式の共有ゲームに入っています。",
    },
    hint: {
      en: "Go back to the title screen, open this world again, then try again.",
      "zh-TW": "請回到標題畫面，重新開啟這個世界，再試一次。",
      ja: "タイトル画面に戻り、このワールドを開き直してから、もう一度試してください。",
    },
  },
  "continent-world-attached": {
    message: {
      en: "This world is already shared with friends online, so it cannot use a join code too.",
      "zh-TW": "這個世界已經在網路上和朋友共享，不能再用加入碼。",
      ja: "このワールドはもうオンラインで友だちと共有しているため、参加コードは使えません。",
    },
    hint: {
      en: "Invite friends with an invite link instead: open the door at home, then Advanced.",
      "zh-TW": "請改用邀請連結邀請朋友：打開家門，再打開「進階」。",
      ja: "代わりに招待リンクで友だちを招待してください。家の扉を開き、「詳細」を開きます。",
    },
  },
  "continent-name-not-found": {
    message: {
      en: "That is not the name of any world.",
      "zh-TW": "這個名稱不屬於任何世界。",
      ja: "その名前のワールドはありません。",
    },
    hint: {
      en: "Check the spelling with your friend, or ask them for their join code.",
      "zh-TW": "請和朋友核對拼字，或直接向朋友要加入碼。",
      ja: "友だちとつづりを確かめるか、参加コードを聞いてください。",
    },
  },
  "continent-name-not-save": {
    message: {
      en: "That name is a world anyone can start, not your friend's own world, so it has no join code.",
      "zh-TW": "這個名稱是任何人都能開始的世界，不是朋友自己的世界，所以沒有加入碼。",
      ja: "その名前は誰でも始められるワールドのもので、友だち自身のワールドではないため、参加コードがありません。",
    },
    hint: {
      en: "Ask your friend for the name or the join code shown under Invite friends.",
      "zh-TW": "請向朋友要「邀請朋友」下面顯示的名稱或加入碼。",
      ja: "友だちに「友だちを招待」の下に表示される名前か参加コードを聞いてください。",
    },
  },
  "continent-name-no-door": {
    message: {
      en: "That name carries no join code yet.",
      "zh-TW": "這個名稱還沒有記上加入碼。",
      ja: "その名前にはまだ参加コードが載っていません。",
    },
    hint: {
      en: "Its owner records it again from Worlds → My worlds, which adds the join code; or ask them for the join code.",
      "zh-TW":
        "請名稱的主人到「世界 → 我的世界」再記錄一次，就會加上加入碼；也可以直接向對方要加入碼。",
      ja: "名前の持ち主が「ワールド → マイワールド」で記録し直すと参加コードが加わります。参加コードを直接聞くこともできます。",
    },
  },
  "world-not-migrated": {
    message: {
      en: "This save has no world history yet.",
      "zh-TW": "這個存檔還沒有世界歷史。",
      ja: "このセーブにはまだ世界の歴史がありません。",
    },
    hint: {
      en: "Walk its land once in Play, then try again.",
      "zh-TW": "先在遊戲中走一趟它的大地，再試一次。",
      ja: "一度プレイでその大地を歩いてから、もう一度試してください。",
    },
  },
  "note-invalid": {
    message: {
      en: "That note cannot be kept: it has no words or no name.",
      "zh-TW": "這則留言無法收下：它沒有內容或沒有署名。",
      ja: "このメモは残せません。本文か名前がありません。",
    },
  },
  "room-open-land": {
    message: {
      en: "Open land is shared by inviting friends, not through a room.",
      "zh-TW": "開放大地要用「邀請朋友」來共享，不經由房間。",
      ja: "開けた大地は、ルームではなく「友だちを招待」で共有します。",
    },
    hint: {
      en: "Play the world, open the Door at home and choose “Invite friends”.",
      "zh-TW": "進入這個世界，打開家裡的門，選擇「邀請朋友」。",
      ja: "ワールドで遊び、家の扉を開いて「友だちを招待」を選んでください。",
    },
  },
  "session-v2-required": {
    message: {
      en: "Playing together needs a world in the v2 format.",
      "zh-TW": "一起玩需要 v2 格式的世界。",
      ja: "一緒に遊ぶには v2 形式のワールドが必要です。",
    },
    hint: {
      en: "Open a world in the v2 format, or move this world to it and publish it first.",
      "zh-TW": "請開啟 v2 格式的世界，或先把這個世界轉換成 v2 並發布。",
      ja: "v2 形式のワールドを開くか、先にこのワールドを移行して公開してください。",
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
