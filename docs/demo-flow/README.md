# Demo：《無界之地》給 ETHGlobal Tokyo 2026

三個版本，同一個世界。先決定這次的評審是誰，再挑版本。

| 版本 | 給誰 | 長度 | 主角 | 檔案 |
| --- | --- | --- | --- | --- |
| 總體版 | 總評審、決賽、第一次聽到的人 | 約 4 分鐘 | AI 自動生成 → 走路不等 AI → 朋友的世界連成大陸（CRDT）→ 鏈上出處 | [overall.md](overall.md) |
| ENS 聚焦版 | ENS：Best Use of ENSv2（$6,000） | 約 4 分鐘 | 世界的名字＝身分；改編＝子名稱；權利金跟著名字走 | [track-ens.md](track-ens.md) |
| Uniswap 聚焦版 | Uniswap：Best Uniswap Stack Contribution（$6,000） | 約 4 分鐘 | CCA 拍賣定價 → v4 池 → hook 沿血緣分權利金 | [track-uniswap.md](track-uniswap.md) |

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
| README 指到合約與行號（Uniswap 必要） | 進行中 | ENSv2 session |
| ENS 的 live demo 連結 | 進行中（唯讀鏈上瀏覽頁，或 Etherscan＋影片） | ENSv2 session |
| 市場畫面實機 E2E（發行、出價、買賣、領權利金） | 進行中 | ENSv2 session |
| 總體版排練紀錄 | 完成（f98de40，第二段之前）：[`milestone-demo-flow`](../e2e/milestone-demo-flow/result.md)；第 2–4 幕照腳本通過，第 1 幕要先填名稱 | 第二段上線後重跑 |

## 第二段上線後要改的地方

第二段（`docs/plans/rev6-phase2.md`）正在實作，完成後標題會變成「繼續・世界・創造世界・設定」：

- 「加入大陸」「卡帶」「用 ENS 名稱開啟」移到「世界」畫面裡；「新遊戲」也在「世界」裡。
- 創造流程多一步「看樣子」（三張低畫質概念圖選一張）和建立前的「報價」。
- 手把可以從標題一路玩到第一章。

第二段整合綠燈後會重跑排練，並更新三份腳本的按鈕名稱。
