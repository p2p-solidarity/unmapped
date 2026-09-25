# 交接（2026-09-23）：AI 世界 · 故事劇集 · 選配鏈上出處

> 給下一個 session 的工作指令。上一版交接（P1.5 → P5，2026-09-21）的工作**全部做完了**，
> 內容已移到 `plan.md` §10；本檔只講 2026-09-22 → 09-23 這一輪做了什麼、還缺什麼。

## 0. 開工前

1. `git log --oneline -1` 應該是 `4fc229b`（已在 `origin/main`）。工作樹應該乾淨。
2. 依序讀：`CLAUDE.md`（規則，**Rule 12／13 是這一輪新增的**）→ `plan.md`（規格）→ 本檔
   → `docs/plans/interactive-web-player.md`（AI 世界的設計）→
   `docs/experiments/interactive-works-acceptance-2026-09-23.md`（**實測數據，別重測**）。
3. `bun run check` 必須全綠。基準：**115 檔 806 測試**（2026-09-23 10:42 實跑）。不綠先回報，不要疊新東西。
4. 模型：`.env` 有 `OPENAI_API_KEY` 就走 OpenAI（`gpt-5.4-mini`）。圖片走 `OPENAI_IMAGE_MODEL`（預設 `gpt-image-1-mini`）。
   鏈是選配：`UNWRITTEN_*` 全空時每個畫面照常運作，只是說「沒有設定帳本」。

## 1. 已定案，不要重新討論

- 一個遊戲、無限地圖；顯影（witness）只在玩家踏進未記區塊時對該區塊寫一次；**互動當下不呼叫 LLM**。
- **Rule 12**：模型唯一能寫 JavaScript 的地方是 `interactive-web@1` 世界，且只跑在
  `<iframe sandbox="allow-scripts">` + `ulwork://<token>/` + nonce CSP。永遠不要加 `allow-same-origin`、
  不要從 app origin 提供世界、不要把 `window.seed`／路徑／secret 丟進 frame。
- **Rule 13**：故事計畫是卡帶內容（`bible/story.json`，進 content hash）；玩到哪、產出的世界、帶著的東西在存檔
  （`land.episodes`、`land.storyCarry`）。**閘門位置與 carry 合併由主程式決定，不是模型**。鏈上只放 hash／作者／血緣／短註記。
- 世界（works）存在卡帶**旁邊**，不在卡帶裡：`works/`（不可變、有 hash）、`work-plays/`（釘住的進度）、
  `work-drafts/`（候選；head 只能 compare-and-set 移動）。舊卡帶的位元組因此完全沒動。
- 沒有假資料：模型不通、沒有世界、沒有帳本 → 顯示 `error` + `hint`，不要塞範例內容。

## 2. 這一輪交付了什麼

| commit | 交付 | 程式在哪 |
| --- | --- | --- |
| `83a4225` | 2D 開放地（CC0 Ninja Adventure 貼圖、區塊串流、道具碰撞） | `src/renderer/engine2d/` |
| `64fb5b4` | **Prompt 1+2+3**：沙箱 AI 世界播放器 + 創作迴圈（產生 → 玩 → 改 → 存版本 → 旅程） | `src/shared/{works,workEdits,workPrompt}.ts`、`src/main/works/`、`src/renderer/works/` |
| `763ea31` | 用圖片模型畫世界素材（主程式持 key，`nativeImage` 縮到 256px，照樣要過檢查才生效） | `src/main/works/images.ts` |
| `baf6ce0` | **故事 → RPG 地圖 → 劇集**：一段故事變成世界聖經 + 3–8 段劇集，閘門散在開放地上，走到才寫世界，carry 一路帶著 | `src/shared/story.ts`、`src/renderer/works/EpisodePanel.tsx`、`src/renderer/engine2d/storyLayer.ts` |
| `ef75aea`＋`4fc229b` | 選配鏈上出處（`publish` 出處帳本 / `witness` 註記）＋ 先寫下一段劇集的按鈕；review 修正（取消要在每個 await 之間生效、uri 長度上限、花 gas 前二次確認） | `contracts/src/UnwrittenLedger.sol`、`src/main/chain/`、`src/shared/chain.ts` |

