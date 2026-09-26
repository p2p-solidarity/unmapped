# E2E · rev 6 phase 3 · `offline-visit` (Done 1)

Plan row (`docs/plans/rev6-phase3.md`, "E2E flows"): A plays a New game, witnesses 2 chunks,
attaches, invites, quits. B joins from the link (pack verified and installed, same head and
chain) and walks A's chunks with 0 witness calls. B witnesses 1 chunk; A restarts and sees it with
0 calls.

**Verdict: pass.** One sub-check does not apply to this world: the built-in world has no `pack`
event, so there was no cartridge pack to fetch (see row 5). The work-pack path is covered by
`milestone-rev6-p3-migrated-share`.

## Replay

```bash
SCR=$(mktemp -d); R=$PWD                      # R = the repo root
mkdir -p "$SCR/tree" "$SCR/svc" "$SCR/udA" "$SCR/udB" && git archive 51817a3 | tar -x -C "$SCR/tree"
ln -s "$R/node_modules" "$SCR/tree/node_modules"; ln -s "$R/.env" "$SCR/tree/.env"
cp -R "$R/native/afm-bridge/.build" "$SCR/tree/native/afm-bridge/.build"
# snapshot-only: keep Vite's dependency cache out of the shared node_modules
perl -0pi -e 's/renderer: \{\n    plugins:/renderer: {\n    cacheDir: resolve(__dirname, ".vite-cache"),\n    plugins:/' "$SCR/tree/electron.vite.config.ts"
(cd "$SCR/tree" && UNMAPPED_SERVICE_TEST=1 bun run service -- --port 8801 --data "$SCR/svc") &
(cd "$SCR/tree" && AETHER_TEST_USER_DATA="$SCR/udA" bun run dev --remoteDebuggingPort 9353) &
D=docs/e2e/milestone-rev6-p3-offline-visit
step() { CDP_PORT=$1 bun scripts/cdp-drive.ts "$(cat "$D/$2")"; }      # a step file is {app, port, what, actions}
step 9353 run-01-a-a-settings.json; step 9353 run-02-a-a-newgame.json; step 9353 run-03-a-a-origin-probe.json
step 9353 run-04-a-a-walk-east.json; step 9353 run-05-a-a-share.json
step 9353 run-06-a-a-invite.json | tail -1 | python3 -c "import json,sys; open('$SCR/invite.txt','w').write(json.loads(sys.stdin.read()))"
step 9353 run-07-a-a-head-before-quit.json
# step 8: quit A — Browser.close on the browser target of 9353
(cd "$SCR/tree" && AETHER_TEST_USER_DATA="$SCR/udB" bun run dev --remoteDebuggingPort 9354) &
step 9354 run-09-b-b-settings.json
CDP_PORT=9354 bun scripts/cdp-drive.ts "$(python3 -c "import sys; print(open(sys.argv[1]).read().replace('__INVITE__', open(sys.argv[2]).read().strip()))" "$D/run-10-b-b-join.json" "$SCR/invite.txt")"
step 9354 run-11-b-probe-world.json; step 9354 run-12-b-b-walk-read.json; step 9354 run-13-b-b-witness-0-1.json
(cd "$SCR/tree" && AETHER_TEST_USER_DATA="$SCR/udA" bun run dev --remoteDebuggingPort 9353) &   # step 14
step 9353 run-15-a-a-restart.json; step 9353 run-16-a-probe-world.json; step 9354 run-17-b-probe-world.json
```

Count `[inference]` lines in each app's stdout after each step. The seed is rolled by New game,
so names and ids differ on a replay.

Environment: macOS 27.0, Bun 1.3.6, Electron 44.3.0. Build: main `51817a3` as a `git archive`
snapshot (why: below). Model: openai `gpt-5.4-mini`, the Settings → Model default on a fresh
userData with `OPENAI_API_KEY` in `.env`. Service `kp6cycf3…grk4a` on `ws://127.0.0.1:8801`, test
mode, default beat (6 h). userData: fresh temp dirs `udA`, `udB`.

## What was checked

