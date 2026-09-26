# E2E · rev 6 · the integrated journey (phases 2–4 in one run)

One continuous player journey across everything rev 6 phases 2–4 built, on the final code: one
world, made in Create, carried from A's first click to a phone, a `.world` file, a local model and
a quit-and-continue. Earlier runs checked each piece alone; this one checks the whole path.

**Verdict: pass, with two expectations that the app's own design answers differently (steps 10
and 12), recorded below.** No app code was changed. The model spend was 9 chat calls and 3 pictures.
`bun run check` passes typecheck, lint and lines. Vitest had 3–4 tests that timed out at 5 s while
other sessions kept the machine at load 15–21. There were no assertion failures (see Checks).

## Replay

```bash
SCR=<scratch dir>; R=<repo root>; D=docs/e2e/milestone-rev6-integrated-journey
mkdir -p $SCR/{snap,svc,udA,udB,udC,udD,files,chrome-profile}
git -C $R fetch -q && git -C $R archive origin/main | tar -x -C $SCR/snap          # e0710c6
cp $R/src/renderer/app/title/ModelPanel.tsx $SCR/snap/src/renderer/app/title/       # the one uncommitted fix
ln -s $R/node_modules $R/.env $SCR/snap/
# snapshot-tools.txt: the renderer's cacheDir/port edit in electron.vite.config.ts, vite.ij.page.mts,
# close-browser.ts and console-dump.ts
(cd $SCR/snap && node scripts/build-afm-bridge.mjs debug)                           # the snapshot's own bridge
(cd $SCR/snap && UNMAPPED_SERVICE_TEST=1 bun run service -- --port 8797 --data $SCR/svc \
  --browser-origin http://localhost:5190) &
app() { (cd $SCR/snap && AETHER_TEST_USER_DATA=$SCR/ud$1 IJ_APP=$1 IJ_VITE_PORT=$2 $4 \
  bunx electron-vite dev --remoteDebuggingPort $3) & }
app A 5291 9340                                                                      # later: B, C, D (run.json)
step() { CDP_PORT=$1 bun $SCR/snap/scripts/cdp-drive.ts "$(python3 -c "import sys; t=open(sys.argv[1]).read(); \
  print(t.replace('__INVITE__', open(sys.argv[2]).read().strip() if len(sys.argv) > 2 else '__INVITE__') \
  .replace('/__REPO__', '$SCR/snap'))" $D/$2 $3)"; }
step 9340 run-01-a-title-settings.json; step 9340 run-02-a-create.json   # … every step in run.json order
```

`run.json` holds the env, the model and all 46 steps in order: 35 cdp-drive steps, each also in
its own `run-NN-*.json`, plus 11 shell steps. Invites are passed with a literal replace, never
`sed`. World ids, keys and hashes below are this run's; a replay makes new ones.

**Environment:**

- Code: origin/main `e0710c6` as a `git archive` snapshot, plus the uncommitted `ModelPanel.tsx`.
- Platform: macOS 27.0, Bun 1.3.6, Electron 44.3.0, Vite 8.3.0.
- Ports:
  - A: CDP 9340, renderer 5291.
  - B: CDP 9341, renderer 5292.
  - C, then D: CDP 9342, renderer 5293.
  - Phone: chrome-headless-shell 1243 on CDP 9343, page on 5190.
  - Service: 8797.
- The renderer's dev port is fixed per app, so A's relaunch kept its origin and localStorage.
- Model: `openai · gpt-5.4-mini`, the Settings → Model default on a fresh userData, with the key
  from `.env`. Pictures used `gpt-image-1-mini`.
- C switched to Apple on-device (the in-app `afm-bridge`) for step 11, then to llama.cpp.

## Checked

World `hpnal6es5oliwpwe435ocxoiwn7sqyuurgrxt27enrjjk2lishivq` "Fog-bound drifting islands",
cartridge `fog-bound-drifting-islands-66d73a@1.0.0` (`sha256:aef83b41…04a9`).