重點契約（改之前先讀）：

- 模型看到的世界 API 就只有 `host.{root, carry, load, save, complete, status, asset}`（`src/shared/workPrompt.ts`）。
- 模型回覆是 `@@summary` / `@@file` / `@@edit`（SEARCH/REPLACE）/ `@@end` 行協定（`src/shared/workEdits.ts`），修不好最多 repair 2 次。
- 「可玩」是自動關卡：全新開一次（補放按鍵與點擊）→ 若有存檔再用該存檔重開一次；兩次都過才會動 head。
- 每次嘗試會在 console 印 `[works:attempt] {...}`（時間、token、repair 次數）——驗收數據就是從這裡來的。

## 3. 實測數據在哪

`docs/experiments/interactive-works-acceptance-2026-09-23.md`：邊界逃逸測試（`window.seed`/`eval`/`fetch`/跳轉/無窮迴圈各自的結果）、
4 個世界的產生時間與 token、5 次修改、旅程與重開、故事 5 段劇集、圖片、鏈。**別重做這些測量**，要引用就引這份。

## 4. 還沒做的（建議照這個順序）

### A. 無限遊戲：自動預寫下一章 + 官方劇集打完後續寫（最接近可交付）

現況：只有手動的「Prepare the next episode now」按鈕（`EpisodePanel.tsx`），而且劇集打完就結束。
目標：走在地上時背景把**下一段**的世界寫好，走到閘門是秒開；作者寫的劇集打完後，土地自己續寫下一章。

作法（已想過，照做即可）：

1. `src/shared/story.ts`
   - 加 `storyEpisodes(plan, extra)` = 卡帶的劇集 ++ 存檔續寫的劇集。
   - `episodeUnlocked` / `nextEpisode` 改成吃 `StoryEpisode[]`（不要再吃 `StoryPlan`，因為 schema 最多 8 段）。
   - 加 `parseNextEpisode(reply, index)`（單一 `@@episode` 區塊）與 `continueStoryMessages()`（給 logline、已清的劇集摘要、carry、語言）。
   - **注意閘門距離**：現在 `episodePlace(index)` 的半徑每段 +1，相鄰閘門距離約 `1.87 × 半徑`，續寫到第 20 段會遠到走不到。
     改成 phyllotaxis（`r ≈ c·√n`）讓相鄰距離大致固定；卡帶裡已存的 `cx/cz` 不受影響（story.json 存的是座標）。
     上限：schema 的 `cx/cz` 是 ±64，id 是 `e1`–`e99`，所以續寫要設一個上限並誠實顯示。
2. 存檔：`LandProgress.storyMore?: StoryEpisode[]`（`src/shared/land.ts`）＋ `src/main/instances/schemas.ts` 的 zod
   ＋ `landStore.addEpisode()`。存檔會自動 checkpoint（`usePersistWorld` 已訂閱 landStore）。
3. 把 `EpisodePanel.prepare()` 抽成 `src/renderer/works/prepareEpisode.ts`（面板與背景預寫共用；面板現在 257 行，Rule 1）。
4. 新 `src/renderer/works/EpisodePrefetch.tsx`，掛在 `PlayScreen`：
   - 一次只跑一段；`sessionStore.episodeOpen !== null` 時不跑（避免和面板重複產生）；失敗不自動重試（會燒 token），給 Retry。
   - **檢查用的 frame 必須真的在畫面上**（隱藏的 frame 收不到 animation frame——這個坑踩過）：角落一張小卡片顯示
     「正在寫下一章…」+ `useChecker` 的元素 + Pause／Cancel。Pause 偏好放 `localStorage`（Rule 2 允許的裝置偏好）。
   - 全部劇集都清完 → 先呼叫 `continueStoryMessages` 續寫一章 → `addEpisode` → 下一輪自然會去寫它的世界。
5. 其他讀者一起改：`engine2d/storyLayer.ts`（標記／目標／指南針）、`app/hud/PlayerCard.tsx`（`Story 3/5` → 續寫後顯示章數）、
   `engine2d/LandView2D.tsx` 的 memo、`EpisodePanel`。