| # | Check | Observed | Verdict |
| --- | --- | --- | --- |
| 1 | A plays a New game | Seed PSTJ-L7R4, instance `pstj-l7r4-muhu31sn`, toast "This save's land now lives in its world's history (2 entries)." (`a-01`) | pass |
| 2 | A witnesses 2 chunks | (0, 0) "Spring Windmill Road" at n=3, (1, 0) "Windmill and Stop" at n=4. Two `witness` calls: `3bbdf672` 7,621 ms, 3,332+1,021 tokens (2,816 cached); `65ba886e` 7,101 ms, 3,573+889 (2,304 cached) (`a-02`) | pass |
| 3 | A attaches | "Share on 127.0.0.1:8801" → "Shared on 127.0.0.1:8801 · Online" in **756 ms**. Service: `attached world hryt3f2x…d4bgq (5 entries)`; n=5 is the `sequencer`, chain(5) `sha256:b604b54e…a3e6` (`a-03`, `a-04`) | pass |
| 4 | A invites, then quits | "Create an invite" → a 600-character link (nonce `cc6fbtgn…`, 1 use, until 2026-10-03T03:33:33Z, svc `ws://127.0.0.1:8801`). A's head before quitting: n=5, link online, pending 0. A quit with Browser.close (`a-05`) | pass |
| 5 | B joins from the link: pack verified and installed | Preview: "Made by player-NUNL · Kept on 127.0.0.1:8801 · Door: Friends · 0 members · 5 entries · This invite: 1 of 1 use left". "Join and play" → Play in **741 ms**, role member. **No pack step:** the genesis pins the shipped built-in `aether-land@1.3.0`, so the log has no `pack` event and the service's `blobs/` stayed empty (D10: "A shipped built-in revision needs no pack") (`b-01`, `b-02`) | pass (pack: n/a) |
| 6 | Same head and chain | B's log: 1 genesis, 2 profile, 3 witness, 4 witness, 5 sequencer, 6 member.join. B's chain(5) = `sha256:b604b54e…a3e6`, equal to A's head at quit | pass |
| 7 | B walks A's chunks with 0 witness calls | B spawned on (0, 0) "WRITTEN · Spring Windmill Road" and walked into (1, 0) "WRITTEN · Windmill and Stop". B's stdout had **0** `[inference]` lines at that point (`b-03`) | pass |
| 8 | B witnesses 1 chunk | (0, 1) "Field by the Giant Tree" at **n=7**, author B (`k5fzaylm…`). One `witness` call `71f6bb7b` 6,453 ms, 3,741+1,271 (2,816 cached); pending 0 afterwards (`b-04`) | pass |
| 9 | A restarts and sees it with 0 calls | A relaunched, Continue → online in **854 ms**, head **8**; the fold held (0, 1) "Field by the Giant Tree". A walked into (0, 1): "WRITTEN · Field by the Giant Tree". A's new stdout had **0** `[inference]` lines (`a-06`) | pass |
| 10 | Everyone holds one history | Head n=8, chain `sha256:c4ea1d76…5917` on A, B and the service | pass |

Entry 8 is a second `profile` from A ("player-B7WR"; entry 2 said "player-NUNL"). The relaunched
dev server took another port, so the page had a new origin and new localStorage, and the player
name is a localStorage preference. It is a dev-mode effect, but it does show that a changed display
name is written as a new `profile` event.

### Service log

```
2026-09-26T03:33:22.714Z attached world hryt3f2xlraunkooui3ax5aoko6k2qf4wc6dx7hnjads7etfd4bgq (5 entries)
```

### `[inference]` lines of this flow

```
A  [inference] done 3bbdf672-… · witness · openai gpt-5.4-mini · 7621 ms · max 3200 · 3332+1021 tokens (2816 cached)
A  [inference] done 65ba886e-… · witness · openai gpt-5.4-mini · 7101 ms · max 3200 · 3573+889 tokens (2304 cached)
B  [inference] done 71f6bb7b-… · witness · openai gpt-5.4-mini · 6453 ms · max 3200 · 3741+1271 tokens (2816 cached)
```

That is 2 + 1 witness calls, as planned. One more `witness` call was spent before this run and
thrown away: `bc152d78` 8,887 ms, 3,332+1,074 tokens. That first attempt ran `bun run dev` in the
shared working tree. Another session's edits reloaded the renderer through HMR
(`page reload i18n/strings/identity.ts`, `…/errors-identity.ts`), which put A back on the title.
Its userData was deleted. Every run here uses the `git archive` snapshot instead.

## Found here

