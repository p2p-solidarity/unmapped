// The UI string table. One entry per key, one line per language, so a missing translation is
// visible here rather than at runtime — the type requires every language for every key.

import type { UiLanguage } from "./store";

export type Phrase = Record<UiLanguage, string>;

export const STRINGS = {
  // ── Create: modes ──────────────────────────────────────────────────────────────────────────
  cylinder: { en: "Cylinder", "zh-TW": "彈巢", ja: "シリンダー" },
  cylinderFull: {
    en: "Full — eject one to swap",
    "zh-TW": "滿了 — 要換就先退一發",
    ja: "満杯 — 入れ替えるにはまず排莢",
  },
  showAllModes: {
    en: "Also show the {count} without modules",
    "zh-TW": "也顯示還沒有模組的 {count} 個",
    ja: "モジュール未実装の {count} 件も表示",
  },
  showOnlyAvailable: {
    en: "Show only available modes",
    "zh-TW": "只顯示可用的模式",
    ja: "利用可能なモードのみ表示",
  },
  needsModule: { en: "needs module", "zh-TW": "需要模組", ja: "モジュール必要" },
  searchModes: { en: "Search modes", "zh-TW": "搜尋模式", ja: "モード検索" },
  noModeMatches: {
    en: "Nothing matches “{query}”.",
    "zh-TW": "沒有符合「{query}」的模式。",
    ja: "「{query}」に一致するモードがありません。",
  },
  loaded: { en: "LOADED", "zh-TW": "已裝填", ja: "装填済" },
  emptyChamber: { en: "empty chamber", "zh-TW": "空彈巢", ja: "空薬室" },
  ejectHint: {
    en: "{label} — click to eject",
    "zh-TW": "{label} — 點一下退出",
    ja: "{label} — クリックで排莢",
  },

  // ── Axis labels ────────────────────────────────────────────────────────────────────────────
  axisGenre: { en: "Genre", "zh-TW": "類型", ja: "ジャンル" },
  axisTiming: { en: "Pacing", "zh-TW": "節奏", ja: "テンポ" },
  axisStructure: { en: "Players", "zh-TW": "結構", ja: "構成" },
  axisSetting: { en: "Setting", "zh-TW": "題材", ja: "題材" },
  groupTiming: { en: "Pacing", "zh-TW": "節奏", ja: "テンポ" },
  groupTimingNote: {
    en: "Reshapes the whole game's clock; stacks with any genre",
    "zh-TW": "改變整款遊戲的時間軸，可與任何 genre 疊加",
    ja: "ゲーム全体の時間軸を変える。どのジャンルとも重ねられる",
  },
  groupStructure: { en: "Who plays", "zh-TW": "玩家結構", ja: "プレイ構成" },
  groupStructureNote: { en: "Who plays with you", "zh-TW": "誰和你一起玩", ja: "誰と遊ぶか" },
  groupRpg: { en: "RPG, story and cards", "zh-TW": "RPG、敘事與卡牌", ja: "RPG・物語・カード" },
  groupAction: {
    en: "Shooters, arcade, platform and fighting",
    "zh-TW": "射擊、街機、平台與格鬥",
    ja: "シューター・アーケード・アクション・格闘",
  },
  groupSimulation: {
    en: "Farming, building and simulation",
    "zh-TW": "種田、建造與模擬",
    ja: "農業・建設・シミュレーション",
  },
  groupStrategy: {
    en: "Strategy, cards and board",
    "zh-TW": "策略、卡牌與棋盤",
    ja: "ストラテジー・カード・ボード",
  },
  groupSports: { en: "Sports and racing", "zh-TW": "運動與競速", ja: "スポーツ・レース" },
  groupSetting: { en: "Setting", "zh-TW": "題材", ja: "題材" },
  groupSettingNote: {
    en: "Steers the scene and the story only; never blocks Forge",
    "zh-TW": "只影響場景與故事的方向，不會擋住 Forge",
    ja: "シーンと物語の方向のみに影響。Forge を止めることはない",
  },

  // ── Create: navigation ─────────────────────────────────────────────────────────────────────
  stepModes: { en: "Modes", "zh-TW": "模式", ja: "モード" },
  stepBase: { en: "Scene Base", "zh-TW": "場景基底", ja: "シーン基底" },
  stepBuild: { en: "Build", "zh-TW": "建關", ja: "ビルド" },
  stepStory: { en: "Story", "zh-TW": "劇情", ja: "ストーリー" },
  next: { en: "Next", "zh-TW": "下一步", ja: "次へ" },
  back: { en: "Back", "zh-TW": "上一步", ja: "戻る" },
  cancel: { en: "Cancel", "zh-TW": "取消", ja: "キャンセル" },
  forgeAndPlay: { en: "Forge & Play", "zh-TW": "蓋章並開始玩", ja: "刻印してプレイ" },
  retryForge: { en: "Retry Forge", "zh-TW": "重新蓋章", ja: "刻印をやり直す" },
  forging: { en: "Forging…", "zh-TW": "蓋章中…", ja: "刻印中…" },
  hintLoadModes: {
    en: "Load a few modes into the cylinder first.",
    "zh-TW": "先裝幾個模式進彈巢。",
    ja: "まずシリンダーにモードを装填してください。",
  },
  hintPickBase: {
    en: "Next: pick the space this happens in.",
    "zh-TW": "下一步是挑場景基底。",
    ja: "次はシーン基底を選びます。",
  },
  hintWriteSetup: {
    en: "Pick a space, then write the setup.",
    "zh-TW": "挑一個空間，然後寫設定。",
    ja: "空間を選び、設定を書きます。",
  },
  hintForgeSigned: {
    en: "Forging starts play · signed {maker}",
    "zh-TW": "蓋章後直接開始玩 · 作者署名 {maker}",
    ja: "刻印後すぐプレイ · 作者 {maker}",
  },
  hintBlocked: {
    en: "This selection needs a capability that is not implemented; swap that mode out.",
    "zh-TW": "這組選擇有必要能力還沒有實作，先換掉那個模式。",
    ja: "この選択には未実装の能力が必要です。そのモードを外してください。",
  },

  // ── Create: scene bases ────────────────────────────────────────────────────────────────────
  baseIntroGenerated: {
    en: "Your modes generate the map. The base sets the materials, the mood and where the exit is — the walls and the route are generated, but the start and the exit stay yours.",
    "zh-TW":
      "你選的模式會生成地圖。基底決定素材、氣氛與出口位置，牆與路線由生成器填——起點和出口仍然是你的。",
    ja: "選んだモードがマップを生成します。基底は素材・雰囲気・出口の位置を決め、壁と経路は生成されます。開始地点と出口はあなたのものです。",
  },
  baseIntroAuthored: {
    en: "The base sets the space, the materials and where the exit is.",
    "zh-TW": "基底決定空間、素材與出口位置。",
    ja: "基底が空間・素材・出口の位置を決めます。",
  },
  rollBases: { en: "Roll another set", "zh-TW": "換一組候選", ja: "別の候補を引く" },

  // ── Create: story ──────────────────────────────────────────────────────────────────────────
  storyIntro: {
    en: "Modes and space are settled. Let the model name this cartridge and say what you do here. Reroll or skip as you like.",
    "zh-TW":
      "模式和空間都定了，接下來讓模型替這張卡帶取名字、寫出你在這裡要做什麼。可以重骰，也可以直接略過。",
    ja: "モードと空間が決まりました。モデルにカートリッジの名前とここで何をするかを書かせます。引き直しもスキップも自由です。",
  },
  storyIdle: { en: "No setup generated yet.", "zh-TW": "還沒生成設定。", ja: "設定は未生成です。" },
  storyWriting: { en: "Writing the setup…", "zh-TW": "正在寫設定…", ja: "設定を執筆中…" },
  storyNoModel: {
    en: "No model is fine — Skip still forges a playable cartridge.",
    "zh-TW": "沒有模型也沒關係——按「略過」照樣可以蓋卡帶開始玩。",
    ja: "モデルがなくても大丈夫。スキップでも遊べるカートリッジになります。",
  },
  reroll: { en: "Reroll", "zh-TW": "重骰", ja: "引き直す" },
  skip: { en: "Skip", "zh-TW": "略過", ja: "スキップ" },
  readyToForge: { en: "Ready to forge", "zh-TW": "可以蓋章了", ja: "刻印できます" },
  title: { en: "Title", "zh-TW": "標題", ja: "タイトル" },
  exitLabel: { en: "Exit: {label}", "zh-TW": "出口：{label}", ja: "出口：{label}" },

  // ── Capability report ──────────────────────────────────────────────────────────────────────
  contextsHeadline: {
    en: "This cartridge has {count} play contexts",
    "zh-TW": "這張卡帶有 {count} 種玩法情境",
    ja: "このカートリッジには {count} 種のプレイ文脈があります",
  },
  contextsNote: {
    en: "{keys} differ per context; scenes switch between them. This is not an error.",
    "zh-TW": "{keys} 在不同情境下不一樣，場景會在它們之間切換。這不是錯誤。",
    ja: "{keys} は文脈ごとに異なり、シーンが切り替えます。これはエラーではありません。",
  },
  swapped: { en: "Swapped in", "zh-TW": "已經換過的做法", ja: "差し替え済み" },
  availableSwaps: { en: "Available swaps", "zh-TW": "可以換的做法", ja: "選べる代替案" },
  useThisSwap: { en: "Use this instead", "zh-TW": "採用這個做法", ja: "これを採用" },
  missingModules: {
    en: "Missing engine modules",
    "zh-TW": "缺少的引擎模組",
    ja: "不足しているモジュール",
  },
  globalConflict: {
    en: "One session-wide capability was asked for twice",
    "zh-TW": "整場共用的能力被要求了兩個值",
    ja: "セッション全体の能力に二つの値が要求されました",
  },
  modulesToMount: {
    en: "Modules to mount · {count}",
    "zh-TW": "要掛載的模組 · {count}",
    ja: "マウントするモジュール · {count}",
  },
  contextLabel: { en: "Play context", "zh-TW": "玩法情境", ja: "プレイ文脈" },
  contextNumbered: {
    en: "Context {n} · {modes}",
    "zh-TW": "情境 {n} · {modes}",
    ja: "文脈 {n} · {modes}",
  },
  ctxPlayable: { en: "playable", "zh-TW": "可以玩", ja: "プレイ可" },
  ctxPending: { en: "undecided", "zh-TW": "待決定", ja: "未決定" },
  ctxMissing: { en: "missing module", "zh-TW": "缺模組", ja: "モジュール不足" },
  ctxConflict: { en: "conflict", "zh-TW": "衝突", ja: "衝突" },
  requiredBy: {
    en: "{modes} asked for it, but nothing provides it.",
    "zh-TW": "{modes} 要求，但沒有模組提供。",
    ja: "{modes} が要求していますが、提供するモジュールがありません。",
  },
  conflictBetween: {
    en: "{modes} disagree.",
    "zh-TW": "{modes} 互相衝突。",
    ja: "{modes} が矛盾しています。",
  },
  defaults: { en: "defaults", "zh-TW": "預設值", ja: "既定値" },

  // ── Create: describe it in words ───────────────────────────────────────────────────────────
  describeLabel: {
    en: "What do you want to make",
    "zh-TW": "想做什麼遊戲",
    ja: "どんなゲームを作りたいか",
  },
  decidedButMissing: {
    en: "You accepted this decision, but no installed module provides it.",
    "zh-TW": "這是你接受的決定，但沒有已安裝的模組能提供。",
    ja: "採用した決定ですが、提供できるモジュールがありません。",
  },
  revokeDecision: {
    en: "Undo this decision",
    "zh-TW": "撤銷這個決定",
    ja: "この決定を取り消す",
  },
  describeAsk: { en: "Pick for me", "zh-TW": "幫我選", ja: "選んでもらう" },
  describeThinking: { en: "Thinking…", "zh-TW": "想一下…", ja: "考え中…" },
  describeNoModel: {
    en: "No model is fine — picking from the cards below works just as well.",
    "zh-TW": "沒有模型也沒關係，下面的卡片自己挑一樣可以。",
    ja: "モデルがなくても大丈夫。下のカードから選んでも同じです。",
  },
  cylinderCount: {
    en: "Cylinder {n} / {max}",
    "zh-TW": "彈巢 {n} / {max}",
    ja: "シリンダー {n} / {max}",
  },
  searchPlaceholder: {
    en: "fps / turn-based / farming / 2.5D",
    "zh-TW": "fps / 回合制 / 種田 / 2.5D",
    ja: "fps / ターン制 / 農業 / 2.5D",
  },

  // ── Capability report: the four verdicts ───────────────────────────────────────────────────
  statusReady: { en: "READY", "zh-TW": "READY", ja: "READY" },
  statusReadyNote: {
    en: "Every capability this selection asks for is implemented.",
    "zh-TW": "這組選擇的每一項能力，引擎都已經實作。",
    ja: "この選択が求める能力はすべて実装済みです。",
  },
  statusNeedsDecision: { en: "NEEDS DECISION", "zh-TW": "NEEDS DECISION", ja: "NEEDS DECISION" },
  statusNeedsDecisionNote: {
    en: "An optional capability is undecided. You can carry on and answer it in the interview.",
    "zh-TW": "有選擇性的能力還沒決定；可以先繼續，之後在設計訪談裡回答。",
    ja: "任意の能力が未決定です。このまま進めて、後で設計インタビューで答えられます。",
  },
  statusNeedsPlugin: { en: "NEEDS PLUGIN", "zh-TW": "NEEDS PLUGIN", ja: "NEEDS PLUGIN" },
  statusNeedsPluginNote: {
    en: "A required capability has no module. Forge stays blocked until a mode changes or a module lands.",
    "zh-TW": "有必要能力沒有任何已安裝模組能實作。Forge 會被擋住，直到換一組模式或補上模組。",
    ja: "必須の能力にモジュールがありません。モードを変えるかモジュールが揃うまで Forge は止まります。",
  },
  statusConflict: { en: "CONFLICT", "zh-TW": "CONFLICT", ja: "CONFLICT" },
  statusConflictNote: {
    en: "One session-wide capability (networking, say) was asked for twice. Pick one.",
    "zh-TW": "有一項整場共用的能力（例如連線方式）被要求了兩個值，必須挑一個。",
    ja: "セッション全体で共有する能力（通信方式など）に二つの値が要求されました。一つ選んでください。",
  },

  // ── Build: the level editor ────────────────────────────────────────────────────────────────
  holding: { en: "Holding", "zh-TW": "手上拿著", ja: "手に持っている" },
  brushPlatform: { en: "Platform", "zh-TW": "平台", ja: "足場" },
  brushWall: { en: "Wall", "zh-TW": "牆", ja: "壁" },
  brushProp: { en: "Prop", "zh-TW": "物件", ja: "オブジェクト" },
  brushPhysics: { en: "Physics prop", "zh-TW": "物理物件", ja: "物理オブジェクト" },
  brushMonster: { en: "Enemy", "zh-TW": "敵人", ja: "敵" },
  brushTreasure: { en: "Chest", "zh-TW": "寶箱", ja: "宝箱" },
  brushPatch: { en: "Ground", "zh-TW": "地面", ja: "地面" },
  brushExit: { en: "Exit", "zh-TW": "出口", ja: "出口" },
  editorHeight: { en: "Height {n}", "zh-TW": "高度 {n}", ja: "高さ {n}" },
  editorBounce: { en: "Bouncy", "zh-TW": "彈跳", ja: "跳ねる" },
  editorHint: {
    en: "Left click places · drag to paint a run · right click or Alt removes",
    "zh-TW": "左鍵放置 · 拖曳連續放 · 右鍵/Alt 移除",
    ja: "左クリックで設置 · ドラッグで連続設置 · 右クリック/Alt で削除",
  },
  editorCounts: {
    en: "{platforms} platforms · {props} props · {monsters} enemies",
    "zh-TW": "{platforms} 平台 · {props} 物件 · {monsters} 敵人",
    ja: "足場 {platforms} · オブジェクト {props} · 敵 {monsters}",
  },
  editorPhysicsNote: {
    en: "A physics prop falls, collides and can be grabbed with G in play.",
    "zh-TW": "物理物件會掉落、會碰撞，遊玩時可以用 G 抓起來丟。",
    ja: "物理オブジェクトは落ちて衝突し、プレイ中は G で掴んで投げられます。",
  },
  editorSimulate: { en: "Test physics", "zh-TW": "試跑物理", ja: "物理を試す" },
  editorStopSim: { en: "Stop · reset", "zh-TW": "停止並復原", ja: "停止して戻す" },
  editorSimRunning: {
    en: "Simulating — stopping puts everything back where you placed it.",
    "zh-TW": "模擬中——停止後所有東西會回到你放的位置。",
    ja: "シミュレーション中 — 停止すると配置した位置に戻ります。",
  },
  editorNothingDynamic: {
    en: "Nothing to simulate yet. Place a physics prop first.",
    "zh-TW": "還沒有可模擬的東西，先放一個物理物件。",
    ja: "シミュレーションする対象がありません。まず物理オブジェクトを置いてください。",
  },

  // ── Language ───────────────────────────────────────────────────────────────────────────────
  language: { en: "Language", "zh-TW": "語言", ja: "言語" },
  languageNote: {
    en: "Interface only. Anything the model writes stays in the language it was generated in.",
    "zh-TW": "只影響介面。模型寫的內容維持它生成時的語言。",
    ja: "UI のみ。モデルが書いた内容は生成時の言語のままです。",
  },
  enterDepths: {
    en: "Enter the depths",
    "zh-TW": "進入無盡深層",
    ja: "深層へ進む",
  },
  depthsNote: {
    en: "Below the ending, every floor is generated from this save's seed and gets harder.",
    "zh-TW": "結局之下的每一層都由這個存檔的種子生成，越往下越難。",
    ja: "エンディングの下の階層はこのセーブのシードから生成され、深いほど難しくなります。",
  },
  descending: {
    en: "Descending to B{depth}…",
    "zh-TW": "前往 B{depth}…",
    ja: "B{depth} へ降りています…",
  },
  reachedDepth: {
    en: "B{depth}",
    "zh-TW": "B{depth}",
    ja: "B{depth}",
  },
  objectiveClear: {
    en: "Clear every hostile on this floor, then take the stairs down.",
    "zh-TW": "清光這一層的敵人，再走樓梯往下。",
    ja: "この階の敵をすべて倒してから階段を降りる。",
  },
  objectiveLoot: {
    en: "Open every cache on this floor, then take the stairs down.",
    "zh-TW": "打開這一層所有的寶箱，再走樓梯往下。",
    ja: "この階の宝箱をすべて開けてから階段を降りる。",
  },
  objectiveReach: {
    en: "Find the stairs down.",
    "zh-TW": "找到往下的樓梯。",
    ja: "下り階段を見つける。",
  },
  objectiveUnmet: {
    en: "Not yet: {left} left.",
    "zh-TW": "還不行：還剩 {left} 個。",
    ja: "まだです：残り {left}。",
  },
  retryFloor: {
    en: "Retry this floor",
    "zh-TW": "重試這一層",
    ja: "この階をやり直す",
  },
} as const satisfies Record<string, Phrase>;

export type StringKey = keyof typeof STRINGS;