Keys:
- A: `krcegpbd…`
- B (Bea): `kv3nyzlh…`
- Phone (Rin): `kqeyg65u…`
- C (Cy): `k6sfq3qq…`
- D (Dee): `kviljkdr…`
- Service: `kvt6qo3c…`

| # | Step | Checked / observed | Numbers | Verdict |
| --- | --- | --- | --- | --- |
| 1 | **A: title and settings** | The title has exactly 繼續 · 世界 · 創造世界 · 設定, plus the ↑↓ / Enter hint row (`01-a-00`). Settings → English. Model: "Next call: OpenAI · key from .env · gpt-5.4-mini", "Connected" (`01-a-01`). Shared worlds: added `ws://127.0.0.1:8797` → Test: "Reachable: unmapped-service/1, physics 1, 0 worlds kept … test mode" (`01-a-02`) | probe 1,050 ms; health 9 ms, greeting 11 ms | pass |
| 2 | **A: Create, five steps** | **Idea:** words only, name blank. **World:** 7 cards; derived name "Fog-bound drifting islands". **Lock:** Lock the look card, then "Rewrite the 6 unlocked cards": look identical (162 chars), the other 6 all changed. **Look:** at 2.5 s the drawing counter and the streaming story showed together. "The story is ready: 5 chapters." appeared, then 3 pictures. Chose sketch 2. **Story:** 5 chapters. **Quote:** 1 call + up to 2 repairs; ≈2,962 input tokens, ≤2,200 output; ≈US$0.02, ≤US$0.05 at the 2026-09-26 list price; the chapter-1 line; "This draft: 6 calls · 2,836 in / 1,915 out" (`02-a-00`…`02-a-09`). **Build and play:** published, then the BuiltPanel asked for an optional ENS name (finding 1). "Enter the world" → Play (`02-a-09b`, `02-a-10`). Chapter 1 "Lamp Count" was written in the background, and D walked (`02-a-11`). **Picture:** the manifest's `assets/look.png` is 270,594 B `sha256:dbba8d91…4060`, equal to the chosen picture hashed in the page | stream at 1,759 ms; cards at 2,709 ms (bible 2,498 ms, 1,126+251). Rewrite: preview at 835 ms, done 2,278 ms (528+336). Story ready at 3,449 ms (3,367 ms, 617+512). Pictures at 9,986 ms (`[look]` 9,762 / 9,847 / 9,917 ms; 189/190/186 in, 272 out each). Build → published 2.53 s (origin 2,471 ms, 2,777+581; quote estimate 1.067× real). Enter → Play 282 ms. **Words → published 21.4 s.** Chapter status gone 3.2 s after Play (chapter 2,929 ms, 2,184+608). Origin chunk witnessed on entry (4,967 ms, 3,389+1,187). Walk: x 8.5 → 14.50 in 1.5 s | pass |
| 3 | **A: play** | Chapter 1's gate is at (80.5, 16.5) in chunk (2, 0). Walking the z=16 ford **witnessed (1, 0)** "Lamp Edge" (n 6) and (2, 0) (n 7), which the path needs, then reached the gate (`03-a-00`, `03-a-01`). **Talked to Bram** (the chapter's person): "I kept the pier posts in sight. Three freight kites are late…", then "Ask for the freight marks"; `met: [bram]` (`03-a-02`, `03-a-03`). **Note** n 8 at (2, 0) tile 17,14 (`03-a-04`). **Usage panel:** "This world: 11 calls · 18,330 in / 6,527 out · 5,120 cached". Every by-purpose row equals the sum of main's lines: cards 2 · 1,654/587; story 1 · 617/512; picture 3 · 565/816 (ledger); starting place 1 · 2,777/581; chapter 1 · 2,184/608; witnessing 3 · 10,533/3,423/5,120 (`03-a-05`) | Talk: `[inference] chat` lines 8 → 8, **0 new calls**. Witness (1,0) 3,698 ms, 3,501+778 (2,304 cached); (2,0) 5,516 ms, 3,643+1,458 (2,816 cached) | pass |
| 4 | **A: share** | Door → "Share on 127.0.0.1:8797" → "Shared on 127.0.0.1:8797 · Online". Service: `attached world hpnal6es… (9 entries)`. The log is 1 genesis, **2 pack**, 3 profile, 4 chapter, 5–7 witness, 8 note, 9 sequencer. The service holds the pack blob `f7d581dd…` (277,059 B) (`04-a-00`, `04-a-01`). The invite is 600 chars, 1 use, 7 days (`04-a-02`) | Online in **276 ms** | pass |
| 5 | **B (fresh): join** | Preview: "Made by player-YSAA · Kept on 127.0.0.1:8797 · Door: Friends · 0 members · 9 entries · 1 of 1 use left". Joined as Bea: member, `member.join` n 10, pack installed. B walked A's (1, 0) "Lamp Edge" and (2, 0), both `written`, and Notes at (2, 0) showed A's note (`05-b-00`…`05-b-04`) | Join and play **602 ms**. B's `[inference]` lines: **0** | pass |
| 6 | **Together** | Both stood at the west edge, then walked into unwritten (-1, 0), B 2 s after A. A: `mine: true`, meaning granted; its HUD read "You are writing this; everyone here reads it as it arrives · 2516 characters so far" (`06-a-00`). B: `mine: false`, `by` = A's key, the **same sid** `p-X8tYNpimO-cN_O2L0Htg`, 30 frames k 0…29. **Text sha256 `5c0b57db…603c` on both** (3,391 chars). **1 witness call in total** (A). **Both flipped at n 11**, the same id `hjwieobz…`, "Fog Tide" (`06-a-01`, `06-b-00`, `06-b-01`) | A claim → developing 235 ms. Witness 4,527 ms, 3,709+996 (2,816 cached). B's walk took 6.3 s (the together panel holds input, as in p3-together) | pass |
| 7 | **B: a note; A sees it live** | B's note n 13 at (-1, 0) tile 24,16. A was never reloaded: its land-store watcher saw it, and N lists "Bea · tile 24,16" (`07-b-00`, `07-a-00`) | A saw it **40 ms** after B's click | pass |
| 8 | **A: make B a co-owner** | Door → People: Bea "member since entry 10" → Make co-owner → Make them a co-owner. The row reads "co-owner since entry 14", with "Bea is now a co-owner." `owner.add` is n 14 by A; owners = {A n 1, B n 14} (`08-a-00`) | — | pass |
| 9 | **Phone joins** | A made a second invite (`09-a-00`). The phone (375 × 812, touch) joined as Rin: canvas and "Online · Entry 15". It **drew A's land from the world's pack**: IndexedDB blob `f7d581dd…` 277,059 B, cartridge `fog-bound-drifting-islands-66d73a@1.0.0`, land mode `history`, chunks -1,0 · 0,0 · 1,0 · 2,0, gate marker "Lamp Count" (`09-p-00`, `09-p-01`). **Stick:** +50 px held 1.5 s moved (8.5, 8.5) → (15.366, 8.5) (`09-p-02`). **Note** n 16 at {0, 0, 15, 8} = the player's tile (`09-p-03`). **A saw it** without a reload, and N lists "Rin · tile 15,8" (`09-a-01`) | Join **360 ms**. Note signed 06:05:12.819Z, receipted .836Z; A had it at .852Z (**16 ms** after the receipt) | pass |
| 10 | **World files** | B: Worlds → World files → Export .world: "Wrote b.world (282 KiB)" (`10-b-00`). `verify-world` offline (`sandbox-exec` deny network*): "OK — every check passed", 16 entries by 3 keys, owners 2, services 8797 from #9, packs 1, exit 0. **C (fresh) imports it:** the report is "16 entries … 2 owners · 3 writers … Sequenced by: 127.0.0.1:8797 … Every check passed" (`10-c-00`). Bring it in (Cy) → Play; **the land draws** (4 written chunks, gate, notes) (`10-c-01`, `10-c-02`). **Not adopted:** the world id is the same, role `visitor`, `writable: false`, `access-members-only` "Only members read this world." / "Ask the owner for an invite.", toast "…is on this device.". That is `bundles/import.ts` step 4: only a *never-attached* world is adopted, and an attached one is read-only until an invite (finding 2). B's co-owner invite (`&o=`) then made C a member: the preview said "This device has a save of this world… Joining makes this device a member of that save.", and the result was `member.join` n 17, writable (`10-b-01`, `10-c-03`, `10-c-04`) | File 287,951 B, sha256 `a086ed24…465b`; verify checked in 153 ms (0.34 s wall). Import → Play **596 ms**. Join after import **1,192 ms**. C's `[inference]` lines: 0 | partial (import, verify and land pass; "adopted" does not apply to a shared world) |
| 11 | **Local model** | C: Settings → Model → Apple on-device → Use this model → Check: "Connected · 134 ms · 4096 token context (model)". Config `apple-fm`, `sidecar: null`, no `fm serve` process (`11-c-00`). **Create's first two steps on Apple:** the idea, then Write the world → 7 cards (`11-c-01`, `11-c-02`). **Witness** of (0, 1) on C's world (C a member): **`model-context-too-small`**: "This task needs 4110 tokens of prompt and at least 1280 of answer, but Apple on-device holds 4096 in all." The hint: "Switch to Cloud API in Settings → Model, or shorten what the task sends." The HUD shows FAILED and Retry witnessing, and the usage line counts it as not a call (`11-c-03`, `11-c-04`). **llama.cpp** (no `llama-server` installed, nothing on :8080): "Not installed or running". Use this model **saved** `{kind: llamacpp, baseUrl: http://127.0.0.1:8080/v1, sidecar: null}`. Check: "Model did not answer" (probe reachable false). **No `untrusted-config`** (`11-c-05`). The next real call, Rewrite the cards, showed "Error · connection-refused · Could not reach http://127.0.0.1:8080/v1. · start llama-server (…) or fix baseUrl" (`11-c-06`) | Bible on Apple: **104,090 ms**, 1,519+263, ctx 4096 (15 s in milestone-apple-create). Witness failed in **6,588 ms**. llama.cpp check 1,061 ms; the call failed in 1,488 ms, `connection-refused` | pass |
| 12 | **A: quit and continue** | A stood at (38.229, 17.659) in (1, 0), head 19 (`12-a-00`). Browser.close from Play ended the process. Relaunched on the same userData and origin: the title was in English (localStorage kept). **Continue → back where A stood: (38.234, 17.659)**, (1, 0), online, head 19, no new `profile` (`12-a-01`). **Quit visit:** A's quit logged no visit line, because A's visit for the day was already n 19, written at 06:09:59.567Z. That is 15 min after A entered Play, by `VISIT_AFTER_MS`, and one visit per author per day is the rule (finding 3). The quit path was shown on a fresh device **D**. D joined with B's invite, walked (0, 0) → (1, 0) and quit from Play. Main logged **`[world] hpnal6es5oli… visit of 1 chunks written on quit`**, and the service got n 21 `visit` {(1, 0)} by D (`12-d-00`…`12-d-03`). **Heads:** service, A, B and D are at n 21 `sha256:020d75bb…2793` with byte-identical `log.jsonl` (`43a76d6c…`). C (closed at 19) matches on lines 1–19 (`eb2c905b…`). The phone is at 21 too (`chain-compare.txt`) | Continue → Play online (after the button enabled). D join 1,233 ms | pass (quit visit shown on D; on A the timer's visit came first) |
| 13 | **Health** | `[renderer:ERR]` / `[renderer:WARN]` lines: **0** in A (both launches), B, C and D. The phone page kept 0 errors or warnings since its reload (`console-dump.ts`). The only renderer messages were the dev-only `[vite] connecting/connected` and the React DevTools notice. `[inference]` per app: see Totals. `bun run check` on the snapshot: see Checks | — | pass |

