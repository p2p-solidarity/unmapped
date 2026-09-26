// Errors about shared worlds (rev 6 phase 3, WP8): world services, attaching, the door, invites and
// joining; phase 4's co-owners (D5) and the light chain's answer (D6). English words stay at their
// source (main, the service); these are what the screen shows.

import type { ErrorText } from "./errors";

const NEW_LINK = {
  en: "Ask the world's owner for a new link.",
  "zh-TW": "請向這個世界的主人要一個新的連結。",
  ja: "ワールドの持ち主に新しいリンクをもらってください。",
};

const CHECK_SERVICE = {
  en: "Check the address and that the service runs, then try again.",
  "zh-TW": "請確認位址正確、服務正在執行，再試一次。",
  ja: "アドレスとサービスが動いていることを確かめて、もう一度試してください。",
};

const OWNER_DEVICE = {
  en: "Do it from the device that made the world, or a co-owner's.",
  "zh-TW": "請在建立這個世界的裝置、或共同主人的裝置上操作。",
  ja: "ワールドをつくった端末か、共同の持ち主の端末で行ってください。",
};

const PROVENANCE_ENV = {
  en: "Check UNMAPPED_PROVENANCE_RPC_URL and UNMAPPED_PROVENANCE_ADDRESS in .env.",
  "zh-TW": "請檢查 .env 裡的 UNMAPPED_PROVENANCE_RPC_URL 與 UNMAPPED_PROVENANCE_ADDRESS。",
  ja: ".env の UNMAPPED_PROVENANCE_RPC_URL と UNMAPPED_PROVENANCE_ADDRESS を確かめてください。",
};

