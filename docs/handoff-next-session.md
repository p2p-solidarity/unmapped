# 交接（2026-09-23 下午）：無限遊戲 · HD-2D · 走得到的地

> 給下一個 session 的工作指令。上一版交接（09-23 上午）的 A／B／D 與 E 的一部分已做完，
> 做了什麼與實測數字在 `plan.md` §10「無限遊戲 · HD-2D · 走得到的地」。本檔只講現況與還缺什麼。

## 0. 開工前

1. `git log --oneline -1` 應該在本檔這個 commit 或更新；工作樹應該乾淨。**尚未 push**（本地 main 領先 origin）。
2. 依序讀：`CLAUDE.md`（新增 `engine2d + hd2d` 契約與淺灘規則）→ `plan.md` §10 最後一段 → 本檔。
3. `bun run check` 必須全綠。基準：**118 檔 830 測試**。
4. 模型：`.env` 有 `OPENAI_API_KEY` 就走 `gpt-5.4-mini`。鏈是選配，`UNWRITTEN_*` 全空時照常運作。

## 1. 已定案，不要重新討論

- 上一版 §1 全部仍成立（一個遊戲無限地圖、Rule 12 沙箱、Rule 13 故事是內容／閘門與 carry 由主程式決定）。
- **HD-2D 是「換繪製面」不是換引擎**：`LandView2D` 保留移動／碰撞／目標，`LandSurface` 只負責畫。
  HD-2D 與 16-bit 永遠畫同一片地；規則不准寫進 renderer。後製只用 three 內建（不要加 `postprocessing` 相依）。
- **可達性由主程式保證**：區塊中央橫直排是淺灘（`isFord`）、原點區塊不積水、顯影內容進 store 時過 `clearFords`。
  閘門只能在區塊中心。改地形規則前先跑 `tests/shared/chunks.test.ts` 的可達性測試。
- 選單背後是活的地（`App` 的 `MenuBackdrop`，固定 seed、只有地形與散佈物，不是任何人的世界）。
- 介面字體：散文／選單用書本 serif（OS 內建，不下載）；id／hash／程式碼用 `mono`。

## 2. 還沒做的（建議順序）

### A. HD-2D 再往「歧路旅人」靠（使用者最在意的畫面）

現在已有：地面貼圖 + 洗色、台地斷崖、盆地土岸、直立 sprite 投影、雲影、光塵、bloom、移軸景深、標題活背景。
還缺、依效果排序：
1. **素材不夠**：CC0 Ninja Adventure 只有一張 village 表，很多 `PropKind`（機器、自販機、巴士站…）只能畫成方塊。
   可用已有的圖片模型（`src/main/works/images.ts` 的 key 流程）替缺的 kind 產生 sprite，但**會花使用者的錢，先問**。
2. 角色只有 4 方向 × 4 格走路；沒有待機呼吸、沒有 NPC 動畫。
3. 時間光色（晨／午／黃昏／夜）與點光源（火把、窗燈）還沒做；`HD2D_PALETTE` 已集中顏色，加一個時間軸即可。
4. 水面只有貼圖流動，沒有反光／岸邊淺色。

### B. 無限遊戲的剩餘缺口

- 閘門面板打開時，背景那一章若正在呼叫模型，會被中止並在面板關閉後重來（草稿保留，但那次呼叫的 token 浪費）。
  要避免需一個共享的「正在寫」旗標讓面板等待。
- 續寫第 6 章以後只用**改存檔模擬清除** e2–e5 驗過（見 plan §10）；沒有真人連玩 5 段以上。
- `continueStory` 失敗只重問 1 次，之後顯示錯誤 + Retry（刻意不自動重試）。

### C. 帳本（使用者說先 defer、先用測試的）

- 目前只有 in-process EVM 測試。要真交易：使用者自己 `bun run contracts:deploy` 後填 `UNWRITTEN_*`。
- 本機沒有 anvil／hardhat；若要本機鏈做端到端，需要先問使用者能不能裝 foundry（下載）。

### D. 已知缺口

- `.spire-backup` 匯入 format 1 舊檔仍報 `instance-invalid: expected 2`（`src/main/instances/backup.ts` 約 120 行）。
  開舊存檔已可讀（`src/main/instances/legacy.ts`）。
- 顯影偶發「lore id 撞名」→ 2 次 repair 後區塊維持未記。**這一輪沒重現到**，要先抓到一次失敗的 log 再修。
- 位置在關窗／隱藏時會補存；process 被 kill 仍可能丟最後幾秒。
- dev 模式下 main 不會熱更新：改了 `src/main/**`（例如沙箱 shim）一定要重開 `bun run dev`，
  否則 renderer 的新 prompt 會教模型用舊 shim 沒有的 API（這一輪踩到：`host.loop is not a function`）。

## 3. 怎麼實機驗證（不要搶使用者的畫面、不要碰真實資料）

```bash
mkdir -p "$TMPDIR/ud" && cp -R ~/Library/Application\ Support/Unwritten\ Land/cartridges "$TMPDIR/ud/"
AETHER_TEST_USER_DATA="$TMPDIR/ud" bun run dev --remoteDebuggingPort 9333   # 背景執行
bun scripts/cdp-drive.ts '[{"text":true}]'                                  # 任何 localhost dev port 都找得到
bun scripts/cdp-drive.ts '[{"hold":["KeyW","ShiftLeft"],"ms":3000},{"shot":"/tmp/a.jpg"}]'
```

- 使用者自己可能也開著 `bun run dev`（5173）；你的會落在 5174，CDP 用 9333。收工只殺自己的行程。
- 故事世界：New Game → Write one world with the model → 填故事 → 會自動開始背景寫第一章。
- `[works:attempt]` 行（dev log）有每次產生的時間、token、repair 數。

## 4. 回報格式

改了哪些檔 → `bun run check` 結果（失敗貼原文）→ 實機走了什麼流程（數字抄 `[works:attempt]`）→ 沒做或沒驗到的照實寫。
