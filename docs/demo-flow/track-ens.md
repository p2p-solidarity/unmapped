# ENS 聚焦版：Best Use of ENSv2（$6,000）

給誰：ENS 的評審。他們只想知道一件事：**ENSv2 是不是產品的核心，而不是裝飾。**
所以這版只花 30 秒講遊戲，其餘時間都在「名字」上。

## 評審看什麼（獎項頁，2026-09-26 讀取）

| 要求 | 我們的對應 | 狀態 |
| --- | --- | --- |
| 建在 ENSv2（Sepolia）上 | 所有讀取走 ENSv2 Universal Resolver（`src/main/chain/ensCalls.ts` 的 `ENSV2_SEPOLIA`，不寫死地址）；合約部署在 Sepolia 的 `unmapped.eth` 底下 | 已部署（[lineage-market](../e2e/milestone-lineage-market/result.md) Live deploy 一節） |
| ENSv2 是核心、不是裝飾 | 世界的名字就是它的身分：名字 → 內容雜湊 → 本機重算比對；改編＝子名稱；權利金付給名字的持有人，名字轉手、收款人跟著換。名字也在遊戲裡：HUD 顯示這趟旅程的名字，過一章就提示把名字更新到新進度，朋友輸入存檔的名字就能走進你的大陸 | 遊戲內的名字、過關更新、用名字加入大陸都已實機驗證（[milestone-ens-in-game](../e2e/milestone-ens-in-game/result.md)）；名字轉手只在模擬中驗過 |
| 功能要真的能動，不能寫死 | 名字、紀錄、代幣、拍賣都是鏈上現查；app 開啟「用 ENS 名稱開啟」時現場解析 | 讀取已實機驗證；根世界的拍賣、結算、交易、分潤在 app 內用真實交易跑過（[milestone-lineage-demo](../e2e/milestone-lineage-demo/result.md)） |
| 階層式 registry：萬用字元解析子名稱，或部署自己的子名稱 registry | 名字先有：卡帶 `<cartridge>.unmapped.eth`、改編 `<remix>.<parent>.unmapped.eth`、存檔 `<save>.<cartridge>.unmapped.eth`（由玩家的 passkey 帳戶持有）；每個世界有自己的子名稱 registry | v2 在 Sepolia 上真實登記了根世界、一個改編、一個存檔；限制條件在模擬中通過 |
| Enhanced Access Control（角色權限） | registry 只保留 `REGISTRAR` 與 `SET_PARENT`，不持有任何會讓名字「未解放」的角色，所以每個世界的名字都是可安全轉移的 ERC-1155 | 模擬中 `isEmancipated() = true`，安全轉移成功 |
| Permissioned Resolver | registry 部署時自己開一個 Permissioned Resolver，只有 registry 能寫；文字紀錄是 `unwritten.cartridge`／`unwritten.version`／`unwritten.hash`（存檔再加 `unwritten.save`／`unwritten.progress`），存檔名稱的標準 `description` 記著門牌 | 真實登記（[milestone-lineage-names](../e2e/milestone-lineage-names/result.md)、[milestone-ens-in-game](../e2e/milestone-ens-in-game/result.md)） |
| 強調 AI agent 整合 | AI 寫出來的世界一發布就有雜湊；名字是「這份 AI 生成內容是誰、從哪一版改來的」的公開出處 | 敘事，見下方腳本 |
| live demo 連結、GitHub 開源 | repo 公開：github.com/p2p-solidarity/unmapped；live 連結：https://unmapped-auction.gimmychang.workers.dev（唯讀、直接讀 Sepolia） | 完成 |

有報名 Continuity Track 的話，另一個獎是「Best Integration of ENSv2 into an Existing Project」（$4,000），條件相同再加「目標是既有專案的測試網部署」。同一份腳本可以用，開場多一句「這是一個本來就在做的遊戲，ENSv2 讓它的世界有了可轉移的身分」。

