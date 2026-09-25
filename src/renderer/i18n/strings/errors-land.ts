// Errors met while playing: the land being written as you walk, chapters, places, notes, talking,
// the depths, moving between scenes, and rule tweaks.

import type { ErrorText } from "./errors";
import { HINT } from "./errors-hints";

const CHUNKS_BACKUP = {
  en: "Restore this save's chunks folder from a backup.",
  "zh-TW": "請從備份還原這個存檔的 chunks 資料夾。",
  ja: "このセーブの chunks フォルダーをバックアップから復元してください。",
};

const SCENE_SETUP: ErrorText = {
  message: {
    en: "This scene needs gameplay the cartridge does not set up.",
    "zh-TW": "這個場景需要的玩法，卡帶沒有設定。",
    ja: "このシーンに必要な遊び方が、カートリッジに設定されていません。",
  },
  hint: HINT.repairCartridge,
};

export const LAND_ERRORS: Record<string, ErrorText> = {
  // ── The land, written as you walk ──────────────────────────────────────────────────────────
  "witness-no-cartridge": {
    message: {
      en: "Only a cartridge world has land that is written as you walk.",
      "zh-TW": "只有卡帶世界的大地會隨著你走動寫出來。",
      ja: "歩くたびに大地が書かれるのは、カートリッジのワールドだけです。",
    },
    hint: {
      en: "Open a world from the cartridge library.",
      "zh-TW": "請從卡帶收藏庫開啟一個世界。",
      ja: "カートリッジのライブラリからワールドを開いてください。",
    },
  },
  "witness-no-bible": {
    message: {
      en: "This cartridge has no world bible, so its land stays unwritten.",
      "zh-TW": "這張卡帶沒有世界設定集，所以它的大地不會被寫出來。",
      ja: "このカートリッジには世界設定がないため、大地は書かれないままです。",
    },
    hint: {
      en: "Make a new world; cartridges published before this feature have no bible.",
      "zh-TW": "請建立新的世界；在這個功能之前發布的卡帶沒有世界設定集。",
      ja: "新しいワールドを作ってください。この機能より前に公開されたカートリッジには世界設定がありません。",
    },
  },
  "witness-peer": {
    message: {
      en: "You are visiting; the host's land is written by the host.",
      "zh-TW": "你正在拜訪別人的世界；房主的大地由房主來寫。",
      ja: "訪問中です。ホストの大地はホストが書きます。",
    },
    hint: {
      en: "Walk there together.",
      "zh-TW": "一起走過去吧。",
      ja: "一緒に歩いて行きましょう。",
    },
  },
  "witness-loading": {
    message: { en: "Reading the land…", "zh-TW": "正在讀取大地…", ja: "大地を読み込み中…" },
    hint: { en: "One moment.", "zh-TW": "請稍候。", ja: "少々お待ちください。" },
  },
  "witness-no-model": {
    message: {
      en: "No model is set up, so new land stays unwritten.",
      "zh-TW": "還沒有設定模型，所以新的大地不會被寫出來。",
      ja: "モデルが設定されていないため、新しい大地は書かれません。",
    },
    hint: {
      en: "Set up a provider in F12 → Inference. Walking still works.",
      "zh-TW": "請到「F12 → 推論」設定供應商。走動仍然可以進行。",
      ja: "「F12 → 推論」でプロバイダーを設定してください。歩き回ることはできます。",
    },
  },
  "witness-model-offline": {
    message: {
      en: "The model cannot be reached, so new land stays unwritten.",
      "zh-TW": "無法連線到模型，所以新的大地不會被寫出來。",
      ja: "モデルに接続できないため、新しい大地は書かれません。",
    },
    hint: {
      en: "Start the model or check the provider in F12 → Inference. Walking still works.",
      "zh-TW": "請啟動模型，或到「F12 → 推論」檢查供應商。走動仍然可以進行。",
      ja: "モデルを起動するか、「F12 → 推論」でプロバイダーを確認してください。歩き回ることはできます。",
    },
  },
  "witness-scene-invalid": {
    message: {
      en: "The land written for this area is not a valid scene.",
      "zh-TW": "替這個區塊寫出的大地不是有效的場景。",
      ja: "このチャンクに書かれた大地は、正しいシーンではありません。",
    },
    hint: HINT.writeAreaAgain,
  },
  "witness-dialogue-invalid": {
    message: {
      en: "A resident's words written for this area are not valid.",
      "zh-TW": "替這個區塊寫出的居民台詞無效。",
      ja: "このチャンクに書かれた住人のセリフが正しくありません。",
    },
    hint: HINT.writeAreaAgain,
  },
  "witness-dialogue-mismatch": {
    message: {
      en: "Not every resident written for this area has their own words.",
      "zh-TW": "替這個區塊寫出的居民，並不是每一位都有自己的台詞。",
      ja: "このチャンクに書かれた住人の全員が、自分のセリフを持っているわけではありません。",
    },
    hint: HINT.writeAreaAgain,
  },
  "witness-errands-invalid": {
    message: {
      en: "The errands written for this area do not fit it.",
      "zh-TW": "替這個區塊寫出的委託和這裡對不上。",
      ja: "このチャンクに書かれた依頼が、この場所に合っていません。",
    },
    hint: HINT.writeAreaAgain,
  },
  "witness-lore-invalid": {
    message: {
      en: "The lore written for this area does not fit the world.",
      "zh-TW": "替這個區塊寫出的傳說和這個世界對不上。",
      ja: "このチャンクに書かれた伝承が、ワールドに合っていません。",
    },
    hint: HINT.writeAreaAgain,
  },
  "witness-write-failed": {
    message: {
      en: "This area could not be saved.",
      "zh-TW": "無法儲存這個區塊。",
      ja: "このチャンクを保存できませんでした。",
    },
    hint: HINT.disk,
  },
  "chunk-already-witnessed": {
    message: {
      en: "This area was already written.",
      "zh-TW": "這個區塊已經寫過了。",
      ja: "このチャンクはすでに書かれています。",
    },
    hint: {
      en: "Reload the land; what was written first is what this place is.",
      "zh-TW": "請重新載入大地；最先寫下的內容就是這個地方的樣子。",
      ja: "大地を再読み込みしてください。最初に書かれた内容が、この場所の姿です。",
    },
  },
  "witnessed-chunk-invalid": {
    message: {
      en: "A written area of this save can no longer be read.",
      "zh-TW": "這個存檔裡已寫好的區塊無法再讀取。",
      ja: "このセーブの書かれたチャンクが読み込めなくなっています。",
    },
    hint: CHUNKS_BACKUP,
  },
  "land-read-failed": {
    message: {
      en: "The land of this save could not be read.",
      "zh-TW": "無法讀取這個存檔的大地。",
      ja: "このセーブの大地を読み込めませんでした。",
    },
    hint: HINT.readable,
  },
  "ledger-invalid": {
    message: {
      en: "A land record file in this save is damaged.",
      "zh-TW": "這個存檔裡的大地紀錄檔已損毀。",
      ja: "このセーブの大地の記録ファイルが壊れています。",
    },
    hint: HINT.backup,
  },

  // ── Chapters and places ────────────────────────────────────────────────────────────────────
  "chapter-no-land": {
    message: {
      en: "Chapters are played on open land.",
      "zh-TW": "章節要在開放的大地上遊玩。",
      ja: "章はオープンな大地で遊びます。",
    },
    hint: {
      en: "Open a story world.",
      "zh-TW": "請開啟一個有故事的世界。",
      ja: "ストーリーのあるワールドを開いてください。",
    },
  },
  "chapter-not-place": {
    message: {
      en: "This chapter is played on the land, around its gate.",
      "zh-TW": "這一章是在大地上、關口周圍遊玩的。",
      ja: "この章は大地の、ゲートの周りで遊びます。",
    },
  },
  "chapter-missing": {
    message: {
      en: "This world has no such chapter.",
      "zh-TW": "這個世界沒有這一章。",
      ja: "このワールドにその章はありません。",
    },
  },
  "chapter-dialogue-missing": {
    message: {
      en: "What this person says was not written.",
      "zh-TW": "這位居民要說的話沒有寫出來。",
      ja: "この住人のセリフは書かれていません。",
    },
    hint: {
      en: "Write this chapter again from its gate.",
      "zh-TW": "請從關口重新寫這一章。",
      ja: "ゲートからこの章をもう一度書いてください。",
    },
  },
  "chapter-too-large": {
    message: {
      en: "The model wrote more than a chapter can hold.",
      "zh-TW": "模型寫的內容超出一個章節能容納的量。",
      ja: "モデルが書いた内容が、1 つの章に収まる量を超えています。",
    },
    hint: HINT.tryAgain,
  },
  "place-full": {
    message: {
      en: "This land already holds as many places as it can.",
      "zh-TW": "這片大地的關卡已經滿了。",
      ja: "この大地にはこれ以上ステージを置けません。",
    },
  },
  "place-no-land": {
    message: {
      en: "Places are added to open land.",
      "zh-TW": "關卡只能加在開放的大地上。",
      ja: "ステージはオープンな大地に追加します。",
    },
    hint: {
      en: "Open a world with open land.",
      "zh-TW": "請開啟有開放大地的世界。",
      ja: "オープンな大地のあるワールドを開いてください。",
    },
  },
  "place-no-room": {
    message: {
      en: "There is no free ground near here for a place.",
      "zh-TW": "附近沒有空地可以放關卡。",
      ja: "近くにステージを置ける空き地がありません。",
    },
    hint: {
      en: "Walk somewhere more open, then try again.",
      "zh-TW": "請走到比較空曠的地方再試一次。",
      ja: "もっと開けた場所に移動してから、もう一度試してください。",
    },
  },
  "place-too-large": {
    message: {
      en: "The model wrote more than a place can hold.",
      "zh-TW": "模型寫的內容超出一個關卡能容納的量。",
      ja: "モデルが書いた内容が、1 つのステージに収まる量を超えています。",
    },
    hint: { en: "Ask again.", "zh-TW": "請再要求一次。", ja: "もう一度頼んでください。" },
  },
  "place-invalid": {
    message: {
      en: "This place's program is not valid.",
      "zh-TW": "這個關卡的程式無效。",
      ja: "このステージのプログラムが正しくありません。",
    },
    hint: {
      en: "Ask for the place again, or restore this save from a backup.",
      "zh-TW": "請重新要求這個關卡，或從備份還原這個存檔。",
      ja: "ステージをもう一度頼むか、このセーブをバックアップから復元してください。",
    },
  },

  // ── Notes left on the land ─────────────────────────────────────────────────────────────────
  "note-length": {
    message: {
      en: "A note cannot be empty or too long.",
      "zh-TW": "留言不能是空的，也不能太長。",
      ja: "メモは空にできず、長すぎてもいけません。",
    },
    hint: {
      en: "Keep it short, but not empty.",
      "zh-TW": "請寫短一點，但不要留空。",
      ja: "短く、でも空にはしないでください。",
    },
  },
  "note-nowhere": {
    message: {
      en: "Notes are left on open land.",
      "zh-TW": "留言只能留在開放的大地上。",
      ja: "メモはオープンな大地に残します。",
    },
    hint: {
      en: "Walk out into the land first.",
      "zh-TW": "請先走到大地上。",
      ja: "まず大地に出てください。",
    },
  },
  "note-no-room": {
    message: {
      en: "The host's world cannot be reached.",
      "zh-TW": "無法連到房主的世界。",
      ja: "ホストのワールドに接続できません。",
    },
    hint: {
      en: "Rejoin the room.",
      "zh-TW": "請重新加入房間。",
      ja: "ルームに参加し直してください。",
    },
  },
  "note-exists": {
    message: {
      en: "That note was already written.",
      "zh-TW": "這則留言已經寫過了。",
      ja: "そのメモはすでに書かれています。",
    },
    hint: HINT.reloadLand,
  },
  "note-contests-missing": {
    message: {
      en: "The note it answers is not in this world.",
      "zh-TW": "它要回應的留言不在這個世界裡。",
      ja: "返答先のメモがこのワールドにありません。",
    },
    hint: HINT.reloadLand,
  },
  "note-write-failed": {
    message: {
      en: "The note could not be saved.",
      "zh-TW": "無法儲存這則留言。",
      ja: "メモを保存できませんでした。",
    },
    hint: HINT.disk,
  },

  // ── Talking ────────────────────────────────────────────────────────────────────────────────
  "dialogue-unwritten": {
    message: {
      en: "What this resident says has not been written yet.",
      "zh-TW": "這位居民要說的話還沒寫出來。",
      ja: "この住人のセリフはまだ書かれていません。",
    },
    hint: {
      en: "A resident's words are written once, with their place; talking never asks the model.",
      "zh-TW": "居民的話只會在寫出他所在的地方時寫一次；對話時不會再問模型。",
      ja: "住人のセリフは、その場所が書かれるときに一度だけ書かれます。話しかけてもモデルには尋ねません。",
    },
  },
  "dialogue-invalid": {
    message: {
      en: "This resident's stored words can no longer be read.",
      "zh-TW": "這位居民存下的台詞無法再讀取。",
      ja: "この住人の保存されたセリフが読み込めなくなっています。",
    },
    hint: CHUNKS_BACKUP,
  },
  "no-genesis": {
    message: {
      en: "This world's covenant is not loaded.",
      "zh-TW": "這個世界的盟約沒有載入。",
      ja: "このワールドの誓約が読み込まれていません。",
    },
    hint: {
      en: "Reload the world so its genesis.json is read.",
      "zh-TW": "請重新載入世界，讓它讀取 genesis.json。",
      ja: "ワールドを再読み込みして、genesis.json を読み込ませてください。",
    },
  },
  "no-scene": {
    message: {
      en: "There is no floor loaded to talk on.",
      "zh-TW": "目前沒有載入任何一層，無法對話。",
      ja: "会話できる階が読み込まれていません。",
    },
    hint: {
      en: "Generate or reload the floor first.",
      "zh-TW": "請先生成或重新載入這一層。",
      ja: "先に階を生成するか、再読み込みしてください。",
    },
  },
  "npc-not-found": {
    message: {
      en: "That person is not on this floor.",
      "zh-TW": "這一層沒有這位居民。",
      ja: "その住人はこの階にいません。",
    },
    hint: {
      en: "The floor may have been rewritten; reload the world.",
      "zh-TW": "這一層可能被改寫過了，請重新載入世界。",
      ja: "階が書き換えられた可能性があります。ワールドを再読み込みしてください。",
    },
  },
  "no-world": {
    message: {
      en: "No world is loaded, so there is nothing to change.",
      "zh-TW": "沒有載入任何世界，所以沒有東西可以變更。",
      ja: "ワールドが読み込まれていないため、変更するものがありません。",
    },
    hint: {
      en: "Open a world first.",
      "zh-TW": "請先開啟一個世界。",
      ja: "先にワールドを開いてください。",
    },
  },
  "cartridge-immutable": {
    message: {
      en: "This scene belongs to a published cartridge and cannot change during play.",
      "zh-TW": "這個場景屬於已發布的卡帶，遊玩中無法變更。",
      ja: "このシーンは公開済みカートリッジのもので、プレイ中は変更できません。",
    },
    hint: {
      en: "Remix the cartridge from the library to edit its scenes.",
      "zh-TW": "要編輯場景，請在收藏庫改編這張卡帶。",
      ja: "シーンを編集するには、ライブラリでカートリッジをリミックスしてください。",
    },
  },

  // ── The depths and moving between scenes ───────────────────────────────────────────────────
  "endless-locked": {
    message: {
      en: "The depths open only after this cartridge's ending.",
      "zh-TW": "要在這張卡帶的結局之後，無盡深層才會開啟。",
      ja: "深層は、このカートリッジのエンディングの後に開きます。",
    },
    hint: {
      en: "Reach the ending gate first.",
      "zh-TW": "請先抵達結局的關口。",
      ja: "先にエンディングのゲートにたどり着いてください。",
    },
  },
  "endless-unavailable": {
    message: {
      en: "This cartridge has no scene you can walk in, so there are no depths below it.",
      "zh-TW": "這張卡帶沒有可以走動的場景，所以底下沒有無盡深層。",
      ja: "このカートリッジには歩けるシーンがないため、その下に深層はありません。",
    },
    hint: HINT.exactRevision,
  },
  "scene-prerequisite-missing": {
    message: {
      en: "You cannot enter there yet.",
      "zh-TW": "你還不能進入那裡。",
      ja: "まだそこには入れません。",
    },
    hint: {
      en: "Complete the objective or find the item it needs first.",
      "zh-TW": "請先完成目標，或找到需要的道具。",
      ja: "先に目標を達成するか、必要なアイテムを見つけてください。",
    },
  },
  "scene-transition-denied": {
    message: {
      en: "This scene has no exit to that place.",
      "zh-TW": "這個場景沒有通往那裡的出口。",
      ja: "このシーンには、そこへの出口がありません。",
    },
    hint: {
      en: "Leave through one of this scene's exits.",
      "zh-TW": "請從這個場景的出口離開。",
      ja: "このシーンの出口から出てください。",
    },
  },
  "scene-not-terminal": {
    message: {
      en: "This scene is not an ending, so it cannot finish the cartridge.",
      "zh-TW": "這個場景不是結局，無法結束這張卡帶。",
      ja: "このシーンはエンディングではないため、カートリッジを終えられません。",
    },
    hint: {
      en: "Leave through an exit to the next scene.",
      "zh-TW": "請從出口前往下一個場景。",
      ja: "出口から次のシーンへ進んでください。",
    },
  },
  "scene-save-mismatch": {
    message: {
      en: "The loaded scene does not match the save.",
      "zh-TW": "載入的場景和存檔對不上。",
      ja: "読み込んだシーンがセーブと一致しません。",
    },
    hint: {
      en: "Reload this save.",
      "zh-TW": "請重新載入這個存檔。",
      ja: "このセーブを再読み込みしてください。",
    },
  },
  "scene-contract-missing": {
    message: {
      en: "A published scene is missing its rules for moving on.",
      "zh-TW": "已發布的場景缺少前往下一處的規則。",
      ja: "公開済みのシーンに、次へ進むためのルールがありません。",
    },
    hint: HINT.repairCartridge,
  },
  "scene-context-mismatch": {
    message: {
      en: "The scene does not match the capabilities it was published with.",
      "zh-TW": "場景和發布時的功能設定不一致。",
      ja: "シーンが、公開時の機能設定と一致しません。",
    },
    hint: HINT.repairCartridge,
  },
  "scene-context-missing": {
    message: {
      en: "A capability setting this scene needs is missing.",
      "zh-TW": "缺少這個場景需要的功能設定。",
      ja: "このシーンに必要な機能設定がありません。",
    },
    hint: HINT.repairCartridge,
  },
  "scene-kit-missing": SCENE_SETUP,
  "gameplay-kit-missing": SCENE_SETUP,

  // ── Rule tweaks (the source words are Traditional Chinese; the player sees these) ──────────
  "tweak-unknown-timing": {
    message: {
      en: "The engine has no such timing.",
      "zh-TW": "引擎沒有這種節奏。",
      ja: "エンジンにそのタイミング設定はありません。",
    },
    hint: HINT.askAgain,
  },
  "tweak-unknown-weapon": {
    message: {
      en: "This cartridge has no such weapon.",
      "zh-TW": "這張卡帶沒有這把武器。",
      ja: "このカートリッジにその武器はありません。",
    },
    hint: HINT.askAgain,
  },
  "tweak-duplicate-weapon": {
    message: {
      en: "A weapon with that name already exists.",
      "zh-TW": "已經有同名的武器了。",
      ja: "同じ名前の武器がすでにあります。",
    },
    hint: {
      en: "Give the new weapon another name.",
      "zh-TW": "請替新武器取別的名字。",
      ja: "新しい武器に別の名前を付けてください。",
    },
  },
  "tweak-no-combat": {
    message: {
      en: "This cartridge has no combat, so a weapon would do nothing.",
      "zh-TW": "這張卡帶沒有戰鬥系統，加武器沒有意義。",
      ja: "このカートリッジには戦闘がないため、武器を加えても意味がありません。",
    },
  },
  "tweak-no-generation": {
    message: {
      en: "This cartridge's map is not generated.",
      "zh-TW": "這張卡帶的地圖不是生成的。",
      ja: "このカートリッジのマップは生成されたものではありません。",
    },
  },
  "tweak-empty": {
    message: {
      en: "This tweak changes nothing.",
      "zh-TW": "這個調整沒有任何實際變更。",
      ja: "この調整では何も変わりません。",
    },
    hint: {
      en: "Say it another way and try again.",
      "zh-TW": "換個說法再試一次。",
      ja: "言い方を変えて、もう一度試してください。",
    },
  },
  "tweak-invalid": {
    message: {
      en: "The model did not return a usable tweak.",
      "zh-TW": "模型沒有回傳可用的調整。",
      ja: "モデルが使える調整を返しませんでした。",
    },
    hint: {
      en: "Say it another way, or change one thing at a time.",
      "zh-TW": "換個說法，或一次只改一件事再試一次。",
      ja: "言い方を変えるか、一度に一つだけ変えて、もう一度試してください。",
    },
  },
};