## Totals

| App | Chat calls | Pictures | Input | Output | Cached |
| --- | --- | --- | --- | --- | --- |
| A (openai gpt-5.4-mini) | 9: bible ×2, story, origin, chapter, witness ×4 | 3 (gpt-image-1-mini) | 21,474 chat + 565 image | 6,707 chat + 816 image | 7,936 |
| B | 0 | 0 | — | — | — |
| C | Apple: 1 bible done + 1 witness refused (`model-context-too-small`); llama.cpp: 1 bible refused (`connection-refused`) | 0 | 1,519 (Apple) | 263 (Apple) | 0 |
| D | 0 | 0 | — | — | — |
| Phone, service | no model | — | — | — | — |

- **Usage panel, A's world** (after the relaunch): "This world: 12 calls · 22,039 in / 7,523 out ·
  7,936 cached". This is the 9 chat calls plus the 3 pictures, to the token. The panel shows tokens,
  not money.
- **Money at the app's dated price table** (`@shared/pricing`, gpt-5.4-mini $0.75 / $0.075 cached /
  $4.50 per M, 2026-09-26):
  - 13,538 uncached input: $0.0102.
  - 7,936 cached input: $0.0006.
  - 6,707 output: $0.0302.
  - Chat total: about **US$0.041**.
- `gpt-image-1-mini` has no price in that table (the app says "price unknown"), so the 3 pictures
  (565 in, 816 out) are not converted here.
