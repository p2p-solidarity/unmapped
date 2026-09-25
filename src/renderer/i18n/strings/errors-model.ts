// Errors about the model: reaching it, the local servers the app starts for it, and what it wrote
// once every repair round has failed. The DSL codes only reach the player after those repairs, so
// their words describe the program without assuming who wrote it.

import type { ErrorText } from "./errors";
import { HINT } from "./errors-hints";

const MODEL_SCENE: ErrorText = {
  message: {
    en: "The scene the model wrote could not be used.",
    "zh-TW": "模型寫出的場景無法使用。",
    ja: "モデルが書いたシーンは使えませんでした。",
  },
  hint: HINT.retryModel,
};

export const MODEL_ERRORS: Record<string, ErrorText> = {
  // ── Reaching the model ──────────────────────────────────────────────────────────────────────
  "model-context-too-small": {
    message: {
      en: "This task needs more room than the local model has.",
      "zh-TW": "這項任務超過了本地模型的上下文容量。",
      ja: "このタスクはローカルモデルのコンテキスト容量を超えています。",
    },
    hint: {
      en: "Choose a larger context or Cloud API in System → Model.",
      "zh-TW": "請到「系統 → 模型」加大上下文或改用雲端 API。",
      ja: "「システム → モデル」でコンテキストを増やすかクラウド API に切り替えてください。",
    },
  },
  "connection-refused": {
    message: {
      en: "Could not reach the model.",
      "zh-TW": "無法連線到模型。",
      ja: "モデルに接続できません。",
    },
    hint: {
      en: "Start the model server (llama-server, Ollama or Apple's fm), or check the endpoint in System → Model.",
      "zh-TW":
        "請啟動模型伺服器（llama-server、Ollama 或 Apple 的 fm），或到「系統 → 模型」檢查端點。",
      ja: "モデルのサーバー（llama-server・Ollama・Apple の fm）を起動するか、「システム → モデル」でエンドポイントを確認してください。",
    },
  },
  auth: {
    message: {
      en: "The model provider rejected the API key.",
      "zh-TW": "模型供應商拒絕了這把 API 金鑰。",
      ja: "モデルのプロバイダーが API キーを拒否しました。",
    },
    hint: {
      en: "Enter a valid key in System → Model, or check the key in .env.",
      "zh-TW": "請到「系統 → 模型」輸入有效金鑰，或檢查 .env 裡的金鑰。",
      ja: "「システム → モデル」で有効なキーを入力するか、.env のキーを確認してください。",
    },
  },
  "key-unreadable": {
    message: {
      en: "The saved API key could not be read.",
      "zh-TW": "讀不到已儲存的 API 金鑰。",
      ja: "保存した API キーを読み込めませんでした。",
    },
    hint: {
      en: "Open System → Model, remove the saved key and enter it again.",
      "zh-TW": "請到「系統 → 模型」移除已存的金鑰後重新輸入。",
      ja: "「システム → モデル」で保存したキーを削除し、入力し直してください。",
    },
  },
  "key-storage-unavailable": {
    message: {
      en: "This computer's keychain encryption is not available.",
      "zh-TW": "這台電腦的鑰匙圈加密目前無法使用。",
      ja: "このコンピュータのキーチェーン暗号化を利用できません。",
    },
    hint: {
      en: "Unlock the OS keychain and restart, or use a key from .env.",
      "zh-TW": "請解鎖作業系統鑰匙圈後重新啟動，或改用 .env 裡的金鑰。",
      ja: "OS のキーチェーンを解除して再起動するか、.env のキーを使ってください。",
    },
  },
  "no-api-key": {
    message: {
      en: "An API key is missing.",
      "zh-TW": "缺少 API 金鑰。",
      ja: "API キーが設定されていません。",
    },
    hint: {
      en: "Enter a key in System → Model, or add it to .env.",
      "zh-TW": "請到「系統 → 模型」輸入金鑰，或將金鑰加入 .env。",
      ja: "「システム → モデル」でキーを入力するか、.env に追加してください。",
    },
  },
  "model-not-found": {
    message: {
      en: "The server does not offer the chosen model.",
      "zh-TW": "伺服器沒有提供所選的模型。",
      ja: "サーバーに選んだモデルがありません。",
    },
    hint: {
      en: "Check the connection in System → Model and pick a model the server offers.",
      "zh-TW": "請到「系統 → 模型」檢查連線，並選擇伺服器提供的模型。",
      ja: "「システム → モデル」で接続を確認し、サーバーが提供するモデルを選んでください。",
    },
  },
  provider: {
    message: {
      en: "The model provider returned an error.",
      "zh-TW": "模型供應商回傳了錯誤。",
      ja: "モデルのプロバイダーがエラーを返しました。",
    },
    hint: HINT.checkModel,
  },
  timeout: {
    message: {
      en: "The model did not answer in time.",
      "zh-TW": "模型沒有在時限內回應。",
      ja: "モデルが時間内に応答しませんでした。",
    },
    hint: {
      en: "Try a smaller model or a shorter context, or check the provider in System → Model.",
      "zh-TW": "請改用較小的模型或較短的上下文，或到「系統 → 模型」檢查供應商。",
      ja: "小さいモデルや短いコンテキストを試すか、「システム → モデル」でプロバイダーを確認してください。",
    },
  },
  "invalid-config": {
    message: {
      en: "The inference settings are not valid.",
      "zh-TW": "推論設定無效。",
      ja: "推論の設定が正しくありません。",
    },
    hint: {
      en: "The endpoint must be a full URL ending in /v1, with a known provider type.",
      "zh-TW": "端點必須是以 /v1 結尾的完整網址，且供應商必須是已知的類型。",
      ja: "エンドポイントは /v1 で終わる完全な URL で、既知のプロバイダー種別である必要があります。",
    },
  },
  "untrusted-config": {
    message: {
      en: "This endpoint or key source is not allowed.",
      "zh-TW": "不允許使用這個端點或金鑰來源。",
      ja: "このエンドポイントやキーの取得元は使えません。",
    },
    hint: {
      en: "Use a preset, a local server, or enter a custom endpoint's key in System → Model.",
      "zh-TW": "請使用預設選項、本機伺服器，或到「系統 → 模型」輸入自訂端點的金鑰。",
      ja: "プリセットかローカルサーバーを使うか、「システム → モデル」でカスタムエンドポイントのキーを入力してください。",
    },
  },
  "config-write-failed": {
    message: {
      en: "The inference settings could not be saved.",
      "zh-TW": "無法儲存推論設定。",
      ja: "推論の設定を保存できませんでした。",
    },
    hint: HINT.disk,
  },

  // ── Local servers: llama-server and Apple's fm ─────────────────────────────────────────────
  "no-sidecar-config": {
    message: {
      en: "This provider has no local server to start.",
      "zh-TW": "這個供應商沒有可以啟動的本機伺服器。",
      ja: "このプロバイダーには起動できるローカルサーバーがありません。",
    },
    hint: {
      en: "Choose the llama.cpp provider to let the app start llama-server for you.",
      "zh-TW": "請選擇 llama.cpp 供應商，讓應用程式替你啟動 llama-server。",
      ja: "llama.cpp プロバイダーを選ぶと、アプリが llama-server を起動します。",
    },
  },
  "binary-missing": {
    message: {
      en: "The local model server program was not found.",
      "zh-TW": "找不到本機模型伺服器的程式。",
      ja: "ローカルモデルのサーバープログラムが見つかりません。",
    },
    hint: {
      en: "Install llama.cpp (brew install llama.cpp); Apple's model needs a Mac with Apple Intelligence.",
      "zh-TW":
        "請安裝 llama.cpp（brew install llama.cpp）；Apple 的模型需要支援 Apple Intelligence 的 Mac。",
      ja: "llama.cpp をインストールしてください（brew install llama.cpp）。Apple のモデルには Apple Intelligence 対応の Mac が必要です。",
    },
  },
  "model-missing": {
    message: {
      en: "No .gguf model file was found at the chosen path.",
      "zh-TW": "在設定的路徑找不到 .gguf 模型檔案。",
      ja: "設定したパスに .gguf モデルファイルがありません。",
    },
    hint: {
      en: "Download a .gguf model and choose its file in System → Model.",
      "zh-TW": "請下載 .gguf 模型，並到「系統 → 模型」選擇模型檔案。",
      ja: ".gguf モデルをダウンロードし、「システム → モデル」でファイルを選んでください。",
    },
  },
  "sidecar-exited": {
    message: {
      en: "The local model server stopped before it was ready.",
      "zh-TW": "本機模型伺服器在準備好之前就停止了。",
      ja: "ローカルモデルのサーバーが準備完了前に停止しました。",
    },
    hint: {
      en: "Check the model file and free memory, then start it again.",
      "zh-TW": "請檢查模型檔案與可用記憶體，然後重新啟動。",
      ja: "モデルファイルと空きメモリを確認してから、もう一度起動してください。",
    },
  },
  "sidecar-timeout": {
    message: {
      en: "The local model server did not become ready in time.",
      "zh-TW": "本機模型伺服器沒有在時限內準備好。",
      ja: "ローカルモデルのサーバーが時間内に準備できませんでした。",
    },
    hint: {
      en: "The model may be too large for this Mac's memory; try a smaller model or a shorter context.",
      "zh-TW": "模型可能超出這台 Mac 的記憶體；請改用較小的模型或較短的上下文。",
      ja: "モデルがこの Mac のメモリには大きすぎるかもしれません。小さいモデルか短いコンテキストを試してください。",
    },
  },

  // ── Writing a scene ────────────────────────────────────────────────────────────────────────
  "no-suitable-provider": {
    message: {
      en: "No model is available to write this scene.",
      "zh-TW": "目前沒有可以寫這個場景的模型。",
      ja: "このシーンを書けるモデルがありません。",
    },
    hint: {
      en: "Start Apple's on-device model or llama.cpp, or set up an OpenAI-compatible endpoint in System → Model.",
      "zh-TW": "請啟動 Apple 的裝置端模型或 llama.cpp，或到「系統 → 模型」設定相容 OpenAI 的端點。",
      ja: "Apple のオンデバイスモデルか llama.cpp を起動するか、「システム → モデル」で OpenAI 互換のエンドポイントを設定してください。",
    },
  },
  "provider-generation-failed": {
    message: {
      en: "The model could not write this scene.",
      "zh-TW": "模型沒能寫出這個場景。",
      ja: "モデルがこのシーンを書けませんでした。",
    },
    hint: HINT.checkModel,
  },
  "scene-generation-failed": {
    message: {
      en: "Scene generation failed.",
      "zh-TW": "場景生成失敗。",
      ja: "シーンの生成に失敗しました。",
    },
    hint: HINT.checkModel,
  },
  "scene-source-invalid": MODEL_SCENE,
  "scene-draft-mismatch": MODEL_SCENE,
  "scene-draft-not-canonical": MODEL_SCENE,
  "causal-plan-invalid": MODEL_SCENE,
  "scene-validation-failed": {
    message: {
      en: "The scene does not hold together: things overlap or cannot be reached.",
      "zh-TW": "這個場景不成立：有東西重疊，或有地方到不了。",
      ja: "シーンが成り立っていません。物が重なっているか、たどり着けない場所があります。",
    },
    hint: {
      en: "Generate it again, or move the objects apart and open a path to each one.",
      "zh-TW": "請重新生成，或把物件分開，並替每一個打通路線。",
      ja: "もう一度生成するか、物を離して、それぞれへの道を開けてください。",
    },
  },
  "open-land-origin-invalid": {
    message: {
      en: "The starting place could not be built.",
      "zh-TW": "無法建立起點。",
      ja: "出発地点を作れませんでした。",
    },
    hint: HINT.retryModel,
  },
  "open-land-rules-invalid": {
    message: {
      en: "The game's rules could not be built.",
      "zh-TW": "無法建立遊戲規則。",
      ja: "ゲームのルールを作れませんでした。",
    },
    hint: HINT.bug,
  },
  "open-land-capabilities": {
    message: {
      en: "The open-land game could not be put together.",
      "zh-TW": "無法組成開放大地的遊戲。",
      ja: "オープンな大地のゲームを組み立てられませんでした。",
    },
    hint: HINT.bug,
  },

  // ── Programs still invalid after every repair round ────────────────────────────────────────
  "program-invalid": {
    message: {
      en: "The model did not write a readable program.",
      "zh-TW": "模型沒有寫出可讀取的程式。",
      ja: "モデルが読み取れるプログラムを書きませんでした。",
    },
    hint: HINT.retryModel,
  },
  "dsl-parse": {
    message: {
      en: "No readable program was found.",
      "zh-TW": "找不到可讀取的程式。",
      ja: "読み取れるプログラムが見つかりませんでした。",
    },
    hint: HINT.retryModel,
  },
  "dsl-incomplete": {
    message: {
      en: "The program stops in the middle.",
      "zh-TW": "程式在中途就斷掉了。",
      ja: "プログラムが途中で終わっています。",
    },
    hint: HINT.retryModel,
  },
  "dsl-wrong-root": {
    message: {
      en: "The program is not the kind that was asked for.",
      "zh-TW": "程式的種類和要求的不一樣。",
      ja: "プログラムの種類が、求めたものと違います。",
    },
    hint: HINT.retryModel,
  },
  "dsl-unresolved-reference": {
    message: {
      en: "The program uses names it never defines.",
      "zh-TW": "程式用到了沒有定義的名稱。",
      ja: "プログラムが、定義していない名前を使っています。",
    },
    hint: HINT.retryModel,
  },
  "dsl-invalid-name": {
    message: {
      en: "The program named some of its parts in a script the game cannot read.",
      "zh-TW": "程式用遊戲讀不懂的文字替某些部分命名。",
      ja: "プログラムが、ゲームの読めない文字で一部に名前を付けています。",
    },
    hint: HINT.retryModel,
  },
  "dsl-orphaned-statement": {
    message: {
      en: "The program defines parts it never uses.",
      "zh-TW": "程式定義了從未使用的部分。",
      ja: "プログラムに、使われていない部分があります。",
    },
    hint: HINT.retryModel,
  },
  "dsl-invalid-props": {
    message: {
      en: "Some parts of the program have values the game cannot use.",
      "zh-TW": "程式裡有些部分的數值，遊戲無法使用。",
      ja: "プログラムの一部に、ゲームで使えない値があります。",
    },
    hint: HINT.retryModel,
  },
  "dsl-duplicate-id": {
    message: {
      en: "The program gives the same id to more than one thing.",
      "zh-TW": "程式把同一個 id 用在不只一個東西上。",
      ja: "プログラムが、同じ ID を複数のものに付けています。",
    },
    hint: HINT.retryModel,
  },
  "dsl-missing-floor": {
    message: {
      en: "The scene has no floor to stand on.",
      "zh-TW": "場景沒有可以站立的地面。",
      ja: "シーンに立つための床がありません。",
    },
    hint: HINT.retryModel,
  },
  "dsl-no-choices": {
    message: {
      en: "The conversation gives the player nothing to answer.",
      "zh-TW": "這段對話沒有讓玩家回應的選項。",
      ja: "会話に、プレイヤーが答える選択肢がありません。",
    },
    hint: HINT.retryModel,
  },
  "dsl-invalid-bible": {
    message: {
      en: "The model could not write a valid world bible.",
      "zh-TW": "模型沒能寫出有效的世界設定集。",
      ja: "モデルが正しい世界設定を書けませんでした。",
    },
    hint: HINT.retryModel,
  },
  "dsl-invalid-chapter": {
    message: {
      en: "The chapter program is not valid.",
      "zh-TW": "章節的程式無效。",
      ja: "章のプログラムが正しくありません。",
    },
    hint: HINT.retryModel,
  },
  "dsl-invalid-chunk": {
    message: {
      en: "The model could not write valid land for this area.",
      "zh-TW": "模型沒能替這個區塊寫出有效的大地。",
      ja: "モデルがこのチャンクの大地を正しく書けませんでした。",
    },
    hint: HINT.retryModel,
  },
  "dsl-invalid-errands": {
    message: {
      en: "The errands program is not valid.",
      "zh-TW": "委託的程式無效。",
      ja: "依頼のプログラムが正しくありません。",
    },
    hint: HINT.retryModel,
  },
  "dsl-invalid-mesh-dna": {
    message: {
      en: "The model could not describe how this item looks.",
      "zh-TW": "模型沒能描述這個道具的外觀。",
      ja: "モデルがこのアイテムの見た目を記述できませんでした。",
    },
    hint: HINT.retryModel,
  },
  "dsl-origin-unfit": {
    message: {
      en: "The starting place the model wrote is not fit to start in.",
      "zh-TW": "模型寫出的起點不適合開始遊戲。",
      ja: "モデルが書いた出発地点は、ゲームを始める場所に向いていません。",
    },
    hint: HINT.retryModel,
  },
  "dsl-invalid-rules": {
    message: {
      en: "The gameplay rules are incomplete or unclear.",
      "zh-TW": "遊戲規則不完整或不明確。",
      ja: "ゲームのルールが不完全か、あいまいです。",
    },
    hint: HINT.repairCartridge,
  },
  "turn-max-steps": {
    message: {
      en: "The model kept using tools without answering.",
      "zh-TW": "模型一直在使用工具，卻沒有給出回答。",
      ja: "モデルがツールを使い続け、答えを返しませんでした。",
    },
    hint: HINT.retryModel,
  },
  "empty-resolution": {
    message: {
      en: "The resident said nothing and did nothing.",
      "zh-TW": "這位居民什麼也沒說，什麼也沒做。",
      ja: "住人は何も言わず、何もしませんでした。",
    },
    hint: HINT.retryModel,
  },

  // ── Stories ────────────────────────────────────────────────────────────────────────────────
  "story-kind-unknown": {
    message: {
      en: "A chapter asks for a kind of play this game does not have.",
      "zh-TW": "有章節要求這個遊戲沒有的玩法。",
      ja: "この遊びにない種類の遊び方を求める章があります。",
    },
    hint: {
      en: "Give it meet, search, fight, climb or maze.",
      "zh-TW": "請改成相遇、搜尋、戰鬥、攀登或迷宮。",
      ja: "出会い・探索・戦闘・クライム・迷宮のどれかにしてください。",
    },
  },
  "story-kind-fight": {
    message: {
      en: "A chapter is a fight, but this game has no fighting.",
      "zh-TW": "有章節是戰鬥，但這個遊戲沒有戰鬥。",
      ja: "戦闘の章がありますが、この遊びには戦闘がありません。",
    },
    hint: {
      en: "Change that chapter's kind, or choose a play style with fighting.",
      "zh-TW": "請修改那一章的種類，或改選有戰鬥的玩法。",
      ja: "その章の種類を変えるか、戦闘ありの遊び方を選んでください。",
    },
  },
  "story-reply-invalid": {
    message: {
      en: "The model's story plan is incomplete.",
      "zh-TW": "模型寫出的故事規劃不完整。",
      ja: "モデルが書いたストーリーの構成が不完全です。",
    },
    hint: HINT.retryModel,
  },
  "story-next-invalid": {
    message: {
      en: "The model's next chapter is incomplete.",
      "zh-TW": "模型寫出的下一章不完整。",
      ja: "モデルが書いた次の章が不完全です。",
    },
    hint: HINT.retryModel,
  },
  "story-invalid": {
    message: {
      en: "This world's story file is damaged.",
      "zh-TW": "這個世界的故事檔案已損毀。",
      ja: "このワールドのストーリーファイルが壊れています。",
    },
    hint: HINT.reinstall,
  },
  "story-ended": {
    message: {
      en: "The story has reached its last chapter.",
      "zh-TW": "故事已經到了最後一章。",
      ja: "ストーリーは最後の章に達しました。",
    },
  },
  "story-no-model": {
    message: {
      en: "No model is set up, so the next chapter is not written ahead.",
      "zh-TW": "還沒有設定模型，所以不會預先寫好下一章。",
      ja: "モデルが設定されていないため、次の章は先に書かれません。",
    },
    hint: {
      en: "Set up a provider in System → Model. Walking and chapters already played still work.",
      "zh-TW": "請到「系統 → 模型」設定供應商。走動和已玩過的章節仍然可以進行。",
      ja: "「システム → モデル」でプロバイダーを設定してください。歩き回ることと、プレイ済みの章はそのまま遊べます。",
    },
  },
  "story-model-offline": {
    message: {
      en: "The model cannot be reached, so the next chapter is not written ahead.",
      "zh-TW": "無法連線到模型，所以不會預先寫好下一章。",
      ja: "モデルに接続できないため、次の章は先に書かれません。",
    },
    hint: {
      en: "Start the model or check the provider in System → Model, then press Retry.",
      "zh-TW": "請啟動模型，或到「系統 → 模型」檢查供應商，然後按「重試」。",
      ja: "モデルを起動するか「システム → モデル」でプロバイダーを確認してから、「リトライ」を押してください。",
    },
  },
};
