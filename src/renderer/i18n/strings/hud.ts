// Play: the HUD, dock, player card, turn panel, toasts, tweaks, places and floors.
// Key hints keep the key names (WASD, Shift, E…) and translate only the verbs.

import { HUD_PANELS } from "./hud-panels";
import type { Phrase } from "./phrase";

export const HUD = {
  ...HUD_PANELS,

  // ── Key hints ──────────────────────────────────────────────────────────────────────────────
  controlsLandArmed: {
    en: "WASD / Click Move · Shift Sprint · Space/F Fire · Click a foe to shoot · E Interact · N Notes · V Look",
    "zh-TW":
      "WASD / 點擊 移動 · Shift 衝刺 · Space/F 開火 · 點擊敵人射擊 · E 互動 · N 留言 · V 畫面",
    ja: "WASD / クリック 移動 · Shift ダッシュ · Space/F 射撃 · 敵をクリックで射撃 · E 調べる · N メモ · V 表示",
  },
  controlsLand: {
    en: "WASD / Click Move · Shift Sprint · E Interact · N Notes · V Look",
    "zh-TW": "WASD / 點擊 移動 · Shift 衝刺 · E 互動 · N 留言 · V 畫面",
    ja: "WASD / クリック 移動 · Shift ダッシュ · E 調べる · N メモ · V 表示",
  },
  controlsLand3d: {
    en: "WASD Move · Shift Sprint · Space Jump · E Interact · N Notes · V Camera",
    "zh-TW": "WASD 移動 · Shift 衝刺 · Space 跳躍 · E 互動 · N 留言 · V 鏡頭",
    ja: "WASD 移動 · Shift ダッシュ · Space ジャンプ · E 調べる · N メモ · V カメラ",
  },
  controlsFpsArmed: {
    en: "WASD Move · LMB Fire · R End turn · F Flashlight · E Interact",
    "zh-TW": "WASD 移動 · 左鍵 開火 · R 結束回合 · F 手電筒 · E 互動",
    ja: "WASD 移動 · 左クリック 射撃 · R ターン終了 · F ライト · E 調べる",
  },
  controlsFps: {
    en: "WASD Move · F Flashlight · E Interact",
    "zh-TW": "WASD 移動 · F 手電筒 · E 互動",
    ja: "WASD 移動 · F ライト · E 調べる",
  },
  controlsSide: {
    en: "A/D Move · Space Jump · E Interact",
    "zh-TW": "A/D 移動 · Space 跳躍 · E 互動",
    ja: "A/D 移動 · Space ジャンプ · E 調べる",
  },
  controlsTopdown: {
    en: "WASD Move · E Interact",
    "zh-TW": "WASD 移動 · E 互動",
    ja: "WASD 移動 · E 調べる",
  },
  controlsTps: {
    en: "WASD Move · Shift Sprint · Space Jump · E Interact",
    "zh-TW": "WASD 移動 · Shift 衝刺 · Space 跳躍 · E 互動",
    ja: "WASD 移動 · Shift ダッシュ · Space ジャンプ · E 調べる",
  },

  // ── The "press E" prompt ───────────────────────────────────────────────────────────────────
  promptTalkTo: { en: "Talk to {name}", "zh-TW": "與 {name} 交談", ja: "{name} と話す" },
  promptTalk: { en: "Talk", "zh-TW": "交談", ja: "話す" },
  promptOpen: { en: "Open", "zh-TW": "打開", ja: "開ける" },
  promptBackToLand: { en: "Back to the land", "zh-TW": "回到大地", ja: "大地へ戻る" },
  promptFinish: { en: "Finish and return", "zh-TW": "完成並返回", ja: "クリアして戻る" },
  promptDescend: { en: "Descend", "zh-TW": "往下走", ja: "降りる" },
  promptWish: { en: "Make a wish", "zh-TW": "許願", ja: "願いをかける" },
  promptInspectName: { en: "Inspect {name}", "zh-TW": "查看 {name}", ja: "{name} を見る" },
  promptInspect: { en: "Inspect", "zh-TW": "查看", ja: "見る" },
  promptExamineName: { en: "Examine {name}", "zh-TW": "調查 {name}", ja: "{name} を調べる" },
  promptExamine: { en: "Examine", "zh-TW": "調查", ja: "調べる" },
  promptSearch: { en: "Search here", "zh-TW": "搜索這裡", ja: "ここを探す" },
  promptDoor: { en: "Open the door", "zh-TW": "開門", ja: "扉を開ける" },
  promptEnterName: { en: "Enter · {name}", "zh-TW": "進入 · {name}", ja: "入る · {name}" },
  promptEnter: { en: "Enter", "zh-TW": "進入", ja: "入る" },

  // ── Dock ───────────────────────────────────────────────────────────────────────────────────
  dockHome: { en: "← Home", "zh-TW": "← 主頁", ja: "← ホーム" },
  dockTweak: { en: "Tweak rules", "zh-TW": "調整機制", ja: "ルール調整" },
  dockConsole: { en: "Console", "zh-TW": "主控台", ja: "コンソール" },
  dockNotes: { en: "Notes", "zh-TW": "留言", ja: "メモ" },
  dockLook: { en: "Look: {look}", "zh-TW": "畫面：{look}", ja: "表示：{look}" },
  dockCamLocked: {
    en: "Cam: {mode} · scene locked",
    "zh-TW": "鏡頭：{mode} · 場景鎖定",
    ja: "カメラ：{mode} · シーン固定",
  },

  // ── Player card ────────────────────────────────────────────────────────────────────────────
  noWorldLoaded: { en: "No world loaded", "zh-TW": "尚未載入世界", ja: "ワールド未読み込み" },
  floorBadge: { en: "FLOOR {floor}", "zh-TW": "第 {floor} 層", ja: "{floor} 階" },
  readSeed: { en: "SEED", "zh-TW": "種子", ja: "シード" },
  readLand: { en: "LAND", "zh-TW": "大地", ja: "大地" },
  readKarma: { en: "KARMA", "zh-TW": "因果", ja: "カルマ" },
  karmaEntries: { en: "{n} {n|entry|entries}", "zh-TW": "{n} 筆", ja: "{n} 件" },
  readCarried: { en: "CARRIED", "zh-TW": "背包", ja: "持ち物" },
  carried: {
    en: "{items} {items|item|items} · {mats} {mats|mat|mats}",
    "zh-TW": "道具 {items} · 素材 {mats}",
    ja: "アイテム {items} · 素材 {mats}",
  },
  lastChoice: {
    en: "Last choice: {choice}",
    "zh-TW": "上次選擇：{choice}",
    ja: "直前の選択：{choice}",
  },
  sceneNotParsed: { en: "Scene not parsed", "zh-TW": "場景未解析", ja: "シーン未解析" },
  biome: { en: "Biome", "zh-TW": "地貌", ja: "バイオーム" },
  // One per BIOMES value (@shared/world): a bounded scene's engine biome, never its raw id.
  biome_meadow: { en: "Meadow", "zh-TW": "草原", ja: "草原" },
  biome_onsen_town: { en: "Hot-spring town", "zh-TW": "溫泉小鎮", ja: "温泉町" },
  biome_ruined_castle: { en: "Ruined castle", "zh-TW": "古城廢墟", ja: "廃城" },
  biome_cyber_workshop: { en: "Cyber workshop", "zh-TW": "電子工坊", ja: "サイバー工房" },
  biome_abyss: { en: "Abyss", "zh-TW": "深淵", ja: "深淵" },
  biome_sky_isle: { en: "Sky isle", "zh-TW": "天空浮島", ja: "空の浮島" },
  biome_snowfield: { en: "Snowfield", "zh-TW": "雪原", ja: "雪原" },
  biome_lava_forge: { en: "Lava forge", "zh-TW": "熔岩鍛爐", ja: "溶岩の鍛冶場" },
  biome_countryside: { en: "Countryside", "zh-TW": "鄉間", ja: "田園" },
  storyCount: {
    en: "Story {done}/{total}",
    "zh-TW": "故事 {done}/{total}",
    ja: "ストーリー {done}/{total}",
  },
  chapterCount: {
    en: "Chapter {n} · {done} cleared",
    "zh-TW": "第 {n} 章 · 已完成 {done}",
    ja: "第 {n} 章 · クリア {done}",
  },
  storyNext: {
    en: "next: {title} ({place})",
    "zh-TW": "下一章：{title}（{place}）",
    ja: "次：{title}（{place}）",
  },
  storyLast: {
    en: "the story has reached its last chapter",
    "zh-TW": "故事已經來到最後一章",
    ja: "ストーリーは最終章です",
  },
  storyUnwritten: {
    en: "the next chapter is not written yet",
    "zh-TW": "下一章還沒寫好",
    ja: "次の章はまだ書かれていません",
  },
  chapterLeft: {
    en: "talk {talk} · find {find}",
    "zh-TW": "交談 {talk} · 尋找 {find}",
    ja: "会話 {talk} · 探索 {find}",
  },
  chapterDefeat: { en: "defeat {defeat}", "zh-TW": "擊倒 {defeat}", ja: "撃破 {defeat}" },
  noFloorLoaded: {
    en: "No floor loaded.",
    "zh-TW": "尚未載入這一層。",
    ja: "階が読み込まれていません。",
  },
  writingFloor: {
    en: "Writing this floor…",
    "zh-TW": "正在寫這一層…",
    ja: "この階を書いています…",
  },
  noQuests: {
    en: "No active quests on this floor.",
    "zh-TW": "這一層沒有進行中的任務。",
    ja: "この階に進行中のクエストはありません。",
  },

  // ── Where you stand on the land ────────────────────────────────────────────────────────────
  landWritten: { en: "WRITTEN · {name}", "zh-TW": "已記 · {name}", ja: "記録済み · {name}" },
  landWitnessing: { en: "WITNESSING…", "zh-TW": "顯影中…", ja: "観測中…" },
  landFailed: { en: "FAILED · {reason}", "zh-TW": "失敗 · {reason}", ja: "失敗 · {reason}" },
  retryWitness: { en: "Retry witnessing", "zh-TW": "重新顯影", ja: "もう一度観測" },
  cancelWitness: { en: "Cancel witnessing", "zh-TW": "取消顯影", ja: "観測をやめる" },
  witnessCancelled: {
    en: "Witnessing cancelled; nothing was written here.",
    "zh-TW": "已取消顯影；這裡沒有寫下任何東西。",
    ja: "観測をやめました。ここには何も書かれていません。",
  },
  landUnwritten: { en: "UNWRITTEN", "zh-TW": "未記", ja: "未記録" },

  // ── System card ────────────────────────────────────────────────────────────────────────────
  stateUnconfigured: { en: "NO PROVIDER", "zh-TW": "未設定模型", ja: "プロバイダーなし" },
  stateUnprobed: { en: "NOT PROBED", "zh-TW": "尚未偵測", ja: "未確認" },
  stateProbing: { en: "PROBING…", "zh-TW": "偵測中…", ja: "確認中…" },
  stateOnline: { en: "ONLINE", "zh-TW": "連線中", ja: "オンライン" },
  stateOffline: { en: "UNREACHABLE", "zh-TW": "無法連線", ja: "接続できません" },
  stateError: { en: "PROBE FAILED", "zh-TW": "偵測失敗", ja: "確認に失敗" },
  noInferenceConfig: { en: "no inference config", "zh-TW": "沒有推論設定", ja: "推論設定なし" },
  seedCore: { en: "Seed Core", "zh-TW": "種子核心", ja: "シードコア" },
  thinkingOne: { en: "Neural Inference…", "zh-TW": "模型思考中…", ja: "モデル推論中…" },
  thinkingMany: {
    en: "Neural Stream ({n})",
    "zh-TW": "模型串流（{n}）",
    ja: "モデル応答中（{n}）",
  },
  peers: { en: "{n} {n|peer|peers}", "zh-TW": "{n} 位夥伴", ja: "仲間 {n} 人" },

  // ── Turn panel ─────────────────────────────────────────────────────────────────────────────
  sysRealtime: { en: "Real-time", "zh-TW": "即時", ja: "リアルタイム" },
  sysPause: { en: "Real-time with pause", "zh-TW": "即時暫停", ja: "ポーズ付きリアルタイム" },
  sysTick: { en: "Ticks", "zh-TW": "滴答回合", ja: "ティック制" },
  sysTurnBased: { en: "Turn-based", "zh-TW": "回合制", ja: "ターン制" },
  sysTurnBar: { en: "Action bar", "zh-TW": "行動槽", ja: "行動ゲージ" },
  sysInitiative: { en: "Initiative", "zh-TW": "先攻序", ja: "イニシアチブ" },
  sysPhase: { en: "Phases", "zh-TW": "階段制", ja: "フェイズ制" },
  sysRevolver: { en: "Revolver", "zh-TW": "左輪輪替", ja: "リボルバー" },
  round: { en: "ROUND {n}", "zh-TW": "第 {n} 回合", ja: "ラウンド {n}" },
  barFilling: { en: "Action bars filling…", "zh-TW": "行動槽填充中…", ja: "行動ゲージ充填中…" },
  yourTurn: {
    en: "Your turn · click to fire, R to pass",
    "zh-TW": "你的回合 · 左鍵開火，R 跳過",
    ja: "あなたのターン · クリックで射撃、R でパス",
  },
  resolving: { en: "Resolving…", "zh-TW": "結算中…", ja: "処理中…" },
  actorActing: { en: "{name} is acting", "zh-TW": "{name} 行動中", ja: "{name} の行動中" },
  foesLeft: {
    en: "Foes {standing} / {total}",
    "zh-TW": "敵人 {standing} / {total}",
    ja: "敵 {standing} / {total}",
  },
  score: { en: "SCORE", "zh-TW": "分數", ja: "スコア" },
  xpKills: {
    en: "{xp} xp · {kills} {kills|kill|kills}",
    "zh-TW": "經驗 {xp} · 擊倒 {kills}",
    ja: "経験値 {xp} · 撃破 {kills}",
  },
  reloading: { en: "Reloading…", "zh-TW": "重新裝填…", ja: "リロード中…" },

  // ── Play overlays ──────────────────────────────────────────────────────────────────────────
  sceneDidNotParse: {
    en: "world.oui did not parse",
    "zh-TW": "world.oui 無法解析",
    ja: "world.oui を解析できません",
  },
  openConsole: { en: "Open console", "zh-TW": "開啟主控台", ja: "コンソールを開く" },
  noWorld: {
    en: "No world is loaded.",
    "zh-TW": "尚未載入世界。",
    ja: "ワールドが読み込まれていません。",
  },
  loadingFloor: {
    en: "Loading this floor…",
    "zh-TW": "正在載入這一層…",
    ja: "この階を読み込み中…",
  },
  generatingNote: {
    en: "The main process is generating and validating this scene before it appears.",
    "zh-TW": "主程式正在生成並驗證這個場景，完成後才會顯示。",
    ja: "表示する前に、メインプロセスがこのシーンを生成・検証しています。",
  },
  cancelGeneration: { en: "Cancel generation", "zh-TW": "取消生成", ja: "生成を中止" },
  runCleared: { en: "RUN CLEARED", "zh-TW": "本局清空", ja: "クリア" },
  runOver: { en: "RUN OVER", "zh-TW": "本局結束", ja: "ゲームオーバー" },
  runClearedTitle: {
    en: "Everything here is cleared",
    "zh-TW": "這一局清乾淨了",
    ja: "すべて片付けた",
  },
  runOverTitle: { en: "You fell", "zh-TW": "你倒下了", ja: "力尽きた" },
  runStats: {
    en: "{kills} {kills|kill|kills} · score {score}",
    "zh-TW": "擊倒 {kills} · 分數 {score}",
    ja: "撃破 {kills} · スコア {score}",
  },
  backToLibrary: { en: "Back to library", "zh-TW": "回到主頁", ja: "ホームに戻る" },
  keepLooking: { en: "Keep looking around", "zh-TW": "繼續四處看看", ja: "もう少し見て回る" },
  cartridgeComplete: { en: "CARTRIDGE COMPLETE", "zh-TW": "卡帶完結", ja: "カートリッジ完了" },
  stayFinale: { en: "Stay in the finale", "zh-TW": "留在終章", ja: "フィナーレに残る" },
  floorNotWritten: {
    en: "Floor {floor} was not written",
    "zh-TW": "第 {floor} 層沒有寫成",
    ja: "{floor} 階を書けませんでした",
  },
  stayFloor: { en: "Stay on this floor", "zh-TW": "留在這一層", ja: "この階に留まる" },

  // ── Floors and scene transitions ───────────────────────────────────────────────────────────
  weavingFloor: {
    en: "Weaving floor {floor}…",
    "zh-TW": "正在編織第 {floor} 層…",
    ja: "{floor} 階を編んでいます…",
  },
  waitingHost: { en: "Waiting for host…", "zh-TW": "等待房主…", ja: "ホストを待っています…" },
  hostLoading: {
    en: "Host is loading next scene…",
    "zh-TW": "房主正在載入下一個場景…",
    ja: "ホストが次のシーンを読み込み中…",
  },
  reachingEnding: { en: "Reaching the ending…", "zh-TW": "正在前往結局…", ja: "エンディングへ…" },
  loadingNextScene: {
    en: "Loading next scene…",
    "zh-TW": "正在載入下一個場景…",
    ja: "次のシーンを読み込み中…",
  },
  hostOnlyDepths: {
    en: "Only the host can take a room into the depths.",
    "zh-TW": "只有房主能帶整個房間進入深層。",
    ja: "深層へ進めるのはルームのホストだけです。",
  },
  sceneNotReady: {
    en: "The current scene is not ready to expand.",
    "zh-TW": "目前的場景還不能擴展。",
    ja: "現在のシーンはまだ拡張できません。",
  },
  generationCancelled: {
    en: "Scene generation cancelled.",
    "zh-TW": "已取消場景生成。",
    ja: "シーン生成を中止しました。",
  },
  cancellingGeneration: {
    en: "Cancelling scene generation…",
    "zh-TW": "正在取消場景生成…",
    ja: "シーン生成を中止しています…",
  },
  worldOuiNotSaved: {
    en: "world.oui could not be saved: {reason}",
    "zh-TW": "world.oui 無法儲存：{reason}",
    ja: "world.oui を保存できませんでした：{reason}",
  },

  // ── Interactions ───────────────────────────────────────────────────────────────────────────
  treasureMissing: {
    en: 'Treasure "{id}" is not in the current scene.',
    "zh-TW": "目前的場景裡沒有寶箱「{id}」。",
    ja: "宝箱「{id}」は現在のシーンにありません。",
  },
  found: { en: "Found: {loot}", "zh-TW": "找到：{loot}", ja: "入手：{loot}" },
  chestEmpty: { en: "The chest is empty.", "zh-TW": "寶箱是空的。", ja: "宝箱は空でした。" },
  noCombatWeakness: {
    en: "Combat is not in this build yet — the model gave it weakness: {weakness}",
    "zh-TW": "這個版本還沒有戰鬥 — 模型給它的弱點是：{weakness}",
    ja: "このビルドにはまだ戦闘がありません — モデルが決めた弱点：{weakness}",
  },
  noCombat: {
    en: "Combat is not in this build yet.",
    "zh-TW": "這個版本還沒有戰鬥。",
    ja: "このビルドにはまだ戦闘がありません。",
  },
  triggerMissing: {
    en: 'Trigger "{id}" is not in the current scene.',
    "zh-TW": "目前的場景裡沒有機關「{id}」。",
    ja: "仕掛け「{id}」は現在のシーンにありません。",
  },
  exitNoLabel: {
    en: "This exit has no destination label.",
    "zh-TW": "這個出口沒有標示目的地。",
    ja: "この出口には行き先がありません。",
  },
  dialogueFailed: {
    en: "Dialogue failed: {reason}",
    "zh-TW": "對話失敗：{reason}",
    ja: "会話に失敗しました：{reason}",
  },

  // ── Labels in the 3D scene ─────────────────────────────────────────────────────────────────
  door: { en: "Door", "zh-TW": "門", ja: "扉" },
  noteBy: { en: "Note · {author}", "zh-TW": "留言 · {author}", ja: "メモ · {author}" },
  ally: { en: "Ally {n}", "zh-TW": "隊友 {n}", ja: "味方 {n}" },

  // ── Tweak panel: otherworlds (異界) ────────────────────────────────────────────────────────
  kindOtherworld: { en: "Otherworld", "zh-TW": "異界", ja: "異界" },
  kindOtherworldDetail: {
    en: "A door into one of your AI worlds, played in its own sealed frame.",
    "zh-TW": "通往你某個 AI 世界的門，在它自己封閉的框架裡遊玩。",
    ja: "あなたの AI ワールドへの扉。封じられた専用の枠の中で遊びます。",
  },
} as const satisfies Record<string, Phrase>;
