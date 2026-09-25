# AFM3 生成遊戲 DSL 的可行性

研究里程碑：AFM／DSL 可行性

## 結論先行

方向有一半是對的：**可以用 Apple 的第三代 Foundation Models 來生成這個專案的 DSL，但目前不能把 AFM 3 Cloud 當成一般雲端模型，自行對它訓練或掛載 LoRA。**

- Apple 已開放第三方 app 透過 `PrivateCloudComputeLanguageModel()` 使用 PCC 上的 Apple server model；它支援 32K context、reasoning、guided generation 與 tool calling。[Apple PCC 開發者文件](https://developer.apple.com/documentation/foundationmodels/adding-server-side-intelligence-with-private-cloud-compute)
- 公開 API 沒有 AFM 3 Cloud／Cloud Pro 的 model ID 選擇，也不是 OpenAI-compatible HTTP API。它只有由 OS 管理的 `PrivateCloudComputeLanguageModel()` 入口；因此不能假設 app 可指定 Cloud Pro，或取得模型權重。[`PrivateCloudComputeLanguageModel`](https://developer.apple.com/documentation/FoundationModels/PrivateCloudComputeLanguageModel) · [`init()`](https://developer.apple.com/documentation/foundationmodels/privatecloudcomputelanguagemodel/init%28%29)
- Apple 公開的 LoRA adapter training 是給**裝置端 system language model**。目前最後一版 toolkit 是 26.0.0，Apple 明確標示不相容 macOS/iOS/iPadOS/visionOS 27；因此，查核到的官方資料未提供 AFM3／OS 27 adapter 訓練路徑，更沒有 PCC cloud model 的 LoRA 掛載 API。[Apple Foundation Models adapter training](https://developer.apple.com/apple-intelligence/foundation-models-adapter/)
- 對本專案最實用的方式不是先做 LoRA，而是讓 AFM 透過 guided generation 產生**型別化 AST**，再由 deterministic serializer 輸出 OpenUI Lang，最後仍交給現有 parser 與 limits 驗證。這能保留 `CLAUDE.md` 的「DSL is the truth, model is a guest」。
- 建議保留 Qwen 3.5 4B 作為 Windows、離線與無 Apple Intelligence 裝置的 backend；macOS 可新增 AFM on-device route，PCC 僅用於長上下文或複雜規劃，不要放進每個 chunk／每次對話的高頻 hot path。

## Apple 實際提供了什麼

Apple 公布的 AFM3 家族有兩個裝置端模型，以及三個 PCC server model：AFM 3 Core、AFM 3 Core Advanced、AFM 3 Cloud、ADM 3 Cloud（Image）和 AFM 3 Cloud Pro。Cloud 是 server-side workhorse；Cloud Pro 服務較困難的 agentic tool use 與 complex reasoning。[Apple ML Research：Introducing the Third Generation of Apple’s Foundation Models](https://machinelearning.apple.com/research/introducing-third-generation-of-apple-foundation-models)

但是「Apple 內部有這些模型」不等於「開發者能逐一選它們」：

| 路徑 | 公開給第三方的介面 | 適合本專案 | 限制 |
| --- | --- | --- | --- |
| 裝置端 Apple model | `SystemLanguageModel` | 短 DSL、對話、分類、抽取；離線與高頻 | Apple Intelligence 裝置與支援地區；context 較小；OS 決定實際 model version |
| Apple PCC server model | `PrivateCloudComputeLanguageModel()` | 長世界狀態、複雜規劃、多工具工作流 | OS 27+、網路、每日 per-user quota、managed entitlement、Apple Intelligence 裝置 |
| AFM 3 Cloud／Cloud Pro 權重 | 沒有公開 checkpoint 或自行部署介面 | 不適用 | 公開 API 沒有 model ID／checkpoint／fine-tune endpoint |
| 自己的模型 | Foundation Models `LanguageModel` protocol、Core AI 或 MLX | 可帶自己的 Qwen／LoRA model | 權重、認證、計費與部署由開發者負責 |

Apple 對 PCC 的公開 API 是單一 `PrivateCloudComputeLanguageModel()` initializer，而不是讓 app 指定 `AFM 3 Cloud` 或 `AFM 3 Cloud Pro`。因此較準確的產品描述應是「使用 Apple Foundation Model on Private Cloud Compute」，不要承諾使用者固定得到 Cloud Pro。[Apple API reference](https://developer.apple.com/documentation/FoundationModels/PrivateCloudComputeLanguageModel)

Apple 官方比較如下：裝置端可離線、沒有 request limit；PCC 必須連網、有每日額度、32K context 且支援三種 reasoning level。兩者使用相同的 `LanguageModelSession` API，structured output 和 tools 也可沿用。[Apple WWDC26：Build with the new Apple Foundation Model on Private Cloud Compute](https://developer.apple.com/videos/play/wwdc2026/319/)

## LoRA：能做的與不能做的

### 能做：OS 26 裝置端 adapter

Apple 的 adapter toolkit 確實使用 LoRA：凍結 base model weights，只更新 low-rank adapter weights。官方建議 basic task 約 100–1,000 筆資料，complex task 約 5,000 筆以上；訓練機需要至少 32 GB memory 的 Apple silicon Mac，或 Linux GPU。輸出的 `.fmadapter` 約 160 MB，部署時需要 Foundation Models Framework Adapter Entitlement。[Apple adapter training](https://developer.apple.com/apple-intelligence/foundation-models-adapter/)

但它有幾個重要成本：

- 每個 adapter 只相容單一 system model version；OS model 更新時要重訓。
- 訓練權重只允許用於 adapter training，不能當一般可部署 base model。
- Apple 建議先試 prompt engineering 或 tool calling，只有準確率／一致性仍不夠時才上 adapter。
- 公開 toolkit 26.0.0 是最後一版，僅相容 OS 26，明確不相容 OS 27 及之後版本。

### 不能做：AFM3 Cloud／PCC LoRA

目前 Apple 沒有公開下列能力：

- 下載 AFM 3 Cloud 或 AFM 3 Cloud Pro 的 weights；
- 上傳 LoRA 到 PCC；
- 以 API fine-tune PCC model；
- 在 `PrivateCloudComputeLanguageModel()` 選擇 custom adapter 或指定 Cloud／Cloud Pro。

AFM3 研究文章提到 Apple 自己對 ADM 3 Cloud image model 使用 specialized adapters，這描述的是 Apple 的內部產品訓練／部署方式，不是第三方 adapter API。[Apple AFM3 研究文章](https://machinelearning.apple.com/research/introducing-third-generation-of-apple-foundation-models)

所以「AFM3 雲端版 + 我們的 LoRA」目前不是可落地的產品路線。如果現在就一定要 LoRA，應該微調可取得權重的模型（例如目前的 Qwen 路線），再分別透過 Windows 的 llama.cpp 與 macOS 的 Core AI／MLX 或既有 OpenAI-compatible server 執行。

## 不用 LoRA，也能可靠產 DSL 嗎？

可以，且 Apple 的 guided generation 很適合此任務，但要區分「結構正確」與「遊戲語意正確」。

Foundation Models 的 `@Generable`、`@Guide` 與 `DynamicGenerationSchema` 使用 constrained sampling，讓生成結果符合 Swift type／schema；字串還可用 regex、enum、range、array count 等 guide 約束。[Generating Swift data structures with guided generation](https://developer.apple.com/documentation/foundationmodels/generating-swift-data-structures-with-guided-generation) · [`GenerationGuide`](https://developer.apple.com/documentation/foundationmodels/generationguide)

這能保證欄位與型別等**結構**，但不能自動保證：

- entity reference 一定存在；
- 地圖一定連通或可通關；
- NPC、道具、出口在遊戲語意上合理；
- 所有 OpenUI Lang wiring 與本專案 limits 都成立。

因此不要要求模型直接吐一大段 unrestricted `.oui`，也不要把 Apple schema 當成 parser 的替代品。建議 pipeline：

1. 從現有 `sceneLibrary`／`dialogueLibrary`／`itemLibrary` 對應出可生成的 typed AST schema。
2. AFM 以 guided generation 產生 AST；enum、數值範圍、陣列上限盡量在 schema 層收窄。
3. 用 deterministic serializer 把 AST 轉成 canonical OpenUI Lang source。
4. 照舊呼叫 `parseScene`／`parseDialogue`／`parseItem` 與 `LIMITS`。
5. 對 semantic error 做最多兩次 repair，維持目前專案規則。

Apple 也支援 tool calling；parser／validator 可以包成 tool，把錯誤回饋給模型做 repair。不過對單次 DSL 生成，直接產 AST → serialize → parse 通常比讓 agent 自主決定何時 call tool 更可預測。[Apple WWDC25：Deep dive into the Foundation Models framework](https://developer.apple.com/videos/play/wwdc2025/301/)

Apple 文件提供 string regex constraint，但沒有公開等價於 llama.cpp GBNF 的任意 context-free grammar API。因此完整 OpenUI Lang 約束應放在 typed AST 與本專案 parser，而不是嘗試用一個巨大 regex 取代 grammar。

## 對目前 Electron 架構的影響

目前 `src/main/inference` 假設 provider 是 OpenAI-compatible endpoint。Apple Foundation Models 並不是 `baseURL + API key` 型服務，所以無法只加一筆 preset：

- macOS 端需要一個 Swift native helper／native module，呼叫 `FoundationModels`，再透過 IPC 把 streaming events 與 typed output 回給 Electron main process。
- Apple 官方 Python SDK 只描述 macOS 上的**裝置端** system model；它可作研究與 batch evaluation，但不是 PCC 的跨平台 gateway。[Apple 官方 `python-apple-fm-sdk`](https://github.com/apple/python-apple-fm-sdk)
- Windows 仍需 Qwen／Ollama／llama.cpp／其他 OpenAI-compatible endpoint。
- Provider interface 應該統一「prompt、schema、stream、usage、availability、abort」，不要假設所有 provider 都有 OpenAI chat-completions request shape。

PCC 還有產品與發佈限制。Apple 目前要求開發者加入 App Store Small Business Program、所有 app 的 first-time downloads 少於 200 萬，並取得 managed PCC entitlement；正式使用是在 App Store 發佈的 app，TestFlight／ad hoc 是測試路徑。若超過門檻或不再符合 Small Business Program，需在六個月內遷移。[Apple：Accessing Private Cloud Compute](https://developer.apple.com/private-cloud-compute/)

這代表目前強調自我託管／自由散佈的 Electron app，**不能把 PCC 當唯一 backend**。即使 macOS build 能橋接 Foundation Models，也必須先確認簽章、entitlement 與 Mac App Store 發佈策略。

## 建議的模型路由

| 場景 | 建議 backend | 原因 |
| --- | --- | --- |
| Windows | Qwen 3.5 4B + grammar + parser | 跨平台、可自託管、可做自己的 LoRA |
| macOS，高頻短 DSL | AFM on-device + guided AST | 離線、沒有 request limit；不需要下載 Qwen weights |
| macOS，長世界歷史／複雜跨模組規劃 | PCC（有 entitlement 時） | 32K context、reasoning、tool calling |
| 無 Apple Intelligence、PCC quota 用完或斷網 | Qwen／使用者自帶 endpoint | 必要 fallback |

不要把 PCC 放在玩家每走到 chunk 邊界就一定呼叫的流程。每日 quota 與網路依賴會讓「無限世界」在額度用完時直接中斷。較合理的是由 PCC 低頻產生 world plan／quest arc，裝置端 AFM 或 Qwen 再高頻展開成小段 DSL。

## 建議下一步：先做 evaluation spike，不先訓練

1. 從現有 scene／dialogue／item fixture 建立 100–300 個 gold cases，加入 invalid／edge cases。
2. 比較三條路徑：Qwen + GBNF、AFM on-device + typed AST、PCC + typed AST。
3. 至少量測：首次成功 parse 率、semantic validity、repair 次數、p50/p95 latency、平均 output token、生成後可玩性評分。
4. AFM 測試先用 prompt + guided generation；若準確率已達標，就沒有 LoRA 的維護成本。
5. 若 OS 27 之後 Apple 重新推出相容 AFM3 的 adapter toolkit，再用相同 eval corpus 判斷 adapter 是否有統計顯著收益。

Apple 沒有公布這個 DSL workload 的 latency 或 tokens-per-second，因此不能只從「Cloud optimized for speed」推論它一定比本機 4B 更快。對這個專案，**compile rate、repair rate 與端到端 p95** 比模型參數量更有決策價值。

## 最終判斷

可以把 Apple Foundation Models 加入架構，而且 **guided generation 很可能比 LoRA 更早帶來價值**。但正確方案是：

> macOS 用 AFM on-device 產 typed AST；複雜任務才升級 PCC；Windows 保留 Qwen；所有結果都序列化成 OpenUI Lang 並由既有 parser 驗證。

不是：

> 下載或呼叫 AFM 3 Cloud，替它訓練一個 DSL LoRA，再把它當通用雲端 endpoint。

後者目前沒有 Apple 官方支援的權重、fine-tune 或 adapter 掛載介面。

