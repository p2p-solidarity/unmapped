// Play: the HUD, dock, player card, turn panel, toasts, tweaks, places and floors.
// Key hints keep the key names (WASD, Shift, E…) and translate only the verbs.

import { HUD_ENS } from "./hud-ens";
import { HUD_PANELS } from "./hud-panels";
import type { Phrase } from "./phrase";

export const HUD = {
  ...HUD_PANELS,
  ...HUD_ENS,

  // ── Key hints (only the keys needed now; the dock's buttons show N, V and F12) ─────────────
  controlsLandArmed: {
    en: "WASD Walk · F Fire · E Talk / open · Esc Leave",
    "zh-TW": "WASD 走路 · F 開火 · E 說話／打開 · Esc 離開",
    ja: "WASD 歩く · F 撃つ · E 話す／開ける · Esc 戻る",
  },
  controlsLand: {
    en: "WASD Walk · E Talk / open · Esc Leave",
    "zh-TW": "WASD 走路 · E 說話／打開 · Esc 離開",
    ja: "WASD 歩く · E 話す／開ける · Esc 戻る",
  },
  controlsLand3d: {
    en: "WASD Walk · Space Jump · E Talk / open · Esc Leave",
    "zh-TW": "WASD 走路 · Space 跳 · E 說話／打開 · Esc 離開",
    ja: "WASD 歩く · Space ジャンプ · E 話す／開ける · Esc 戻る",
  },
  controlsFpsArmed: {
    en: "WASD Walk · Click Fire · R End turn · E Interact · Esc Leave",
    "zh-TW": "WASD 走路 · 左鍵 開火 · R 結束回合 · E 互動 · Esc 離開",
    ja: "WASD 歩く · クリック 撃つ · R ターン終了 · E 調べる · Esc 戻る",
  },
  controlsFps: {
    en: "WASD Walk · F Flashlight · E Interact · Esc Leave",
    "zh-TW": "WASD 走路 · F 手電筒 · E 互動 · Esc 離開",
    ja: "WASD 歩く · F ライト · E 調べる · Esc 戻る",
  },
  controlsSide: {
    en: "A/D Walk · Space Jump · E Interact · Esc Leave",
    "zh-TW": "A/D 走路 · Space 跳 · E 互動 · Esc 離開",
    ja: "A/D 歩く · Space ジャンプ · E 調べる · Esc 戻る",
  },
  controlsTopdown: {
    en: "WASD Walk · E Interact · Esc Leave",
    "zh-TW": "WASD 走路 · E 互動 · Esc 離開",
    ja: "WASD 歩く · E 調べる · Esc 戻る",
  },
  controlsTps: {
    en: "WASD Walk · Space Jump · E Interact · Esc Leave",
    "zh-TW": "WASD 走路 · Space 跳 · E 互動 · Esc 離開",
    ja: "WASD 歩く · Space ジャンプ · E 調べる · Esc 戻る",
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
  dockTweak: { en: "Change the world", "zh-TW": "修改世界", ja: "世界を変える" },
  dockConsole: { en: "Friends & more", "zh-TW": "朋友・更多", ja: "友だち・その他" },
  dockNotes: { en: "Notes", "zh-TW": "留言", ja: "メモ" },
  dockHelp: { en: "How to play", "zh-TW": "說明", ja: "遊び方" },
  dockLook: { en: "Look: {look}", "zh-TW": "畫面：{look}", ja: "表示：{look}" },
  dockCamLocked: {
    en: "Cam: {mode} · scene locked",
    "zh-TW": "鏡頭：{mode} · 場景鎖定",
    ja: "カメラ：{mode} · シーン固定",
  },

  // ── How to play (the first time Play opens on this device, and the dock's button) ─────────
  helpTitle: { en: "How to play", "zh-TW": "怎麼玩", ja: "遊び方" },
  helpWalk: { en: "Walk", "zh-TW": "走路", ja: "歩く" },
  helpInteract: {
    en: "Talk, open, go in",
    "zh-TW": "說話、打開、進去",
    ja: "話す・開ける・入る",
  },
  helpArrow: {
    en: "Follow the arrow to the next chapter",
    "zh-TW": "跟著箭頭，走到下一章",
    ja: "矢印をたどって次の章へ",
  },
  helpFriends: { en: "Play with friends", "zh-TW": "和朋友一起玩", ja: "友だちと遊ぶ" },
  helpChat: { en: "Chat", "zh-TW": "聊天", ja: "チャット" },
  helpFriendsPad: {
    en: "Walk to your home door and press {key} to play with friends",
    "zh-TW": "走到家門按 {key}，和朋友一起玩",
    ja: "家の扉で {key} を押すと、友だちと遊べます",
  },
  helpOk: { en: "Got it", "zh-TW": "知道了", ja: "わかった" },

  // ── Player card ────────────────────────────────────────────────────────────────────────────
  noWorldLoaded: { en: "No world loaded", "zh-TW": "尚未載入世界", ja: "ワールド未読み込み" },
  floorBadge: { en: "FLOOR {floor}", "zh-TW": "第 {floor} 層", ja: "{floor} 階" },
  readCarried: { en: "CARRIED", "zh-TW": "背包", ja: "持ち物" },
  carried: {
    en: "{items} {items|item|items} · {mats} {mats|mat|mats}",
    "zh-TW": "道具 {items} · 素材 {mats}",
    ja: "アイテム {items} · 素材 {mats}",
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

  // ── The goal: one plain sentence about what to do now (open land) ─────────────────────────
  goalHeading: { en: "Goal", "zh-TW": "目標", ja: "目標" },
  goalChapter: { en: "Goal · {title}", "zh-TW": "目標 · {title}", ja: "目標 · {title}" },
  goalTalk: {
    en: "Find {name} and press E to talk",
    "zh-TW": "去找{name}，按 E 和他說話",
    ja: "{name}を探して、E で話しかけよう",
  },
  goalTalkMore: {
    en: "Find {name} and press E to talk ({n} people left)",
    "zh-TW": "去找{name}，按 E 和他說話（還有 {n} 個人）",
    ja: "{name}を探して、E で話しかけよう（あと {n} 人）",
  },
  goalFind: {
    en: "Find the treasure and press E to open it",
    "zh-TW": "找到寶箱，按 E 打開",
    ja: "宝箱を見つけて、E で開けよう",
  },
  goalFindMore: {
    en: "Find the treasures and press E to open them ({n} left)",
    "zh-TW": "找到寶箱，按 E 打開（還有 {n} 個）",
    ja: "宝箱を見つけて、E で開けよう（あと {n} 個）",
  },
  goalDefeat: {
    en: "Beat the monster nearby",
    "zh-TW": "打倒附近的怪物",
    ja: "近くの魔物を倒そう",
  },
  goalDefeatMore: {
    en: "Beat the monsters nearby ({n} left)",
    "zh-TW": "打倒附近的怪物（還有 {n} 隻）",
    ja: "近くの魔物を倒そう（あと {n} 体）",
  },
  goalAlmost: {
    en: "This chapter is almost done…",
    "zh-TW": "這一章快完成了…",
    ja: "この章はもうすぐクリアです…",
  },
  goalGate: {
    en: "Follow the arrow to the gate and press E to begin",
    "zh-TW": "跟著箭頭走到入口，按 E 開始",
    ja: "矢印をたどって入口へ行き、E で始めよう",
  },
  goalEnter: {
    en: "Follow the arrow to the gate and press E to go in",
    "zh-TW": "跟著箭頭走到入口，按 E 進去",
    ja: "矢印をたどって入口へ行き、E で入ろう",
  },
  goalWriting: {
    en: "Writing this chapter — please wait a moment…",
    "zh-TW": "正在寫這一章，請稍等…",
    ja: "この章を書いています。少しお待ちください…",
  },
  goalFailed: {
    en: "This chapter could not be written. Go to the gate and press E to try again",
    "zh-TW": "這一章沒寫成。走到入口，按 E 再試一次",
    ja: "この章を書けませんでした。入口で E を押して、もう一度ためそう",
  },
  goalNeedsSetup: {
    en: "To write the story, first set it up in Settings → Model",
    "zh-TW": "要先到「設定 → 模型」設定好，故事才寫得出來",
    ja: "物語を書くには、まず「設定 → モデル」で設定してください",
  },
  goalOffline: {
    en: "The story is waiting: the AI can't be reached. Check Settings → Model",
    "zh-TW": "故事先停著：現在連不上 AI，請到「設定 → 模型」看看",
    ja: "物語は止まっています：AI につながりません。「設定 → モデル」を確認してください",
  },
  goalAllDone: {
    en: "Every chapter so far is done! You will be told when the next one is ready",
    "zh-TW": "目前的章節都完成了！下一章準備好會告訴你",
    ja: "ここまでの章はすべてクリア！次の章ができたらお知らせします",
  },
  goalEnded: {
    en: "The story is complete! Keep walking and exploring",
    "zh-TW": "故事完結了！可以繼續到處走走",
    ja: "物語は完結しました！このまま自由に歩いてみよう",
  },
  goalExplore: {
    en: "Walk around and see this land",
    "zh-TW": "到處走走，看看這片土地",
    ja: "あちこち歩いて、この土地を見てみよう",
  },
  goalPlace: {
    en: "Find the way out at the far end",
    "zh-TW": "找到最裡面的出口",
    ja: "いちばん奥の出口を見つけよう",
  },

  // ── Where you stand on the land: only what matters right now ──────────────────────────────
  landWitnessing: {
    en: "Drawing this land…",
    "zh-TW": "正在畫出這片土地…",
    ja: "この土地を描いています…",
  },
  landFailed: {
    en: "This land could not be drawn: {reason}",
    "zh-TW": "這片土地沒畫出來：{reason}",
    ja: "この土地を描けませんでした：{reason}",
  },
  retryWitness: { en: "Try again", "zh-TW": "再試一次", ja: "もう一度" },
  cancelWitness: { en: "Stop", "zh-TW": "停止", ja: "やめる" },
  witnessCancelled: {
    en: "Stopped; nothing was drawn here.",
    "zh-TW": "已停止；這裡還沒畫出來。",
    ja: "やめました。ここはまだ描かれていません。",
  },

  // ── Top-right: one plain line, only when it matters ───────────────────────────────────────
  modelMissing: {
    en: "New land and story can't be drawn yet: set up Settings → Model",
    "zh-TW": "還不能畫出新的土地和故事：請到「設定 → 模型」設定",
    ja: "まだ新しい土地や物語を描けません：「設定 → モデル」で設定してください",
  },
  modelOffline: {
    en: "Can't reach the AI right now: check Settings → Model",
    "zh-TW": "現在連不上 AI：請到「設定 → 模型」看看",
    ja: "いま AI につながりません：「設定 → モデル」を確認してください",
  },
  writingNow: { en: "Writing…", "zh-TW": "正在寫…", ja: "書いています…" },
  peers: { en: "{n} {n|friend|friends}", "zh-TW": "{n} 位朋友", ja: "友だち {n} 人" },

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
  cartridgeComplete: { en: "STORY COMPLETE", "zh-TW": "故事完結", ja: "物語の終わり" },
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
  waitingHost: {
    en: "Waiting for the friend who leads…",
    "zh-TW": "等待帶頭的朋友…",
    ja: "先導する友だちを待っています…",
  },
  hostLoading: {
    en: "The friend who leads is loading the next scene…",
    "zh-TW": "帶頭的朋友正在載入下一個場景…",
    ja: "先導する友だちが次のシーンを読み込み中…",
  },
  reachingEnding: { en: "Reaching the ending…", "zh-TW": "正在前往結局…", ja: "エンディングへ…" },
  loadingNextScene: {
    en: "Loading next scene…",
    "zh-TW": "正在載入下一個場景…",
    ja: "次のシーンを読み込み中…",
  },
  hostOnlyDepths: {
    en: "Only the friend who leads can take everyone into the depths.",
    "zh-TW": "只有帶頭的朋友能帶大家進入深層。",
    ja: "深層へ進めるのは先導する友だちだけです。",
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
    en: "There is no fighting here yet — its weakness: {weakness}",
    "zh-TW": "這裡還不能戰鬥 — 它的弱點是：{weakness}",
    ja: "ここではまだ戦えません — 弱点：{weakness}",
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
