// Settings → Your passkey, unlocking encrypted seeds (F12 → World), and friends' rooms.

import type { Phrase } from "./phrase";

export const IDENTITY = {
  // ── Settings → Your passkey (app/title/PasskeyPanel.tsx, SystemPanel.tsx) ─────────────────
  passkeyHeading: { en: "Your passkey", "zh-TW": "你的 passkey", ja: "あなたのパスキー" },
  passkeyWhat: {
    en: "One passkey is you: naming your worlds and confirming on the market both use it.",
    "zh-TW": "一把 passkey 就是你：幫世界取名字、在市場上確認，都用它。",
    ja: "パスキーひとつがあなたです。世界に名前を付けるのも、マーケットでの確認も、これを使います。",
  },
  passkeyNone: { en: "Not set up yet", "zh-TW": "還沒設定", ja: "まだ設定していません" },
  passkeySet: { en: "Set up ✓", "zh-TW": "已設定 ✓", ja: "設定済み ✓" },
  settingsAdvanced: { en: "Advanced settings", "zh-TW": "進階設定", ja: "詳細設定" },

  // ── Unlocking encrypted seeds (F12 → World: identity/UnlockPanel.tsx) ──────────────────────
  unlockNeeded: {
    en: "Unlock first to export or import an encrypted seed.",
    "zh-TW": "要匯出或匯入加密種子，請先解鎖。",
    ja: "暗号化シードを書き出す・読み込むには、先にロックを解除してください。",
  },
  unlockNote: {
    en: "With your passkey, the seed opens wherever your passkey works. With the OS keychain, it opens only on this computer.",
    "zh-TW":
      "用 passkey 解鎖，種子在你的 passkey 能用的地方都打得開；用系統鑰匙圈，就只能在這台電腦上打開。",
    ja: "パスキーなら、パスキーが使える所ならどこでも開けます。OS キーチェーンなら、このコンピューターでしか開けません。",
  },
  unlocking: { en: "Unlocking…", "zh-TW": "解鎖中…", ja: "ロック解除中…" },
  unlockPasskey: {
    en: "Unlock with my passkey",
    "zh-TW": "用我的 passkey 解鎖",
    ja: "パスキーでロック解除",
  },
  retryPasskey: {
    en: "Try my passkey again",
    "zh-TW": "再用 passkey 試一次",
    ja: "もう一度パスキーで試す",
  },
  useKeychain: {
    en: "Use the OS keychain instead",
    "zh-TW": "改用系統鑰匙圈",
    ja: "OS キーチェーンを使う",
  },
  unlockedPasskey: {
    en: "Unlocked with your passkey: encrypted seeds open wherever your passkey works.",
    "zh-TW": "已用 passkey 解鎖：加密種子在你的 passkey 能用的地方都打得開。",
    ja: "パスキーでロックを解除しました。暗号化シードはパスキーが使える所ならどこでも開けます。",
  },
  unlockedKeychain: {
    en: "Unlocked with the OS keychain: encrypted seeds open only on this computer.",
    "zh-TW": "已用系統鑰匙圈解鎖：加密種子只能在這台電腦上打開。",
    ja: "OS キーチェーンでロックを解除しました。暗号化シードはこのコンピューターでしか開けません。",
  },
  addPasskey: {
    en: "Let my passkey unlock it too",
    "zh-TW": "也讓我的 passkey 能解鎖",
    ja: "パスキーでも開けるようにする",
  },
  waitingPasskey: {
    en: "Confirm with your passkey…",
    "zh-TW": "請用 passkey 確認…",
    ja: "パスキーで確認してください…",
  },
  passkeyLinked: {
    en: "Done: your passkey unlocks it too.",
    "zh-TW": "好了，你的 passkey 也能解鎖了。",
    ja: "完了しました。パスキーでも開けます。",
  },
  recoveryFailed: {
    en: "Unlocked, but the OS keychain was not added as a way back in: {reason}",
    "zh-TW": "已解鎖，但沒能把系統鑰匙圈加為備用解鎖方式：{reason}",
    ja: "ロックは解除しましたが、OS キーチェーンを予備の解除方法に追加できませんでした：{reason}",
  },
  recoveryAdded: {
    en: "The OS keychain was added as a way back in: on this computer it can unlock too.",
    "zh-TW": "已把系統鑰匙圈加為備用解鎖方式：在這台電腦上它也能解鎖。",
    ja: "OS キーチェーンを予備の解除方法に追加しました。このコンピューターではこれでも開けます。",
  },

  // ── Encrypted seeds ────────────────────────────────────────────────────────────────────────
  seedHeading: {
    en: "Encrypted seed (.seed.enc)",
    "zh-TW": "加密種子（.seed.enc）",
    ja: "暗号化シード（.seed.enc）",
  },
  exportSeedDialog: {
    en: "Export encrypted seed",
    "zh-TW": "匯出加密種子",
    ja: "暗号化シードを書き出す",
  },
  importSeedDialog: {
    en: "Import encrypted seed",
    "zh-TW": "匯入加密種子",
    ja: "暗号化シードを読み込む",
  },
  restored: { en: "Restored {name}", "zh-TW": "已還原 {name}", ja: "{name} を復元しました" },

  // ── Rooms (multiplayer) ────────────────────────────────────────────────────────────────────
  statusConnected: { en: "connected", "zh-TW": "已連線", ja: "接続済み" },
  statusUnreachable: { en: "unreachable", "zh-TW": "無法連線", ja: "接続不可" },
  statusConnecting: { en: "connecting…", "zh-TW": "連線中…", ja: "接続中…" },
  waitingPeer: {
    en: "Waiting for a friend on the same version of this world.",
    "zh-TW": "正在等玩同一個世界版本的朋友。",
    ja: "同じバージョンの世界にいる友だちを待っています。",
  },
  peerLine: {
    en: "{name} — scene {floor}",
    "zh-TW": "{name} — 場景 {floor}",
    ja: "{name} — シーン {floor}",
  },
  codeCopied: {
    en: "Join code copied",
    "zh-TW": "已複製加入碼",
    ja: "参加コードをコピーしました",
  },
  copyFailed: {
    en: "Could not copy: {reason}",
    "zh-TW": "無法複製：{reason}",
    ja: "コピーできませんでした：{reason}",
  },
  roomCode: { en: "join code", "zh-TW": "加入碼", ja: "参加コード" },
  roleHost: { en: "host", "zh-TW": "主持人", ja: "ホスト" },
  roleJoined: { en: "joined", "zh-TW": "已加入", ja: "参加中" },
  copyCode: { en: "Copy code", "zh-TW": "複製加入碼", ja: "コードをコピー" },
  players: { en: "players", "zh-TW": "玩家", ja: "プレイヤー" },
  chooseTitle: {
    en: "Choose a world, then join",
    "zh-TW": "選一個世界再加入",
    ja: "ワールドを選んで参加",
  },
  chooseNote: {
    en: "It starts once this computer has checked the world's version.",
    "zh-TW": "這台電腦確認過世界的版本後才會開始。",
    ja: "このコンピューターで世界のバージョンを確認してから始まります。",
  },
  loadingGames: {
    en: "Loading your worlds…",
    "zh-TW": "正在載入你的世界…",
    ja: "ワールドを読み込み中…",
  },
  savedGame: { en: "world", "zh-TW": "世界", ja: "ワールド" },
  noInstances: {
    en: "Start a world from Worlds → My worlds first.",
    "zh-TW": "請先到「世界 → 我的世界」開始一個世界。",
    ja: "先に「ワールド → マイワールド」でワールドを始めてください。",
  },
  playerProfile: { en: "player profile", "zh-TW": "玩家檔案", ja: "プレイヤープロフィール" },
  displayName: { en: "display name", "zh-TW": "顯示名稱", ja: "表示名" },
  hostGame: { en: "Invite friends", "zh-TW": "邀請朋友", ja: "友だちを招待" },
  orJoin: {
    en: "or join with a join code",
    "zh-TW": "或用加入碼加入",
    ja: "または参加コードで参加",
  },
  join: { en: "Join", "zh-TW": "加入", ja: "参加" },
  noteNotKept: {
    en: "A visitor's note was not kept: {reason}",
    "zh-TW": "訪客的留言沒有保存下來：{reason}",
    ja: "訪問者のメモを保存できませんでした：{reason}",
  },
} as const satisfies Record<string, Phrase>;
