# E2E · demo rehearsal · a few words → a world → walk → friends' worlds merge → leave safely

A full run-through of the planned hackathon demo on a clean build of the committed code. Two app
processes ran on fresh throwaway userData and met through a local signaling server. Every step was
timed from the page clock and from the dev log. Every model call below is an `[inference]` line
of a log, with its wall-clock (the log lines were time-stamped as they came out).

Short version: Acts 2, 3 and 4 pass as scripted. **Act 1 fails as scripted:** this build will not
write a world without a name. With a three-character name (鐘錶城) it went from 撰寫世界 to a
walkable desert land in 26.1 s of machine time. **A's own screen does show B's note, live.** This
was checked for the first time in this run.

## Replay

```bash
git worktree add --detach "$TMPDIR/unmapped-demo" f98de40
cd "$TMPDIR/unmapped-demo" && bun install --frozen-lockfile
# bun skips electron's postinstall: run `node node_modules/electron/install.js`, or copy
# node_modules/electron/{dist,path.txt} from a checkout that has the same 44.3.0 (this run copied)
cp <repo>/.env .                                        # OPENAI_API_KEY; delete it afterwards
PORT=4454 node node_modules/y-webrtc/bin/server.js &   # local signaling
AETHER_TEST_USER_DATA="$TMPDIR/ud-demo-a" bun run dev --remoteDebuggingPort 9443 &   # A, empty
AETHER_TEST_USER_DATA="$TMPDIR/ud-demo-b" bun run dev --remoteDebuggingPort 9444 &   # B, empty
R=<repo>/docs/e2e/milestone-demo-flow/run.json
p() { bun -e "console.log(JSON.stringify(require('$R').$1))"; }
CDP_PORT=9443 bun scripts/cdp-drive.ts "$(p signaling)"; CDP_PORT=9444 bun scripts/cdp-drive.ts "$(p signaling)"
CDP_PORT=9443 bun scripts/cdp-drive.ts "$(p act1)"
CDP_PORT=9443 bun scripts/cdp-drive.ts "$(p act2)"
CDP_PORT=9444 bun scripts/cdp-drive.ts "$(p act3NewGame)"
CDP_PORT=9443 bun scripts/cdp-drive.ts "$(p act3A)"      # prints the door number
CDP_PORT=9444 bun scripts/cdp-drive.ts "$(p act3Join)"   # after replacing 8NSWGS (steps marked doorNumber)
# then run `together` (B holds a key while A captures), act3Note (B), act3NoteA (A), act4 (B), checks.
# The driver ignores `note`, `shell` and `A`/`B` entries: run those by hand on the named app.
```

The screenshot paths in `run.json` are relative, so run the driver from a directory that has
`docs/e2e/milestone-demo-flow/`. A's land is written by the model, so the walking holds in `act2`,
`act3A` and `act3Join` fit this run's land. Adjust them by the printed positions.

## Environment

- **Build:** f98de40 in a clean worktree, before rev6 phase 2. It is a detached `git worktree`
  with `bun install --frozen-lockfile`. None of the uncommitted work in the main tree was in it.
- **OS and window:** macOS (Darwin 27.0.0), `bun run dev` (electron-vite, Electron 44.3.0). UI
  locale zh-TW. Window 1440 × 868 CSS px at launch; the captures are 2×.
- **Model:** `openai · gpt-5.4-mini`. A and B started from empty userData, with nothing saved in
  System. Both System panels showed 雲端 API · OpenAI · 模型 ID `gpt-5.4-mini` and the line
  "金鑰來自 .env", and the probe said "已連線 · 1594 毫秒". So the `.env` key is the default
  fallback with an empty userData, and every call below used it.