1. **The next chapter always failed with `world-loading` (fixed in this session).** On every Play
   open (A, B, and the other flows' screenshots) the card read "The next chapter is not written
   ahead. · Error · world-loading · Reading this world's history… · One moment. · Retry". The
   error never cleared by itself. `EpisodePrefetch` started the chapter job once the land store
   had the instance, while the world's history was still `loading`. `writeChapter` then returned
   the `world-loading` blocker as a failure, and a failure waits for Retry.

   **Fix:** `src/renderer/works/EpisodePrefetch.tsx` now waits while
   `useHistoryStore.world.status === "loading"`.

   **Check (step 18, run last, after the variant flow):** A was relaunched on 9355 with the fix
   and pressed Continue on this world. The card read "Writing the next chapter… · The Twice-a-Day
   Bus · Asking the model…". The relay chip read "You are writing this; everyone here reads it as
   it arrives · Chapter e1". Chapter e1 (kind `land`) went live at **n=14**, and "world-loading"
   no longer appeared on the page. That cost one `chapter` call: `941c58bc` 3,949 ms, 2,933+759
   tokens (`fix-a-00`, `fix-a-01`). The flow's own steps ran before the fix, so its screenshots
   still show the old error card.
2. **An `&` in the invite link breaks `sed` substitution.** This is a harness pitfall, not an app
   bug. The first join typed a mangled link and got `Error · invite-link-invalid · That is not an
   invite link.` Links are now substituted with a literal replace.

## Files

- `run.json`: env, model and every step in order, each with its app, CDP port and exact actions.
  The `run-NN-<app>-<name>.json` files hold the same actions, one step each.
- Screenshots: `a-00` … `a-06`, `b-00` … `b-04`, `fix-a-00`, `fix-a-01`.

## Fixes after the run

**Visits were lost when the app quit from Play (fixed).** The land wrote the day's `visit` only
when Play unmounted, after 15 min, or at 64 chunks. A quit from Play never unmounts Play, so no
visit was written, and walked places lost the care they should have kept (D13). The fix:
- `src/renderer/history/visits.ts` reports each new walked chunk to main (`world.walked`, a new
  IPC call checked with zod: ≤ 64 chunk coords). It also reports once the world becomes writable.
- `src/main/histories/host.ts` keeps the latest unwritten walk per world. `flush()` (the quit path,
  before the 2 s outbox flush) writes it as the visit. Any `visit` append for that world drops the
  kept walk. A second visit on the same day would be refused by admit (`visit-today`), so a day
  never gets two.

**Re-check** (origin/main `6949a97` snapshot plus the change; `legacy-land` fixtures; no model):

| Step | Observed |
| --- | --- |
| `quit-run-01`: migrate, walk 0,-1 → 1,0 → 0,0 → 0,1, quit from Play (Browser.close) | Main logged `[world] h3ap7jgd66w6… visit of 4 chunks written on quit`. The log gained **n=22 `visit`** (rt 2026-09-26T05:21:40Z, chunks 0,-1 · 0,0 · 1,0 · 0,1). 0 `[inference]` lines (`quit-f-00`) |
| Next launch the same day, quit from Play | No quit line, and still one visit that day. The land saw today's visit and reported nothing |
| `quit-run-03` (a second fresh fixture, world `hamlnasx…`): walk, ← Home, Continue, walk 0,1 and -1,0, quit from Play | Leaving Play wrote the visit (**n=22**, chunks 0,-1 · 0,0 · 1,0). After the second walk and the quit there was **no** quit line, and the log had 22 lines with **1** visit |
| Attached world, service down (door re-check, `milestone-rev6-p3-door`) | `[world] hsuonc5p6fe6… visit of 2 chunks written on quit`. The visit waited in the outbox with B's 2 notes |

Seen on the way (not changed here):
- `quit-run-02` repeats "leave Play, then quit" with `UNMAPPED_TEST_CLOCK_DAYS=50`. Neither side
  wrote a visit. The land judges "visited today" by the page's own clock, and the test clock moves
  only main's, so the day's visit from the real day already counted. This is a test-clock effect.
- The chunk the player stands in when the world opens is not counted until they walk into it
  again. The land hears chunk *changes* only, and the history is still loading at spawn. This was
  already so before this change.
- Browser.close from Play quit the app in 3 runs. In 3 others the window closed but the process
  stayed until a second quit (SIGTERM). Pristine origin/main does the same (SIGTERM from the
  title): with a log line per cleanup, all 7 `before-quit` cleanups finished, including
  `host.flush`, and the process still waited for a second quit. The visit is written either way
  (the flush finishes). `src/main/index.ts` was not changed here.