6. 驗收（實機）：進故事世界走一段 → 閘門世界已經寫好、秒開；清掉最後一段作者劇集 → 地圖上冒出新章、走到時已就緒；
   Pause 有效；拔掉模型時卡片顯示原因且不發明內容。

### B. HD-2D 主畫面（使用者要的「歧路旅人」質感，完全沒開始）

誠實的選項，先跟使用者確認要哪一條：

- **真 HD-2D**：把開放地改走既有 Three.js 路徑（`src/renderer/engine/`），角色用 billboard sprite、固定俯角相機、
  景深（tilt-shift）+ bloom。需要新相依 `@react-three/postprocessing`（+`postprocessing`），而且要保留現在的 canvas 路徑在旗標後面，
  因為故事／閘門流程現在是靠 2D canvas 跑的。工作量最大，畫面最像。
- **加深的 16-bit**：留在 canvas，補時間光色、遠景視差層、柔和陰影。半天可做，但**不要叫它 HD-2D**。

### C. 把帳本部署到測試網（需要使用者本人）

`bun run contracts:deploy` 會花 gas、需要 `UNWRITTEN_PRIVATE_KEY`。**agent 不要自己跑**。
部署後把 `UNWRITTEN_RPC_URL` / `UNWRITTEN_CHAIN_ID` / `UNWRITTEN_LEDGER_ADDRESS` 填進 `.env`，
在 AI Worlds 的世界卡上按 publish（會二次確認才送出）驗一次真交易。合約規則已在 in-process EVM 測過，也比對過已提交的 bytecode。

### D. 省 token 的三件事（實測指出來的，不是猜的）

最貴的不是第一次產生，是 **repair 整檔重寫** 和 **模型重複犯的錯**。依序做：
1. repair 一律要求 SEARCH/REPLACE（現在允許整檔覆蓋）。
2. 把「存檔／讀檔要回得來」「carry 要合併不是覆蓋」「dt 用秒」做進 host API，模型就不用每次重寫。
3. `host.status` 已經在 shim 做節流；其他每幀呼叫的 API 也一併看一次。

### E. 已知缺口（不在上面任何一項裡）

- **v1 存檔 reader 未做**：真實 userData 開卡帶會出現 `instance-invalid: expected 2`；測試一律用 `AETHER_TEST_USER_DATA` 繞開。
- 顯影偶發「這個地名已經有人用了」，2 輪 repair 後該區塊維持未記（舊管線，和這一輪無關）。
- app 被直接關掉時，最後 5 秒的移動不會寫入。
- `RTCPeerConnection` 在沙箱 frame 裡仍然存在（CSP 擋不掉），已記錄為可接受的殘留。
- 「Replace…」換圖走原生檔案對話框，沒有自動化測試。
- `plan.md` §10 的狀態這一輪已補上 09-22／09-23 條目；之後每做完一段請繼續更新。

## 5. 怎麼實機驗證（不要搶使用者的畫面）

```bash
mkdir -p /tmp/aether-ud && cp -R ~/Library/Application\ Support/Unwritten\ Land/cartridges /tmp/aether-ud/
AETHER_TEST_USER_DATA=/tmp/aether-ud bun run dev --remoteDebuggingPort 9222   # 背景執行
bun scripts/cdp-drive.ts '[{"text":true}]'                                    # 讀畫面文字
bun scripts/cdp-drive.ts '[{"hold":["KeyW"],"ms":4000},{"shot":"/tmp/a.jpg"}]'
```

- 座標是 CSS px；用 `{"eval":"..."}` 找元素的 `getBoundingClientRect()` 再點，別猜。
- **不要碰** `~/Library/Application Support/Unwritten Land/` 的真實資料。
- 收工：`pkill -f "electron-vite dev"`，並確認 9222 沒有殘留行程（殘留會讓下一次連不上）。
- 沙箱世界的 frame 要另外連：它是獨立的 OOPIF target，`ulwork://` origin。

## 6. 回報格式

改了哪些檔 → `bun run check` 結果（失敗貼原文）→ 實機走了什麼流程（數據從 `[works:attempt]` 抄）→
沒做或沒驗到的部分照實寫。不要宣稱沒跑過的功能會動。
