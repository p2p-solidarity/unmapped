# E2E · rev 6 phase 2 · title and library (D3), gamepad and focus (D4), the cozy built-in world (D7)

The real-app run of phase 2's library, input and cozy-world packages
(`docs/plans/rev6-phase2.md` D3, D4, D7), ending on done-looks-like #2: **with no keyboard and no
mouse, a gamepad plays from the title through the first chapter.** It does: the final replay of
`run.json` went from the title to chapter 1 cleared in 36.8 s and back to the title in 39.4 s, on a
fresh userData, with nothing but a virtual standard-mapping pad after the first wait. Six app bugs
were found and fixed on the way (below), each re-run after the fix.

## Replay

```bash
# Part A — library, keyboard and mouse
mkdir -p "$TMPDIR/ud-p2-pad-a3"   # must be empty
AETHER_TEST_USER_DATA="$TMPDIR/ud-p2-pad-a3" bun run dev --remoteDebuggingPort 9333   # background
bun scripts/cdp-drive.ts "$(cat docs/e2e/milestone-rev6-p2-gamepad/run-library.json)"   # ~25 s, a-00…a-09

# Part B — gamepad only (its own fresh userData)
mkdir -p "$TMPDIR/ud-p2-pad-b3"
AETHER_TEST_USER_DATA="$TMPDIR/ud-p2-pad-b3" bun run dev --remoteDebuggingPort 9333
bun scripts/cdp-drive.ts "$(cat docs/e2e/milestone-rev6-p2-gamepad/run.json)"          # ~42 s, b-00…b-12
```

