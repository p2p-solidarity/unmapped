// A shared world (rev 6 phase 3, WP8): Settings → Shared worlds (the device's world services), the
// door's sharing section (where the world lives, who may come in, invites, people), the library's
// "Join a world" section, and the save badges (local / shared on … / joined from …). Phase 4 adds
// the door's co-owners (D5) and the light chain: the owners' opt-in and the chain's answer (D6).

import type { Phrase } from "./phrase";

export const WORLD = {
  // ── Settings → Shared worlds ───────────────────────────────────────────────────────────────
  servicesHeading: { en: "Shared worlds", "zh-TW": "共享世界", ja: "共有ワールド" },
  servicesIntro: {
    en: "A world service keeps a shared world's history, so the friends you invite can visit it even while you are offline. List the services this device uses.",
    "zh-TW":
      "世界服務保存共享世界的歷史，讓你邀請的夥伴在你離線時也能來訪。請列出這台裝置使用的服務。",
    ja: "ワールドサービスは共有ワールドの歴史を預かり、招いた仲間があなたのオフライン中でも訪れられるようにします。この端末で使うサービスを並べてください。",
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
    en: "Saved. The door offers these services the next time you share a world.",
    "zh-TW": "已儲存。下次共享世界時，門會列出這些服務。",
    ja: "保存しました。次にワールドを共有するとき、扉がこれらのサービスを示します。",
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

  // ── Badges (Worlds → Saves, the door) ──────────────────────────────────────────────────────
  badgeLocal: {
    en: "Local: only this device keeps this world",
    "zh-TW": "本機：只有這台裝置保存這個世界",
    ja: "ローカル：このワールドはこの端末だけが持っています",
  },
  badgeShared: {
    en: "Shared on {service}",
    "zh-TW": "共享於 {service}",
    ja: "{service} で共有中",
  },
  badgeJoined: {
    en: "Joined from {owner} · {service}",
    "zh-TW": "加入自 {owner} · {service}",
    ja: "{owner} のワールドに参加 · {service}",
  },
  badgeNone: {
    en: "No world history yet: Play makes one when it opens a save with open land",
    "zh-TW": "還沒有世界歷史：遊玩有開放大地的存檔時就會建立",
    ja: "ワールドの歴史はまだありません：開かれた大地のあるセーブを遊ぶと作られます",
  },

  // ── The door: where the world lives ────────────────────────────────────────────────────────
  doorSection: { en: "Sharing", "zh-TW": "共享", ja: "共有" },
  working: { en: "Working…", "zh-TW": "處理中…", ja: "処理中…" },
  doorReading: {
    en: "Reading this world's door…",
    "zh-TW": "正在讀取這個世界的門…",
    ja: "このワールドの扉を読み込んでいます…",
  },
  linkOffline: {
    en: "Offline: your changes wait here and go out when the service answers.",
    "zh-TW": "離線：你的變更會在這裡等著，服務回應後就送出。",
    ja: "オフライン：変更はここで待ち、サービスが応答したら送られます。",
  },
  linkConnecting: { en: "Connecting…", "zh-TW": "連線中…", ja: "接続中…" },
  linkOnline: { en: "Online", "zh-TW": "已連線", ja: "オンライン" },
  linkDiverged: {
    en: "Sync stopped: the service's history is not this device's.",
    "zh-TW": "同步已停止：服務上的歷史和這台裝置的不一樣。",
    ja: "同期を止めました：サービスの歴史がこの端末のものと違います。",
  },
  linkRefused: {
    en: "The service refused this device.",
    "zh-TW": "服務拒絕了這台裝置。",
    ja: "サービスがこの端末を拒みました。",
  },
  pendingCount: {
    en: "{n} {n|change|changes} not yet shared",
    "zh-TW": "{n} 項變更尚未共享",
    ja: "{n} 件の変更がまだ共有されていません",
  },
  refusedCount: {
    en: "{n} of your {n|change was|changes were} refused",
    "zh-TW": "你有 {n} 項變更被拒絕",
    ja: "あなたの変更のうち {n} 件が拒否されました",
  },
  roleOwner: {
    en: "You own this world.",
    "zh-TW": "你是這個世界的主人。",
    ja: "あなたはこのワールドの持ち主です。",
  },
  roleMember: { en: "You are a member.", "zh-TW": "你是成員。", ja: "あなたはメンバーです。" },
  roleVisitor: { en: "You are visiting.", "zh-TW": "你正在來訪。", ja: "あなたは訪問中です。" },
  roleRemoved: {
    en: "The owner removed you from this world.",
    "zh-TW": "主人已把你從這個世界移除。",
    ja: "持ち主があなたをこのワールドから外しました。",
  },

  // ── The door: sharing a local world (owner) ────────────────────────────────────────────────
  shareHeading: { en: "Share this world", "zh-TW": "共享這個世界", ja: "このワールドを共有する" },
  shareIntro: {
    en: "Choose a world service. This world's history goes there, so the friends you invite can visit, even while you are offline.",
    "zh-TW": "選一個世界服務。這個世界的歷史會放到那裡，讓你邀請的夥伴即使在你離線時也能來訪。",
    ja: "ワールドサービスを選んでください。このワールドの歴史がそこへ移り、招いた仲間はあなたがオフラインでも訪れられます。",
  },
  shareCoOwnerTip: {
    en: "Once it is shared, make another device of yours a co-owner: a world only one device owns can no longer change its door or move to another service if that device is lost.",
    "zh-TW":
      "共享之後，請把你的另一台裝置設為共同主人：只有一台裝置擁有的世界，一旦那台裝置遺失，就再也無法改變門或搬到別的服務。",
    ja: "共有したら、あなたの別の端末を共同の持ち主にしてください。1 台の端末だけが持つワールドは、その端末をなくすと扉を変えることも別のサービスへ移すこともできなくなります。",
  },
  shareOn: { en: "Share on {service}", "zh-TW": "共享到 {service}", ja: "{service} で共有" },
  sharing: {
    en: "Sharing: sending this world's history to the service…",
    "zh-TW": "共享中：正在把這個世界的歷史送到服務…",
    ja: "共有中：このワールドの歴史をサービスへ送っています…",
  },

  // ── The door: who may come in (owner) ──────────────────────────────────────────────────────
  accessHeading: { en: "Who may come in", "zh-TW": "誰可以進來", ja: "だれが入れるか" },
  accessPrivate: { en: "Private", "zh-TW": "私人", ja: "非公開" },
  accessFriends: { en: "Friends", "zh-TW": "夥伴", ja: "仲間" },
  accessPublic: { en: "Public", "zh-TW": "公開", ja: "公開" },
  accessPrivateNote: {
    en: "Only you read and write this world.",
    "zh-TW": "只有你能讀寫這個世界。",
    ja: "このワールドを読み書きできるのはあなただけです。",
  },
  accessFriendsNote: {
    en: "You and the members you invited read and write.",
    "zh-TW": "你和你邀請的成員都能讀寫。",
    ja: "あなたと招いたメンバーが読み書きできます。",
  },
  accessPublicNote: {
    en: "Anyone with this world's id may visit and leave notes, signposts and gifts; members write as with Friends.",
    "zh-TW": "任何知道這個世界 id 的人都能來訪並留下留言、路標和禮物；成員的權限和「夥伴」相同。",
    ja: "このワールドの id を知っていればだれでも訪れて、書き置き・道しるべ・贈り物を残せます。メンバーは「仲間」と同じく書けます。",
  },
  accessSet: {
    en: "The door is now: {policy}.",
    "zh-TW": "門現在是：{policy}。",
    ja: "扉はいま「{policy}」です。",
  },
  accessWaiting: {
    en: "(not yet shared)",
    "zh-TW": "（尚未共享）",
    ja: "（まだ共有されていません）",
  },

  // ── The door: invites (owner) ──────────────────────────────────────────────────────────────
  invitesHeading: { en: "Invites", "zh-TW": "邀請", ja: "招待" },
  inviteUses: { en: "Uses (1–20)", "zh-TW": "可用次數（1–20）", ja: "使える回数（1–20）" },
  inviteDays: { en: "Days valid (1–30)", "zh-TW": "有效天數（1–30）", ja: "有効日数（1–30）" },
  inviteCreate: { en: "Create an invite", "zh-TW": "建立邀請", ja: "招待をつくる" },
  inviteCreating: {
    en: "Making the invite…",
    "zh-TW": "正在建立邀請…",
    ja: "招待をつくっています…",
  },
  inviteReady: {
    en: "Send this link to the friend you invite. It is shown only now: this device keeps no copy.",
    "zh-TW": "把這個連結傳給你邀請的夥伴。它只在此刻顯示：這台裝置不會留下副本。",
    ja: "このリンクを招く仲間に送ってください。表示されるのは今だけで、この端末には控えが残りません。",
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
    en: "No invites made on this device yet.",
    "zh-TW": "這台裝置還沒有建立任何邀請。",
    ja: "この端末でつくった招待はまだありません。",
  },
  inviteRow: {
    en: "{nonce}… · used {used} of {uses} · until {exp}",
    "zh-TW": "{nonce}… · 已用 {used}／{uses} 次 · 期限 {exp}",
    ja: "{nonce}… · {uses} 回中 {used} 回使用 · {exp} まで",
  },
  inviteOpen: { en: "open", "zh-TW": "可用", ja: "有効" },
  inviteUsedUp: { en: "used up", "zh-TW": "已用完", ja: "使い切り" },
  inviteExpired: { en: "expired", "zh-TW": "已過期", ja: "期限切れ" },
  inviteRevoked: { en: "revoked", "zh-TW": "已撤回", ja: "取り消し済み" },
  inviteRevoke: { en: "Revoke", "zh-TW": "撤回", ja: "取り消す" },
  inviteRevokedDone: {
    en: "Invite revoked: nobody can join with it any more.",
    "zh-TW": "已撤回邀請：再也沒有人能用它加入。",
    ja: "招待を取り消しました。もうだれもこれで参加できません。",
  },

  // ── The door: people ───────────────────────────────────────────────────────────────────────
  peopleHeading: { en: "People", "zh-TW": "成員", ja: "メンバー" },
  personOwner: { en: "owner", "zh-TW": "主人", ja: "持ち主" },
  personMember: {
    en: "member since entry {n}",
    "zh-TW": "自第 {n} 筆起為成員",
    ja: "{n} 番目の記録からメンバー",
  },
  personRemoved: {
    en: "removed at entry {n}",
    "zh-TW": "於第 {n} 筆被移除",
    ja: "{n} 番目の記録で外されました",
  },
  personWaiting: {
    en: "(not yet shared)",
    "zh-TW": "（尚未共享）",
    ja: "（まだ共有されていません）",
  },
  personYou: { en: "(you)", "zh-TW": "（你）", ja: "（あなた）" },
  personUnnamed: { en: "unnamed", "zh-TW": "未命名", ja: "名前なし" },
  personRemove: { en: "Remove", "zh-TW": "移除", ja: "外す" },
  personRemoveAsk: {
    en: "Remove {name}? From now on they can neither read nor write this world; what they wrote stays.",
    "zh-TW": "要移除 {name} 嗎？從現在起對方不能再讀寫這個世界；對方寫過的內容會留下。",
    ja: "{name} を外しますか？これからはこのワールドを読むことも書くこともできません。書いたものは残ります。",
  },
  personRemoveConfirm: { en: "Remove them", "zh-TW": "確定移除", ja: "外す" },
  personRemovedDone: {
    en: "{name} was removed.",
    "zh-TW": "已移除 {name}。",
    ja: "{name} を外しました。",
  },
  peopleNoMembers: {
    en: "Nobody has joined yet.",
    "zh-TW": "還沒有人加入。",
    ja: "まだだれも参加していません。",
  },

  // ── The door: co-owners (phase 4, D5) ──────────────────────────────────────────────────────
  personCoOwner: {
    en: "co-owner since entry {n}",
    "zh-TW": "自第 {n} 筆起為共同主人",
    ja: "{n} 番目の記録から共同の持ち主",
  },
  personMakeOwner: { en: "Make co-owner", "zh-TW": "設為共同主人", ja: "共同の持ち主にする" },
  personMakeOwnerAsk: {
    en: "Make {name} a co-owner? Their device can then do everything yours can here: change the door, invite and remove people, add and remove owners, and move the world to another service. Any owner can undo it.",
    "zh-TW":
      "要把 {name} 設為共同主人嗎？之後對方的裝置能在這裡做你能做的一切：改變門、邀請與移除成員、增減主人，以及把世界搬到別的服務。任何一位主人都能撤銷。",
    ja: "{name} を共同の持ち主にしますか？その端末は、ここであなたと同じことがすべてできるようになります：扉を変える、人を招く・外す、持ち主を加える・外す、ワールドを別のサービスへ移す。どの持ち主でも取り消せます。",
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
    en: "Stop {name} owning this world? What they wrote stays; if they joined as a member, they stay a member.",
    "zh-TW":
      "要取消 {name} 的主人身分嗎？對方寫過的內容會留下；如果對方是以成員身分加入的，仍會是成員。",
    ja: "{name} をこのワールドの持ち主から外しますか？書いたものは残ります。メンバーとして参加していたなら、メンバーのままです。",
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
    en: "Only one device owns this world. If it is lost, nobody can change the door or move the world to another service. Make a member's device, or another device of yours, a co-owner.",
    "zh-TW":
      "只有一台裝置擁有這個世界。一旦它遺失，就沒有人能改變門或把世界搬到別的服務。請把某位成員的裝置、或你的另一台裝置設為共同主人。",
    ja: "このワールドを持つ端末は 1 台だけです。それをなくすと、だれも扉を変えたりワールドを別のサービスへ移したりできません。メンバーの端末か、あなたの別の端末を共同の持ち主にしてください。",
  },

  // ── The door: the light chain (phase 4, D6) ────────────────────────────────────────────────
  chainHeading: {
    en: "Recorded on a public chain",
    "zh-TW": "記錄在公開的區塊鏈上",
    ja: "公開チェーンへの記録",
  },
  chainRecordOff: { en: "Don't record", "zh-TW": "不記錄", ja: "記録しない" },
  chainRecordOn: { en: "Record beats", "zh-TW": "記錄節拍", ja: "拍を記録する" },
  chainNote: {
    en: "When on, this world's service writes a fingerprint of each beat to a public blockchain: the world's id, the entry number and hashes, never what anyone wrote. It is public metadata: anyone can read it, and it cannot be taken back. The service writes it and pays for it; nobody here signs anything or needs a wallet. Off unless an owner turns it on.",
    "zh-TW":
      "開啟後，這個世界的服務會把每個節拍的指紋寫到公開的區塊鏈上：世界的 id、紀錄編號與雜湊值，絕不包含任何人寫的內容。這是公開的中繼資料：任何人都讀得到，而且無法收回。由服務寫入並支付費用；這裡的人不必簽署任何東西，也不需要錢包。除非有主人開啟，否則保持關閉。",
    ja: "オンにすると、このワールドのサービスが拍ごとの指紋を公開ブロックチェーンに書き込みます：ワールドの id、記録の番号とハッシュだけで、だれかが書いた中身は含みません。これは公開のメタデータで、だれでも読めて、取り消せません。書き込みと費用はサービスが受け持ち、ここではだれも署名せず、ウォレットも要りません。持ち主がオンにしない限りオフです。",
  },
  chainSet: {
    en: "Recording is now: {state}.",
    "zh-TW": "記錄設定現在是：{state}。",
    ja: "記録はいま「{state}」です。",
  },
  chainOnMember: {
    en: "This world's owners asked its service to record each beat's fingerprint on a public chain (hashes only, never what anyone wrote).",
    "zh-TW":
      "這個世界的主人請它的服務把每個節拍的指紋記錄在公開的區塊鏈上（只有雜湊值，絕不包含任何人寫的內容）。",
    ja: "このワールドの持ち主は、拍ごとの指紋を公開チェーンに記録するようサービスに頼んでいます（ハッシュだけで、だれかが書いた中身は含みません）。",
  },
  chainOffMember: {
    en: "This world's owners have not asked for its beats to be recorded on a chain.",
    "zh-TW": "這個世界的主人沒有要求把節拍記錄在區塊鏈上。",
    ja: "このワールドの持ち主は、拍をチェーンに記録するよう頼んでいません。",
  },
  provenanceChecking: {
    en: "Comparing this copy with the chain…",
    "zh-TW": "正在把這份副本和鏈上的紀錄比對…",
    ja: "この写しをチェーンの記録と照らし合わせています…",
  },
  provenanceMatches: {
    en: "The chain matches your copy at entry {n}.",
    "zh-TW": "鏈上的紀錄和你的副本在第 {n} 筆一致。",
    ja: "チェーンの記録は、{n} 番目の記録であなたの写しと一致します。",
  },
  provenanceDiffers: {
    en: "The chain differs from your copy at entry {n}.",
    "zh-TW": "鏈上的紀錄和你的副本在第 {n} 筆不一致。",
    ja: "チェーンの記録は、{n} 番目の記録であなたの写しと食い違います。",
  },
  provenanceNotSynced: {
    en: "Recorded from entry {n} on; this copy has not synced that far yet.",
    "zh-TW": "鏈上從第 {n} 筆起有紀錄；這份副本還沒同步到那裡。",
    ja: "{n} 番目の記録から記録されていますが、この写しはまだそこまで同期していません。",
  },
  provenanceNotRecorded: {
    en: "Not recorded on the chain.",
    "zh-TW": "鏈上沒有這個世界的紀錄。",
    ja: "チェーンには記録されていません。",
  },
  provenanceUnverified: {
    en: "{n} {n|stream|streams} on the chain did not verify and {n|was|were} ignored.",
    "zh-TW": "鏈上有 {n} 條紀錄串無法驗證，已略過。",
    ja: "チェーン上の {n} 本の記録列は検証できなかったため、無視しました。",
  },
  provenanceOff: {
    en: "No chain is set up on this device, so nothing is compared. Everything else works as usual.",
    "zh-TW": "這台裝置沒有設定區塊鏈，所以不做比對。其他一切照常運作。",
    ja: "この端末にはチェーンが設定されていないので、照らし合わせはしません。ほかはすべていつもどおり動きます。",
  },
  provenanceCheck: { en: "Check again", "zh-TW": "重新檢查", ja: "もう一度確かめる" },

  // ── The door: redeeming an invite for a restored save (D7) ─────────────────────────────────
  redeemHeading: {
    en: "Redeem an invite for this save",
    "zh-TW": "為這個存檔兌換邀請",
    ja: "このセーブで招待を使う",
  },
  redeemIntro: {
    en: "This save belongs to someone else's shared world. Paste an invite from its owner to make this device a member.",
    "zh-TW": "這個存檔屬於別人的共享世界。貼上主人給你的邀請，讓這台裝置成為成員。",
    ja: "このセーブはほかの人の共有ワールドのものです。持ち主からの招待を貼り付けると、この端末がメンバーになります。",
  },
  redeem: { en: "Redeem", "zh-TW": "兌換", ja: "使う" },
  redeeming: { en: "Redeeming…", "zh-TW": "兌換中…", ja: "処理中…" },
  redeemed: {
    en: "This device is now a member of this world.",
    "zh-TW": "這台裝置現在是這個世界的成員了。",
    ja: "この端末はこのワールドのメンバーになりました。",
  },

  // ── Worlds → Join a world ──────────────────────────────────────────────────────────────────
  sectionJoin: { en: "Join a world", "zh-TW": "加入世界", ja: "ワールドに参加" },
  joinIntro: {
    en: "Paste an invite link a friend sent you. You see the world before you join it.",
    "zh-TW": "貼上夥伴傳給你的邀請連結。加入前會先讓你看看這個世界。",
    ja: "仲間から届いた招待リンクを貼り付けてください。参加する前にワールドを確かめられます。",
  },
  joinLook: { en: "Look at the world", "zh-TW": "看看這個世界", ja: "ワールドを見る" },
  joinLooking: {
    en: "Reading the world from its service…",
    "zh-TW": "正在從服務讀取這個世界…",
    ja: "サービスからワールドを読み込んでいます…",
  },
  joinOwner: {
    en: "Made by {owner}",
    "zh-TW": "由 {owner} 建立",
    ja: "{owner} がつくったワールド",
  },
  joinService: { en: "Kept on {service}", "zh-TW": "保存在 {service}", ja: "{service} に保管" },
  joinDoor: { en: "Door: {policy}", "zh-TW": "門：{policy}", ja: "扉：{policy}" },
  joinSize: {
    en: "{members} {members|member|members} · {head} {head|entry|entries} in its history",
    "zh-TW": "{members} 位成員 · 歷史中有 {head} 筆記錄",
    ja: "メンバー {members} 人 · 歴史の記録 {head} 件",
  },
  joinInvite: {
    en: "This invite: {left} of {uses} {uses|use|uses} left, until {exp}",
    "zh-TW": "這份邀請：{uses} 次中還剩 {left} 次，期限 {exp}",
    ja: "この招待：{uses} 回中あと {left} 回、{exp} まで",
  },
  joinMember: {
    en: "This device already belongs to this world.",
    "zh-TW": "這台裝置已經是這個世界的成員。",
    ja: "この端末はすでにこのワールドのメンバーです。",
  },
  joinRestored: {
    en: "This device has a save of this world: {name}. Joining makes this device a member of that save.",
    "zh-TW": "這台裝置有這個世界的存檔：{name}。加入後，這台裝置會成為那個存檔的成員。",
    ja: "この端末にはこのワールドのセーブがあります：{name}。参加すると、この端末がそのセーブのメンバーになります。",
  },
  joinName: {
    en: "Your name in this world",
    "zh-TW": "你在這個世界的名字",
    ja: "このワールドでのあなたの名前",
  },
  joinGo: { en: "Join and play", "zh-TW": "加入並開始遊玩", ja: "参加して遊ぶ" },
  joinOpen: { en: "Open {name}", "zh-TW": "開啟 {name}", ja: "{name} を開く" },
  joining: {
    en: "Joining: fetching the world, its history and its cartridge…",
    "zh-TW": "加入中：正在取得世界、它的歷史與卡匣…",
    ja: "参加中：ワールドとその歴史、カートリッジを取り寄せています…",
  },
  joinOther: { en: "Paste another link", "zh-TW": "貼上其他連結", ja: "別のリンクを貼る" },
  joined: { en: "Joined {name}.", "zh-TW": "已加入 {name}。", ja: "{name} に参加しました。" },
} as const satisfies Record<string, Phrase>;
