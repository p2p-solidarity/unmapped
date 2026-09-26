// Create a game: the drafts, the idea, the progress of every model call, building the world. The
// world, look and story steps keep their own tables (create-world.ts, create-look.ts,
// create-story.ts) in the same `create.` namespace.

import { CREATE_LOOK } from "./create-look";
import { CREATE_STORY } from "./create-story";
import { CREATE_WORLD } from "./create-world";
import type { Phrase } from "./phrase";

const CREATE_FRAME = {
  // ── Frame ──────────────────────────────────────────────────────────────────────────────────
  title: { en: "Create a game", "zh-TW": "建立遊戲", ja: "ゲームを作る" },
  stepIdea: { en: "Idea", "zh-TW": "構想", ja: "アイデア" },
  stepWorld: { en: "World", "zh-TW": "世界", ja: "ワールド" },
  stepStory: { en: "Story", "zh-TW": "故事", ja: "ストーリー" },
  stepBuild: { en: "Build and play", "zh-TW": "建立並遊玩", ja: "作って遊ぶ" },

  // ── Drafts (the Create entry) ──────────────────────────────────────────────────────────────
  draftsTitle: { en: "Games you are making", "zh-TW": "製作中的遊戲", ja: "作りかけのゲーム" },
  draftsLoading: {
    en: "Opening your drafts…",
    "zh-TW": "正在開啟你的草稿…",
    ja: "下書きを開いています…",
  },
  draftsNote: {
    en: "Nothing here is published until you build it.",
    "zh-TW": "在你按下建立之前，這裡的內容都不會發布。",
    ja: "作成するまで、ここにあるものは公開されません。",
  },
  startNew: { en: "Start a new game", "zh-TW": "開始新的遊戲", ja: "新しいゲームを始める" },
  continueDraft: { en: "Continue", "zh-TW": "繼續", ja: "続ける" },
  untitled: { en: "Untitled", "zh-TW": "未命名", ja: "無題" },
  draftLine: {
    en: "{step} · {n} {n|chapter|chapters} · {when}",
    "zh-TW": "{step} · {n} 章 · {when}",
    ja: "{step} · {n} 章 · {when}",
  },
  draftBroken: {
    en: "This draft no longer reads: {problem}",
    "zh-TW": "這份草稿無法讀取：{problem}",
    ja: "この下書きは読み込めません：{problem}",
  },
  confirmDeleteDraft: {
    en: "Delete “{name}”? Its world and story are gone for good.",
    "zh-TW": "要刪除「{name}」嗎？它的世界與故事會永久消失。",
    ja: "「{name}」を削除しますか？ ワールドとストーリーは元に戻せません。",
  },
  keep: { en: "Keep", "zh-TW": "保留", ja: "残す" },
  saving: { en: "Saving the draft…", "zh-TW": "正在儲存草稿…", ja: "下書きを保存しています…" },
  saved: { en: "Draft saved", "zh-TW": "草稿已儲存", ja: "下書きを保存しました" },

  // ── Every model call, stage by stage ───────────────────────────────────────────────────────
  stageWorld: {
    en: "Writing the world bible…",
    "zh-TW": "正在撰寫世界設定…",
    ja: "世界設定を書いています…",
  },
  stageCard: {
    en: "Rewriting the {part} card…",
    "zh-TW": "正在重寫「{part}」卡…",
    ja: "「{part}」のカードを書き直しています…",
  },
  stageCards: {
    en: "Rewriting the unlocked cards…",
    "zh-TW": "正在重寫未鎖定的卡片…",
    ja: "ロックしていないカードを書き直しています…",
  },
  stageStory: {
    en: "Writing the story and its chapters…",
    "zh-TW": "正在撰寫故事與章節…",
    ja: "ストーリーと章を書いています…",
  },
  stageChapter: {
    en: "Rewriting chapter {n}…",
    "zh-TW": "正在重寫第 {n} 章…",
    ja: "第{n}章を書き直しています…",
  },
  stageInsert: {
    en: "Writing a new chapter {n}…",
    "zh-TW": "正在寫新的第 {n} 章…",
    ja: "新しい第{n}章を書いています…",
  },
  stageNote: {
    en: "Rewriting the unlocked chapters…",
    "zh-TW": "正在重寫未鎖定的章節…",
    ja: "ロックしていない章を書き直しています…",
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
  elapsed: { en: "{s} s", "zh-TW": "{s} 秒", ja: "{s} 秒" },
  streamCaption: { en: "The model is writing", "zh-TW": "模型正在寫", ja: "モデルが書いています" },

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
    en: "Start a model or choose one in Settings → Model. You can still try: a real failure says what went wrong.",
    "zh-TW":
      "請啟動模型，或到「設定 → 模型」選擇模型。你還是可以直接試試看：真的失敗時會說明原因。",
    ja: "モデルを起動するか、「設定 → モデル」でモデルを選んでください。このまま試すこともできます。失敗したときは原因が表示されます。",
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
  writeWorld: { en: "Write the world", "zh-TW": "撰寫世界", ja: "ワールドを書く" },
  toWorld: { en: "Continue to the world", "zh-TW": "前往世界設定", ja: "ワールドへ進む" },
  toStory: { en: "Continue to the story", "zh-TW": "繼續寫故事", ja: "ストーリーへ進む" },
  toBuild: { en: "Continue to build", "zh-TW": "前往建立", ja: "作成へ進む" },
  buildAndPlay: { en: "Build and play", "zh-TW": "建立並開始玩", ja: "作って遊ぶ" },

  // ── Built: the world is published (BuiltPanel, when a lineage market is set up) ─────────────
  builtHeading: {
    en: "Your world is published",
    "zh-TW": "你的世界已經發布",
    ja: "ワールドを公開しました",
  },
  builtNote: {
    en: "You can give it an ENS name now, or later in Worlds → Cartridges. Entering never waits for it.",
    "zh-TW": "你可以現在幫它登記 ENS 名稱，也可以之後到「世界 → 卡帶」再登記。進入世界不必等它。",
    ja: "今 ENS 名を付けても、あとで「ワールド → カートリッジ」で付けてもかまいません。入るのに待つ必要はありません。",
  },
  builtNameHeading: {
    en: "Its ENS name (optional)",
    "zh-TW": "它的 ENS 名稱（可略過）",
    ja: "ENS 名（任意）",
  },
  builtReading: {
    en: "Reading the published world…",
    "zh-TW": "正在讀取已發布的世界…",
    ja: "公開したワールドを読み込んでいます…",
  },
  enterWorld: { en: "Enter the world", "zh-TW": "進入世界", ja: "ワールドに入る" },
  backToTitle: { en: "Back to the title", "zh-TW": "回到標題畫面", ja: "タイトルに戻る" },
  replace: { en: "Replace", "zh-TW": "取代", ja: "置き換える" },
  keepMine: { en: "Keep mine", "zh-TW": "保留我的", ja: "自分のを残す" },
  needsWords: {
    en: "Say in a few words what this land is first.",
    "zh-TW": "請先用幾個字說說這片大地是什麼樣的地方。",
    ja: "まず、この大地がどんな場所かを少し書いてください。",
  },
  needsChoice: {
    en: "Choose above first: update it, or keep it as it is.",
    "zh-TW": "請先在上方選擇：更新，或保留原樣。",
    ja: "まず上で選んでください：更新するか、このままにするか。",
  },

  // ── Step 1: the idea ───────────────────────────────────────────────────────────────────────
  worldName: { en: "World name", "zh-TW": "世界名稱", ja: "ワールド名" },
  worldNameOptional: {
    en: "World name (optional: taken from your words when blank)",
    "zh-TW": "世界名稱（選填：留白時從你的描述取名）",
    ja: "ワールド名（任意：空欄ならあなたの言葉から付けます）",
  },
  intent: {
    en: "In one sentence, what is this land?",
    "zh-TW": "用一句話說說，這片大地是什麼樣的地方？",
    ja: "この大地はどんな場所？ ひとことで",
  },
  story: {
    en: "Your own story (optional): who you are, what happens, how it ends — material for the world and its chapters",
    "zh-TW": "你自己的故事（選填）：你是誰、發生了什麼、怎麼結束——世界與章節的素材",
    ja: "あなた自身のストーリー（任意）：あなたは誰で、何が起き、どう終わるか。ワールドと章の素材になります",
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
  ideaWritten: {
    en: "The world and story were written from this idea. Changing the sentence, your story, the language or the play style will ask whether to update them.",
    "zh-TW":
      "世界與故事是依這個構想寫成的。修改那句話、你的故事、語言或玩法時，會詢問你要不要更新它們。",
    ja: "ワールドとストーリーはこのアイデアから書かれました。ひとこと・ストーリー・言語・遊び方を変えると、更新するかどうかを尋ねます。",
  },

  // ── Step 4: build ──────────────────────────────────────────────────────────────────────────
  buildWhat: {
    en: "Building writes the place you wake in, publishes the world and opens it. Only this step publishes; until then everything stays a draft.",
    "zh-TW":
      "建立時會寫出你醒來的地方、發布世界並開啟它。只有這一步會發布；在那之前一切都只是草稿。",
    ja: "作成すると、目覚める場所を書き、ワールドを公開して開きます。公開するのはこの手順だけで、それまではすべて下書きです。",
  },
  buildLanguage: { en: "Language", "zh-TW": "語言", ja: "言語" },
  buildChapters: { en: "{n} {n|chapter|chapters}", "zh-TW": "{n} 章", ja: "{n} 章" },
  rules: { en: "Rules", "zh-TW": "規則", ja: "ルール" },
  rulesPeaceful: {
    en: "No fighting: chapters are meetings, searches, climbs and mazes.",
    "zh-TW": "沒有戰鬥：章節是相遇、搜尋、攀登和迷宮。",
    ja: "戦闘なし：章は出会い・探索・クライム・迷宮です。",
  },
  rulesFighting: {
    en: "Fighting on: you start with {weapon} ({damage} damage, reach {range}); you have {hp} HP, monsters {base} HP + {per} per level.",
    "zh-TW":
      "開啟戰鬥：一開始持有{weapon}（傷害 {damage}，距離 {range}）；你有 {hp} HP，怪物 {base} HP，每一級再 +{per}。",
    ja: "戦闘あり：{weapon}を持って始めます（ダメージ {damage}、射程 {range}）。自分は HP {hp}、モンスターは HP {base}＋レベルごとに {per}。",
  },
  defaultGun: { en: "a gun", "zh-TW": "一把槍", ja: "銃" },
  defaultBlade: { en: "a blade", "zh-TW": "一把刀劍", ja: "剣" },
} as const satisfies Record<string, Phrase>;

export const CREATE = {
  ...CREATE_FRAME,
  ...CREATE_WORLD,
  ...CREATE_LOOK,
  ...CREATE_STORY,
} as const satisfies Record<string, Phrase>;
