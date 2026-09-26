# E2E · Simplify: one world, a goal, and a first screen a new player can read

Spec: `docs/plans/simplify-together.md` (the owner's bar: a 70-year-old can play it). One app on a
fresh userData, zh-TW, driven over CDP with `run.json` (`bun scripts/cdp-drive.ts "$(cat run.json)"`
with `CDP_PORT=9335`). Model: gpt-5.4-mini from `.env` (the default of a fresh userData).

| # | Checked | Observed | Result |
| --- | --- | --- | --- |
| 1 | Title | Exactly 繼續 · 世界 · 創造世界 · 設定 (`01`) | pass |
| 2 | Worlds screen | Nav is 我的世界 0 · 加入世界 · 市場 (no 新遊戲, 存檔, 世界檔案, 卡帶, 大陸). One row 開始新的冒險 with one primary 開始 and a folded 更多; 更多：還原備份、匯入世界 under the list (`02`) | pass |
| 3 | Start a new adventure | 開始 → Play in **2,736 ms**; the 怎麼玩 card is the only layer: W A S D 走路 · E 說話、打開、進去 · ➜ 跟著箭頭，走到下一章 · F12 和朋友一起玩 · Enter 聊天 · 知道了 (focused, Esc) (`03`) | pass |
| 4 | Goal line | Player card: the world's ENS name `aether-land.unmapped.eth` over 無界之地, then 目標 · The Twice-a-Day Bus and first 正在寫這一章，請稍等…, then 去找阿松，按 E 和他說話（還有 3 個人） once chapter 1 was written. Key row 「WASD 走路 · E 說話／打開 · Esc 離開」. Dock ← 主頁 · 說明 · 修改世界 · 朋友・更多 F12 · 留言 N · 畫面 V. No seed, chunk, karma, token, provider or FPS on screen (`04`) | pass |
| 5 | The door (E at home) | 門: 邀請朋友 → 加入世界 (one field 朋友的 ENS 名稱或加入碼) → 快速移動 (第 1–4 格) → 紀念品 → ▸ 進階 (folded) → 關閉 (`05`) | pass |
| 6 | F12 | Opens on 朋友 (tabs 朋友 · 世界 · 因果 · 推論): 拉朋友進來 · 加入世界 · 在線的朋友 「還沒有朋友在線」 (`06`) | pass |
| 7 | Settings | 語言 · 模型 · 設定我的 passkey (+ 改用安全金鑰) · ▸ 進階設定; nothing else unfolded (`07`) | pass |
| 8 | Join a world | One field 朋友的 ENS 名稱、加入碼或邀請連結 and 加入; 更多：從 .world 檔加入 (`08`) | pass |
| 9 | My worlds with a save | 開始新的冒險 → 開始, then 無界之地 → 繼續 (the seed is not shown), each with 更多 (`09`) | pass |

**Found and fixed during the run** (both visible from `04` on; `01`–`03` predate them):
- The HUD title read 「無界之地 · 7DAF-A53V」 — the seed suffix New game puts in a save's name. The
  player card now shows the plain name (`plainSaveName`, the rule My worlds already used).
- A brand-new world's first open toasted 「這個世界已經更新好，現在可以和朋友一起玩了（保留了 2 項）」 — the
  migration notice meant for old saves. It now shows only when the save carried land, notes or
  signposts (`history/session.ts`).

Calls: 2 on gpt-5.4-mini in the background (chapter 1: 5,389 ms; one witness: 5,602 ms; 5,567 in /
1,699 out in total). Nothing in the flow above waits for a model.

Not reached here: the pad walk through these screens (the menus keep the focus rules of
`milestone-rev6-p2-gamepad`), the other two UI languages, and a player's first ENS name (no passkey
on this userData). Playing together is `milestone-simplify-play-together`.
