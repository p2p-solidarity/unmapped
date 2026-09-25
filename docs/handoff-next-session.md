# 交接：《未記之地》P1.5 → P5

> 這是一份給新 session 的完整工作指令。照順序做，每完成一個階段就更新 `plan.md` §10「目前狀態」。

## 0. 開工前（必做）

1. **確認你站在對的程式碼上。** 執行 `ls src/shared/chunks.ts src/renderer/engine/ChunkField.tsx plan.md`。
   任一不存在，代表你的 worktree 是從舊 commit 切出來的，缺少尚未提交的工作（P1 + 前一位 agent 的大量 WIP）。
   這時**不要開工**：改到主 checkout `/Users/kidney/Workspace/Hackathon/26ethtokyo` 工作，或請使用者先 commit。
2. 依序讀：`CLAUDE.md`（規則，全部有效）→ `plan.md`（**唯一規格**，2026-09-17 改向）→ 本檔。
   `docs/ref/plan-cartridge-console.md` 是上一版計畫，只在做 P5 時參考。
3. 跑 `bun run check`，必須全綠（基準：88 檔 678 測試）。不綠就先回報，不要疊新東西上去。

## 1. 已經定案、不要重新討論的事

- 只做**一個遊戲**、無限地圖。不新增類型、kit、capability context、Create 步驟。
- 地形確定性（`landSeed = seedFromText(cartridgeId)` + 區塊座標），**不落盤、不呼叫模型**。
- 模型只在「顯影」時對一個區塊寫**一次**（居民、地標、習俗、靜態對話），存進 instance 的 save。
- **互動當下不呼叫 LLM。** 沒有許願祭壇。戰鬥不在主路徑。相機玩家可切換。
- 舊 Create 流程**從路由拿掉、保留為進階入口「重制」**，不刪。
- 精神 = Large Lore Models（事實帳本 + 可爭論的 para-ledger）；控制核心 = Zero（固定錨點 + lore 圖啟動）。
- 主軸「被看見，才存在」、昭和鄉間質感、不要奇幻。細節全在 `plan.md` §2–§8。

## 2. 現況（P1 已完成並實機驗證）

- `src/shared/chunks.ts`：`CHUNK_SIZE=32`、`chunkOf`、`chunksAround`、`groundAt`、`chunkTerrain`（value noise：水／岸／岩、林地、稀有巨樹；原點區塊為 authored scene 留洞）。測試 `tests/shared/chunks.test.ts`。
- `src/renderer/engine/ChunkField.tsx`：玩家周圍 5×5 繪製、3×3 有碰撞。`Ground`／`Props` 多了 `hole`、`solid`。
- `kits/registry.ts` 的 `GameplayKitBehavior.open`（只有 `tps_exploration@1` 為 true）；`Player.tsx` 在 open 時不 `clampToFloor`；
  `Atmosphere.tsx` 的太陽跟隨玩家、霧下限 `OPEN_FOG_FLOOR`；`engineStore.chunk` → HUD `LAND cx · cz`。
- 實測：《P0 Finale Test》跑到 `LAND 0 · -3`、《湯屋來信》到 `LAND -1 · -1`，60 FPS，無邊界。

### 怎麼實機驗證（不搶使用者畫面）

```bash
mkdir -p /tmp/aether-ud && cp -R ~/Library/Application\ Support/Unwritten\ Land/cartridges /tmp/aether-ud/
AETHER_TEST_USER_DATA=/tmp/aether-ud bunx electron-vite dev --remoteDebuggingPort 9333   # 背景執行
bun scripts/cdp-drive.ts '[{"text":true}]'                                              # 讀畫面文字
bun scripts/cdp-drive.ts '[{"click":[160,722]},{"wait":1500},{"text":true}]'            # 標題 → Cartridges
bun scripts/cdp-drive.ts '[{"hold":["KeyW","ShiftLeft"],"ms":10000},{"shot":"/tmp/a.jpg"}]'
```

座標是 CSS px（視窗約 1440×868）。用 `{"eval": "..."}` 以文字找元素的 `getBoundingClientRect()` 再點，別猜座標。
**不要碰** `~/Library/Application Support/Unwritten Land/` 底下的真實資料；一律用 `AETHER_TEST_USER_DATA`。
結束時 `pkill -f "electron-vite dev"` 並確認 Electron 行程已退出（殘留會佔住 9333）。

### 已知擋路的 bug（不在本交接範圍，另有任務）

真實 userData 下 Cartridges 面板顯示 `instance-invalid: expected 2`：v2 存檔格式沒有 v1 reader。用暫存 userData 即可繞過。

## 3. 要做的工作

每個階段：先寫最小可跑的實作 → `bun run check` 綠 → 用上面的方式**實機走一遍** → 更新 `plan.md` 狀態 → 才進下一階段。
Rule 0：不要過度工程，測試只要證明「這部分能跑」。每檔 ≤ 600 行。不確定的產品決定才問使用者，其餘自己選並在回報裡說明。

### P1.5 收尾

1. **天光下限**：open 且場景沒有 `sun` 時，加一盞跟隨玩家的弱方向光（夜景走出去現在近乎全黑）。在 `Atmosphere.tsx`。
2. **相機切換**：open 世界允許玩家用一個按鍵在 orbit / fps 間切換（目前 HUD 顯示 `scene locked`，見 `CameraRig.tsx`、`app/hud/ActionDock.tsx`）。只對 `open` kit 放寬，其他 kit 維持鎖定。
3. **世界座標存檔**：`SaveState.player`（`src/shared/cartridge.ts`）加世界座標；離開 Play／定期（低頻）寫入，載入時從該座標出生而不是 `spawnPoint`。
   經 `src/main/instances/`（zod 驗證，Rule 6）與 preload `window.seed.instances`。驗收：重開 app 回到原地、同座標地形相同。