export const WORLD_ERRORS: Record<string, ErrorText> = {
  // ── World services ─────────────────────────────────────────────────────────────────────────
  "world-service-url": {
    message: {
      en: "That is not a world service address.",
      "zh-TW": "這不是世界服務的位址。",
      ja: "それはワールドサービスのアドレスではありません。",
    },
    hint: {
      en: "Use wss://…, or ws://127.0.0.1:<port> for a service on this machine.",
      "zh-TW": "請使用 wss://…，本機的服務則用 ws://127.0.0.1:<port>。",
      ja: "wss://… を使ってください。このマシン上のサービスなら ws://127.0.0.1:<port> です。",
    },
  },
  "service-unreachable": {
    message: {
      en: "The world service cannot be reached.",
      "zh-TW": "連不上世界服務。",
      ja: "ワールドサービスに接続できません。",
    },
    hint: CHECK_SERVICE,
  },
  "service-timeout": {
    message: {
      en: "The world service did not answer in time.",
      "zh-TW": "世界服務沒有及時回應。",
      ja: "ワールドサービスが時間内に応答しませんでした。",
    },
    hint: CHECK_SERVICE,
  },
  "world-service-timeout": {
    message: {
      en: "The world service did not answer in time.",
      "zh-TW": "世界服務沒有及時回應。",
      ja: "ワールドサービスが時間内に応答しませんでした。",
    },
    hint: {
      en: "Check that the service runs and this network reaches it.",
      "zh-TW": "請確認服務正在執行，且這個網路連得到它。",
      ja: "サービスが動いていて、このネットワークから届くか確かめてください。",
    },
  },
  "world-service-not-service": {
    message: {
      en: "Something answers at that address, but it is not a world service.",
      "zh-TW": "這個位址有回應，但它不是世界服務。",
      ja: "そのアドレスには応答がありますが、ワールドサービスではありません。",
    },
    hint: {
      en: "Check the address: a world service answers /v1/health and greets on /v1/ws.",
      "zh-TW": "請檢查位址：世界服務會回應 /v1/health，並在 /v1/ws 打招呼。",
      ja: "アドレスを確かめてください。ワールドサービスは /v1/health に応え、/v1/ws であいさつします。",
    },
  },
  "world-service-key-mismatch": {
    message: {
      en: "The address answers with two different service keys.",
      "zh-TW": "這個位址回應了兩把不同的服務金鑰。",
      ja: "そのアドレスは 2 つの異なるサービスの鍵で応答します。",
    },
    hint: {
      en: "Two services may share this address; check the proxy in front of it.",
      "zh-TW": "可能有兩個服務共用這個位址；請檢查它前面的代理伺服器。",
      ja: "2 つのサービスが同じアドレスを使っているかもしれません。前段のプロキシを確かめてください。",
    },
  },
  "world-service-physics": {
    message: {
      en: "This service cannot reproduce this build's physics.",
      "zh-TW": "這個服務無法重現這個版本的物理。",
      ja: "このサービスはこのビルドの物理を再現できません。",
    },
    hint: {
      en: "Update the service, or use another one.",
      "zh-TW": "請更新服務，或改用別的服務。",
      ja: "サービスを更新するか、別のサービスを使ってください。",
    },
  },
  "protocol-unsupported": {
    message: {
      en: "This service speaks another version of the world protocol.",
      "zh-TW": "這個服務使用另一個版本的世界協定。",
      ja: "このサービスは別の版のワールドプロトコルを話します。",
    },
    hint: {
      en: "Use a service and a build of UNMAPPED that match.",
      "zh-TW": "請使用版本相符的服務與《無界之地》。",
      ja: "バージョンの合うサービスと UNMAPPED を使ってください。",
    },
  },
  "world-services-none": {
    message: {
      en: "This device lists no world service.",
      "zh-TW": "這台裝置沒有列出任何世界服務。",
      ja: "この端末にはワールドサービスがありません。",
    },
    hint: {
      en: "Add one in Settings → Advanced settings → Shared worlds, then open the door again.",
      "zh-TW": "請到「設定 → 進階設定 → 共享世界」加入一個，再重新開門。",
      ja: "「設定 → 詳細設定 → 共有ワールド」で追加してから、扉を開き直してください。",
    },
  },
  "world-services-not-saved": {
    message: {
      en: "This device's world services could not be saved.",
      "zh-TW": "無法儲存這台裝置的世界服務。",
      ja: "この端末のワールドサービスを保存できませんでした。",
    },
    hint: {
      en: "Storage may be disabled for this app; the services in use did not change.",
      "zh-TW": "這個應用程式的儲存空間可能被停用了；使用中的服務沒有改變。",
      ja: "このアプリのストレージが無効かもしれません。使用中のサービスは変わっていません。",
    },
  },

  // ── Attaching and syncing ──────────────────────────────────────────────────────────────────
  "attach-already": {
    message: {
      en: "This world is already shared.",
      "zh-TW": "這個世界已經分享出去了。",
      ja: "このワールドはすでに共有されています。",
    },
  },
  "attach-url-invalid": {
    message: {
      en: "That is not a world service address.",
      "zh-TW": "這不是世界服務的位址。",
      ja: "それはワールドサービスのアドレスではありません。",
    },
  },
  "history-diverged": {
    message: {
      en: "This world's sync stopped: the service's history is not this device's.",
      "zh-TW": "這個世界的同步已停止：服務上的歷史和這台裝置的不一樣。",
      ja: "このワールドの同期を止めました：サービスの歴史がこの端末のものと違います。",
    },
  },
  "world-device-not-member": {
    message: {
      en: "This world is shared from another device, and this device is not one of its members.",
      "zh-TW": "這個世界由另一台裝置共享，而這台裝置不是它的成員。",
      ja: "このワールドは別の端末から共有されていて、この端末はそのメンバーではありません。",
    },
    hint: {
      en: "Open it on the device that made it, or ask its owner for an invite link and paste it in Join a world.",
      "zh-TW": "請在建立它的裝置上開啟，或向主人要一個邀請連結，貼到「加入世界」。",
      ja: "つくった端末で開くか、持ち主に招待リンクをもらって「ワールドに参加」に貼ってください。",
    },
  },

  // ── The door ───────────────────────────────────────────────────────────────────────────────
  "access-owner-only": {
    message: {
      en: "Only the world's owners change its door.",
      "zh-TW": "只有這個世界的主人們能改變它的門。",
      ja: "ワールドの扉を変えられるのは持ち主たちだけです。",
    },
    hint: OWNER_DEVICE,
  },
  "member-remove-owner": {
    message: {
      en: "An owner is not removed as a member.",
      "zh-TW": "主人不能以成員身分被移除。",
      ja: "持ち主はメンバーとして外すことはできません。",
    },
    hint: {
      en: "Remove them as an owner first.",
      "zh-TW": "請先取消對方的主人身分。",
      ja: "先に持ち主から外してください。",
    },
  },
  "access-private": {
    message: {
      en: "This world is private.",
      "zh-TW": "這個世界是私人的。",
      ja: "このワールドは非公開です。",
    },
    hint: {
      en: "Ask its owner to open the door.",
      "zh-TW": "請主人把門打開。",
      ja: "持ち主に扉を開けてもらってください。",
    },
  },
  "access-members-only": {
    message: {
      en: "Only members come into this world.",
      "zh-TW": "只有成員能進入這個世界。",
      ja: "このワールドに入れるのはメンバーだけです。",
    },
    hint: {
      en: "Ask the owner for an invite.",
      "zh-TW": "請向主人要一份邀請。",
      ja: "持ち主に招待をもらってください。",
    },
  },
  "access-removed": {
    message: {
      en: "The owner removed this device from the world.",
      "zh-TW": "主人已把這台裝置從這個世界移除。",
      ja: "持ち主がこの端末をワールドから外しました。",
    },
  },
  "member-already": {
    message: {
      en: "This device already belongs to this world.",
      "zh-TW": "這台裝置已經是這個世界的成員。",
      ja: "この端末はすでにこのワールドのメンバーです。",
    },
  },
  "invite-not-attached": {
    message: {
      en: "This world is not shared yet.",
      "zh-TW": "這個世界還沒有共享。",
      ja: "このワールドはまだ共有されていません。",
    },
    hint: {
      en: "Share it first: make an invite link at the door.",
      "zh-TW": "請先分享它：在門口建立邀請連結。",
      ja: "先に共有してください。扉で招待リンクをつくれます。",
    },
  },
  "world-invite-not-recorded": {
    message: {
      en: "The invite could not be written down on this device.",
      "zh-TW": "無法在這台裝置上記下這份邀請。",
      ja: "招待をこの端末に書き留められませんでした。",
    },
    hint: {
      en: "Nothing was shared; check the disk and make the invite again.",
      "zh-TW": "還沒有分享出任何東西；請檢查磁碟後再建立一次邀請。",
      ja: "まだ何も共有されていません。ディスクを確かめて、招待をつくり直してください。",
    },
  },
  "world-invites-unreadable": {
    message: {
      en: "The invites made on this device cannot be read.",
      "zh-TW": "無法讀取這台裝置建立過的邀請。",
      ja: "この端末でつくった招待を読み込めません。",
    },
    hint: {
      en: "Check that the app's data folder can be read, then open the door again.",
      "zh-TW": "請確認應用程式的資料夾可以讀取，再重新開門。",
      ja: "アプリのデータフォルダーを読み込めるか確かめて、扉を開き直してください。",
    },
  },
  "world-door-no-history": {
    message: {
      en: "This world has no shared history yet.",
      "zh-TW": "這個世界還沒有共享的歷史。",
      ja: "このワールドにはまだ共有の歴史がありません。",
    },
    hint: {
      en: "It is made when you play the world; go back to the title and continue it again.",
      "zh-TW": "開始玩這個世界時就會建立；請回到標題畫面，再繼續玩一次。",
      ja: "ワールドを遊び始めると作られます。タイトルに戻って、もう一度続きから遊んでください。",
    },
  },

  // ── Invites and joining ────────────────────────────────────────────────────────────────────
  "invite-link-invalid": {
    message: {
      en: "That is not an invite link, or it is damaged.",
      "zh-TW": "這不是邀請連結，或連結已損壞。",
      ja: "それは招待リンクではないか、壊れています。",
    },
    hint: {
      en: "Paste the whole link, starting with unmapped://join.",
      "zh-TW": "請貼上以 unmapped://join 開頭的完整連結。",
      ja: "unmapped://join で始まるリンク全体を貼り付けてください。",
    },
  },
  "invite-sig-invalid": {
    message: {
      en: "This invite's signature does not verify.",
      "zh-TW": "這份邀請的簽章驗證不通過。",
      ja: "この招待の署名を確かめられません。",
    },
    hint: NEW_LINK,
  },
  "invite-expired": {
    message: {
      en: "This invite has expired.",
      "zh-TW": "這份邀請已過期。",
      ja: "この招待は期限切れです。",
    },
    hint: NEW_LINK,
  },
  "invite-revoked": {
    message: {
      en: "The owner revoked this invite.",
      "zh-TW": "主人已撤回這份邀請。",
      ja: "持ち主がこの招待を取り消しました。",
    },
    hint: NEW_LINK,
  },
  "invite-used-up": {
    message: {
      en: "This invite has been used as many times as it allows.",
      "zh-TW": "這份邀請的可用次數已經用完。",
      ja: "この招待は使える回数を使い切りました。",
    },
    hint: NEW_LINK,
  },
  "invite-proof-invalid": {
    message: {
      en: "This join does not prove it holds the invite.",
      "zh-TW": "這次加入無法證明持有這份邀請。",
      ja: "この参加は招待を持っていることを証明できません。",
    },
    hint: NEW_LINK,
  },
  "invite-wrong-world": {
    message: {
      en: "This invite is for another world.",
      "zh-TW": "這份邀請屬於另一個世界。",
      ja: "この招待は別のワールドのものです。",
    },
    hint: NEW_LINK,
  },
  "invite-not-owner": {
    message: {
      en: "This invite was not signed by the world's owner.",
      "zh-TW": "這份邀請不是由世界的主人簽署的。",
      ja: "この招待はワールドの持ち主が署名したものではありません。",
    },
    hint: NEW_LINK,
  },
  "join-invalid": {
    message: {
      en: "The world this invite leads to does not check out.",
      "zh-TW": "這份邀請指向的世界沒有通過檢查。",
      ja: "この招待が示すワールドは確認できませんでした。",
    },
    hint: NEW_LINK,
  },
  "join-physics-pin": {
    message: {
      en: "This world keeps another version of the land's physics than this build makes.",
      "zh-TW": "這個世界使用的大地物理版本和這個版本製作的不同。",
      ja: "このワールドは、このビルドとは別の版の大地の物理を使っています。",
    },
    hint: {
      en: "Join it from a build made for that physics.",
      "zh-TW": "請用為那個物理版本製作的《無界之地》加入。",
      ja: "その物理の版に合った UNMAPPED から参加してください。",
    },
  },
  "join-pack-mismatch": {
    message: {
      en: "The version this world sent is not the one its history names.",
      "zh-TW": "這個世界送來的版本和它歷史中記載的不一樣。",
      ja: "このワールドが送ってきた版は、歴史に記されたものと違います。",
    },
    hint: NEW_LINK,
  },

  // ── Co-owners and world protocol 2 (rev 6 phase 4, D5) ─────────────────────────────────────
  "protocol-newer": {
    message: {
      en: "This world has co-owners or records on a chain, which this build cannot read yet.",
      "zh-TW": "這個世界有共同主人或在鏈上留紀錄，這個版本還無法讀取。",
      ja: "このワールドには共同の持ち主やチェーンの記録があり、このビルドではまだ読めません。",
    },
    hint: {
      en: "Update UNMAPPED to open it.",
      "zh-TW": "請更新《無界之地》後再開啟。",
      ja: "UNMAPPED を更新してから開いてください。",
    },
  },
  "owner-already": {
    message: {
      en: "That key already owns this world.",
      "zh-TW": "這把金鑰已經是這個世界的主人。",
      ja: "その鍵はすでにこのワールドの持ち主です。",
    },
  },
  "owner-unknown": {
    message: {
      en: "That key does not own this world.",
      "zh-TW": "這把金鑰不是這個世界的主人。",
      ja: "その鍵はこのワールドの持ち主ではありません。",
    },
  },
  "owner-last": {
    message: {
      en: "The last owner cannot be removed.",
      "zh-TW": "不能移除最後一位主人。",
      ja: "最後の持ち主は外せません。",
    },
    hint: {
      en: "Add another owner first.",
      "zh-TW": "請先加入另一位主人。",
      ja: "先に別の持ち主を加えてください。",
    },
  },
  "owners-full": {
    message: {
      en: "This world already has as many owners as it can.",
      "zh-TW": "這個世界的主人已經達到上限。",
      ja: "このワールドの持ち主はもう上限です。",
    },
  },
  "invite-owners-invalid": {
    message: {
      en: "This invite's link does not show who made its signer an owner.",
      "zh-TW": "這份邀請的連結無法證明簽署者是怎麼成為主人的。",
      ja: "この招待のリンクでは、署名した人が持ち主になった経緯を確かめられません。",
    },
    hint: {
      en: "Ask the co-owner who invited you for a new link.",
      "zh-TW": "請向邀請你的共同主人要一個新的連結。",
      ja: "招待してくれた共同の持ち主に新しいリンクをもらってください。",
    },
  },
  "invite-owner-path-long": {
    message: {
      en: "This device became a co-owner too many steps from the world's maker to invite.",
      "zh-TW": "這台裝置成為共同主人時離世界的建立者太遠，無法發出邀請。",
      ja: "この端末はワールドをつくった人から離れすぎた共同の持ち主なので、招待できません。",
    },
    hint: {
      en: "Ask an owner closer to the maker to send the invite.",
      "zh-TW": "請離建立者較近的主人發出邀請。",
      ja: "つくった人に近い持ち主に招待を送ってもらってください。",
    },
  },

  // ── The light chain's answer (rev 6 phase 4, D6; read-only) ────────────────────────────────
  "provenance-not-configured": {
    message: {
      en: "No provenance chain is set up on this device.",
      "zh-TW": "這台裝置沒有設定來源證明用的區塊鏈。",
      ja: "この端末には来歴を確かめるチェーンが設定されていません。",
    },
    hint: {
      en: "Nothing needs it. To compare worlds with what their services recorded, set UNMAPPED_PROVENANCE_RPC_URL and UNMAPPED_PROVENANCE_ADDRESS in .env.",
      "zh-TW":
        "沒有任何功能需要它。若想把世界和服務記錄的內容比對，請在 .env 設定 UNMAPPED_PROVENANCE_RPC_URL 與 UNMAPPED_PROVENANCE_ADDRESS。",
      ja: "なくても困りません。ワールドをサービスの記録と照らし合わせたいときは、.env に UNMAPPED_PROVENANCE_RPC_URL と UNMAPPED_PROVENANCE_ADDRESS を設定してください。",
    },
  },
  "provenance-chain-mismatch": {
    message: {
      en: "The chain's RPC is not on the chain id this device expects.",
      "zh-TW": "區塊鏈的 RPC 不在這台裝置預期的鏈 id 上。",
      ja: "チェーンの RPC が、この端末の期待するチェーン id ではありません。",
    },
    hint: {
      en: "Point UNMAPPED_PROVENANCE_RPC_URL at the chain the contract is on, or fix UNMAPPED_PROVENANCE_CHAIN_ID.",
      "zh-TW":
        "請把 UNMAPPED_PROVENANCE_RPC_URL 指向合約所在的鏈，或修正 UNMAPPED_PROVENANCE_CHAIN_ID。",
      ja: "UNMAPPED_PROVENANCE_RPC_URL をコントラクトのあるチェーンに向けるか、UNMAPPED_PROVENANCE_CHAIN_ID を直してください。",
    },
  },
  "provenance-read-failed": {
    message: {
      en: "The chain could not be read.",
      "zh-TW": "無法讀取區塊鏈。",
      ja: "チェーンを読み取れませんでした。",
    },
    hint: PROVENANCE_ENV,
  },
  "provenance-world-invalid": {
    message: {
      en: "That is not a world id.",
      "zh-TW": "這不是世界的 id。",
      ja: "それはワールドの id ではありません。",
    },
  },
};
