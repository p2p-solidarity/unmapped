# ENS 聚焦版：Best Use of ENSv2（$6,000）

給誰：ENS 的評審。他們只想知道一件事：**ENSv2 是不是產品的核心，而不是裝飾。**
所以這版只花 30 秒講遊戲，其餘時間都在「名字」上。

## 評審看什麼（獎項頁，2026-09-26 讀取）

| 要求 | 我們的對應 | 狀態 |
| --- | --- | --- |
| 建在 ENSv2（Sepolia）上 | 所有讀取走 ENSv2 Universal Resolver（`src/main/chain/ensCalls.ts` 的 `ENSV2_SEPOLIA`，不寫死地址）；合約部署在 Sepolia 的 `unmapped.eth` 底下 | 已部署（[lineage-market](../e2e/milestone-lineage-market/result.md) Live deploy 一節） |
| ENSv2 是核心、不是裝飾 | 世界的名字就是它的身分：名字 → 內容雜湊 → 本機重算比對；改編＝子名稱；權利金付給名字的持有人，名字轉手、收款人跟著換 | 設計完成；名字轉手只在模擬中驗過 |
| 功能要真的能動，不能寫死 | 名字、紀錄、代幣、拍賣都是鏈上現查；app 開啟「用 ENS 名稱開啟」時現場解析 | 讀取已實機驗證；發行與認領待 ENSv2 那邊的 E2E |
| 階層式 registry：萬用字元解析子名稱，或部署自己的子名稱 registry | 每個世界發行時，`LineageRegistry` 為它部署一個自己的改編 registry；子世界的名字掛在父世界底下（`mushroom.zelda.<label>.eth`） | 模擬三代全數通過；真實發行進行中 |
| Enhanced Access Control（角色權限） | registry 只保留 `REGISTRAR` 與 `SET_PARENT`，不持有任何會讓名字「未解放」的角色，所以每個世界的名字都是可安全轉移的 ERC-1155 | 模擬中 `isEmancipated() = true`，安全轉移成功 |
| Permissioned Resolver | 卡帶名稱用 `ens:setup` 部署的 Permissioned Resolver；文字紀錄只有 `unwritten.cartridge`／`unwritten.version`／`unwritten.hash` | 模擬通過（[ensv2-cartridge-names](../e2e/milestone-ensv2-cartridge-names/result.md)） |
| 強調 AI agent 整合 | AI 寫出來的世界一發布就有雜湊；名字是「這份 AI 生成內容是誰、從哪一版改來的」的公開出處 | 敘事，見下方腳本 |
| live demo 連結、GitHub 開源 | repo 公開：github.com/p2p-solidarity/unmapped；live 連結由 ENSv2 那邊做唯讀的鏈上瀏覽頁（或 Etherscan＋影片） | 待定 |

有報名 Continuity Track 的話，另一個獎是「Best Integration of ENSv2 into an Existing Project」（$4,000），條件相同再加「目標是既有專案的測試網部署」。同一份腳本可以用，開場多一句「這是一個本來就在做的遊戲，ENSv2 讓它的世界有了可轉移的身分」。

## 腳本（約 4 分鐘）

| 時間 | 做什麼 | 說什麼 |
| --- | --- | --- |
| 0:00–0:30 | A 在大地上走一段，一塊新地顯影 | 「這是一個 AI 邊走邊寫的世界。每次發布，整個世界的內容會算成一個 sha256 雜湊——這就是它的身分。問題是：雜湊人記不住，也沒有主人。」 |
| 0:30–1:15 | 標題 → 卡帶 → 選內建世界，指著名稱那一行 | 「所以每個版本都有一個 ENSv2 名字，例如 `aether-land.unmapped.eth`。名字上只有三筆文字紀錄：哪個世界、哪一版、哪個雜湊。內容本身不上鏈。」 |
| 1:15–1:50 | 「用 ENS 名稱開啟」→ 輸入名字 → 開到那一版 | 「這不是寫死的：app 用 Universal Resolver 走 ENSv2 的樹，拿到雜湊，再跟本機的卡帶比對，對得上才開。」再輸入一個沒有卡帶紀錄的名字（例如 `nick.eth`），畫面說「這個名稱沒有指向任何卡帶」。 |
| 1:50–2:50 | 市場：從根世界發行一個改編世界（ENSv2 那邊的畫面，Touch ID） | 「改編一個世界，就是在它的名字底下開一個子名稱。發行那一刻，registry 替這個新世界部署一個自己的子名稱 registry，所以改編的改編可以一直往下長。」現場解析新的子名稱，顯示它指向新世界的代幣與雜湊。 |
| 2:50–3:30 | 指出權利金領取（claim）與名字持有人 | 「名字不是裝飾：交易的權利金付給名字的持有人。registry 只保留兩個角色，名字是解放的 ERC-1155，可以安全轉手；轉手之後，錢就付給新的持有人。」（轉手目前只在模擬驗過——講的時候說「我們在模擬裡跑過」，不要現場做。） |
| 3:30–4:00 | 回到遊戲 | 「對 AI 生成的內容來說，最難的是出處：誰做的、從哪一版來、改了什麼。ENSv2 的階層正好就是血緣。」 |

操作細節（按鈕、Touch ID、要等多久）以 ENSv2 那邊的 `docs/demo/lineage-market.md` 為準；它還沒寫好之前，1:50 之後改成開 Etherscan 講模擬紀錄。

## 要講清楚、不能講過頭的

- 可以說：讀取與「用名稱開啟」已在 app 內實機跑過；三代發行、拍賣、畢業、交易、權利金、名字轉手已在 Sepolia 真實合約上模擬通過；市場合約已真實部署。
- 在 ENSv2 那邊的 E2E 綠燈之前，不要說「玩家已經在 app 裡發行過世界」。
- 「用 ENS 名稱開啟 → 對到版本 → 開始玩」這條分支，還沒有在鏈上有真名字時實機看過；根世界發行後要補排練。
