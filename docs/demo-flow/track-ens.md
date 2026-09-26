# ENS 聚焦版：Best Use of ENSv2（$6,000）

給誰：ENS 的評審。他們只想知道一件事：**ENSv2 是不是產品的核心，而不是裝飾。**
所以這版只花 30 秒講遊戲，其餘時間都在「名字」上。

## 評審看什麼（獎項頁，2026-09-26 讀取）

| 要求 | 我們的對應 | 狀態 |
| --- | --- | --- |
| 建在 ENSv2（Sepolia）上 | 所有讀取走 ENSv2 Universal Resolver（`src/main/chain/ensCalls.ts` 的 `ENSV2_SEPOLIA`，不寫死地址）；合約部署在 Sepolia 的 `unmapped.eth` 底下 | 已部署（[lineage-market](../e2e/milestone-lineage-market/result.md) Live deploy 一節） |
| ENSv2 是核心、不是裝飾 | 世界的名字就是它的身分：名字 → 內容雜湊 → 本機重算比對；改編＝子名稱；權利金付給名字的持有人，名字轉手、收款人跟著換 | 設計完成；名字轉手只在模擬中驗過 |
| 功能要真的能動，不能寫死 | 名字、紀錄、代幣、拍賣都是鏈上現查；app 開啟「用 ENS 名稱開啟」時現場解析 | 讀取已實機驗證；根世界的拍賣、結算、交易、分潤在 app 內用真實交易跑過（[milestone-lineage-demo](../e2e/milestone-lineage-demo/result.md)） |
| 階層式 registry：萬用字元解析子名稱，或部署自己的子名稱 registry | 名字先有：卡帶 `<cartridge>.unmapped.eth`、改編 `<remix>.<parent>.unmapped.eth`、存檔 `<save>.<cartridge>.unmapped.eth`（由玩家的 passkey 帳戶持有）；每個世界有自己的子名稱 registry | v2 在 Sepolia 上真實登記了根世界、一個改編、一個存檔；限制條件在模擬中通過 |
| Enhanced Access Control（角色權限） | registry 只保留 `REGISTRAR` 與 `SET_PARENT`，不持有任何會讓名字「未解放」的角色，所以每個世界的名字都是可安全轉移的 ERC-1155 | 模擬中 `isEmancipated() = true`，安全轉移成功 |
| Permissioned Resolver | 卡帶名稱用 `ens:setup` 部署的 Permissioned Resolver；文字紀錄只有 `unwritten.cartridge`／`unwritten.version`／`unwritten.hash` | 模擬通過（[ensv2-cartridge-names](../e2e/milestone-ensv2-cartridge-names/result.md)） |
| 強調 AI agent 整合 | AI 寫出來的世界一發布就有雜湊；名字是「這份 AI 生成內容是誰、從哪一版改來的」的公開出處 | 敘事，見下方腳本 |
| live demo 連結、GitHub 開源 | repo 公開：github.com/p2p-solidarity/unmapped；live 連結：https://unmapped-auction.gimmychang.workers.dev（唯讀、直接讀 Sepolia） | 完成 |

有報名 Continuity Track 的話，另一個獎是「Best Integration of ENSv2 into an Existing Project」（$4,000），條件相同再加「目標是既有專案的測試網部署」。同一份腳本可以用，開場多一句「這是一個本來就在做的遊戲，ENSv2 讓它的世界有了可轉移的身分」。

## 腳本（約 4 分鐘）

名字先有、市場後有（v2，name-first）：卡帶、改編、存檔都先拿到 ENSv2 名字，要不要拍賣是另一件事。

