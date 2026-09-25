# Demo 前準備

照這頁做完，三個版本的 demo（[總體](overall.md)、[ENS](track-ens.md)、[Uniswap](track-uniswap.md)）都能直接上。

## 1. 金鑰：`.env` 是預設的後備

AI 生成需要一把模型金鑰。app 找金鑰的順序只有一條（`src/main/inference/keyStore.ts` 的 `resolveApiKey`）：

1. 在「系統 → 模型」輸入過的金鑰（存在 OS 鑰匙圈加密的檔案裡）；
2. 沒有、或那把讀不出來（鑰匙圈鎖住、檔案壞了）→ 用 `.env` 的 `OPENAI_API_KEY`。

所以最穩的做法是：**把金鑰放在 repo 根目錄的 `.env`，畫面上不要另外存**。全新的資料夾打開 app 時，看到 `.env` 有 `OPENAI_API_KEY` 就會預設選 OpenAI（`defaultConfig`，`src/main/inference/config.ts`）；沒有才會找 Apple 裝置端模型或本機 llama.cpp。

```bash
# .env（已在 .gitignore，永遠不要 commit）
OPENAI_API_KEY=sk-...
# 鏈（只有第 4 幕、ENS／Uniswap 版需要；只給 main 行程讀）
UNWRITTEN_PRIVATE_KEY=0x...        # 中繼器付 Sepolia gas，玩家不用錢包
UNWRITTEN_LINEAGE_...              # 由 ENSv2 那邊的 docs/demo/lineage-market.md 提供
```

- 圖片（AI Worlds 的素材、第二段的概念圖）用同一把 OpenAI 金鑰，走同一條解析路徑。
- 金鑰只在 main 行程；畫面（renderer）永遠拿不到（Rule 6）。
- 打包版會依序找：app 目錄、app 資料夾（userData）、目前目錄的 `.env`（`src/main/env.ts`）。

## 2. 兩個視窗、兩份乾淨的資料

demo 一律用拋棄式資料夾，不要用自己平常玩的存檔。

```bash
PORT=4444 node node_modules/y-webrtc/bin/server.js
```

```bash
AETHER_TEST_USER_DATA="$TMPDIR/demo-a" bun run dev --remoteDebuggingPort 9333
```

```bash
AETHER_TEST_USER_DATA="$TMPDIR/demo-b" bun run dev --remoteDebuggingPort 9334
```

三個指令各開一個終端機。A 是主講人的世界，B 是「朋友」。

**信令伺服器**：兩個視窗都到「系統 → 信令伺服器」填 `ws://127.0.0.1:4444` → 測試連線（會顯示握手與轉送毫秒數）→ 儲存到這台裝置。預設的公開伺服器 `wss://y-webrtc-eu.fly.dev` 可用、`wss://y-webrtc.fly.dev` 在我們的量測裡 5 次都沒回應（[signaling 紀錄](../e2e/milestone-rev6-followup-signaling/result.md)）。兩台不同的電腦就要用公開伺服器，或把本機伺服器開在兩台都連得到的位址。

## 3. 開場前 10 分鐘

| 要準備的 | 為什麼 |
| --- | --- |
| A 先建好一個世界（同樣輸入「沙漠裡的鐘錶城」）並走出原點一次 | 第 1 幕的備援：模型慢就直接「繼續」 |
| 留一個方向不要走 | 第 2 幕要走進還沒見證的霧 |
| B 用「新遊戲」開內建世界，等原點顯影完成 | 第 3 幕 B 要有自己的世界才能加入大陸 |
| 兩個視窗並排、字體放大 | 台下看得到 HUD 的「已連線 · 1 位夥伴」 |
| 開好 Sepolia 的 Etherscan 分頁（合約地址見 `contracts/README.md`） | 第 4 幕、鏈上版的備援 |
| 市場：根世界 `aether-land.unmapped.eth` 已經拍賣完成、池子已開 | ENSv2 那邊負責，見 `docs/demo/lineage-market.md` |

## 4. 出狀況時

| 狀況 | 怎麼辦 |
| --- | --- |
| 模型沒回應／很慢 | 第 1 幕改用事先建好的世界；第 2 幕說「這裡正在寫」然後繼續講 CRDT，回頭再看 |
| 金鑰錯誤畫面（`no-api-key` 之類） | 檢查 `.env` 的 `OPENAI_API_KEY`；「系統 → 模型」會顯示金鑰來源是「.env」還是「已存」 |
| 大陸一直「連線中…」 | 約 20 秒後會變成錯誤並附提示；照提示到「系統 → 信令伺服器」換成本機伺服器 |
| 鏈上交易卡住 | 切 Etherscan 分頁講已完成的交易；前三幕不受影響（鏈可以整個關掉） |

## 5. 排練

排練紀錄放在 `docs/e2e/milestone-demo-flow/`（`run.json` 可以用 `scripts/cdp-drive.ts` 重播）。每次換版本（例如第二段上線）都要重跑一次，確認按鈕名稱和秒數。