4. HUD 在 open 世界不顯示 `FLOOR`。

### P2 顯影（本計畫的核心，花最多心力）

規格在 `plan.md` §4–§6。建議順序：

1. **`src/shared/lore.ts`（純函式 + 測試）**：`LoreNode { id, kind, label, text, coord, links[], tone }`；
   `activate(nodes, { coord, karma }) → LoreNode[]`：空間核 + 近期 karma 加權 + 沿 links 擴散一步（×0.5）+ top-K≈12。
2. **世界聖經**：cartridge 多 `bible/core.md`、`bible/style.md`，納入 content hash（看 `src/main/cartridges/` 的檔案表與 `validate-revision.ts`）。
   沒有聖經的舊卡帶：顯影功能顯示 `error` 狀態與 hint，**不要**塞預設聖經（Rule 2）。
3. **DSL**：在 `src/dsl` 加 `Lore(id, kind, label, text, links[], tone)` 元件與 `parseChunk`（Scene 程式 + Lore 宣告），數值走 `limits.ts` clamp。
   區塊 Scene 用區塊內本地座標 0..31。prompt 放 `src/dsl/prompts/`，repair 沿用 `src/dsl/repair.ts`（≤ 2 輪）。
4. **顯影管線**（renderer `narrative/`，比照 `generateScene` 的 prompt → chat → parse → repair）：
   輸入 = 聖經（原封不動）+ `activate()` 的熱區 + 鄰區摘要 + 本區地形摘要（由 `chunkTerrain` 算：水／林比例、有無巨樹）。
   輸出 = 區塊 Scene + 每個 NPC 的**靜態** Dialogue 程式 + 新 Lore 節點。prompt 明示「居民可以記錯、各說各話」、語言 = `genesis.language`。
   衛生檢查：助理腔、空泛神祕語、與既有節點重名 → 當成 repair 錯誤。兩輪失敗 → 區塊維持「未記」、可重試，**絕不寫 fallback**。
5. **存檔**：`saves/<saveId>/chunks/<cx>_<cz>/{scene.oui,dialogue/<npcId>.oui}`、`lore.jsonl`；`karma.jsonl` 加 `{cx, cz}` 與 action `witness`。
   全部經 main（zod）寫入；寫一次後唯讀。
6. **觸發與渲染**：玩家進入一個未記區塊（且模型可用）→ 背景顯影，走路不中斷；完成後該區塊的居民／道具疊在地形上
   （`ChunkField` 的 `Chunk` 多渲染 overlay 的 walls／props／NPC，座標加區塊偏移）。`Proximity`／`useInteractions` 要能認到非原點區塊的 NPC。
   HUD 誠實顯示該區塊狀態：未記／顯影中／已記／失敗。
7. **對話零 LLM**：互動時讀存好的 Dialogue 程式；`useInteractions.ts` 在 open 世界不再呼叫 `generateDialogue`。
8. **換掉扁平視窗**：`src/harness/builtins/worldContext.ts` 的 `KARMA_WINDOW = 12` 改由 `activate()` 的熱區提供。
9. **鄉間詞彙**：`src/shared/world.ts` 補 prop／biome（電線桿、自動販賣機、公車亭、鐵軌、煙囪、鐵塔、風車、防波堤、民家…），
   幾何在 `src/renderer/engine/palette/`（hex 只能放那裡，Rule 3）。舊詞彙保留以相容舊卡帶。
10. **遠景層**：霧下限讓 64 m 外看不到東西，和「遠方有高的東西」衝突——加一層只畫高地標剪影、不受近霧影響的遠景。

驗收：走進未記區塊 → 居民出現、重開後不變；相鄰區塊的習俗看得出關聯；拔掉模型仍可無限行走；對話期間零 LLM 請求（看 main 的 inference log）。

### P3 家與門

`plan.md` §7。委託用確定性模板（送／找／帶路），文字在顯影時寫好；完成 → 紀念物（沿用 Item DSL，於顯影時生成定義）→ 擺在家。
門 = 四格轉盤（世界座標或朋友門牌），存在 save。驗收：完成委託 → 紀念物擺在家 → 用門回到該地。

### P4 連線

`plan.md` §8、既有 `src/renderer/net`。Y.Doc：`overlays`（key = 座標，先寫者為準）、`lore`、`notes`、`home`；位置走 awareness。
加入前沿用 SessionHello 的 `contentHash` gate。手記 `notes.jsonl`：`{ id, author, at, coord, anchors, text, contests? }`，玩家自己打的字，不經模型。
驗收：兩個 app 行程（兩個 `AETHER_TEST_USER_DATA`）在同一區塊看到同一批居民與彼此的手記。

### P5 重制入口

極簡 Create（世界名 + 一句意圖 + 語言 → 模型寫聖經與**邊緣開放**的原點場景 → 發布 `tps_exploration@1` cartridge → 直接進遊戲）成為主路徑；
舊 `narrative/ui/CreateScreen.tsx` 那一套移到進階入口「重制」。無模型 → `error` + hint。驗收：新玩家三次輸入內進到遊戲。

## 4. 回報格式

每階段結束回報：改了哪些檔、`bun run check` 結果（失敗就貼原文）、實機走了什麼流程與截圖、沒做或沒驗到的部分照實寫。