- **Signaling:** local `ws://127.0.0.1:4454` (y-webrtc's bundled server). Each app set it through
  title → 系統 → 信令伺服器: replace the list → 測試連線 → 儲存到這台裝置. Results: A
  "可連線 · 握手 25 ms · 轉送 0 ms", B "可連線 · 握手 15 ms · 轉送 0 ms". Both showed
  "已儲存到這台裝置。", and `unwritten.signaling` = `ws://127.0.0.1:4454`.
- **Seeds:**
  - A's world is 鐘錶城 from Create; its cartridge is `xn--uis759kmta-890407@1.0.0`, content hash
    `sha256:a76cb6ca…58138`.
  - B used New Game with the prefilled random seed `47SJ-NT59`.
  - A's door number this run: `8NSWGS`.

## Checked · Act 1 — "a few words become a world" (A)

| Step | Expected | Observed |
| --- | --- | --- |
| Idea only, no name (`01`) | the world gets written | **Fails.** The field "用一句話說說，這片大地是什麼樣的地方？" held `沙漠裡的鐘錶城` and 世界名稱 was empty. 撰寫世界 stayed `disabled`, and red text under it read **"請先替世界取名，並用一句話描述它。"** Clicking it twice (2 s apart) gave 0 `[inference]` lines. The gate is in `useCreateController.writeWorld` and `CreateGameScreen`, which need a non-empty name. To move on, the name **鐘錶城** was typed; nothing else changed. Defaults: 探索, 中文（台灣）· zh-TW |
| World cards stream (`02`, `03`) | cards fill in while the model writes | Clicked 撰寫世界; the request left 53 ms later. The capture at 2.25 s shows only the header **"正在撰寫世界設定… · 2 秒"**, at the bottom edge of the window. There was no text yet, and the preview sits below the fold at this window size. All 7 cards were ready **5,123 ms** after the click (`bible` 5,017 ms, 1,124 + 365). The cards are 世界前提, 氛圍, 日常規則, 不會出現的事物 (武器/怪物/戰鬥/血腥), 命名方式, 人物語氣 and 外觀風格. The last one begins "土黃與赭紅的沙漠城，低矮石屋與拱廊相連，屋頂立著銅鐘、日晷和風鈴…". Draft line: "這份草稿：1 次 · 輸入 1,124 / 輸出 365 · 快取 0" |
| Story streams (`04`, `05`) | chapters appear one by one | Clicked 繼續寫故事. The preview had text 2,678 ms later. At 3.9 s it showed "正在撰寫故事與章節… · 3 秒", the logline, chapter 1 whole (失名清晨 · 逆光門外的報時階 · 相遇) and chapter 2 cut off ("正午前，玩家"). This capture needed a scroll to the preview. The story was done at **7,788 ms** (`story` 7,721 ms, 597 + 670) with 5 chapters: 失名清晨, 短巷聽影, 風鈴屋脊, 回聲鐘塔底層, 對鐘之夜 |
| Build review (`06`) | what building does, before it does it | Heading 鐘錶城, then "建立時會寫出你醒來的地方、發布世界並開啟它。只有這一步會發布；在那之前一切都只是草稿。" Then 語言: zh-TW · 5 章 · 規則: 沒有戰鬥：章節是相遇、搜尋、攀登和迷宮。 · 使用 openai · gpt-5.4-mini（1363 毫秒）· 這份草稿：2 次 · 輸入 1,721 / 輸出 1,035 · 快取 0 |
| Build → land (`07`) | the land opens, the player can walk | Clicked 建立並開始玩. "正在撰寫你醒來的地方… · N 秒" counted 0 → 11 s. The origin took **3 calls**: 4,717 ms, 3,319 ms and 3,007 ms. The 2nd and 3rd send 4 messages, meaning 2 repair rounds; the reasons are not in the dev log or the in-app console. The land was on screen at **12,252 ms** with HUD "顯影中… / 取消顯影", "模型串流 (2)" and the background card "正在撰寫下一章… · 失名清晨 / 正在詢問模型… / 暫停 / 取消". The player moved (8.5, 8.5) → (11.3, 8.5) during a 0.7 s D press, at **13.2 s**, while still 顯影中 |
| Origin place written (`08`) | the origin chunk gets its name and life | The chapter call ran in parallel (6,596 ms). The origin witness took **3 calls** (12,193 + 6,990 + 5,929 ms = 25.1 s). HUD "已記 · 零角" came **36,992 ms** after 建立並開始玩. The land is desert: `Floor(16, 16, "sand")`, sky `#f2d6a2`. Props: well, pillar, house, pipe_stack, rock and one `utility_pole`. HUD: 故事 0/5 · 下一章：失名清晨（逆光門外的報時階）… · 交談 3 · 尋找 3 |
| Usage panel (`09`) | the world's total and its breakdown | "本世界：9 次 · 輸入 29,976 / 輸出 7,587 · 快取 10,240". By purpose: 世界卡片 1 · 1,124/365 · 5 秒; 故事計畫 1 · 597/670 · 7.7 秒; 起點 3 · 11,098/1,561 · 4,608 · 11 秒; 章節 1 · 2,146/895 · 6.6 秒; 顯影 3 · 15,011/4,096 · 5,632 · 25.1 秒. Every row matches the dev log to the token |
| Wall-clock | — | Click on 創作遊戲 (02:54:13.53) → first step on the land (02:55:56.27): **102.7 s**. That includes the driver's pauses: the no-name attempt, typing, screenshots and reads. Machine time: world 5.1 s + story 7.8 s + build-to-walkable 13.2 s = **26.1 s**. Up to the origin place written (已記): 5.1 + 7.8 + 37.0 = **49.9 s** |

## Checked · Act 2 — "walking never waits for the AI" (A)

An in-page recorder sampled `samplePlayer()`, the engine chunk and the HUD line every 250 ms.

| Step | Expected | Observed |
| --- | --- | --- |
| First walk out, north into chunk 0 · −1 (`10`) | 顯影中 while the player keeps moving | The chunk changed at 1.28 s (z −0.37) and the HUD went 顯影中…. The player kept moving to z −8.84 (at 2.50 s) while 顯影中. It was one call, 6,597 ms (3,522 + 918, 2,304 cached), and "已記 · 零角北緣" showed at ~8.0 s, so **~6.7 s** of 顯影中. `10` was taken only after it was written: the second driver call started later than the witnessing lasted. So this walk has no 顯影中 screenshot |
| Second walk, into chunk 0 · −2 (`11`, `12`, `13`) | the same, with screenshots | The chunk changed between 2.50 s and 2.75 s (z −31.2 → −32.95), and the witness request left at 02:57:57.670. **3 calls** (2 repairs): 8,646 + 6,901 + 7,390 ms = 22.9 s. "已記 · 零角北灘" came at 25.66 s, so **~23.0 s** of 顯影中. **Moves during it:** z −32.95 → −36.16 (to 3.25 s), then x 17.3 → 12.47 (3.25 → 5.25 s). `11` (~3.3 s) and `12` (~4.6 s) show "顯影中… / 取消顯影", "模型思考中…" and the player already elsewhere. `13` shows 已記 · 零角北灘 with new residents at the top. HUD FPS during it: 74–80 |
| After Act 2 | — | HUD "本世界：13 次 · 輸入 49,973 / 輸出 12,401 · 快取 23,040". `chunks/` holds 0_0, 0_-1 and 0_-2 |

## Checked · Act 3 — "friends' worlds merge (CRDT)" (A + B)

| Step | Expected | Observed |
| --- | --- | --- |
| B: New Game (`14`) | its origin witnessed | 新遊戲 → 種子 prefilled `47SJ-NT59` → 開始. The land was up at 675 ms, and "已記 · 零零岬" at **6,941 ms**. One `witness` call: 6,229 ms, 3,304 + 851 |
| A: open the door (`15`, `16`) | a door number, and a live continent | A walked home. At the door the prompt read "E · 開門"; E opened the panel "門 … 大陸 / 這個世界的門牌：8NSWGS". **向夥伴敞開我的門** → HUD "大陸 8NSWGS · 已連線 · 0 位夥伴"; the panel read "大陸 8NSWGS — 把這個門牌分享給夥伴。 / 已連線 · 有 0 位夥伴在" |
| B: join from the title (`17`) | both show 1 partner | ← 主頁 → **加入大陸**. The panel read "選擇要帶來的存檔世界，再輸入夥伴的門牌。" and listed 無界之地 · 47SJ-NT59 → 夥伴的門牌代碼 `8NSWGS` → **穿過這扇門**. Play opened: "大陸 8NSWGS · 已連線 · 0 位夥伴" at 235 ms, then **"… · 1 位夥伴" at 578 ms**. A's HUD also read "大陸 8NSWGS · 已連線 · 1 位夥伴" |
| B: door panel (`18`) | A's world listed | 其他世界: "player-HX39 · 鐘錶城 · 0 · 0 / 在線" with **前往他們的門**. Also "這個世界的偏移：6 · 0" and 離開大陸 |
| B: 前往他們的門 (`19`, `21`) | B stands on A's desert land | The sample became `visiting:instance-muh9hubz` at (−180.5, 8.5), chunk −6 · 0. HUD "player-HX39 的大地 · 鐘錶城 / 已記 · 零角". B's continent store held **3 chunks**, which are A's three places. B walked north into chunk −6 · −1 and the HUD read "已記 · 零角北緣" (`21`) |
| B made no model call for A's chunks | received, not regenerated | B's log after 穿過這扇門 has **0 `[inference]` lines**, for all the time on A's land in both chunks. B's whole run made **1** call, for its own origin |
| B sees A (`20`) | A's figure on A's land | B's roster had player-HX39 at (−181.10, 8.34), which is A's (10.90, 8.34) − 192 tiles (6 chunks) |
| A sees B walk, HD-2D (`22`) | name, facing, walk | A's roster had player-WDSK at (17.60, 2.70) while B stood at (−174.40, 2.70). While B held A (west), the roster read `facing: west, moving: true`, and `22` shows B with its name |
| A sees B walk, 16-bit (`23`) | the same in the flat look | After V (畫面：16-bit), B walked east and the roster read `facing: east, moving: true`. B's name is drawn faintly in this look |
| B leaves a note on A's land (`24`) | the line lands in A's notes.jsonl | N opened "留言 · 零角（-6 · 0）/ 還沒有人在這裡留言。 / 你的留言" → typed → **留下留言** (03:02:51.048). B's panel then read "player-WDSK · 格 17,2 · 2026/9/26 上午3:02:51". **A's `notes.jsonl`:** `{"author":"player-WDSK","at":"2026-09-25T18:02:51.075Z","coord":{"cx":0,"cz":0,"x":17,"z":2},"text":"鐘塔下的沙比別處涼，路過的訪客在這裡歇了一會兒。"}` in A's coordinates; file mtime 03:02:51. **B has no `notes.jsonl`** |
| **A's own screen shows the note** (`25`) | never verified before | **Yes, live**, with no reload or reopen. A's land store held the note. N at A's door, same chunk 0 · 0, opened "留言 · 零角（0 · 0）/ player-WDSK · 格 17,2 · 2026/9/26 上午3:02:51 / 鐘塔下的沙比別處涼，路過的訪客在這裡歇了一會兒。 / 寫下不同的版本". A note marker is drawn on the map at B's spot |
| A's karma | — | A's HUD changed: 因果 3 → 4 筆 and **"上次選擇：player-WDSK"**. A's `karma.jsonl` gained `{"choice":"player-WDSK","action":"note","effect":"left a note","cx":0,"cz":0}` at 18:02:51.141Z, 93 ms after B's click |

## Checked · Act 4 — "leaving is safe" (B)

| Step | Expected | Observed |
| --- | --- | --- |
| ← 主頁 while visiting | title; nothing foreign saved | Sample before: `visiting:instance-muh9hubz` at (−174.79, 2.70). The title came up |
| 繼續遊戲 (`26`) | own land, no witness | "已記 · 零零岬" **297 ms** after the click. Sample `origin` (8.5, 8.5), `visiting: false`, chunk 0 · 0, continent `off`, no 大陸 line after 6 s. `save.json` position (8.5, 8.5) before and after; `updatedAt` moved 18:00:07.090Z → 18:03:36.248Z. **0 `[inference]` lines**, and `chunks/` still holds only `0_0` |
| A after B left | partner gone | A's HUD read "大陸 8NSWGS · 已連線 · 0 位夥伴", with 0 remote players |

## Dev-log numbers

```
A 02:54:44.615 done · bible   · openai gpt-5.4-mini ·  5017 ms · max 1400 · 1124+365  (0 cached)
A 02:55:19.727 done · story   · openai gpt-5.4-mini ·  7721 ms · max 4000 ·  597+670  (0 cached)
A 02:55:47.797 done · origin  · openai gpt-5.4-mini ·  4717 ms · max 2200 · 2762+563  (0 cached)
A 02:55:51.121 done · origin  · openai gpt-5.4-mini ·  3319 ms · max 2200 · 4525+509  (2304 cached)
A 02:55:54.133 done · origin  · openai gpt-5.4-mini ·  3007 ms · max 2200 · 3811+489  (2304 cached)
A 02:56:00.869 done · chapter · openai gpt-5.4-mini ·  6596 ms · max 2400 · 2146+895  (0 cached)
A 02:56:07.027 done · witness · openai gpt-5.4-mini · 12193 ms · max 3200 · 3372+1684 (0 cached)     0 · 0
A 02:56:14.023 done · witness · openai gpt-5.4-mini ·  6990 ms · max 3200 · 5825+1191 (2816 cached)  0 · 0
A 02:56:19.959 done · witness · openai gpt-5.4-mini ·  5929 ms · max 3200 · 5814+1221 (2816 cached)  0 · 0
A 02:57:25.534 done · witness · openai gpt-5.4-mini ·  6597 ms · max 3200 · 3522+918  (2304 cached)  0 · −1
A 02:58:06.316 done · witness · openai gpt-5.4-mini ·  8646 ms · max 3200 · 3733+1293 (2816 cached)  0 · −2
A 02:58:13.222 done · witness · openai gpt-5.4-mini ·  6901 ms · max 3200 · 6381+1297 (3328 cached)  0 · −2
A 02:58:20.618 done · witness · openai gpt-5.4-mini ·  7390 ms · max 3200 · 6361+1306 (4352 cached)  0 · −2
B 02:58:53.936 done · witness · openai gpt-5.4-mini ·  6229 ms · max 3200 · 3304+851  (0 cached)     own 0 · 0
```

- **A:** 13 calls, 49,973 in / 12,401 out, 23,040 cached. The ledger `usage.jsonl` has 14 lines:
  the 13 calls plus the draft → world `link`.
- **B:** 1 call.
- **Failures:** `[inference] fail` 0 and `[renderer:ERR]` 0, in both logs.

## Button labels, as clicked (zh-TW)

- **Setup (A and B):**
  - 系統 → field "伺服器 — ws:// 或 wss://，每行一個" → 測試連線 → 儲存到這台裝置 → 返回
  - The model block in the same panel reads 雲端 API · OpenAI · "金鑰來自 .env".
- **Act 1 (A):**
  - 創作遊戲 → 開始新的遊戲
  - Fields: 世界名稱 and "用一句話說說，這片大地是什麼樣的地方？"
  - 撰寫世界 (disabled without a name) → 繼續寫故事 → 前往建立 → 建立並開始玩 → 用量 → 關閉
  - Seen on the way: 探索 / 冒險 · 槍 / 冒險 · 刀劍; 中文（台灣） · zh-TW; 重寫這張卡片; 取消 (while streaming); step bar 1 · 構想 / 2 · 世界 / 3 · 故事 / 4 · 建立並遊玩.
- **Act 2 (A):**
  - W / A / S / D + Shift. The HUD shows 顯影中… / 取消顯影 / 模型思考中… / 已記 · 〈name〉.
  - Dock: ← 主頁 · 調整機制 · 主控台 F12 · 留言 N · 畫面：HD-2D V.
- **Act 3:**
  - B: 返回 → 新遊戲 → (種子 field, 隨機) → 開始
  - A: E at the "E · 開門" prompt → 向夥伴敞開我的門 → 關閉
  - B: ← 主頁 → 加入大陸 → 無界之地 · 47SJ-NT59 → field 夥伴的門牌代碼 → 穿過這扇門 → E ("E · 開門") → 前往他們的門
  - A: V (畫面：HD-2D ↔ 畫面：16-bit)
  - B: N → field 你的留言 → 留下留言 → 關閉
  - A: N → 關閉
  - The door panel also offers 轉盤 1–4, 設定到轉盤 1, 離開大陸 and 穿過這扇門.
- **Act 4 (B):** ← 主頁 → 繼續遊戲

## Found

1. **A name is required to write a world (at f98de40).** The demo line "type only a few words, no
   name" cannot be done on this build. Its screen shows the red "請先替世界取名，並用一句話描述它。"
   and a disabled 撰寫世界 (`01`). Either type a name on stage or run a build that drops the
   requirement.
2. **The streaming previews render below the fold** at 1440 × 868. In `02`, the world stream is
   only a header at the bottom edge 2.25 s in, and the cards were done at 5.1 s. The story preview
   (`04`) needed a scroll. On stage, scroll down right after 撰寫世界 / 繼續寫故事, or the
   streaming is never seen.
3. **Repair rounds dominate the waits.** The origin scene needed 3 calls, the origin place 3, and
   chunk 0 · −2 also 3. So "顯影中" lasted 23.0 s for 0 · −2 against 6.7 s for 0 · −1 (1 call).
   The reason for each repair is not in the dev log or the in-app console (主控台 → 推論 shows
   only the provider and the model list).
4. **A visitor's note becomes a karma entry on the host.** A's HUD reads "上次選擇：player-WDSK"
   and 因果 goes up by one. The stored effect is the English literal "left a note".
5. **In the 16-bit look, some props are grey squares** labelled "we" and "pi" (`23`). At f98de40,
   `canvasRenderer.ts` `drawFallback` draws a prop with no pixel sprite as a square showing the
   first two letters of its kind: well, and pillar or pipe_stack. HD-2D draws the same props as
   sprites.
6. **Seen, not a bug:** in `19` and `20`, B's view shows "player-HX39" twice, overlapping. A is
   standing on its own door, and the foreign door marker also carries the owner's name
   (`continentLayer.ts`).
7. **Seen:** A's desert clock city has a wooden `utility_pole` (電線桿) at its origin. The land
   turned to night during Act 3 (`22`, `25`), so those captures are dark.

## Not verified

- The scripted Act 1 itself (no name); see Found 1. The run used the name 鐘錶城.
- A mid-text screenshot of the **world cards** streaming. Only the story stream was captured with
  text (`04`).
- A screenshot of 顯影中 on the **first** walk-out (0 · −1). The second walk-out (0 · −2) has it
  (`11`, `12`).
- Why each repair round happened (not logged).
- That B's note is still there after A reopens its world. Only the live arrival was checked.
- Anything over the default public signaling servers; this run used the local server only.
- Walking through a continent that stays open for a long time, a partner who drops off mid-visit,
  and leaving via 離開大陸.
