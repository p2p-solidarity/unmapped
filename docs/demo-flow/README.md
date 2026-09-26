# Demo：《無界之地》給 ETHGlobal Tokyo 2026

三個版本，同一個世界。先決定這次的評審是誰，再挑版本。

| 版本 | 給誰 | 長度 | 主角 | 檔案 |
| --- | --- | --- | --- | --- |
| 總體版 | 總評審、決賽、第一次聽到的人 | 約 4 分鐘 | AI 自動生成 → 走路不等 AI → 朋友的世界連成大陸（CRDT）→ 鏈上出處 | [overall.md](overall.md) |
| ENS 聚焦版 | ENS：Best Use of ENSv2（$6,000） | 約 4 分鐘 | 世界的名字＝身分；改編＝子名稱；權利金跟著名字走 | [track-ens.md](track-ens.md) |
| Uniswap 聚焦版 | Uniswap：Best Uniswap Stack Contribution（$6,000） | 約 4 分鐘 | CCA 拍賣定價 → v4 池 → hook 沿血緣分權利金 | [track-uniswap.md](track-uniswap.md) |
| 投稿影片 | ETHGlobal 投稿（總評審＋ENS＋Uniswap 一支影片），2–4 分鐘、真人講解、不配樂、不加速 | 目標 3:30 | 以上全部濃縮：分段時間碼、要錄的畫面與剪接點、英文講稿、4 張投影片 | [video.md](video.md) |

- 上台前：[setup.md](setup.md)（`.env` 金鑰、兩個視窗、信令伺服器、出狀況時怎麼辦）。
- 給大家看的圖解：[explainer.html](explainer.html)（AI 怎麼自動生成、CRDT 為什麼不會亂、鏈上放什麼）。
- 市場的操作手冊與鏈上架構：`docs/demo/`（ENSv2 那邊負責）。

## 為什麼只挑這兩個 track

獎項頁（2026-09-26 讀取）其他 track 的條件，我們目前都沒有對應的功能，硬做只會變成裝飾：

| Track | 不選的原因 |
| --- | --- |
| World：IDKit、World ID for Agents | 需要一個真正要驗證「是人」的時刻並在後端驗證；我們沒有這個流程 |
| 1inch：Aqua App | 要用 Aqua／SwapVM 做 DeFi 部位，與本專案無關 |
| Sui：DeFi & Payments | 要建在 Sui 上 |
| Curvegrid（RWA、資產儀表板、AI Agent） | 題目是金融資產與代理付款；README 還要寫 MultiBaas 使用經驗 |
| Intercepta：x402 付款篩選 | 要真的呼叫 Intercepta API 篩選付款 |

有報名 Continuity Track（既有專案）的話，ENS 與 Uniswap 各有一個 $4,000 的延續獎，腳本相同，見各自的檔案。

## 提交前檢查

| 項目 | 狀態 | 誰 |
| --- | --- | --- |
| GitHub repo 公開 | 完成：github.com/p2p-solidarity/unmapped | — |
| `FEEDBACK.md`（Uniswap 必要） | 完成：[`FEEDBACK.md`](../../FEEDBACK.md) | — |
| Uniswap Developer Feedback Form | **要人親自填** | 團隊 |
| README 指到合約與行號（Uniswap 必要） | 完成：`contracts/README.md` 的「Where to look」，27 個行號錨點 2026-09-26 對過（[chain-audit](../e2e/milestone-chain-audit/result.md)） | — |
| ENS 的 live demo 連結 | 完成：https://unmapped-auction.gimmychang.workers.dev/#aether-land（不加 `#aether-land` 會打開最新上架、0 筆出價就結束的 lantern-quay） | — |
| 市場畫面實機 E2E（出價、結算、買入、發放分潤） | 完成：[`milestone-lineage-demo`](../e2e/milestone-lineage-demo/result.md)（真的按 Touch ID 未測） | 上台前排練 |
| 總體版排練紀錄 | 完成（1a10a9d，改寫前為 f98de40；第二段之前）：[`milestone-demo-flow`](../e2e/milestone-demo-flow/result.md)；第 2–4 幕照腳本通過 | 第二段已上線，要重跑 |
| 鏈上全部重讀（出處、ENS、市場、代付站、拍賣頁、app 唯讀畫面） | 完成（區塊 11,785,145）：[`milestone-chain-audit`](../e2e/milestone-chain-audit/result.md)；代付站當時剩 0.0318 ETH，之後已補到 0.4518 ETH（區塊 11,785,984） | 完成 |

## 第二段已上線

第二段（`docs/plans/rev6-phase2.md`）已上線，標題是「繼續・世界・創造世界・設定」：

- 「大陸」「卡帶」「用 ENS 名稱開啟」「市場」都在「世界」畫面裡；「新遊戲」也在「世界」裡。
- 創造流程多一步「看樣子」（三張低畫質概念圖選一張）和建立前的「報價」；世界名稱可以留白。
- 設定在標題的「設定」（以前的「系統」），模型與信令伺服器都在裡面。
- 手把可以從標題一路玩到第一章。

2026-09-26 已照 `src/renderer/i18n/strings` 把各腳本的按鈕名稱與路徑改成現在的版本（[chain-audit](../e2e/milestone-chain-audit/result.md) 第 7 節）；總體版的排練（秒數）還沒重跑。
