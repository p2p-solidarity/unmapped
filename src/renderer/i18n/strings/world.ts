// A shared world (rev 6 phase 3, WP8): Settings → Advanced settings → Shared worlds (the device's world services), the
// door's Advanced group (where the world lives, invite links, who may come in, people — never a
// service address), the library's "Join a world" section, and the save badges. Phase 4 adds the
// door's co-owners (D5) and the light chain: the owners' opt-in and the chain's answer (D6).

import type { Phrase } from "./phrase";

export const WORLD = {
  // ── Settings → Advanced settings → Shared worlds ───────────────────────────────────────────────
  servicesHeading: { en: "Shared worlds", "zh-TW": "共享世界", ja: "共有ワールド" },
  servicesIntro: {
    en: "A world service keeps a shared world's history, so the friends you invite can visit it even while you are offline. List the services this device uses.",
    "zh-TW":
      "世界服務保存共享世界的歷史，讓你邀請的朋友在你離線時也能來訪。請列出這台裝置使用的服務。",
    ja: "ワールドサービスは共有ワールドの歴史を預かり、招いた友だちがあなたのオフライン中でも訪れられるようにします。この端末で使うサービスを並べてください。",
  },
  servicesNone: {
    en: "This device lists no world service yet: every world stays on this device until you add one.",
    "zh-TW": "這台裝置還沒有列出任何世界服務：在加入服務之前，每個世界都只留在這台裝置上。",
    ja: "この端末にはまだワールドサービスがありません。追加するまで、どのワールドもこの端末の中だけにあります。",
  },
  servicesOwn: {
    en: "This device uses the services below.",
    "zh-TW": "這台裝置使用下列服務。",
    ja: "この端末は下のサービスを使います。",
  },
  servicesField: {
    en: "World services (one per line: wss://…, or ws://127.0.0.1:<port> on this machine)",
    "zh-TW": "世界服務（每行一個：wss://…，或本機的 ws://127.0.0.1:<port>）",
    ja: "ワールドサービス（1 行に 1 つ：wss://…、またはこのマシン上の ws://127.0.0.1:<port>）",
  },
  servicesInvalid: {
    en: "Not a world service address: {entries}. Use wss://…; ws:// works only for this machine.",
    "zh-TW": "不是世界服務的位址：{entries}。請使用 wss://…；ws:// 只能用於本機。",
    ja: "ワールドサービスのアドレスではありません：{entries}。wss://… を使ってください。ws:// はこのマシン専用です。",
  },
  servicesTest: { en: "Test", "zh-TW": "測試", ja: "テスト" },
  servicesSave: { en: "Save", "zh-TW": "儲存", ja: "保存" },
  servicesClear: { en: "Clear the list", "zh-TW": "清空清單", ja: "リストを空にする" },
  servicesSaved: {
    en: "Saved. The door's “Make an invite link” uses the first service in this list.",
    "zh-TW": "已儲存。門上的「建立邀請連結」會使用清單中的第一個服務。",
    ja: "保存しました。扉の「招待リンクをつくる」は、このリストの最初のサービスを使います。",
  },
  servicesUntested: {
    en: "Not tested yet.",
    "zh-TW": "尚未測試。",
    ja: "まだテストしていません。",
  },
  servicesTesting: { en: "Testing…", "zh-TW": "測試中…", ja: "テスト中…" },
  servicesReachable: {
    en: "Reachable: {version}, physics {physics}, {worlds} {worlds|world|worlds} kept. Health {health} ms, greeting {greeting} ms.",
    "zh-TW":
      "連得上：{version}，物理 {physics}，保存 {worlds} 個世界。健康檢查 {health} 毫秒，問候 {greeting} 毫秒。",
    ja: "接続できます：{version}、物理 {physics}、{worlds} 個のワールドを保管。ヘルス {health} ms、あいさつ {greeting} ms。",
  },
  servicesKey: {
    en: "Service key {key}",
    "zh-TW": "服務金鑰 {key}",
    ja: "サービスの鍵 {key}",
  },
  servicesTestMode: {
    en: "This service runs in test mode (its clock can be moved forward).",
    "zh-TW": "這個服務以測試模式執行（它的時鐘可以往前調）。",
    ja: "このサービスはテストモードで動いています（時計を先へ進められます）。",
  },
  servicesApplyNote: {
    en: "A world already shared keeps the service it was shared on.",
    "zh-TW": "已經共享的世界會繼續使用當初共享時的服務。",
    ja: "すでに共有したワールドは、共有したときのサービスを使い続けます。",
  },

  // ── Badges (Worlds → My worlds, the door) ─────────────────────────────────────────────────
  badgeLocal: {
    en: "Only on this device",
    "zh-TW": "只在這台裝置上",
    ja: "この端末だけにあります",
  },
  badgeShared: {
    en: "Shared with friends",
    "zh-TW": "已和朋友共享",
    ja: "友だちと共有しています",
  },
  badgeJoined: {
    en: "Joined from {owner}",
    "zh-TW": "加入自 {owner}",
    ja: "{owner} のワールドに参加",
  },
  badgeNone: {
    en: "Play this world once, and then it can be shared with friends.",
    "zh-TW": "先玩一次這個世界，之後就能和朋友共享。",
    ja: "一度このワールドで遊ぶと、友だちと共有できるようになります。",
  },

  // ── The door: where the world lives (inside 進階; never a service address) ────────────────
  doorSection: { en: "Advanced", "zh-TW": "進階", ja: "詳細" },
  working: { en: "Working…", "zh-TW": "處理中…", ja: "処理中…" },
  doorReading: { en: "Reading…", "zh-TW": "正在讀取…", ja: "読み込んでいます…" },
  whereLocal: {
    en: "Only on this device — not shared with friends yet.",
    "zh-TW": "只在這台裝置上，還沒和朋友共享。",
    ja: "この端末だけにあります。まだ友だちと共有していません。",
  },
  whereShared: {
    en: "Shared with friends.",
    "zh-TW": "已經和朋友共享。",
    ja: "友だちと共有しています。",
  },
  whereJoined: {
    en: "{owner}'s world — you joined it.",
    "zh-TW": "這是 {owner} 的世界，你已經加入。",
    ja: "{owner} のワールドに参加しています。",
  },
  linkOffline: {
    en: "Offline: your changes wait here and go out when you are back online.",
    "zh-TW": "離線中：你的變更會先留在這裡，連上後就送出。",
    ja: "オフライン：変更はここで待ち、つながったら送られます。",
  },
  linkConnecting: { en: "Connecting…", "zh-TW": "連線中…", ja: "接続中…" },
  linkOnline: { en: "Online", "zh-TW": "已連線", ja: "オンライン" },
  linkDiverged: {
    en: "Syncing stopped: this copy and your friends' copy no longer match.",
    "zh-TW": "同步停住了：這裡的世界和朋友那邊的不一樣了。",
    ja: "同期を止めました：ここのワールドと友だちのものが食い違っています。",
  },
  linkRefused: {
    en: "This device was turned away.",
    "zh-TW": "這台裝置被拒絕了。",
    ja: "この端末は断られました。",
  },
  pendingCount: {
    en: "{n} {n|change|changes} not sent yet",
    "zh-TW": "{n} 項變更還沒送出",
    ja: "{n} 件の変更がまだ送られていません",
  },
  refusedCount: {
    en: "{n} of your {n|change was|changes were} not accepted",
    "zh-TW": "你有 {n} 項變更沒被接受",
    ja: "あなたの変更のうち {n} 件が受け入れられませんでした",
  },
  roleOwner: {
    en: "You own this world.",
    "zh-TW": "你是這個世界的主人。",
    ja: "あなたはこのワールドの持ち主です。",
  },
  roleMember: {
    en: "You are an invited friend.",
    "zh-TW": "你是受邀的朋友。",
    ja: "あなたは招かれた友だちです。",
  },
  roleVisitor: { en: "You are visiting.", "zh-TW": "你正在來訪。", ja: "あなたは訪問中です。" },
  roleRemoved: {
    en: "The owner removed you from this world.",
    "zh-TW": "主人已把你從這個世界移除。",
    ja: "持ち主があなたをこのワールドから外しました。",
  },

  // ── The door: making an invite link (owner; the first world service, never named) ──────────
  shareIntro: {
    en: "Making a link shares this world, so friends can visit even while you are offline.",
    "zh-TW": "建立連結後，這個世界就會和朋友共享，你不在線時朋友也能來。",
    ja: "リンクをつくるとこのワールドが共有され、あなたがオフラインでも友だちが来られます。",
  },
  sharing: {
    en: "Sharing this world…",
    "zh-TW": "正在共享這個世界…",
    ja: "このワールドを共有しています…",
  },

  // ── The door: who may come in (owner) ──────────────────────────────────────────────────────
  accessHeading: { en: "Who may come in", "zh-TW": "誰可以進來", ja: "だれが入れるか" },
  accessPrivate: { en: "Only me", "zh-TW": "只有我", ja: "自分だけ" },
  accessFriends: { en: "Friends", "zh-TW": "朋友", ja: "友だち" },
  accessPublic: { en: "Everyone", "zh-TW": "所有人", ja: "だれでも" },
  accessPrivateNote: {
    en: "Only you can come in and add to this world.",
    "zh-TW": "只有你能進來、在這個世界留下東西。",
    ja: "入って書き加えられるのはあなただけです。",
  },
  accessFriendsNote: {
    en: "You and the friends you invited can come in and add to it.",
    "zh-TW": "你和你邀請的朋友都能進來、留下東西。",
    ja: "あなたと招いた友だちが入って書き加えられます。",
  },
  accessPublicNote: {
    en: "Anyone who finds this world may visit and leave notes, signposts and gifts; invited friends keep what they could do.",
    "zh-TW": "任何人都能來訪並留下留言、路標和禮物；你邀請的朋友能做的事不變。",
    ja: "だれでも訪れて、メモ・道しるべ・贈り物を残せます。招いた友だちはこれまでどおりです。",
  },
  accessSet: {
    en: "The door is now: {policy}.",
    "zh-TW": "門現在是：{policy}。",
    ja: "扉はいま「{policy}」です。",
  },
  accessWaiting: {
    en: "(not sent yet)",
    "zh-TW": "（還沒送出）",
    ja: "（まだ送られていません）",
  },

  // ── The door: invite links (owner) ─────────────────────────────────────────────────────────
  invitesHeading: { en: "Invite links", "zh-TW": "邀請連結", ja: "招待リンク" },
  inviteUses: {
    en: "How many people (1–20)",
    "zh-TW": "幾個人可以用（1–20）",
    ja: "使える人数（1–20）",
  },
  inviteDays: {
    en: "Good for how many days (1–30)",
    "zh-TW": "有效幾天（1–30）",
    ja: "有効な日数（1–30）",
  },
  inviteCreate: { en: "Make an invite link", "zh-TW": "建立邀請連結", ja: "招待リンクをつくる" },
  inviteCreating: {
    en: "Making the link…",
    "zh-TW": "正在建立連結…",
    ja: "リンクをつくっています…",
  },
  inviteReady: {
    en: "Send this link to your friend. It is shown only now: copy it before you close the door.",
    "zh-TW": "把這個連結傳給朋友。它只會在現在出現：關上門之前先複製。",
    ja: "このリンクを友だちに送ってください。表示されるのは今だけです。扉を閉じる前にコピーしてください。",
  },
  inviteLink: { en: "Invite link", "zh-TW": "邀請連結", ja: "招待リンク" },
  inviteCopy: { en: "Copy the link", "zh-TW": "複製連結", ja: "リンクをコピー" },
  inviteCopied: {
    en: "Invite link copied.",
    "zh-TW": "已複製邀請連結。",
    ja: "招待リンクをコピーしました。",
  },
  inviteCopyFailed: {
    en: "Could not copy: {reason}. Select the link and copy it by hand.",
    "zh-TW": "無法複製：{reason}。請選取連結後手動複製。",
    ja: "コピーできませんでした：{reason}。リンクを選択して手でコピーしてください。",
  },
  invitesNone: {
    en: "No invite links made yet.",
    "zh-TW": "還沒有建立任何邀請連結。",
    ja: "招待リンクはまだありません。",
  },
  inviteRow: {
    en: "Used {used} of {uses} · until {exp}",
    "zh-TW": "已用 {used}／{uses} 次 · 到 {exp}",
    ja: "{uses} 回中 {used} 回使用 · {exp} まで",
  },
  inviteOpen: { en: "open", "zh-TW": "可用", ja: "有効" },
  inviteUsedUp: { en: "used up", "zh-TW": "已用完", ja: "使い切り" },
  inviteExpired: { en: "expired", "zh-TW": "已過期", ja: "期限切れ" },
  inviteRevoked: { en: "revoked", "zh-TW": "已撤回", ja: "取り消し済み" },
  inviteRevoke: { en: "Revoke", "zh-TW": "撤回", ja: "取り消す" },
  inviteRevokedDone: {
    en: "Link revoked: nobody can join with it any more.",
    "zh-TW": "已撤回連結：再也沒有人能用它加入。",
    ja: "リンクを取り消しました。もうだれもこれで参加できません。",
  },

  // ── The door: people ───────────────────────────────────────────────────────────────────────
  peopleHeading: { en: "People", "zh-TW": "一起玩的人", ja: "一緒に遊ぶ人" },
  personOwner: { en: "owner", "zh-TW": "主人", ja: "持ち主" },
  personMember: { en: "friend", "zh-TW": "朋友", ja: "友だち" },
  personRemoved: { en: "removed", "zh-TW": "已移除", ja: "外されました" },
  personWaiting: {
    en: "(not sent yet)",
    "zh-TW": "（還沒送出）",
    ja: "（まだ送られていません）",
  },
  personYou: { en: "(you)", "zh-TW": "（你）", ja: "（あなた）" },
  personUnnamed: { en: "unnamed", "zh-TW": "未命名", ja: "名前なし" },
  personRemove: { en: "Remove", "zh-TW": "移除", ja: "外す" },
  personRemoveAsk: {
    en: "Remove {name}? From now on they can't come in; what they left stays.",
    "zh-TW": "要移除 {name} 嗎？從現在起對方不能再進來；對方留下的東西會保留。",
    ja: "{name} を外しますか？これからは入れなくなります。残したものはそのままです。",
  },
  personRemoveConfirm: { en: "Remove them", "zh-TW": "確定移除", ja: "外す" },
  personRemovedDone: {
    en: "{name} was removed.",
    "zh-TW": "已移除 {name}。",
    ja: "{name} を外しました。",
  },
  peopleNoMembers: {
    en: "No friends have joined yet.",
    "zh-TW": "還沒有朋友加入。",
    ja: "まだ友だちは参加していません。",
  },

  // ── The door: co-owners (phase 4, D5) ──────────────────────────────────────────────────────
  personCoOwner: { en: "co-owner", "zh-TW": "共同主人", ja: "共同の持ち主" },
  personMakeOwner: { en: "Make co-owner", "zh-TW": "設為共同主人", ja: "共同の持ち主にする" },
  personMakeOwnerAsk: {
    en: "Make {name} a co-owner? Their device can then do everything yours can here: change who may come in, invite and remove people, add and remove owners, and move the world. Any owner can undo it.",
    "zh-TW":
      "要把 {name} 設為共同主人嗎？之後對方的裝置能在這裡做你能做的一切：改變誰可以進來、邀請與移除朋友、增減主人，以及把世界搬到別處。任何一位主人都能撤銷。",
    ja: "{name} を共同の持ち主にしますか？その端末は、ここであなたと同じことがすべてできるようになります：だれが入れるかを変える、人を招く・外す、持ち主を加える・外す、ワールドを移す。どの持ち主でも取り消せます。",
  },
  personMakeOwnerConfirm: {
    en: "Make them a co-owner",
    "zh-TW": "確定設為共同主人",
    ja: "共同の持ち主にする",
  },
  personMadeOwner: {
    en: "{name} is now a co-owner.",
    "zh-TW": "{name} 現在是共同主人了。",
    ja: "{name} は共同の持ち主になりました。",
  },
  personRemoveOwner: { en: "Remove as owner", "zh-TW": "取消主人身分", ja: "持ち主から外す" },
  personRemoveOwnerAsk: {
    en: "Stop {name} owning this world? What they left stays; if they joined as a friend, they stay one.",
    "zh-TW":
      "要取消 {name} 的主人身分嗎？對方留下的東西會保留；如果對方是以朋友身分加入的，仍然是朋友。",
    ja: "{name} をこのワールドの持ち主から外しますか？残したものはそのままです。友だちとして参加していたなら、友だちのままです。",
  },
  personRemoveOwnerConfirm: {
    en: "Remove them as owner",
    "zh-TW": "確定取消主人身分",
    ja: "持ち主から外す",
  },
  personRemovedOwnerDone: {
    en: "{name} no longer owns this world.",
    "zh-TW": "{name} 不再是這個世界的主人。",
    ja: "{name} はもうこのワールドの持ち主ではありません。",
  },
  ownersOnlyOne: {
    en: "Only one device owns this world. If it is lost, nobody can change who may come in or move the world. Make a friend's device, or another of yours, a co-owner.",
    "zh-TW":
      "只有一台裝置擁有這個世界。一旦它遺失，就沒有人能改變誰可以進來或搬移世界。請把朋友的裝置、或你的另一台裝置設為共同主人。",
    ja: "このワールドを持つ端末は 1 台だけです。それをなくすと、だれが入れるかを変えたりワールドを移したりできなくなります。友だちの端末か、あなたの別の端末を共同の持ち主にしてください。",
  },

  // ── The door: the light chain (phase 4, D6) ────────────────────────────────────────────────
  chainHeading: {
    en: "Recorded on a public chain",
    "zh-TW": "記錄在公開的區塊鏈上",
    ja: "公開チェーンへの記録",
  },
  chainRecordOff: { en: "Don't record", "zh-TW": "不記錄", ja: "記録しない" },
  chainRecordOn: { en: "Record it", "zh-TW": "記錄", ja: "記録する" },
  chainNote: {
    en: "When on, a fingerprint of this world is written to a public blockchain now and then — never what anyone wrote. Anyone can read it and it cannot be taken back. Nobody here signs anything or needs a wallet. Off unless an owner turns it on.",
    "zh-TW":
      "開啟後，會不時把這個世界的指紋寫到公開的區塊鏈上，絕不包含任何人寫的內容。任何人都讀得到，而且無法收回。這裡的人不必簽署任何東西，也不需要錢包。除非有主人開啟，否則保持關閉。",
    ja: "オンにすると、このワールドの指紋がときどき公開ブロックチェーンに書き込まれます。だれかが書いた中身は含みません。だれでも読めて、取り消せません。ここではだれも署名せず、ウォレットも要りません。持ち主がオンにしない限りオフです。",
  },
  chainSet: {
    en: "Recording is now: {state}.",
    "zh-TW": "記錄設定現在是：{state}。",
    ja: "記録はいま「{state}」です。",
  },
  chainOnMember: {
    en: "This world's owners have it recorded on a public chain (fingerprints only, never what anyone wrote).",
    "zh-TW": "這個世界的主人把它記錄在公開的區塊鏈上（只有指紋，絕不包含任何人寫的內容）。",
    ja: "このワールドの持ち主は、公開チェーンに記録しています（指紋だけで、だれかが書いた中身は含みません）。",
  },
  chainOffMember: {
    en: "This world's owners have not asked for it to be recorded on a chain.",
    "zh-TW": "這個世界的主人沒有把它記錄在區塊鏈上。",
    ja: "このワールドの持ち主は、チェーンへの記録を頼んでいません。",
  },
  provenanceChecking: {
    en: "Comparing this copy with the chain…",
    "zh-TW": "正在把這份世界和鏈上的紀錄比對…",
    ja: "この写しをチェーンの記録と照らし合わせています…",
  },
  provenanceMatches: {
    en: "The chain matches your copy.",
    "zh-TW": "鏈上的紀錄和你的一致。",
    ja: "チェーンの記録はあなたの写しと一致します。",
  },
  provenanceDiffers: {
    en: "The chain does not match your copy.",
    "zh-TW": "鏈上的紀錄和你的不一致。",
    ja: "チェーンの記録はあなたの写しと食い違います。",
  },
  provenanceNotSynced: {
    en: "The chain is ahead of your copy; yours has not caught up yet.",
    "zh-TW": "鏈上的紀錄比你的新；你的還沒同步到那裡。",
    ja: "チェーンの記録のほうが新しく、あなたの写しはまだ追いついていません。",
  },
  provenanceNotRecorded: {
    en: "Not recorded on the chain.",
    "zh-TW": "鏈上沒有這個世界的紀錄。",
    ja: "チェーンには記録されていません。",
  },
  provenanceUnverified: {
    en: "{n} {n|record|records} on the chain could not be checked and {n|was|were} ignored.",
    "zh-TW": "鏈上有 {n} 筆紀錄無法確認，已略過。",
    ja: "チェーン上の {n} 件の記録は確かめられなかったため、無視しました。",
  },
  provenanceOff: {
    en: "No chain is set up on this device, so nothing is compared. Everything else works as usual.",
    "zh-TW": "這台裝置沒有設定區塊鏈，所以不做比對。其他一切照常運作。",
    ja: "この端末にはチェーンが設定されていないので、照らし合わせはしません。ほかはすべていつもどおり動きます。",
  },
  provenanceCheck: { en: "Check again", "zh-TW": "重新檢查", ja: "もう一度確かめる" },

  // ── The door: redeeming an invite for a restored save (D7) ─────────────────────────────────
  redeemHeading: {
    en: "Join this world with an invite",
    "zh-TW": "用邀請加入這個世界",
    ja: "招待でこのワールドに参加する",
  },
  redeemIntro: {
    en: "This is someone else's world. Paste an invite link from its owner to join it.",
    "zh-TW": "這是別人的世界。貼上主人給你的邀請連結，就能加入。",
    ja: "これはほかの人のワールドです。持ち主の招待リンクを貼り付けると参加できます。",
  },
  redeem: { en: "Join", "zh-TW": "加入", ja: "参加する" },
  redeeming: { en: "Joining…", "zh-TW": "加入中…", ja: "参加しています…" },
  redeemed: {
    en: "You have joined this world.",
    "zh-TW": "你已經加入這個世界了。",
    ja: "このワールドに参加しました。",
  },

  // ── Worlds → Join a world ──────────────────────────────────────────────────────────────────
  sectionJoin: { en: "Join a world", "zh-TW": "加入世界", ja: "ワールドに参加" },
  joinIntro: {
    en: "Paste what your friend gave you, then press Join.",
    "zh-TW": "把朋友給你的貼在這裡，再按「加入」。",
    ja: "友だちからもらったものをここに貼って、「参加する」を押してください。",
  },
  joinField: {
    en: "Your friend's ENS name, join code or invite link",
    "zh-TW": "朋友的 ENS 名稱、加入碼或邀請連結",
    ja: "友だちの ENS 名、参加コード、または招待リンク",
  },
  joinLook: { en: "Look at the world", "zh-TW": "看看這個世界", ja: "ワールドを見る" },
  joinLooking: {
    en: "Reading the world…",
    "zh-TW": "正在讀取這個世界…",
    ja: "ワールドを読み込んでいます…",
  },
  joinOwner: {
    en: "Made by {owner}",
    "zh-TW": "由 {owner} 建立",
    ja: "{owner} がつくったワールド",
  },
  joinDoor: {
    en: "Who may come in: {policy}",
    "zh-TW": "誰可以進來：{policy}",
    ja: "入れる人：{policy}",
  },
  joinSize: {
    en: "{members} {members|person plays|people play} here",
    "zh-TW": "有 {members} 個人在這裡玩",
    ja: "{members} 人がここで遊んでいます",
  },
  joinInvite: {
    en: "This invite works {left} more {left|time|times}, until {exp}.",
    "zh-TW": "這份邀請還能用 {left} 次，到 {exp} 為止。",
    ja: "この招待はあと {left} 回、{exp} まで使えます。",
  },
  joinMember: {
    en: "You are already in this world.",
    "zh-TW": "你已經在這個世界裡了。",
    ja: "あなたはもうこのワールドにいます。",
  },
  joinRestored: {
    en: "Your world {name} is this world. Join to play it with your friends.",
    "zh-TW": "你的「{name}」就是這個世界。加入後就能和朋友一起玩。",
    ja: "あなたの「{name}」がこのワールドです。参加すると友だちと一緒に遊べます。",
  },
  joinName: {
    en: "Your name in this world",
    "zh-TW": "你在這個世界的名字",
    ja: "このワールドでのあなたの名前",
  },
  joinGo: { en: "Join and play", "zh-TW": "加入並開始玩", ja: "参加して遊ぶ" },
  joinOpen: { en: "Open {name}", "zh-TW": "開啟 {name}", ja: "{name} を開く" },
  joining: {
    en: "Joining: fetching the world…",
    "zh-TW": "加入中：正在取得這個世界…",
    ja: "参加中：ワールドを取り寄せています…",
  },
  joinOther: { en: "Start over", "zh-TW": "重新輸入", ja: "入力しなおす" },
  joined: { en: "Joined {name}.", "zh-TW": "已加入 {name}。", ja: "{name} に参加しました。" },
} as const satisfies Record<string, Phrase>;
