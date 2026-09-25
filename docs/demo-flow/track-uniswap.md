# Uniswap 聚焦版：Best Uniswap Stack Contribution（$6,000）

給誰：Uniswap Foundation 的評審。他們看的是：**用了 Uniswap 堆疊的哪一塊、做得多深、有沒有好好回饋開發體驗。**
這版的主角是「世界的血緣市場」：CCA 拍賣定價 → 畢業成 v4 池 → hook 沿血緣分權利金 → router 一次走完整條血緣。

## 評審看什麼（獎項頁，2026-09-26 讀取）

| 要求 | 我們的對應 | 狀態 |
| --- | --- | --- |
| 建在 Uniswap 堆疊上（API、v2/v3/v4、CCA、新的 v4 hook……） | Continuous Clearing Auction（經 liquidity-launcher 的 LBPStrategy v3.1.0、CCA factory v2.1.0，Uniswap 自己在 Sepolia 的部署）＋ 自寫的 v4 hook `LineageHook` ＋ 多跳 `LineageRouter` | 合約已真實部署（[lineage-market](../e2e/milestone-lineage-market/result.md)）；三代流程模擬通過 |
| 公開 GitHub、開源 | github.com/p2p-solidarity/unmapped（公開） | 完成 |
| `FEEDBACK.md` | [`FEEDBACK.md`](../../FEEDBACK.md)：做了什麼、順利的地方、9 個實際卡住的點、9 條給 CCA 的建議 | 完成 |
| 填 Uniswap Developer Feedback Form | 要由團隊的人自己填 | **缺（人做）** |
| README 清楚指到相關合約與行號 | `contracts/README.md` 有檔案與地址，還沒有行號；ENSv2 那邊負責補 | **缺** |

沒有 `FEEDBACK.md` 的作品在發獎前會被額外審查。Feedback Form 一定要由團隊的人自己填；可以直接照 `FEEDBACK.md` 的「Where we got stuck」與「Suggestions for CCA」填。有報名 Continuity Track 的話，另一個獎（$4,000）條件完全相同。

## 我們做了什麼（講給 Uniswap 的人聽的版本）

| 合約 | 用到 Uniswap 的哪裡 | 一句話 |
| --- | --- | --- |
| `contracts/src/lineage/LineageRegistry.sol` | 透過 LBPStrategy 開 CCA | 每個新世界的代幣用它「父世界的代幣」計價拍賣，價格由市場清算，不是我們定 |
| `contracts/src/lineage/LineageHook.sol` | v4 hook：`beforeInitialize`、`afterSwap`、`afterSwapReturnDelta` | 只有 LBPStrategy 能開世界的池子；每次交易抽 1%，依代數 50／30／20 往上分；`claim` 付給 ENS 名字的持有人 |
| `contracts/src/lineage/LineageRouter.sol` | 在一次 unlock 裡多跳 | 用 MockUSDC 買孫世界的代幣，一筆交易走完三跳 |
| `contracts/src/lineage/LaunchTypes.sol` | 對齊 liquidity-launcher v3.1.0／CCA v2.1.0 的結構 | 一個欄位都不差，才能直接呼叫官方部署 |

模擬中量到的數字（Sepolia 真實合約上的 `eth_simulateV1`）：用 10 MockUSDC 買第二代 `mushroom`，兩跳，拿到 3,260.384 MUSHROOM；每一跳 1% 權利金，第二跳 30／70 分給父世界與自己；第三代 `night` 三跳，20／30／50 分給祖父、父、自己，份額完全精確。

## 腳本（約 4 分鐘）

| 時間 | 做什麼 | 說什麼 |
| --- | --- | --- |
| 0:00–0:30 | A 在大地上走，一塊新地顯影 | 「玩家用幾個字就能做出一個 AI 世界，也能改編別人的世界。改編會形成血緣。我們想讓血緣上的每一代都分到後代的價值。」 |
| 0:30–1:20 | 市場：根世界 `aether-land.unmapped.eth` 的拍賣紀錄與畢業後的池子 | 「每個世界的代幣先用 Uniswap 的 Continuous Clearing Auction 賣，價格由出價清算，而且用父世界的代幣計價——子世界值多少，是用父世界的單位量的。」 |
| 1:20–2:20 | 現場發行一個改編世界、出價（passkey 簽名；見下方「簽名的限制」） | 「玩家沒有錢包、沒有 ETH；簽名的是 passkey 帳戶，gas 由我們的中繼器付。」 |
| 2:20–3:20 | 用 MockUSDC 沿血緣買一個子世界的代幣，然後看每一代累積的權利金 | 「router 在一次 unlock 裡走完整條血緣；每一跳，我們的 v4 hook 在 `afterSwap` 抽 1%，依 50／30／20 往上分。」 |
| 3:20–3:50 | 領取權利金 | 「錢付給 ENS 名字的持有人，不是寫死的地址——名字轉手，權利金跟著走。」 |
| 3:50–4:00 | 收尾 | 「CCA 負責公平定價，v4 hook 負責血緣分潤；這兩塊都是 Uniswap 堆疊。我們卡過的九個地方和對 CCA 的建議寫在 `FEEDBACK.md`——最想要的是：每個版本一個介面套件，和把人類價格換成 Q96 的 helper。」 |