| 時間 | 做什麼 | 說什麼 |
| --- | --- | --- |
| 0:00–0:30 | A 在大地上走一段，一塊新地顯影 | 「這是一個 AI 邊走邊寫的世界。每次發布，整個世界的內容會算成一個 sha256 雜湊——這就是它的身分。問題是：雜湊人記不住，也沒有主人。」 |
| 0:30–1:10 | Worlds → Cartridges（世界 → 卡帶）：內建世界那一行顯示 `aether-land.unmapped.eth` · points at this version（指向這個版本）；選一個改編卡帶 → Name it with your passkey（用 passkey 登記名稱） | 「每個發布的版本都有一個 ENSv2 名字，紀錄只有：哪個世界、哪一版、哪個雜湊。改編就是父世界底下的子名稱，例如 `moss-hollow.aether-land.unmapped.eth`。不用拍賣，名字先有。」 |
| 1:10–1:50 | Worlds → Saves（世界 → 存檔）→ ENS name for this save（這個存檔的 ENS 名稱）→ 填存檔名稱 → Record with passkey（用 passkey 記錄）→ 玩一段 → Update to this checkpoint（更新到目前進度） | 「連玩家的存檔也有名字：`kidney-run.aether-land.unmapped.eth`，掛在它玩的那個世界底下、由玩家的 passkey 帳戶持有。紀錄是存檔的雜湊和進度，不是存檔本身。」 |
| 1:50–2:20 | 「用 ENS 名稱開啟」（Open by ENS name）輸入存檔名稱，畫面顯示那個存檔的進度點（先排練） | 「這不是寫死的：app 用 Universal Resolver 走 ENSv2 的樹，拿到雜湊再跟本機比對。備份在別台機器還原，也能靠雜湊找回自己的名字。」 |
| 2:20–3:20 | Worlds → Market（世界 → 市場）：根世界的拍賣結果、名字持有人（Name held by …）；切到公開拍賣頁的家族樹 | 「名字有了，要不要上市場是另一步：發行時才把代幣和拍賣接到已經存在的名字上，改編要等父世界先發行。registry 只保留兩個角色，每個名字都是解放的 ERC-1155，可以安全轉手；交易的權利金付給名字的持有人。」（轉手只在模擬驗過——講的時候說「我們在模擬裡跑過」，不要現場做。） |
| 3:20–4:00 | 回到遊戲 | 「對 AI 生成的內容來說，最難的是出處：誰做的、從哪一版來、玩到哪裡。ENSv2 的階層正好就是血緣，連存檔都有自己的位置。」 |

操作細節（按鈕、簽名、要等多久）以 `docs/demo/lineage-market.md` 為準。

### 鏈上現況（v2，ENSv2 session 2026-09-26 回報；最終 E2E 紀錄待補）

| 項目 | 狀態 |
| --- | --- |
| 新的 name-first 合約：registry `0xda8051e3…dAf6`、hook `0x59FA49D9…a044`、router `0x2201fBDB…39BE`；`unmapped.eth` 已指向新樹（舊 v1 合約還在，但不在名字樹上） | Sepolia 上真實部署 |
| 根世界 `aether-land.unmapped.eth`（aether-land 1.3.0）重新發行 | 真實 |
| 改編卡帶 `moss-hollow.aether-land.unmapped.eth`（app 內用 passkey 登記） | 真實 |
| 存檔 `kidney-run.aether-land.unmapped.eth`，由玩家的 PasskeyAccount 持有（app 內用 passkey 記錄） | 真實 |
| 名字不帶市場、改編不能早於父世界發行、陌生人不能改別人的存檔名、存檔底下不能再開名字 | 在 Sepolia 真實合約上模擬通過 |
| 權利金付給名字持有人 | v1 部署上真實發生（5.408 AETHERLAND 付給持有人）；v2 上待最終 E2E |
| 名字轉手後權利金付給新持有人 | 只在模擬中 |

**可以講的故事**：我們一開始撞到 ENSv2 的 `TransferUnsafeUntilRegistryIsEmancipated`——registry 手上還握著能改指向的角色，名字就不能安全轉手。於是改成每個世界都有自己的子名稱 registry，registry 只留兩個角色，連我們自己的合約都無法收回或改指向任何名字。

**live 連結**：https://unmapped-auction.gimmychang.workers.dev ——唯讀的「Lineage Auction House」，直接讀 Sepolia（清算價曲線、出價、池子、家族樹），不需要錢包。

**簽名與 gas（上台前一定要知道）**：Electron 開發版叫不出 Touch ID，所以 app 會開 Chrome／Safari 的本機頁面完成那一次簽名；E2E 用的是虛擬驗證器，**真的按 Touch ID 還沒測過，上台前在 demo 用的 Mac 排練一次**。付 gas 的是 Cloudflare 上的 gas station（app 裡不放私鑰），**它的金鑰要由你本人跑 `wrangler secret put` 設好**，否則 `/status` 會顯示 relayer null、所有鏈上動作都會失敗。

## 要講清楚、不能講過頭的

- 可以說：卡帶、改編、存檔的名字都在 Sepolia 上用 app 真實登記過；拍賣、結算在 v2 上真實發生；三代分帳與名字轉手只在 Sepolia 真實合約上模擬通過。
- v2 上的買入與分潤還沒做（v1 上做過）；最終 E2E 之前，講稿不要說「在新合約上買過」。
- 「用 ENS 名稱開啟」輸入存檔名稱顯示進度點，是 ENSv2 session 回報的功能；上台前排練一次。
