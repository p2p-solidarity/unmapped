// Create a game: the idea, the planned chapters, building the world.

import type { Phrase } from "./phrase";

export const CREATE = {
  // ── Frame ──────────────────────────────────────────────────────────────────────────────────
  title: { en: "Create a game", "zh-TW": "建立遊戲", ja: "ゲームを作る" },
  stepWorld: { en: "The world", "zh-TW": "世界", ja: "ワールド" },
  stepPlan: { en: "The plan", "zh-TW": "規劃", ja: "プラン" },
  stepPlay: { en: "Play", "zh-TW": "遊玩", ja: "プレイ" },

  // ── Building, stage by stage ───────────────────────────────────────────────────────────────
  stageBible: {
    en: "Writing the world bible…",
    "zh-TW": "正在撰寫世界設定…",
    ja: "世界設定を書いています…",
  },
  stageStory: {
    en: "Turning your story into chapters on the map…",
    "zh-TW": "正在把你的故事分成地圖上的章節…",
    ja: "ストーリーをマップ上の章に分けています…",
  },
  stageOrigin: {
    en: "Writing the place you wake in…",
    "zh-TW": "正在撰寫你醒來的地方…",
    ja: "目覚める場所を書いています…",
  },
  stagePublish: {
    en: "Publishing the world…",
    "zh-TW": "正在發布世界…",
    ja: "ワールドを公開しています…",
  },

  // ── Scene generation progress (also shown while a floor is written) ────────────────────────
  genChoosingModel: {
    en: "Choosing the local scene model…",
    "zh-TW": "正在選擇本機場景模型…",
    ja: "ローカルのシーンモデルを選んでいます…",
  },
  genPlanning: {
    en: "Planning what happens here…",
    "zh-TW": "正在構思這裡會發生的事…",
    ja: "ここで起きることを考えています…",
  },
  genLayout: {
    en: "Laying out the room…",
    "zh-TW": "正在配置房間…",
    ja: "部屋を配置しています…",
  },
  genPhase: {
    en: "Generating scene · {phase}",
    "zh-TW": "正在生成場景 · {phase}",
    ja: "シーンを生成中 · {phase}",
  },
  genChecking: {
    en: "Checking the generated scene…",
    "zh-TW": "正在檢查生成的場景…",
    ja: "生成したシーンを確認しています…",
  },
  genTrying: { en: "Trying {name}…", "zh-TW": "改用 {name}…", ja: "{name} を試しています…" },
  genReady: { en: "Scene ready.", "zh-TW": "場景完成。", ja: "シーンができました。" },
  genCancelled: {
    en: "Generation cancelled.",
    "zh-TW": "已取消生成。",
    ja: "生成をキャンセルしました。",
  },

  // ── No model ───────────────────────────────────────────────────────────────────────────────
  offlineMessage: {
    en: "A new world is written by the model, and the model did not answer the last check.",
    "zh-TW": "新世界要由模型來寫，但模型沒有回應上一次的檢查。",
    ja: "新しいワールドはモデルが書きますが、前回の確認でモデルが応答しませんでした。",
  },
  offlineHint: {
    en: "Start a model or configure a provider in System → Inference. You can still try: a real failure says what went wrong.",
    "zh-TW":
      "請啟動模型，或到「系統 → 推論」設定供應商。你還是可以直接試試看：真的失敗時會說明原因。",
    ja: "モデルを起動するか、「システム → 推論」でプロバイダーを設定してください。このまま試すこともできます。失敗したときは原因が表示されます。",
  },
  checkModel: { en: "Check the model again", "zh-TW": "重新檢查模型", ja: "モデルを再確認" },
  modelReadiness: {
    en: "Using {provider} · {model} ({ms} ms)",
    "zh-TW": "使用 {provider} · {model}（{ms} 毫秒）",
    ja: "使用モデル：{provider} · {model}（{ms} ms）",
  },
  modelRouteBridge: {
    en: "The starting place uses Apple's on-device scene model. The world plan and chapters use the selected chat model.",
    "zh-TW": "起點場景使用 Apple 裝置端場景模型；世界規劃與章節使用目前選定的對話模型。",
    ja: "開始地点には Apple のオンデバイスシーンモデルを使用し、世界プランと章には選択中のチャットモデルを使用します。",
  },
  modelRouteChat: {
    en: "The world plan, chapters and starting place all use this model.",
    "zh-TW": "世界規劃、章節與起點場景都使用這個模型。",
    ja: "世界プラン、章、開始地点はすべてこのモデルを使用します。",
  },
  modelContext: {
    en: "Local context: {n} tokens ({source}). Long stories may need a larger model or Cloud API.",
    "zh-TW": "本地上下文：{n} token（{source}）。長篇故事可能需要更大的模型或雲端 API。",
    ja: "ローカルのコンテキスト：{n} トークン（{source}）。長い物語には、より大きいモデルまたはクラウド API が必要な場合があります。",
  },

  // ── Buttons ────────────────────────────────────────────────────────────────────────────────
  planWorld: { en: "Plan this world", "zh-TW": "規劃這個世界", ja: "プランを作る" },
  planAgain: { en: "Plan it again", "zh-TW": "重新規劃", ja: "プランを作り直す" },
  backToPlan: { en: "Back to the plan", "zh-TW": "回到規劃", ja: "プランに戻る" },
  buildAndPlay: { en: "Build and play", "zh-TW": "建立並開始玩", ja: "作って遊ぶ" },
  anotherPlan: { en: "Ask for another plan", "zh-TW": "換一份規劃", ja: "別のプランを頼む" },
  backToWorld: { en: "Back to the world", "zh-TW": "回到世界設定", ja: "ワールド設定に戻る" },
  backToTitle: { en: "Back to the title", "zh-TW": "回到標題畫面", ja: "タイトルに戻る" },

  // ── Why the edited chapters cannot be built yet ────────────────────────────────────────────
  chaptersIncomplete: {
    en: "The chapters are incomplete.",
    "zh-TW": "章節還沒填完整。",
    ja: "章の内容が足りません。",
  },
  chapterNeeds: {
    en: "Chapter {n} needs its {field}.",
    "zh-TW": "第 {n} 章還缺少{field}。",
    ja: "第{n}章の{field}を入力してください。",
  },
  fieldTitle: { en: "title", "zh-TW": "標題", ja: "タイトル" },
  fieldPlace: { en: "place", "zh-TW": "地點", ja: "場所" },
  fieldKind: { en: "kind", "zh-TW": "類型", ja: "種類" },
  fieldBrief: { en: "“what happens”", "zh-TW": "「發生什麼事」", ja: "「何が起きるか」" },
  fieldText: { en: "text", "zh-TW": "內容", ja: "内容" },

  // ── Page 1: the idea ───────────────────────────────────────────────────────────────────────
  worldName: { en: "World name", "zh-TW": "世界名稱", ja: "ワールド名" },
  intent: {
    en: "In one sentence, what is this land?",
    "zh-TW": "用一句話說說，這片大地是什麼樣的地方？",
    ja: "この大地はどんな場所？ ひとことで",
  },
  story: {
    en: "Your story (optional): who you are, what happens, how it ends — it becomes chapters on the map",
    "zh-TW": "你的故事（選填）：你是誰、發生了什麼、怎麼結束——它會變成地圖上的章節",
    ja: "あなたのストーリー（任意）：あなたは誰で、何が起き、どう終わるか。マップ上の章になります",
  },
  howPlayed: { en: "How is it played?", "zh-TW": "要怎麼玩？", ja: "遊び方は？" },
  styleExplore: { en: "Explore", "zh-TW": "探索", ja: "探索" },
  styleExploreDetail: {
    en: "Walk, meet people, find things. Nobody fights; chapters are meetings, searches, climbs and mazes.",
    "zh-TW": "四處走走、認識居民、找找東西。沒有戰鬥；章節是相遇、搜尋、攀登和迷宮。",
    ja: "歩いて、人に会って、ものを見つけます。戦闘はなく、章は出会い・探索・クライム・迷宮です。",
  },
  styleGun: { en: "Adventure · gun", "zh-TW": "冒險 · 槍", ja: "冒険 · 銃" },
  styleGunDetail: {
    en: "Monsters on the land and in chapters; you shoot the way you face.",
    "zh-TW": "大地上和章節裡都有怪物；你朝面對的方向射擊。",
    ja: "大地にも章にもモンスターが出ます。向いている方向に撃ちます。",
  },
  styleBlade: { en: "Adventure · blade", "zh-TW": "冒險 · 刀劍", ja: "冒険 · 剣" },
  styleBladeDetail: {
    en: "Monsters on the land and in chapters; you fight up close.",
    "zh-TW": "大地上和章節裡都有怪物；你近身作戰。",
    ja: "大地にも章にもモンスターが出ます。接近して戦います。",
  },
  weaponName: {
    en: "Your weapon's name (optional)",
    "zh-TW": "你的武器名稱（選填）",
    ja: "武器の名前（任意）",
  },
  languageCaption: {
    en: "Language — everything the world says is written in it",
    "zh-TW": "語言——這個世界說的每句話都用它來寫",
    ja: "言語：ワールドの言葉はすべてこの言語で書かれます",
  },

  // ── Page 2: the plan ───────────────────────────────────────────────────────────────────────
  noStory: {
    en: "No story was given, so this world has no chapters: it is open land to walk. Go back and write a story to get chapters on the map.",
    "zh-TW":
      "沒有提供故事，所以這個世界沒有章節，只是一片可以自由走動的大地。回上一步寫下故事，地圖上就會出現章節。",
    ja: "ストーリーがないので、このワールドに章はありません。自由に歩ける大地です。戻ってストーリーを書くと、マップに章が置かれます。",
  },
  chapterN: { en: "Chapter {n}", "zh-TW": "第 {n} 章", ja: "第{n}章" },
  chapterTitle: { en: "Title", "zh-TW": "標題", ja: "タイトル" },
  chapterWhere: { en: "Where", "zh-TW": "地點", ja: "場所" },
  chapterBrief: { en: "What happens", "zh-TW": "發生什麼事", ja: "何が起きるか" },
  addChapter: {
    en: "Add a chapter you write yourself",
    "zh-TW": "加入自己寫的章節",
    ja: "自分で書く章を追加",
  },
  kindMeet: { en: "meet", "zh-TW": "相遇", ja: "出会い" },
  kindSearch: { en: "search", "zh-TW": "搜尋", ja: "探索" },
  kindFight: { en: "fight", "zh-TW": "戰鬥", ja: "戦闘" },
  kindClimb: { en: "climb", "zh-TW": "攀登", ja: "クライム" },
  kindMaze: { en: "maze", "zh-TW": "迷宮", ja: "迷宮" },
  kindHintMeet: {
    en: "people to talk to, on the land",
    "zh-TW": "在大地上找居民說話",
    ja: "大地で住人と話す",
  },
  kindHintSearch: {
    en: "things to find, on the land",
    "zh-TW": "在大地上找東西",
    ja: "大地で探し物をする",
  },
  kindHintFight: {
    en: "foes to beat, on the land",
    "zh-TW": "在大地上打倒敵人",
    ja: "大地で敵を倒す",
  },
  kindHintClimb: {
    en: "a side-scrolling course",
    "zh-TW": "橫向捲軸關卡",
    ja: "横スクロールのコース",
  },
  kindHintMaze: { en: "a dungeon", "zh-TW": "地下城", ja: "ダンジョン" },
  kindHintOther: {
    en: "“{kind}” — played on the land unless it reads as a climb or a maze",
    "zh-TW": "「{kind}」——在大地上進行，除非看起來像攀登或迷宮",
    ja: "「{kind}」：クライムか迷宮らしくなければ大地で遊びます",
  },
  gatesCaption: { en: "Where the gates stand", "zh-TW": "關口的位置", ja: "ゲートの位置" },
  rules: { en: "Rules", "zh-TW": "規則", ja: "ルール" },
  rulesPeaceful: {
    en: "No fighting: chapters are meetings, searches, climbs and mazes.",
    "zh-TW": "沒有戰鬥：章節是相遇、搜尋、攀登和迷宮。",
    ja: "戦闘なし：章は出会い・探索・クライム・迷宮です。",
  },
  rulesFighting: {
    en: "Fighting on: you start with {weapon}; you 100 HP, monsters 30 HP + 10 per level.",
    "zh-TW": "開啟戰鬥：一開始持有{weapon}；你 100 HP，怪物 30 HP，每一級再 +10。",
    ja: "戦闘あり：{weapon}を持って始めます。自分は HP 100、モンスターは HP 30＋レベルごとに 10。",
  },
  defaultGun: { en: "a gun", "zh-TW": "一把槍", ja: "銃" },
  defaultBlade: { en: "a blade", "zh-TW": "一把刀劍", ja: "剣" },
  bibleCaption: {
    en: "The world, as the model wrote it",
    "zh-TW": "模型寫下的世界",
    ja: "モデルが書いたワールド",
  },

  // ── The gate map ───────────────────────────────────────────────────────────────────────────
  mapLabel: {
    en: "Home and {n} chapter gates on the land",
    "zh-TW": "起點與大地上的 {n} 個章節關口",
    ja: "拠点と大地にある {n} か所の章ゲート",
  },
  mapHome: {
    en: "Home — where the world starts",
    "zh-TW": "起點——世界從這裡開始",
    ja: "拠点：ワールドが始まる場所",
  },
} as const satisfies Record<string, Phrase>;