## 腳本（約 4 分鐘）

名字先有、市場後有（v2，name-first）：卡帶、改編、存檔、玩家都先拿到 ENSv2 名字，要不要拍賣是另一件事。這版的重點是：**名字在遊戲裡，不只在選單裡。**

| 時間 | 做什麼 | 說什麼 |
| --- | --- | --- |
| 0:00–0:40 | 創造世界：輸入「霧之港」和一句話 → 建立 → 「你的世界已經發布」面板：自動標籤是 `xn-9iq609e681a-…`，改成 `misty-harbor` → 用 passkey 登記名稱（先排練：建立要約 1 分鐘，可先建好停在這個面板） | 「AI 剛寫完一個世界。它的內容算成一個 sha256 雜湊——那是它的身分，但人記不住。所以建完的第一件事是給它一個 ENSv2 名字。中文名字沒辦法直接當標籤，玩家自己挑一個。」 |
| 0:40–1:10 | 同一個面板 → 上架到市場（條款：100 萬枚、一半進 Uniswap 池、拍賣約 20 分鐘） | 「名字有了，玩家自己就能把它上市場，不需要錢包：passkey 簽名、代付站付 gas。代幣和 Uniswap 拍賣接在已經存在的名字上。」 |
| 1:10–1:50 | 進入世界：HUD 玩家卡片上是 `misty-harbor.unmapped.eth`；走到第一章入口，跟三個人說話、找到東西 → 過關卡片「要把這趟旅程記錄到 ENS 嗎？」→ 用 passkey 記錄 → HUD 變成存檔的名字 ✓ | 「名字不是選單裡的設定，是遊戲的一部分：每過一章，這趟旅程的名字就可以往前移到新的進度點。鏈上只有雜湊、版本、一行進度和門牌。」 |
| 1:50–2:30 | 朋友的 app：世界 → 大陸 → 輸入 `<存檔名>.misty-harbor.unmapped.eth` → 穿過這扇門 → 1–2 秒後出現在同一片大陸 | 「朋友不用記六碼門牌：存檔的名字的 description 就寫著門牌，app 用 Universal Resolver 讀出來再加入。」 |
| 2:30–3:10 | 卡帶 → 無界之地 → 改編 → 發布 → 名字自動掛在 `aether-land.unmapped.eth` 底下 → 登記 → 上架（底價用父世界的代幣） | 「改編就是父名字底下的子名字，拍賣用父世界的代幣計價；交易的權利金沿著家族樹往上付給每個名字的持有人。」 |
| 3:10–3:40 | 世界 → 市場：三個世界；切到公開拍賣頁的家族樹 | 「registry 只保留兩個角色，每個名字都是解放的 ERC-1155，可以安全轉手——轉手之後權利金跟著新持有人。」（轉手只在模擬驗過，不要現場做。） |
| 3:40–4:00 | 回到遊戲 | 「對 AI 生成的內容來說，最難的是出處：誰做的、從哪一版來、玩到哪裡。ENSv2 的階層正好就是血緣，連一趟旅程都有自己的位置。」 |

玩家自己的名字（`<名字>.players.unmapped.eth`，在「世界 → 市場」領取，之後在大陸上別人看到的就是這個名字）需要操作者先登記一次 `players.unmapped.eth` 目錄（`bun run lineage:demo players`）；登記並實機驗證之前，不要放進 demo。

操作細節（按鈕、簽名、要等多久）以 `docs/demo/lineage-market.md` 為準。

### 鏈上現況（v2，Sepolia 真實交易：[milestone-lineage-names](../e2e/milestone-lineage-names/result.md)、[milestone-lineage-relay](../e2e/milestone-lineage-relay/result.md)）