- Local calls (Apple, llama.cpp) cost nothing.
- Every line is in `model-calls.txt`, with each device's `usage.jsonl`.

## Findings

No real bug with a small, clear fix came up, so no code was changed. Found on the way:

1. **Build stops on the BuiltPanel when a lineage market is configured.** After "Build and play" the
   world was published in 2.5 s. The app then showed "Your world is published · You can give it an
   ENS name now, or later in Worlds → Cartridges. Entering never waits for it." and waited for
   "Enter the world". Play opened 282 ms after that click.
   - This is `create.builtHeading`, shown "when a lineage market is set up". The repo `.env` sets
     `UNWRITTEN_LINEAGE_*`.
   - It is by design, but it is one more click than CLAUDE.md's "lets the player in at once".
   - A p2-create replay with that `.env` stops there. `run-02` now has the click.
2. **An imported `.world` of a shared world is not adopted.** The app does what `bundles/import.ts`
   documents: the world is read-only as a `visitor` until an invite (`access-members-only`), and
   the land still draws. Joining with an invite afterwards works. It reuses the imported save
   ("Joining makes this device a member of that save") and adds only `member.join`.
3. **A long session writes the day's visit before the quit.** `visits.ts` sends the visit after
   15 min in Play (`VISIT_AFTER_MS`), and the fold keeps one visit per author per UTC day. A had
   been in Play for more than 15 min, so its quit had nothing to write. The quit path itself works
   (D: "visit of 1 chunks written on quit").
   - Also seen: the chunk a player spawns in is not counted. D walked (0, 0) → (1, 0), and the visit
     holds only (1, 0). This was already noted in p3-offline-visit.