Environment: macOS 27, dev build (main 7a04adf + the uncommitted phase-2 tree + this run's fixes),
UI zh-TW (system default), window 1440 × 868 in the background (`backgroundThrottling` is off under
`AETHER_TEST_USER_DATA`). Model: the fresh-userData default, Settings → Model
`openai · gpt-5.4-mini`, key from `.env`. Model calls and times are the `[inference]` lines of the
main log and `usage.jsonl`.

How Part B drives: before the first `wait`, one `cdp` call (`Emulation.setFocusEmulationEnabled` —
a background window has no document focus, so `:focus`, and with it the pad's focus ring, never
matches; a player's window has focus) and one eval that defines read-only helpers on
`window.__e2e` (the player's position, the current chapter's people and finds recomputed with the
app's own `chapterScene` / `canStandAt` / `residentTiles`, and a free spot next to the next undone
one from which it is the nearest target). After the wait only `pad`, `wait`, read-only `eval` and
`shot`. Two driver additions in `scripts/cdp-drive.ts` make the run replayable on any seed (New
game rolls a random one): `{"pad": {"toward": "<js → [x, z]>", "within", "buttons"}}` leans the
left stick toward a point the way a player walks to what they see (and sidesteps when stuck), and
`{"repeat": {"times", "until", "actions"}}` loops until the chapter is cleared.

Runs, each on its own throwaway userData:

- **A1** `ud-p2-pad`: Part A driven one call at a time; found bugs 1 and 2. The same userData then
  served as the Part B rehearsal (pad walks, dialogues, the 16-bit look) and found bugs 3 and 4.
- **A2** `ud-p2-pad-a2`: the Cartridges check after fix 1 (`a-10`).
- **A3** `ud-p2-pad-a3`: `run-library.json` replayed whole after all fixes (`a-00`–`a-09`).
- **B1** `ud-p2-pad-b`: Part B interactively, three calls; found the driver's spot problem and bug 5.
- **B2** `ud-p2-pad-b2`: `run.json` replayed whole in one call; found bug 6.
- **B3** `ud-p2-pad-b3`: `run.json` replayed whole after fix 6 — the shots `b-00`–`b-12` are this run.

## Part A — library, keyboard and mouse (A3; A1 where noted)

| # | Expected | Observed |
| --- | --- | --- |
| A1 | Title shows exactly 繼續 · 世界 · 創造世界 · 設定, Continue disabled on a fresh userData | `[繼續 disabled, 世界, 創造世界, 設定]`, focus on 世界 (`a-00`) |
| A2 | 設定 is a dialog, the menu inert, Esc returns focus | `role=dialog` 「設定」, focus inside (English), the menu's column `inert`; Esc → no dialog, 0 inert nodes, focus on 設定 (`a-01`) |
| A3 | 世界 lists 新遊戲 · 存檔 · 卡帶 · 大陸, no 封存 | `新遊戲 · 存檔 0 · 卡帶 4 · 大陸 · 市場` — no 封存. **市場** is another session's work in progress (`src/renderer/app/market/**`), not in this brief (`a-02`) |
| A4 | 卡帶 lists aether-land 1.0.0–1.3.0 | A1: **「還沒有卡帶。」 and count 0** while `cartridges.list()` returned all four (bug 1), and once listed the four rows read only 無界之地 / 無界之地 / 未記之地 / 未記之地 (bug 2). A2/A3 after the fixes: `卡帶 · 1.3.0`, `· 1.2.0`, `· 1.1.0`, `· 1.0.0`, count 4, before any New game (`a-03`, `a-10`) |
| A5 | New game reaches Play on 1.3.0 | 開始 → Play in 333 ms (A1 475 ms); active save pins `aether-land@1.3.0` `sha256:57f17e0d…` (`a-05`) |
| A6 | Back at the title Continue is enabled; 存檔 shows the save | 繼續 enabled and focused (`a-06`); 存檔 1: 「無界之地 · 9ZCT-T4DD · aether-land@1.3.0」 with 繼續 / 備份存檔 / 還原備份 (`a-07`); Cartridges detail shows 「1 個遊玩進度」 (`a-08`); 繼續 on the title reopens Play on 1.3.0 (`a-09`) |
| A7 | Nothing that existed is unreachable | The old title had Continue, New game, Create, Worlds (AI worlds), Continent, Cartridges, System, Archive. Now: New game / Continent / Cartridges / Saves are library sections, System is 設定, Archive is a library section when legacy worlds exist (not on a fresh userData, so not seen), AI worlds are reached from the in-world place maker (`OtherworldPicker` → `works`, code read, not driven here) |

## Part B — gamepad only (B3; B1/B2 where noted)

| # | Check | Observed |
| --- | --- | --- |
| B1 | Title → 世界 → New game → Start by pad | stick down → 創造世界, D-pad ↓ → 設定, A → Settings dialog, B → closed with focus back on 設定, ↑ ↑ → 世界, A → library (focus 新遊戲), A → panel, focus lands on 開始 (5.4 s after the first eval, Settings detour included), A → Play at **5.8 s** on `aether-land@1.3.0` (seed H7S5-FQMQ) (`b-00`–`b-04`) |
| B2 | `data-input="pad"` after pad input; hint rows show pad glyphs | `data-input="pad"` from the first press. Library hints `✚ · B`; Settings `B 返回` (`b-01`); Play: `LS / ✚ 移動 · RB 衝刺 · A 互動 · Y 留言 · Start 選單`, dock `留言 Y`, prompt `A 開門` (`b-04`); title after Start `✚ · A`. A real key press (V) switches them back to `WASD … E 互動` (A1) |
| B3 | Focus ring visible in dialogs | Settings: `outline solid 2px` + `0 0 0 5px` glow on English, then on 雲端 API after D-pad ↓ (`b-01`); gate card on 開始 (`b-06`); dialogue on the first choice, then the second after ↓ (`b-08`, `b-09`). Menu rows (library nav) show their gold marker instead, by design |
| B4 | Dead zone | Play: lean `0.25` for 1 s and `(-0.2, 0.2)` for 1 s → position 8.5, 8.5 unchanged (B1, B2, B3). Title: lean `0.4` for 0.5 s → focus stays on 世界; a full lean moves one row |
| B5 | RB sprint | on the ford row, 1 s each: stick → 8.5 → 12.5 (4.0 tiles/s; B2 4.4), with RB → 19.5 (7.0 tiles/s) — the kit's walk 4 / sprint 7 |
| B6 | Walk to chapter 1's gate (chunk 2, 0) | south to the chunk-centre row (2.1 s), then east sprinting from x 19.5 to 79.9 (60 tiles) in 8.7 s; at the gate at **22.5 s**, HUD 大地 2 · 0, nearby `episode:e1` (`b-05`) |
| B7 | Chapter written while walking | already written when the player arrived (checked at 22.6 s): chapter call started with Play, 1 call, 5,462 ms, 2,096 + 951 tokens. People 阿久 · 美代 · 小圓, 1 find, 0 foes. B2: 2 calls (a repair for non-ASCII statement names), also ready before arrival |
| B8 | B closes panels | gate card (A at the gate) → B → closed, input unlocked; notes (Y) → B → closed (`b-11`) |
| B9 | The A that picks a choice doesn't reopen the talk | A on the card's 開始 (held 300 ms) closed it and did not reopen it; A on a dialogue choice (held 300 ms) closed the dialogue with the person still nearest, and 0.8 s later it was still closed |
| B10 | Talk to every person, open every treasure | 阿久: A → dialogue with focus on 「我聽到了。」, ↓ → 「我再去看看。」, A → taken (`b-07`–`b-09`); 小圓, 美代: A, A; the find: A → toasts 「找到：涼糖, 折好的車票」 and 「章節通關：The Twice-a-Day Bus」. **Chapter cleared at 36.8 s**: met 3/3, found 1/1, carry `{"The Twice-a-Day Bus": ["涼糖", "折好的車票"]}`, HUD 故事 1/3 · 下一章 What the Wind Took, usage 「本世界：5 次 · 輸入 18,903 / 輸出 6,170」 = the ledger (`b-10`) |
| B11 | Start returns to the title | Start → title at **39.4 s**, 繼續 enabled and focused (B2: focused on 世界 — bug 6), 1 save on 1.3.0 (`b-12`) |
| B12 | Where the pad could NOT proceed | Nowhere in the app. B1's first loop pressed A ten times on 則, a resident of the witnessed chunk standing one tile from the chapter's 阿爺: the driver's standing spot was nearer to him. Walking round to 阿爺's other side works (the second loop did); that was the driver's aim, not the app. Reading why led to bug 5 |

Numbers (B3): whole list **42 s** wall clock (B2 41 s); title → Play 5.8 s, → gate 22.5 s, →
chapter cleared 36.8 s, → title 39.4 s. **6 model calls**, all background: chapter 1 ×1 (5,462 ms),
witness ×4 (4,983–6,864 ms; the five finished calls used 18,903 in / 6,170 out tokens), chapter 2 ×1
aborted by Start after 2,435 ms (it resumes on the next Play). B2: 7 calls (chapter 1 ×2, witness
×4, chapter 2 aborted). B1: 7 calls (chapter 1 ×2, witness ×3, chapter 2 ×2 done). Renderer errors:
0 in B1, B2, B3; the only warnings are `[repair]` lines.

## Part C — the cozy built-in world

- Eval in Play (B3): 1.3.0 `gameplayRules.combat = null`; story `e1:meet@2,0 · e2:search@-2,2 ·
  e3:meet@0,-3`; New game has a chapter from the first minute (B7). None of the shipped
  revisions 1.0.0–1.3.0 declares Combat.
- `@shared/safeGround` exists (`isSafeGround`, `safeChunk`) and `useLandCombat` uses it for the
  roster filter and the pursuit path (`src/renderer/engine2d/useLandCombat.ts` 131, 208–209);
  `combatLoop` and `hostiles` take `ground.safe` for strikes and steps. **Code read only — not
  verified in the app**: no shipped world has combat, and creating one with fights in Create was
  not run.

## In passing

- **16-bit look** (V, A1, chunk 2, 0): the well is drawn as a stone ring with dark water, not a grey
  box with letters (`a-11`, zoom `a-12`). No torch, altar, statue or pillar stood on the witnessed
  chunks of that land (their props: chimney, utility_pole, vending_machine, tree, rock, bus_stop,
  well, house), so those four were not seen.
- **上次選擇 never showed a player id** (A1, B1–B3): values seen were place names (田路岔口,
  岬口石場), dialogue choices (敲站牌, 我來看著。) — and see finding 1.

## Failures and fixes

1. **Cartridges said 「還沒有卡帶」 on a fresh userData.** The library is read once when Worlds
   opens, but the built-in world is installed by the New game panel mounted at the same moment, so
   the list was read before the install finished; the four revisions appeared only on a later
   visit. Fix: `NewGamePanel` re-reads the library once when the revision it installed is not in
   it (`src/renderer/app/library/NewGamePanel.tsx`). Re-run A2, A3: 卡帶 4 before any New game.
2. **Four cartridge rows, two names, no versions** (無界之地 ×2, 未記之地 ×2): a revision could be
   told apart only by selecting it. Fix: a cartridge row's meta reads `卡帶 · <version>`
   (`src/renderer/app/title/CartridgesPanel.tsx`).
3. **A pad's first press was swallowed.** The poller latches controls held when its mode flips, and
   a pad appearing counted as a flip (`null → menu`); browsers reveal a pad on its first press, so
   that press was always lost (the first B in the library did nothing). Fix: a pad that just
   appeared latches nothing (`src/renderer/input/gamepad.ts`). Re-run: the first D-pad press moves
   focus.
4. **The interact prompt read 「A  E · 進入 · …」 after a pad input** (and 「E  E · 開門」 on
   keys): `NearbyPrompt` draws the key (E or A) and `nearbyPrompt` also prefixed every line with
   `E · `. Fix: the line no longer names a key (`src/renderer/app/prompts.ts`); now 「A 與 美代
   交談」 / 「E 開門」 (`x-01` before, `x-02` after, `a-05`).
5. **A chapter's person or find could stand on a resident's tile and never be reachable.**
   `settleAround` keeps chapter people off the gate and off each other, but LandView2D's `free`
   only checked ground and props; residents of witnessed chunks come earlier in the target list and
   `nearestTarget` breaks ties on the earlier entry, so someone standing exactly under a resident
   could never be the nearest — for pad and keyboard alike — and the chapter could never clear. B1
   hit the one-tile case (則 beside 阿爺, reachable from the other side); the same-tile case was not
   observed, the fix follows from the tie rule. Fix: `residentTiles(chunks)` in
   `src/renderer/engine2d/chapterLayer.ts`, excluded in `LandView2D.tsx`'s `free`. Positions are
   recomputed on load, so only someone who stood on a resident moves.
6. **Back at the title by pad, focus was on 世界 instead of 繼續** (B2). The poller gives a pad
   user focus every frame; while the saves were still loading Continue was disabled, so the pad
   focused 世界 first and the title's own first focus (which waits for the saves) no longer applied.
   Fix: the title menu is `data-nav-skip` while the saves load (`src/renderer/app/WorldsScreen.tsx`).
   Re-run B3 and a pad Continue → Start → title twice: focus 繼續.

Driver (not the app): `scripts/cdp-drive.ts` gained `pad.toward` and `repeat` (see Replay).

## Findings (not fixed here)

1. **上次選擇 shows host-written English karma text.** After a chapter clears the HUD reads
   「上次選擇：cleared chapter The Twice-a-Day Bus」 (B2, B3), and by `openChapterTreasure`'s karma
   line (`opened ${treasure.id}`) a chapter find would show an internal id such as
   `opened treasure_memo` (from code; the clear line came right after it in these runs). Never a
   player id. The HUD should skip or translate host lines (`app/hud/summary.ts`).
2. **Notes (Y) put the pad's first focus in the note text field**, which a pad cannot type into;
   B still closes it and the D-pad reaches the other buttons.
3. **The chapter-writing card's 暫停 / 取消 / Retry are not pad-reachable in Play** (the card is not
   a layer). A failed chapter can still be retried by pad from its gate card (撰寫), which is the
   path this brief asked about — not exercised, because no chapter write failed in any run.
4. `tests/shared/physics.test.ts` and `tests/shared/history-fold.test.ts` fail typecheck / 3 tests
   against another agent's in-progress `src/shared/history/**` (reserved; untouched here).

## Checks

`bun run typecheck`: node and web configs pass; the test config fails only in
`tests/shared/physics.test.ts` (reserved history work) · `bun run lint` clean (741 files) ·
`bun run lines` ok · `bunx vitest run` 110 / 112 files, 488 / 491 tests — the 3 failures are in
`history-fold` and `physics` (reserved `src/shared/history/fold.ts`); `tests/identity/pack.test.ts`
passed.

## Not verified here

- Safe home in a world with combat (Part C): code read only.
- Torch, altar, statue, pillar in the 16-bit look: none on this land.
- A failed chapter write retried by pad (no write failed).
- A real USB/Bluetooth pad: the pad was the virtual standard-mapping pad `cdp-drive` installs; the
  focus ring needed focus emulation because the driven window was in the background.
- AI worlds from the place maker (D6) and the Archive section (no legacy worlds on a fresh userData).

> Commit ids in this record were updated after the 2026-09-26 rewrite of main, which changed only test date strings (7a04adf was ca6394b, d84cfde was f59d7c3, feac2d3 was 8e2fa8d).