| 項目 | 狀態 |
| --- | --- |
| 新的 name-first 合約：registry `0xda8051e3…dAf6`、hook `0x59FA49D9…a044`、router `0x2201fBDB…39BE`；`unmapped.eth` 已指向新樹（舊 v1 合約還在，但不在名字樹上） | Sepolia 上真實部署 |
| 根世界 `aether-land.unmapped.eth`（aether-land 1.3.0）重新發行 | 真實 |
| 改編卡帶 `moss-hollow.aether-land.unmapped.eth`（app 內用 passkey 登記） | 真實 |
| 存檔 `kidney-run.aether-land.unmapped.eth`，由玩家的 PasskeyAccount 持有（app 內用 passkey 記錄） | 真實 |
| 名字不帶市場、改編不能早於父世界發行、陌生人不能改別人的存檔名、存檔底下不能再開名字 | 在 Sepolia 真實合約上模擬通過 |
| 權利金付給名字持有人 | v2 上真實：5.338 AETHERLAND 付給名字持有人（`0xa2efd93f…86bd`）；v1 上也做過 |
| 備份在另一台機器還原後，靠雜湊自己找回存檔名字；「用 ENS 名稱開啟」存檔名稱顯示「aether-land@1.3.0 的一個存檔：0 chapters cleared · 1 deed」 | 實機驗證（milestone-lineage-names 第 10–11 步） |
| 名字轉手後權利金付給新持有人 | 只在模擬中 |
| 建完世界立刻登記 `misty-harbor.unmapped.eth`（中文名「霧之港」自選標籤），並在 app 內由持有人上市（`launch` 5,126,613 gas，代付站支付） | 真實（[milestone-ens-in-game](../e2e/milestone-ens-in-game/result.md) 第 3–5 步） |
| 過第一章在遊戲內記錄 `my-save.misty-harbor.unmapped.eth`（帶門牌 GEC2AA），過第二章更新到 2 chapters cleared | 真實（第 7–8、18–19 步） |
| 從「改編」按鈕做出 `lantern-quay`，名字掛在 `aether-land.unmapped.eth` 底下並上市，以 AETHERLAND 計價 | 真實（第 9–14 步；過程中修了兩個讓改編無法發布或無法遊玩的問題） |
| 朋友輸入存檔名稱加入大陸：1.6 秒看到對方 | 真實（第 16 步） |

**可以講的故事**：我們一開始撞到 ENSv2 的 `TransferUnsafeUntilRegistryIsEmancipated`——registry 手上還握著能改指向的角色，名字就不能安全轉手。於是改成每個世界都有自己的子名稱 registry，registry 只留兩個角色，連我們自己的合約都無法收回或改指向任何名字。

**live 連結**：https://unmapped-auction.gimmychang.workers.dev ——唯讀的「Lineage Auction House」，直接讀 Sepolia（清算價曲線、出價、池子、家族樹），不需要錢包。

**簽名與 gas（上台前一定要知道）**：Electron 開發版叫不出 Touch ID，所以 app 會開 Chrome／Safari 的本機頁面完成那一次簽名；E2E 用的是虛擬驗證器，**真的按 Touch ID 還沒測過，上台前在 demo 用的 Mac 排練一次**。付 gas 的是 Cloudflare 上的 gas station（app 裡不放私鑰）；金鑰已設好（部署的 Worker 已送出第一筆真實交易），上台前打開 https://unmapped-relay.gimmychang.workers.dev/status 確認 relayer 不是 null、還有 ETH。

## 要講清楚、不能講過頭的

- 可以說：卡帶、改編、存檔的名字都在 Sepolia 上用 app 真實登記過；玩家可以在 app 裡把自己的世界上市；拍賣、結算在 v2 上真實發生；三代分帳與名字轉手只在 Sepolia 真實合約上模擬通過。
- 在 app 裡上市要用新版代付站：`bun run relay:deploy` 部署之前，線上的代付站會拒絕 `launch`。
- 「用 ENS 名稱開啟」輸入存檔名稱顯示進度點已實機驗證；E2E 用的是虛擬驗證器，上台前在 demo 用的 Mac 排練一次真的簽名。
