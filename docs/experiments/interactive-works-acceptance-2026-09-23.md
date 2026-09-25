# Interactive works — player + creation loop acceptance (2026-09-23)

Scope: Prompt 2 (sandboxed player) and Prompt 3 (generate → play → change → save) from
`docs/architecture/afm3-dsl-architecture.html`, built as `interactive-web@1`
(`docs/plans/interactive-web-player.md`). Entry: title menu → **AI Worlds**.

Environment: dev build (`bun run dev`) with an isolated `AETHER_TEST_USER_DATA`, driven over
the Chrome DevTools Protocol. Model: OpenAI preset `gpt-5.4-mini` through the existing inference
IPC. Every number below comes from `[works:attempt]` logs or `draft.json` metrics of real runs.
Billed cost is not returned by the API and is not estimated.

## Execution boundary (Prompt 2)

Verified in the running app, not only in the spike:

| Attempt by the world | Result |
| --- | --- |
| `window.seed`, `require`, `process` | all `undefined` |
| `parent.document`, `localStorage` | `SecurityError` (opaque origin) |
| `eval`, `new Function` | blocked by CSP |
| `fetch`, WebSocket, external `<img>` | blocked (`connect-src 'none'`, `img-src data: blob:`) |
| `window.open` | blocked (no `allow-popups`) |
| `location.href = "https://…?leak=1"` | blocked by host `frame-src ulwork:` (`ERR_BLOCKED_BY_CSP`); the world stopped, the watchdog reported it |
| `while (true) {}` | world process at 83 % CPU, host CDP round-trip 95 ms, watchdog killed exactly that pid, host renderer untouched |
| API surface seen by the world | `root, carry, load, save, complete, status, asset` only |

Residual (documented, accepted): `RTCPeerConnection` exists in the frame; CSP cannot block it. A
world only ever holds its own state, carry and asset data URLs.

Automated tests: `tests/works/boundary.test.ts` (CSP, escaping of `</script>`/`</style>`,
line mapping, per-session hosts, message guard: source/origin/token/schema/size/rate),
`tests/works/store.test.ts` (hash tamper detection, path ids, pinning, compare-and-set, stale
results, revert, size limits, concurrent save/complete), `tests/works/edits.test.ts`.

## Generation (four requests, one player, no per-genre code)

| World | First candidate | Repairs | Wall time | Model time | Tokens in / out | Core loop played |
| --- | --- | ---: | ---: | ---: | ---: | --- |
| Turn-based RPG | failed check: called `host.status` every frame (flood) | 1 | 52.4 s | 30.0 s | 4,957 / 3,757 | won 3 battles (after reload) |
| ARPG | passed | 0 | 24.6 s | 21.4 s | 812 / 2,862 | 5 kills → cleared |
| Maze (keys + exit) | passed | 0 | 16.3 s | 13.1 s | 810 / 1,871 | 3 keys → exit → cleared |
| Mario-like platformer | passed | 0 | 22.5 s | 19.3 s | 826 / 2,583 | reached the flag |
| **Total** | **3/4 first pass, 4/4 playable** | **1** | **115.8 s** | **83.8 s** | **7,405 / 11,073** | **4/4 completable** |

Not counted above: one earlier RPG run failed all three candidates because the test window was
hidden (timers throttled, no animation frames). That was a harness and product-robustness bug,
fixed below, not a model result.

"Playable" is the automated gate (starts, draws, survives replayed keys + click, and — added
during this run — resumes from its own save without errors). "Completable" was checked by
actually playing each world to its win condition.

## Changes (three kinds, plus one regression caught automatically)

