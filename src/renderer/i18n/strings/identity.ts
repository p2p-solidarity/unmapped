// Unlock and keys, encrypted seeds, and friends' rooms.

import type { Phrase } from "./phrase";

export const IDENTITY = {
  // ── Unlock ─────────────────────────────────────────────────────────────────────────────────
  passkeyCaption: {
    en: "Passkey PRF: when this runtime supports WebAuthn PRF, the key is derived from the passkey itself.",
    "zh-TW": "通行密鑰 PRF：若此執行環境支援 WebAuthn PRF，金鑰會直接由通行密鑰衍生。",
    ja: "パスキー PRF：この実行環境が WebAuthn PRF に対応していれば、鍵はパスキー自体から導出されます。",
  },
  keychainCaption: {
    en: "OS keychain: the key is stored by this operating system and never leaves this machine.",
    "zh-TW": "系統鑰匙圈：金鑰由作業系統保管，絕不會離開這台電腦。",
    ja: "OS キーチェーン：鍵はこの OS が保管し、このマシンの外には出ません。",
  },
  unlocking: { en: "Unlocking", "zh-TW": "解鎖中", ja: "ロック解除中" },
  waitingAuthenticator: {
    en: "Waiting for the authenticator…",
    "zh-TW": "正在等待驗證器…",
    ja: "認証器を待っています…",
  },
  unlockFailed: { en: "Unlock failed", "zh-TW": "解鎖失敗", ja: "ロック解除に失敗しました" },
  useKeychain: {
    en: "Use OS keychain instead",
    "zh-TW": "改用系統鑰匙圈",
    ja: "OS キーチェーンを使う",
  },
  retryPasskey: {
    en: "Try the passkey again",
    "zh-TW": "再試一次通行密鑰",
    ja: "パスキーで再試行",
  },
  unlocked: { en: "Saves unlocked", "zh-TW": "存檔已解鎖", ja: "セーブのロックを解除しました" },
  methodPrf: {
    en: "Passkey (WebAuthn PRF)",
    "zh-TW": "通行密鑰（WebAuthn PRF）",
    ja: "パスキー（WebAuthn PRF）",
  },
  methodKeychain: { en: "OS keychain", "zh-TW": "系統鑰匙圈", ja: "OS キーチェーン" },
  credential: { en: "credential {id}", "zh-TW": "憑證 {id}", ja: "認証情報 {id}" },
  waitingPasskey: {
    en: "Waiting for passkey…",
    "zh-TW": "正在等待通行密鑰…",
    ja: "パスキーを待っています…",
  },
  addPasskey: { en: "Add another passkey", "zh-TW": "新增另一把通行密鑰", ja: "パスキーを追加" },
  addedCredential: {
    en: "Added credential {id}",
    "zh-TW": "已新增憑證 {id}",
    ja: "認証情報 {id} を追加しました",
  },
  continue: { en: "Continue", "zh-TW": "繼續", ja: "続ける" },
  unlockTitle: { en: "Unlock your saves", "zh-TW": "解鎖你的存檔", ja: "セーブのロックを解除" },
  unlockPasskey: {
    en: "Unlock with passkey",
    "zh-TW": "用通行密鑰解鎖",
    ja: "パスキーでロック解除",
  },
  recoveryFailed: {
    en: "Saves unlocked, but keychain recovery was not added: {reason}",
    "zh-TW": "存檔已解鎖，但未能加入鑰匙圈復原方式：{reason}",
    ja: "セーブのロックは解除しましたが、キーチェーンによる復元を追加できませんでした：{reason}",
  },
  recoveryAdded: {
    en: "Keychain recovery added: saves on this machine also unlock through the OS keychain.",
    "zh-TW": "已加入鑰匙圈復原：這台電腦上的存檔也能透過系統鑰匙圈解鎖。",
    ja: "キーチェーンによる復元を追加しました。このマシンのセーブは OS キーチェーンでもロック解除できます。",
  },

  // ── Encrypted seeds ────────────────────────────────────────────────────────────────────────
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
    en: "Waiting for a player with the same cartridge revision.",
    "zh-TW": "正在等待持有相同卡帶版本的玩家。",
    ja: "同じカートリッジの版を持つプレイヤーを待っています。",
  },
  peerLine: {
    en: "{name} — scene {floor}",
    "zh-TW": "{name} — 場景 {floor}",
    ja: "{name} — シーン {floor}",
  },
  codeCopied: {
    en: "Room code copied",
    "zh-TW": "已複製加入代碼",
    ja: "参加コードをコピーしました",
  },
  copyFailed: {
    en: "Could not copy: {reason}",
    "zh-TW": "無法複製：{reason}",
    ja: "コピーできませんでした：{reason}",
  },
  roomCode: { en: "room code", "zh-TW": "加入代碼", ja: "参加コード" },
  roleHost: { en: "host", "zh-TW": "房主", ja: "ホスト" },
  roleJoined: { en: "joined", "zh-TW": "已加入", ja: "参加中" },
  copyCode: { en: "Copy code", "zh-TW": "複製代碼", ja: "コードをコピー" },
  players: { en: "players", "zh-TW": "玩家", ja: "プレイヤー" },
  chooseTitle: {
    en: "Choose a game, then join",
    "zh-TW": "選擇遊戲後加入",
    ja: "ゲームを選んで参加",
  },
  chooseNote: {
    en: "The room opens only after the local cartridge and runtime hashes are verified.",
    "zh-TW": "本機卡帶與執行環境的雜湊值驗證通過後，房間才會開啟。",
    ja: "ローカルのカートリッジとランタイムのハッシュを検証してから、ルームが開きます。",
  },
  loadingGames: { en: "Loading saved games…", "zh-TW": "正在載入存檔…", ja: "セーブを読み込み中…" },
  savedGame: { en: "saved game", "zh-TW": "存檔", ja: "セーブ" },
  noInstances: {
    en: "Create an instance from Cartridges first.",
    "zh-TW": "請先從卡帶建立遊玩進度。",
    ja: "先にカートリッジからプレイを作成してください。",
  },
  playerProfile: { en: "player profile", "zh-TW": "玩家檔案", ja: "プレイヤープロフィール" },
  displayName: { en: "display name", "zh-TW": "顯示名稱", ja: "表示名" },
  hostGame: { en: "Host this game", "zh-TW": "主持這場遊戲", ja: "このゲームをホスト" },
  orJoin: { en: "or join with a code", "zh-TW": "或用加入代碼加入", ja: "または参加コードで参加" },
  join: { en: "Join", "zh-TW": "加入", ja: "参加" },
  noteNotKept: {
    en: "A visitor's note was not kept: {reason}",
    "zh-TW": "訪客的留言沒有保存下來：{reason}",
    ja: "訪問者のメモを保存できませんでした：{reason}",
  },
} as const satisfies Record<string, Phrase>;
