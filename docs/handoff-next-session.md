# 交接：整合驗收里程碑之後還缺什麼

> 給下一個 session。進度檢討分成 A–F 六條工作線，由 Codex 接手合進 main；
> 整合驗收里程碑修掉審查與實機找到的問題（`plan.md` §10 最後一段、
> [驗收紀錄](e2e/milestone-integration/result.md)、進度頁第 17 列）。本檔只寫現況與還缺什麼。

## 0. 開工前

1. `bun run check` 必須全綠。基準：**96 檔 409 測試**，lint 0 警告。
2. 模型：標題「系統 → 模型」選雲端（OpenAI，金鑰可在畫面輸入、存 OS 鑰匙圈，或放 `.env`）或本機
   （Apple 裝置端／Ollama／llama.cpp）。Create 的起點場景跟著這個選擇走（`narrative/originScene.ts`）。
3. 實機驗證照 `CLAUDE.md` 的 "Verify before claiming done"；`run.json` 用 `{env, model, actions}`，
   `scripts/cdp-drive.ts` 直接吃。

## 1. 已定案，不要重新討論

- Create 是四步：構想 → 世界卡片（可單張重寫）→ 故事（一定產生；章節可改、重寫、插入、排序、鎖定）
  → 建立。草稿在 `workspaces/create.<id>/draft.json`。章節種類只能是 meet／search／fight／climb／maze，
  沒有戰鬥的世界不能有 fight（解析時修補、建立前再檢查）。
- 標題的「加入」只有大陸（門牌）；舊的同卡帶房間只在主控台 → Multiplayer（限定場景用）。
- 即時戰鬥：怪物會追、會打、會回家；調校全在 `src/shared/foes.ts`。

## 2. 還沒做的（建議順序）

### A. 先查清楚的問題（實機看到的）

1. **戰鬥傷害速率**：一次量到約 3 秒掉 54 HP，但調校上限是每 0.8 秒一擊（Lv2 每擊 6，≤ 7.5 HP/s）；
   同一對怪第二次只打了 1 下。先做可重現的量測（固定種子、站著不動、頁內每 25 ms 取樣 HP），再修。
   新玩家離家 30 格就會在 10 秒內倒下，平衡本身也要看。
2. **HD-2D 移動中的怪**：已完成的修正讓怪的圖每幀跟著位置畫；只在靜止時確認過，移動中未再實機看。
3. 原點村子裡角色常卡在兩叢石頭／灌木之間。
4. 進 Create 時「模型沒有回應」警告閃了一次（探測還沒回來），再開一次就沒有。

### B. 本機模型（使用者最在意的一條）

- Apple 裝置端、Ollama、llama.cpp 的**實際生成**都沒有端到端跑過（`fm license` 需要使用者本人同意）。
- 小模型（4B、8–16k context）下每個功能的輸出上限已會先檢查，但沒實測哪些功能真的能用。
- 打包版：金鑰可從畫面存進鑰匙圈；`.env` 讀不讀得到、`afm-bridge` 簽章與公證都沒驗。

### C. 已實作、還沒有 E2E 紀錄

章節實玩到第 2 章以後、地點、備份匯出→還原（只有單元測試）、擊倒後寫進存檔與 600 秒復活、
送貨／帶路委託、兩台機器連大陸、AI Worlds。

### D. 選定但還沒做

- **存檔全面加密**（使用者已選定）：卡帶、存檔、備份都用 Data Key。還沒開始；
  要先決定 main 怎麼拿到 Data Key、備份如何帶包好的 Data Key 跨機器還原。
- **NPC／怪物待機動畫**：只有玩家走路時會動。
- **手記上鏈**：`witness` 從 main 接到 preload，畫面沒有入口。`NoteWitness.tsx` 草稿未收入本倉庫，畫面入口仍待實作。
- 家只能在原點；lore id 偶發撞名（沒重現到）。

### E. 要使用者本人

合約部署、`ens:setup` 與認領名稱的真實交易（gas 與金鑰）。

## 3. 工作樹提醒

`docs/e2e/milestone-generated-props/` 與 `docs/e2e/milestone-integrated-create/` 只有截圖，
沒有 `run.json`／`result.md`。需要補上可重播的紀錄才能作為驗收證據。
