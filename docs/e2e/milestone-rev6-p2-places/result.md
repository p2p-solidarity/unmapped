# E2E · rev 6 phase 2 · places on engine2d (D5), otherworlds (D6 + D2's reference picture), safe home (D7)

The real-app run of phase 2's places, otherworld and safe-home packages
(`docs/plans/rev6-phase2.md` D2, D5, D6, D7), toward done-looks-like #3: **inside the game there is
only one 2D engine** — a side course and a dungeon are played on engine2d (one 2D canvas, no WebGL,
no `GameCanvas`), an AI world is an otherworld place on the land, and home is safe in a world with
fights. All of it works after three app fixes (below); one of them (Escape could not leave an
otherworld) was found here and re-verified after an app restart.

## Replay

```bash
# Places on engine2d + a chapter played as a place (keyboard; no model call at interaction time)
mkdir -p "$TMPDIR/ud-p2-places-replay"          # must be empty
AETHER_TEST_USER_DATA="$TMPDIR/ud-p2-places-replay" bun run dev --remoteDebuggingPort 9333   # background
bun scripts/cdp-drive.ts "$(cat docs/e2e/milestone-rev6-p2-places/run.json)"   # ~102 s, writes r-*.jpg
```

`run-model.json` records, in order, the parts that ask the model and so cannot replay identically
(Tweak → Add a place with the model, Create with fights = gun, safe home, combat in a place, the
otherworld workshop, D2), as they were driven one cdp-drive call at a time on `$TMPDIR/ud-p2-places`
(`{note}` entries are comments; the app was restarted once in the middle, marked there).

Environment: macOS 27, dev build — main at 7a04adf (was ca6394b before the 2026-09-26 rewrite) + the
uncommitted rev 6 phase 2 working tree + this run's fixes; UI zh-TW (system default); window
1440 × 868 in the background. Model: the fresh-userData default, Settings → Model
`openai · gpt-5.4-mini`, key from `.env`; pictures `gpt-image-1-mini`. Times and tokens are the
`[inference]` / `[look]` / `[image]` lines of the main log and `usage.jsonl`.