| Request | Files touched | Result | Wall / model | Tokens in / out | Unrequested behaviour |
| --- | --- | --- | ---: | ---: | --- |
| Maze rule: 2 keys open the exit (was 3) | `main.js` (3 lines) | effective: 2 keys clears; 1 key → "still locked" | 6.7 / 3.4 s | 2,608 / 225 | movement, walls, lock intact; the key-pickup status text still says "/3" |
| RPG asset: slime uses `library/samurai_green.png` | `assets.json` only | effective: slimes drawn with the sprite | 5.2 / 2.0 s | 4,199 / 155 | battle won after the swap |
| ARPG screen: counter top-right, 2× size; full hearts at full HP | `main.js` (`drawUI`, 4 lines) | counter moved; hearts were already correct and were not changed | 6.9 / 3.6 s | 3,677 / 507 | logic untouched (diff) |
| ARPG rule: movement speed ÷ 10 | `main.js` (2 constants) | effective | 6.4 / 1.3 s | 3,665 / 107 | — |
| ARPG screen: hit spark yellow | `main.js` | first candidate failed the new resume check (`main.js:134:24 game.spark is not iterable`), repair 1 introduced `main.js:29:1 SyntaxError`, repair 2 passed | 46.7 / 14.0 s | 11,078 / 3,215 | whitespace-insensitive diff vs. before: only the colour and the state-merge fix; earlier speed and layout edits kept |
| **Total** | | **5/5 applied, 4/5 first pass** | **71.9 s** | **25,227 / 4,209** | |

Cancel: an edit cancelled after ~1 s ended as `cancelled` (1.1 s), wrote no candidate, and the
draft head stayed `c002`; the UI said the playable version was untouched.

Each change was made in a draft candidate; the previous playable version stayed current until the
candidate passed. History shows request, model summary, files changed, timing and tokens; any
earlier playable candidate can be restored. The model's own summary claimed a heart fix it did
not make — summaries are not proof; the diff is.

## Saved versions and journey

All four drafts were published as immutable `v1.0.0` revisions (content hash over manifest +
file table; editing a published file on disk is detected as `work-tampered`). A journey pinned
RPG → ARPG → maze → platformer and was played through:

- carry flowed `{coins:3,wins:3,potions:1}` → ARPG kept it → maze replaced it with `{keys:3}` →
  platformer merged `{keys:3,coins:3}`;
- the app was fully quit mid-maze and restarted: the journey reopened on world 3/4 with 1 key
  and the player at the saved tile, pinned to the same revision;
- "Reload" resumed the RPG from its save; "Journey complete" after world 4.

## Framework bugs found by running it (all fixed in this change)

1. Hidden window: ready detection used `requestAnimationFrame` and the watchdog counted silence
   while the host was hidden → false "stalled" kills. Ready now uses a timer; stall and check
   clocks pause while the host is hidden. (Dev smoke tests additionally disable occluded-window
   backgrounding, env-gated.)
2. Worlds call `host.status` every frame → the shim now sends changed text at most every 250 ms,
   and flushes it before `complete` so "Cleared" is not overwritten.
3. Save/resume bugs were invisible to the check → the checker now reloads a second session from
   the state the world saved and fails the candidate if it crashes.
4. After an edit the preview reused the old save → it now restarts and says so.
5. Journey `play.json` was an unlocked read-modify-write; a save racing `complete` erased the
   ARPG completion in the run above. Changes are now serialised per play (test reproduces it).
6. Journey titles over 200 characters were rejected by main validation; titles are now short.

## Model-side defects seen (not fixed by the framework)

- Contract misuse: platformer passed file paths to `host.asset` (shown honestly as "missing").
- Carry: maze replaced the incoming carry instead of extending it (1 of 4 worlds).
- Game logic: RPG soft-locks after one lost battle; ARPG mixed per-frame speeds with `dt` in ms;
  maze status text not updated by the rule change.

## Not measured / limits

- Manual image replacement ("Replace…" opens a native file dialog) was not driven by the test.
- One model, n = 4 generations and 5 changes; success rates are indicative, not statistics.
- Billed cost: not available from the API (`null`).
- Seen once, not reproduced: right after clearing world 3 (following an app restart) the view was
  back on the library and the journey had already advanced to world 4. A second journey
  (maze → platformer) stayed on "World cleared · Next world →" as designed.

## Next cost to cut

The most expensive step was not the first generation but **repairs that rewrite whole files**
(repair 2 above: 2,818 output tokens to fix one syntax error) and **defects the model repeats**:
state that does not round-trip through `host.save`, carry replaced instead of merged, and frame
time units. Highest-value next steps: require SEARCH/REPLACE for repairs, and move save/resume,
carry merging and a `dt`-in-seconds loop helper into the host API so models stop re-implementing
them.