4. **Model output (content quality, not app logic).**
   - The witness of (2, 0), chapter 1's gate chunk, named the place **"Chunk 2,0"**. The prompt
     calls it "chunk (2, 0)", and the model echoed that.
   - It also wrote residents "Bram" and "Tilly", the same names as chapter 1's people. Two Brams
     now stand near the gate: a land resident and the chapter's person.
   - This is for the chunk-prompt owners (`src/dsl/prompts/chunk.ts`).
5. **A derived name cut mid-phrase.** "A salt-marsh town where the tide clock…" → "A salt-marsh town
   where the" (`nameFromWords`: 28 characters, cut at a word boundary). The player can rename it
   (cosmetic).
6. **Apple on-device was slow this time.** The same kind of bible call took 104 s here, against
   15 s in milestone-apple-create. The machine was under load 15–21 from other sessions, and
   nothing else was measured.
7. **Browser.close on a page target at the title.** It closed C's window, but the process stayed
   with 0 page targets until a browser-target `Browser.close` (`close-browser.ts`). From Play the
   page-target close quit A (twice), B and D completely. This was seen before in p3-offline-visit.
8. **The quote's estimate is now slightly high:** 2,962 estimated vs 2,777 real (1.067×), after the
   3.4 characters/token calibration. That is on the safe side (p2-create's finding 1 read 14 % low).
9. **Bun prints an error at exit.** `Internal error: directory mismatch for directory
   ".../snap/tsconfig.node.json", fd 3` appears at exit of `verify-world` and of the service. The
   exit code was 0 (known).

**Harness slips (not app bugs).** Each is recorded in its run file's `note`:
- 7b's first try pressed Escape with no layer open. That left Play; B continued back, and the
  continue wrote B's visit, n 12.
- 9b's note wait kept a stale `Entry 9` condition and ran its full 6 s. The note itself was
  receipted in 17 ms.
- 10b's first try started before C's title rendered.
- 11c's first two tries used the wrong way out of Create. Neither walked or called a model.
- 11e first looked for a button on the wrong step.
- 12b's first Continue click came while Continue was still disabled after a cold start.

## Checks

`bun run check` on the snapshot: origin/main `e0710c6` plus `ModelPanel.tsx`, with the
`electron.vite.config.ts` edit restored first.
- `typecheck` (4 projects): pass.
- `lint`: pass, "Checked 1098 files … No fixes applied."
- `lines`: pass, "ok: all source files are <= 600 lines".
- `vitest run`: **red on timeouts only.**
  - The first run failed 3 of 817 tests, each "Test timed out in 5000ms":
    - `tests/app/together-relay.test.ts` "sends a gapless prefix…"
    - `tests/engine2d/remoteMotion.test.ts` "never moves a figure more than 0.3 tiles…"
    - `tests/shared/cartridge-pack.test.ts` "refuses an honest zip bomb…"
  - A second run failed 4 tests the same way: the same three plus `tests/main/backup-land.test.ts`
    "refuses to export a save import could not restore".
  - Load average was 15–21, from other sessions; none of this run's processes were alive.
  - Each failing file passes alone (3 files, 15 tests; backup-land 8 tests).
  - The whole suite with `--testTimeout=20000` passes: 160 files, 817 tests, 68 s.

Teardown: every app, the phone browser, the page server and the service were closed. `lsof` on
9340–9343, 8797, 5190 and 5291–5293 shows nothing listening, and no process of this run remains.

## Not run

- **Clearing chapter 1, and chapter 2 being written:** only one person was met (the step asked for
  a talk, not a clear).
- **Presence between the phone and a desktop, and the phone's offline path:** outside this
  journey; see p4-mobile-proof.
- **Moving the world to another service, and a mirror import:** outside this journey; see
  p4-rehost.
- **Ollama:** not asked for, and not installed.
- **Picture money:** `gpt-image-1-mini` has no price in the app's table.
- **Screens in zh-TW and ja:** only the title was seen in zh-TW before the switch to English.

## Files

- `run.json`: env, model and all 46 steps in order.
- `run-NN-*.json`: each cdp-drive step on its own.
- `step-outputs.txt`: what every step printed.
- `model-calls.txt`: every `[inference]`, `[look]`, `[world]` and `[licence]` line per app, plus
  each device's `usage.jsonl`.
- `service.txt`: the service's log, its `log.jsonl` (n, kind, times, author, chain) and its blobs.
- `chain-compare.txt`: heads and log hashes on every holder.
- `verify-b-world.txt`: the offline `verify-world` output.
- `b.world`: B's export, replayable with `bun run verify-world -- b.world`.
- `snapshot-tools.txt`: the snapshot-only config edit, the page's Vite config and two small CDP
  helpers.
- Screenshots `01-…` to `12-…`, named step-device-index (`a`, `b`, `c`, `d`, `p` = phone).