How it is driven: keys through CDP (`hold`), clicks on dialogue choices and in the frame, the
virtual pad's stick only for walking the land along the chunk-centre fords (`pad.toward`), and
read-only helpers (`window.__e2e`) that read the place view's own body refs through React's fiber
and route with the app's own `gridMaze` / `gridOpen` / `sideCourse`. `scripts/cdp-drive.ts` gained
`{hold: {from: "<js>"}}` (the keys are read from the page first — the next step of a route), so a
maze and a course are walked by real key presses. What `run.json` injects (two evals, recorded in
its `env.injected`): the two places the model wrote in the interactive run, added with
`useLandStore.addPlace` (so every replay plays the same programs and residents' words), and chapter
e1's stage set to a side-scroller (the built-in story has no climb or maze).

Runs:

- **I** `ud-p2-places` — everything, interactively; found bugs 1–3. The app was restarted once on
  the same userData for the main-process half of fix 3.
- **R1** `ud-p2-places-replay` — `run.json` whole; passed the places, then another session's edit
  of `i18n/strings/market.ts` made vite reload the page during the chapter walk (log:
  `page reload i18n/strings/market.ts`), so the chapter part ran on the title screen. Not the app.
- **R2** `ud-p2-places-replay` (emptied) — `run.json` whole, all passed; the `r-*` shots are this run.

## 1 · Places on engine2d, keyboard (I, R2)

| Check | Observed |
| --- | --- |
| Add a place with the model (Tweak → 新增關卡) | Side-scroller 「青苔石階路」 at chunk (1, 0) in 6.7 s: 2 calls (3,827 ms, 2,997 + 533; repair for `Quest` missing its text, 2,603 ms, 3,885 + 471), 482 chars, 1 resident with stored words. Dungeon 「舊礦道」 at (0, 1) in 11.3 s: 3 calls (4,471 / 3,691 / 3,063 ms; repairs for `Quest` text and an NPC accent colour), 773 chars, 1 resident (`03`–`05`) |
| The view is the 2D place view, nothing else | Inside the course `document.querySelectorAll('canvas')` = **1**, `aria-label` 「青苔石階路，側面畫面」; in the dungeon 1, 「舊礦道，俯視畫面」; the chapter place 1, 「The Twice-a-Day Bus，側面畫面」. On the land before and after: the HD-2D pair (three.js r186 + overlay) or the one 16-bit canvas. No `GameCanvas` canvas in any of these reads (`07`, `14`, `20`, `r-02`, `r-07`) |
| Walk / jump / fall (course, kit 4.5 / 7 / jump 7 / gravity 17) | Walk 1 s: 4.42 tiles (R2 4.43). Sprint 1 s: 6.88 (R2 6.77). Jump from the ground: apex **1.416 tiles** at 0.39–0.41 s, landed 0.81–0.84 s (theory 1.441 / 0.412 / 0.824). A straight jump under the ledge 33–35 lands on its top (y 1.0); S drops through it, 336–340 ms to the ground (theory 343). I: sprint-jumps up the ledges 1.0 → 1.5 → 2.0 → 2.5 (0.75 s in the air each), walked off 2.5 → ground in 531 ms (theory 542); a 1-tile wall stops the body at x 53.7, a jump clears it (`10`, `11`, `r-04`) |
| Walk (dungeon, 19 × 19, 87 walls) | W at the spawn only turns north (a wall); D steps one tile; the route to the resident 4.6 s, to the far end 9.6–9.8 s — 4 tiles/s |
| Talk to a resident: stored words, no model call | 新爺: 「風涼。這石階長了青苔…」 with 3 choices; 阿炭 likewise; the chapter's 新爺 read from `episodes.e1.stage.dialogues`. `[inference] chat` count unchanged across every talk (9 → 9 in I; R2: 0 place / talk / chest calls of its 9 background calls). A choice writes a `talk` karma line and its toast (`08`, `16`, `21`) |
| Open a treasure | 「找到：舊布, 銅錢, 小鈴」, 3 materials in the bag, karma `opened chest_old`; the dungeon's 「舊銅幣, 煤塊」 (`09`) |
| The far end | E at ✓ → toast **已穿越 青苔石階路**, `land.places.p1.cleared = true`, karma `witness · crossed 青苔石階路 · <the place's goal>` at (1, 0), back on the land at (48.5, 17.9) — the entrance + 1.4 south; same for 舊礦道 at (16.5, 49.9) (`12`, `13`, `17`, `18`, `r-05`, `r-06`, `r-09`) |
| The way back | Re-entered, ↩ → back at the entrance, no karma line, no toast (course and dungeon) |

## 2 · A chapter played as a place (injected; I, R2)

The built-in 1.3.0 story is meet / search / meet, so e1's stage was set by eval to `kind: "side"`
with p1's program on seed 1234567, after its own background write had landed. At the gate the card
reads 「橫向捲軸關卡：抵達最遠端即可通關本章。 · 進入」; 進入 → the place (1 canvas, its own walls at x 36 /
40 / 44 hopped by the route); the chest and 新爺's stored words work inside; ✓ → toast
**章節通關：The Twice-a-Day Bus**, `episodes.e1.cleared = true`, summary = the place's goal, karma
`cleared chapter The Twice-a-Day Bus` at (2, 0), HUD 「故事 1/3 · 下一章：What the Wind Took」, back at
the gate (`19`–`22`, `r-10`, `r-11`). A real climb / maze chapter exists in the gun world below
(e3 climb, e4 maze) but is only reachable after two earlier chapters, so it was not played.

## 3 · A world with guns: safe home, combat in a place (I)

Create (keyboard + typing): words 「海邊廢棄的燈塔小鎮，夜裡會有發光的水母爬上岸，鎮民用信號槍把牠們趕回海裡。」 +
冒險 · 槍 → cards 4.1 s (bible 4,019 ms, 1,204 + 416) → three look pictures in 12.4 s (9,787 /
10,482 / 12,111 ms), picture 1 chosen → story 4 chapters (e1 meet, e2 search, **e3 climb, e4 maze**),
ready when the pictures were → Build 9.1 s (origin 2 calls: 5,211 ms + one repair 3,645 ms). The
cartridge `xn--omss0g6zcftp20fr7gn8ixk8c65f-9a7637@1.0.0` carries `assets/look.png` (268,800 B,
sha256 `f84a0878…`, equal to the manifest); rules `combat.playerHp 100`, weapon 制式槍械 (22 damage,
range 22, 320 ms, magazine 12) (`30`–`33`).

**(a) Home is safe** (home = chunk 0, 0: x 0–32, z 0–32; foes sampled every 250 ms from the land
view's own fight):

| Phase | Observed |
| --- | --- |
| 20 s one tile inside the south border, (21.47, 31.13), golem `wild_0_1_1` 2.37 tiles away at (21.5, 33.5) | 80 samples: HP **100 → 100, 0 changes**; the golem never moved; 0 samples with any foe inside home (`34`) |
| Step out to (23.6, 34.7) | The golem closed in and struck: 100 → 94 → 88 → 82 in 7.6 s (6 = 5.6 % of 100 at level 2), each blow pushing the player back 0.6 tiles; left outside a little longer it reached 52 (`35`) |
| Step back to (22.48, 31.29), 20 s | 80 samples: HP **52 → 52, 0 changes**; the golem did not follow into home and was back on its own spot (21.5, 33.5) by the sample at 4.25 s; 0 foes inside home (`36`, `37`) |
| West border: struck once outside (52 → 46), sprinted home to (1.0, 24.5), 24 s | 96 samples: HP 46 constant, 0 foes in home, none within 9 tiles after 1.75 s (`38`) |

**(b) Fighting in a place.** Tweak → Add a place → 「東邊防波堤棧道」 (1 call, 5,523 ms, 3,557 + 849, first
try) with 3 monsters: wisp L2 (40 HP) at 53.5, slime L3 (50) at 55.5, wisp L4 (60) at 57.5; the
hint row reads 「F / 點擊 開火 · S 從平台跳下」 (`39`). From x 34.55, behind the 1-tile wall at x 36,
30 F presses were all `empty` (the wall is in the line of fire; no round spent). From x 46.03:
**F** → hit, kill (2 shots, 0.8 s, kills 1); **click** right of the player ×3 → hit, hit, kill
(kills 2); **pad X** ×3 → hit, hit, kill (kills 3); HP 100 (they stood beyond the aggro radius)
(`40`, `41`). The run store's kills (3) show on the land HUD afterwards (「LV 4 · 經驗 9 · 擊倒 3」).
Crossing it cleared it as in part 1.

## 4 · Otherworld (異界) (I, then after the restart)

| Check | Observed |
| --- | --- |
| Picker on a fresh device | 「這台裝置上還沒有儲存任何 AI 世界。在下面寫一個新的吧。」 (`50`) |
| Write a new one over Play | 「一個房間，中間有一個大按鈕（按鈕的圖片用 assets.json 裡的 button），按下就呼叫 host.complete」 → 寫一個新的異界: the tweak panel closed, a `role=dialog` layer 「異界」 over Play, `inputLocked` true, encounter `paused` true (`51`). Generate → check → playable c001 in **15.7 s** (model 8.8 s, 782 + 1,430 tokens, first try, 0 repairs) |
| Save version → entrance | toast 「一個房間 的入口已經出現在大地上（區塊 1, -1）。」; `land.places.p2 = {kind: "otherworld", work: {workId: w-7f0c1b2a, version 1.0.0, contentHash sha256:09efcb5b…}, cleared: false}` (`55`) |
| Marker in both looks | HD-2D: the magenta 異 crest over a turning rift ring and its title (`56`); V → 16-bit: 異 in a magenta square over the dashed rift (`57`) |
| Walk in, E | the frame 88 ms after E: `sandbox="allow-scripts"`, `allow="gamepad"`, `src=ulwork://w6eb04c2…/`, `data-autofocus`, `referrerpolicy=no-referrer`, focused; layer `role=dialog aria-modal=true` 「一個房間」; `sessionStore.place` null; `playId p-bd492581f15ccc8e` stored in the save (`58`) |
| Land held while open | D held 600 ms with focus in the frame and again with focus on the page: position (48.45, −14.38) unchanged; `inputLocked` true |
| The button in the frame (click at 720, 155) | toast **已穿越 一個房間** 26 ms after the click; `cleared: true`; karma `witness · crossed 一個房間 · ""` at (1, −1) — written from the stored title; the world's own summary 「按下房間中央的大按鈕，世界完成。」 stays in the frame's panel (`59`) |
| Escape leaves | **Failed first** (bug 3): the layer stayed open (`60`). After the fix and a restart: Continue → E → Escape with focus inside the frame → layer closed, still in Play at (48.45, −14.38), input unlocked, encounter running again (`62`). 離開異界 also leaves (before and after) |
| Re-enter | the same `playId p-bd492581f15ccc8e`, the header shows its carry `{"buttonPressed":true}` |
| A second entrance from the saved world | 放置入口 → p3 at chunk (1, −2) with the same work ref, no play yet; **0** `[inference]` / `[image]` lines in main's log for it (`63`) |

## 5 · D2 — pictures drawn over the world's look (I, after the restart)

First otherworld, asset `button` → 生成: `Image "button" was generated by gpt-image-1-mini over the
look of xn--omss0g6zcftp20fr7gn8ixk8c65f-9a7637@1.0.0.`, **14,070 ms, 390 in / 1,056 out**. The
candidate then **failed its check**: the world's code passed the data URL string to `drawImage`
(`TypeError … at draw (ulwork://…:147)`), a path the world never ran while the asset was missing;
the check kept c001 playable (the frame's errors are the 184 `renderer:ERR` lines of run I, all
from `ulwork://`). Main's log line then said only `[image] done … · openai · 14070 ms`.

After fix 3b/3c: a second otherworld 「一盞燈塔的燈…（燈的圖片用 assets.json 裡的 lamp）」 (generate
16.9 s, 802 + 1,357 tokens plus one 1.6 s repair) → lamp → 生成:

```
[image] done 8cf7f7fd-… · openai · gpt-image-1-mini · images.edit over the look of xn--omss0g6zcftp20fr7gn8ixk8c65f-9a7637@1.0.0 · 14996 ms
```

ledger `image · 400 in / 1,056 out · 14,996 ms`; the candidate passed its check and became the
current version (draw + check 21.6 s) and the lantern shows in the world (`64`; the asset
`65-asset-lamp-over-look.png` beside the look `65-world-look-256.jpg`). For scale: the three
text-only look sketches of Create took 222–226 input tokens each; the two pictures drawn over the
reference took 390 and 400.

## 6 · Renderer console

Run I: 184 `renderer:ERR`, **all from `ulwork://`** (the rejected asset candidate's check frame,
one TypeError a frame); 0 from the app. After the restart: 0. R1: 0; R2: **0 errors**, the only
warnings are `[repair]` lines of background chapter writes. Read from main's `[renderer:*]` console
forwarding.

## Failures and fixes

1. **A dungeon's maze was unreadable.** The walls were drawn with the stone ground sprite plus a
   28 % shade, and models write dungeon floors as `stone`, so walls and corridors looked the same
   (`14`). Fix: the floor sinks into shade and a wall is a lit top face with a bright lip and a dark
   front face, whatever the floor (`src/renderer/engine2d/place/dungeonView.ts`, tokens `floorShade`,
   `wallTop`, `wallFace`, `wallEdge` in `src/renderer/engine/palette/place2d.ts`). After: `23`, `24`,
   `r-07`, `r-08`.
2. **The dungeon was still described as first person** (after D5 it is seen from above): the place
   maker's tile 「第一人稱的格子迷宮」 and the place prompt's `KIND_NOTE`. Fix:
   `src/renderer/i18n/strings/hud-panels.ts` (`kindDungeonDetail`, three languages) and
   `src/dsl/prompts/place.ts`.
3. **Escape never left an otherworld.** The played frame takes keyboard focus (as it must, for the
   world's keys and a pad user), so the host's Escape listener never saw the key; only the Leave
   button and a pad's Start worked. Fix: the frame runtime forwards a trusted Escape press as a new
   frame message `escape` (`src/main/works/frame.ts`, schema in `src/shared/works.ts`, still
   rate-limited and token-checked by `frameGuard`), and `WorkFrame` answers it in play mode with the
   same synthetic Escape the pad sends (`pressEscape`, now exported from `src/renderer/input`), so
   the host's own Escape paths decide what closes. Re-run after a restart: Escape leaves the played
   otherworld and the workshop's preview (`62`). Two smaller changes met on the way:
   - 3b. `[image]` log lines now name the model, the request and the look
     (`src/main/works/images.ts` `GeneratedImage.call`, `src/main/works/ipc.ts`).
   - 3c. `WORK_CONTRACT` says `host.asset` returns a data URL *string* to use as an `<img>` src or to
     load into `new Image()` before `drawImage` (`src/shared/workPrompt.ts`, +20 prompt tokens). One
     world before (asset rejected by its check) and one after (asset accepted) — two data points.

Driver: `scripts/cdp-drive.ts` `{hold: {from}}` (see Replay).

## Findings (not fixed here)

1. **Walking into any place heals.** The land had HP 46; the course's fight started at 100, and back
   on the land HP was 100: the land view remounts and `useLandCombat` loses its HP ref, and a place
   builds a whole roster (`usePlaceCombat`). HP is not saved at all, so where it should persist is a
   design decision.
2. **A re-entered place shows its chests closed again** (`resetFloor` on entry; `opened: []` on
   re-entry); by the code, opening one again adds its items again. Not exercised.
3. **Place writes need repairs often:** 2 of 3 (a `Quest` without its text, twice; an NPC accent that
   was not a colour). The raw answers are not logged, so the cause was not established.
4. **A wall in the line of fire gives no feedback:** 30 presses behind a 1-tile wall drew nothing
   and said nothing (`empty` spends no round). A player cannot tell the wall is in the way.
5. **16-bit look at night:** place markers and their titles sit under the night wash; the magenta 異
   and its title are low-contrast (`57`).
6. **The HUD inside a place** still shows 「第 1 層」 and 「這一層沒有進行中的任務」 while the place's own
   goal is shown bottom-left.
7. Run R1 was interrupted by another session's i18n edit (vite full reload); R2 is clean.

## Checks

`bun run typecheck` 0 errors (node, web, test configs) · `bun run lint` clean (816 files) ·
`bun run lines` ok · `bunx vitest run` 123 files / 557 tests passed — after all fixes.

## Not verified here

- A real climb or maze chapter of a story (the gun world's e3 / e4 are behind two chapters); the
  chapter-as-place check used an injected stage.
- A pad inside a course or a dungeon (keyboard and one pad X only); a real USB pad.
- Monsters in a place closing in and striking (they stayed beyond the aggro radius), and dying in
  a place (the "revived" path).
- An otherworld in the built-in world (done in the gun world), a failed `play-missing` recovery,
  and restoring a save with an otherworld on another machine.