市場畫面的按鈕與等待時間以 ENSv2 那邊的 `docs/demo/lineage-market.md` 為準（例如改編世界的拍賣大約 10 分鐘，現場發行後要接一個事先拍賣完的世界來示範交易）。app 入口：「世界」→「市場」。

### 鏈上現況（Sepolia 真實交易，[milestone-lineage-demo](../e2e/milestone-lineage-demo/result.md)）

| 項目 | 狀態 |
| --- | --- |
| 根世界 `aether-land.unmapped.eth` 的 CCA 拍賣（LBPStrategy v3.1.0＋CCA factory v2.1.0） | **已結束**：5 筆 passkey 出價，清算價 0.018395 USDC（底價 0.009999，**+84%**），募得 9,070 USDC，50 萬顆全數領走 |
| 結算並畢業成 v4 池（app 的「結算拍賣」，不需簽名，中繼器付 gas） | 5 × `exitBid`＋5 × `claimTokens`＋`graduate`（`0x218ae77b…f6bb`） |
| 用 passkey 經池子買入 10 USDC（系統瀏覽器簽名） | 買到 535.39 AETHERLAND，hook 抽 5.408——**剛好 1%**（`0x0aca30e5…d55f`） |
| 發放分潤給 ENS 名字的持有人 | 5.408 AETHERLAND 付給 `0x8eEC…51C3`（`0x3161c788…d819`）。根世界是第一代，所以 1% 全歸它；50／30／20 的三代分帳看 `bun run lineage:market --dry-run` |
| 3 跳買入的權利金 7.30／10.95／18.25（50／30／20 精確） | 只在模擬中 |
| 玩家不需要錢包：passkey 擁有一個 PasskeyAccount，main 組好批次、passkey 簽摘要、中繼器只付 gas；鏈上用 OpenZeppelin WebAuthn＋EIP-7951 P-256 precompile 驗章 | precompile 驗章在 Sepolia 上真實通過；重放、竄改、別的 passkey 在模擬中都被拒 |

**台上的圖**：公開的唯讀拍賣頁 https://unmapped-auction.gimmychang.workers.dev（現在顯示 GRADUATED · POOL OPEN）畫出清算價逐塊上升、出價（標 PASSKEY）、池子與家族樹，比 Etherscan 好講。操作手冊：`docs/demo/lineage-market.md`。

**現場要出價**：根世界的池子已經開了，要現場示範拍賣就先發行一個新的改編世界：`bun run lineage:demo launch <label> --parent 0x5e8e39c25cEa96F3ED4d6B03c1fc17213453ae7f --blocks 50`（約 10 分鐘）。中繼器 `0x8eEC…51C3` 的 Sepolia ETH 要維持在 0.02 以上。

**簽名**：Electron 開發版叫不出 Touch ID，所以 app 會在 Chrome／Safari 開一個本機頁面完成那一次簽名。E2E 用的是虛擬驗證器，**真的用手指按 Touch ID 還沒測過——上台前在 demo 用的 Mac 上排練一次**。

## 要講清楚、不能講過頭的

- 可以說：合約已在 Sepolia 真實部署；發行、拍賣、畢業、多跳交易、權利金、名字轉手、四種拒絕情境已在真實合約上模擬通過。
- 模擬裡每場拍賣只有一個出價者，清算價從沒高過底價；Sepolia 上根世界的真實拍賣有 5 筆出價，清算價從底價 0.009999 推到 0.018395（+84%）。畢業失敗（`MigrationFailed`）和 exact-output 交易沒有跑過。被問到價格發現時照實說。
- 已知限制（評審可能問）：registry 持有的全範圍流動性目前不能提出，LP 手續費也沒人收；沒用到的 LP 儲備歸世界擁有者。
- 可以說「app 裡用 passkey 出價、結算、買入、發放分潤都在 Sepolia 真實交易過」；三代分帳與名字轉手仍只在模擬中。
