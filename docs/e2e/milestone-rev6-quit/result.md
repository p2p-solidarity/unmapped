# milestone-rev6-quit — one quit always exits

Earlier runs saw the window close and the process stay until a second quit. It happened most often
at the title. This run finds the cause, fixes it, and times 20 quits before the fix and 22 after
(10 title, 10 Play, and 2 last-window checks), each on a fresh throwaway userData.

**Verdict: fixed.** Before, 0 of 10 title quits exited. After, 10 of 10 did, and 10 of 10 Play quits
exited too. After the fix every Play quit also kept the last position (1 of 10 before). The day's
visit and the usage ledger were written on every Play quit, before and after. `bun run check`
passes.

## Cause

`src/main/index.ts` held `before-quit` with `preventDefault()`, ran the cleanups, and called
`app.quit()` again in `Promise.allSettled(...).then(...)`. Electron's `Browser::Quit()` (v44.3.0,
`shell/browser/browser.cc`) stores the event's answer *after* the listeners return:

```cpp
is_quitting_ = HandleBeforeQuit();   // emits before-quit; false because it was prevented
```

A quit from SIGTERM, Cmd-Q or DevTools `Browser.close` starts in native code: the signal task
`base::BindOnce(&Browser::Quit, …)` from `electron_browser_main_parts.cc`, `[NSApp terminate:]`, or
the DevTools handler. Its `before-quit` is the outermost JavaScript call, so Node drains microtasks
as the listener returns, and that happens before the `is_quitting_ =` line runs.

At the title every cleanup settles within microtasks, because nothing has I/O to wait for: the
flush has no world and no walk. So the second `app.quit()` ran *inside* the first `Quit()`. It set
`is_quitting_ = true`, emitted `before-quit` (not prevented) and started closing the window. Then the
outer `Quit()` finished and overwrote `is_quitting_` with `false`. When the window was gone,
`Browser::OnWindowAllClosed()` saw a quit that was not running. It emitted `window-all-closed`, which
does nothing on macOS, and the process stayed with no window.

From Play, the history flush writes files, so the cleanups settle in a later macrotask. That is
after `Quit()` has returned, so the second `app.quit()` goes through. An `app.quit()` called from
JavaScript (a timer) also exited, because its microtasks only drain after the calling JS returns.

Evidence (`diag-origin-main.txt`, from origin/main with the logging-only patch
`diag-index.patch.txt`):

- Title + SIGTERM, title + page `Browser.close`, and title + browser `Browser.close` all show the
  same sequence:
  1. `before-quit (last listener) defaultPrevented=true`.
  2. All 7 cleanups done in 0–3 ms.
  3. `app.quit() called from … processTicksAndRejections`, which is the microtask drain.
  4. `before-quit … defaultPrevented=false`, `window 1 close`, `webContents … destroyed`,
     `window 1 closed`.
  5. **`window-all-closed`** instead of `will-quit`.
  6. After that: `windows=[] webContents=[]` and `/json` = `[]` (0 page targets).
- `process._getActiveHandles()` while it hung was `{}` or one `Socket`. Nothing on the Node side
  (a child process, a server, a WebSocket or a timer) keeps it alive. The Electron browser loop is
  simply not quitting. The afm-bridge child had already exited.
- The same title with `app.quit()` from a JS timer: the identical sequence ends in
  `will-quit` → `quit code=0`.
- Play + SIGTERM: `registerWorldIpc` took 7 ms (`visit of 1 chunks written on quit`), then
  `will-quit` → exit.
- A second SIGTERM always "worked" only because Chromium's handler is one-shot: the second one
  meets the default handler and kills the process without cleanups.

Checked and not the cause: every registered cleanup finished in 0–14 ms. These are the histories
host flush (`registerWorldIpc`), `registerAccountIpc`, the inference sidecar (`createSidecar`),
inference aborts (`registerInferenceIpc`), the afm-bridge (`appleLocalHelper`) and the two
watchers. Usage, the image providers and billing's return page register no cleanup. The sign
bridge's and billing's servers are Node handles, and those do not hold Electron open.

Found on the way (pristine): the last position was lost on 9 of 10 Play quits. The old order ran
the cleanups first and closed the window last. The page's `beforeunload` then sent its checkpoint
while main was already shutting down, so the write was cut off. `save.json` kept the 5-second
sampler's spot, 4.5–21.8 tiles behind.

## Fix

- `src/main/quit.ts` (new): the quit sequence.
  - `before-quit` is left alone, so Electron closes the windows first and each page's
    `beforeunload` sends its checkpoint.
  - `will-quit` (all windows gone) is held once. Main waits up to 1.5 s for calls the pages left
    running, then runs every cleanup with a 4 s bound.
  - Then it re-quits with **`setImmediate(() => app.quit())`**: a macrotask, never inside
    Electron's native `Quit`/`NotifyAndShutdown`.
  - Log lines: `[quit] requested`, `[quit] windows closed N ms after the request`,
    `[quit] 7 cleanups done N ms …: <name> <ms> · …` (names come from the registering function),
    a warning naming any cleanup that failed or was still running at the bound, and
    `[quit] exit 0 N ms after the request`.
- `src/main/handle.ts`: every `handle()`/`handleValue()` call is tracked until it is answered, and
  `callsSettled()` lets the quit wait for them. This is what keeps the checkpoint the closing page
  sent.
- `src/main/index.ts`:
  - installs the sequence and names the Apple helper's cleanup.
  - `window-all-closed` is unchanged: it still quits off macOS and keeps the app on macOS, and now
    logs `[app] last window closed; the app stays open (macOS)`.
  - `activate` opens no window while a quit is running.
  - `broadcast` skips a window whose page is already destroyed. Without that guard, the first
    after-fix pass logged `UnhandledPromiseRejectionWarning: Object has been destroyed` on every
    Play quit: the chat aborted by the closing page emitted its final event into the dead page.
- `src/main/context.ts`: `onBeforeQuit`'s doc now says the cleanups run after the windows close.

## Numbers

| | Before (origin/main) | After |
| --- | --- | --- |
| Title quits that exited on the first request | **0 / 10** (none within 20 s; a 2nd SIGTERM killed each in 26–178 ms) | **10 / 10** |
| Title: request → process gone | — | median 352 ms, 305–1,176 ms |
| Play quits that exited on the first request | 10 / 10 | 10 / 10 |
| Play: request → process gone | median 367 ms, 182–651 ms | median 449 ms, 237–1,637 ms |
| Day's visit written on quit (`[world] … visit of 1 chunks written on quit`) | 10 / 10 | 10 / 10 |
| Last position kept (`save.json` = the spot read right before the quit) | **1 / 10** | **10 / 10** |
| Usage ledger: every call, including the witness aborted by the quit | 10 / 10 (`done, done, aborted`) | 10 / 10 (`done, done, aborted`) |
| Closing the last window keeps the app (macOS), then SIGTERM exits | not run | 2 / 2: alive with 0 pages after 3 s, then gone in 54 / 88 ms, visit and position written |
| Unhandled rejections in the main log | 0 | 0 (interim build: 11 of 11 Play quits, fixed by the `broadcast` guard) |

The slowest after-fix quits were runs 01 and 04 (1,176 ms and 1,637 ms; the app's own `[quit]
exit` line said 956 ms and 1,219 ms). They were the first runs of the pass. Other sessions kept
the machine loaded: the load average was 27.5 at 16:43, just before the pass began, and 11.1 over
the five minutes to 16:51.

The interim pass on the build without the `broadcast` guard had the same outcome: title median
310 ms and Play median 403 ms, with visit and position 10 of 10 (`quits-after-interim.json`). A
screenshot run on that build took 8,109 ms from request to exit, while its own log said
`[quit] exit 0 299 ms after the request`. That was at 16:42, and the load average was 27.5 a
minute later. The 22 final runs did not show it again.

## Replay

1. Make a snapshot with `git archive 12c29e7`.
   - Symlink `node_modules`, `.env` and `native/afm-bridge/.build`.
   - Give the renderer a private `cacheDir` and `server: {port: QUIT_VITE_PORT, strictPort: true}`.
   - For "after", copy in `src/main/{quit,index,handle,context}.ts`.
2. `cp quitloop.ts.txt quitloop.ts && bun quitloop.ts <snap> <label> "<plan>"`.
   - The plan is in `run.json`.
   - The loop starts `bunx electron-vite dev --remoteDebuggingPort 9341` with a fresh
     `AETHER_TEST_USER_DATA` for each quit.
   - It drives `scripts/cdp-drive.ts` with `run.json`'s `actions`: title = switch to English;
     Play = Worlds → New game → Start, then walk into chunk (1, 0).
   - Then it sends the quit and polls the Electron pid every 25 ms.
   - A process still alive after 20 s gets a second SIGTERM (timed), then SIGKILL.

The model was openai gpt-5.4-mini from `.env`. New game writes chapter 1 and witnesses the chunks
walked into. That made 103 calls: 100 recorded over the before, after, interim and screenshot runs,
plus 3 in one probe. They used ≈193k input tokens (≈156k cached) and ≈61k output. No `app.quit()`
dev hook exists, so none was used. SIGTERM, Cmd-Q and DevTools `Browser.close` all reach
`Browser::Quit`, the same native function `app.quit()` calls.

## Checks

`bun run check` on the working tree (which also holds other sessions' uncommitted work): typecheck,
lint and lines pass; vitest 162 files, 831 tests passed.

## Files

- `run.json`: env, model, plan, quit methods and the exact cdp-drive actions.
- `quitloop.ts.txt`: the loop. The before pass ran it without the usage/closethen/screenshot
  additions; the quit and timing code is the same.
- `quits-before.json`, `quits-after.json`, `quits-after-interim.json`: one row per quit. Each row
  holds the times, the main log's `[quit]` / `[app]` / `[world]` lines, the position at quit, the
  save's position and the usage outcomes.
- `diag-origin-main.txt`, `diag-index.patch.txt`: the cause's evidence and the logging-only patch
  that produced it.
- `after-01-title-before-quit.jpg`, `after-02-play-before-quit.jpg` (in (1, 0), a witness in
  flight) and `after-22-play-before-closing-window.jpg`: the screens right before those quits.

## Per quit

### Before: origin/main 12c29e7

| # | Where | Quit | Request → exit | Second quit | Visit on quit | Last position | Usage lines |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 01 | title | SIGTERM | **none in 20 s** | 2nd SIGTERM → gone in 26 ms | — | — | — |
| 02 | play | SIGTERM | 182 ms | — | written | lost: at (38.953, 15.815), save (32.771, 12.996) | done, done, aborted |
| 03 | title | Browser.close (page) | **none in 20 s** | 2nd SIGTERM → gone in 52 ms | — | — | — |
| 04 | play | Browser.close (page) | 311 ms | — | written | kept: at (38.585, 16.037), save (38.585, 16.037) | done, done, aborted |
| 05 | title | Browser.close (browser) | **none in 20 s** | 2nd SIGTERM → gone in 53 ms | — | — | — |
| 06 | play | Browser.close (browser) | 306 ms | — | written | lost: at (38.744, 16.221), save (24.039, 9.159) | done, done, aborted |
| 07 | title | SIGTERM | **none in 20 s** | 2nd SIGTERM → gone in 54 ms | — | — | — |
| 08 | play | SIGTERM | 268 ms | — | written | lost: at (38.908, 15.372), save (30.246, 11.99) | done, done, aborted |
| 09 | title | Browser.close (page) | **none in 20 s** | 2nd SIGTERM → gone in 84 ms | — | — | — |
| 10 | play | Browser.close (page) | 422 ms | — | written | lost: at (38.677, 16.145), save (25.314, 12.956) | done, done, aborted |
| 11 | title | Browser.close (browser) | **none in 20 s** | 2nd SIGTERM → gone in 118 ms | — | — | — |
| 12 | play | Browser.close (browser) | 517 ms | — | written | lost: at (39.23, 16.011), save (27.093, 10.986) | done, done, aborted |
| 13 | title | SIGTERM | **none in 20 s** | 2nd SIGTERM → gone in 28 ms | — | — | — |
| 14 | play | SIGTERM | 501 ms | — | written | lost: at (38.818, 15.404), save (34.667, 13.586) | done, done, aborted |
| 15 | title | Browser.close (page) | **none in 20 s** | 2nd SIGTERM → gone in 159 ms | — | — | — |
| 16 | play | Browser.close (page) | 651 ms | — | written | lost: at (39.183, 15.941), save (23.607, 9.323) | done, done, aborted |
| 17 | title | Browser.close (browser) | **none in 20 s** | 2nd SIGTERM → gone in 178 ms | — | — | — |
| 18 | play | Browser.close (browser) | 306 ms | — | written | lost: at (38.857, 15.961), save (19.459, 8.5) | done, done, aborted |
| 19 | title | SIGTERM | **none in 20 s** | 2nd SIGTERM → gone in 27 ms | — | — | — |
| 20 | play | SIGTERM | 536 ms | — | written | lost: at (39.271, 15.869), save (18.818, 8.382) | done, done, aborted |

### After: 12c29e7 + this change

| # | Where | Quit | Request → exit | Second quit | App log: exit | Visit on quit | Last position | Usage lines |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 01 | title | SIGTERM | 1176 ms | — | 956 ms | — | — | — |
| 02 | play | SIGTERM | 503 ms | — | 385 ms | written | kept: at (38.581, 15.514), save (38.581, 15.514) | done, done, aborted |
| 03 | title | Browser.close (page) | 1070 ms | — | 805 ms | — | — | — |
| 04 | play | Browser.close (page) | 1637 ms | — | 1219 ms | written | kept: at (38.907, 15.83), save (38.907, 15.83) | done, done, aborted |
| 05 | title | Browser.close (browser) | 351 ms | — | 204 ms | — | — | — |
| 06 | play | Browser.close (browser) | 420 ms | — | 301 ms | written | kept: at (39.238, 16.533), save (39.238, 16.533) | done, done, aborted |
| 07 | title | SIGTERM | 321 ms | — | 215 ms | — | — | — |
| 08 | play | SIGTERM | 352 ms | — | 233 ms | written | kept: at (39.429, 15.549), save (39.429, 15.549) | done, done, aborted |
| 09 | title | Browser.close (page) | 569 ms | — | 203 ms | — | — | — |
| 10 | play | Browser.close (page) | 480 ms | — | 349 ms | written | kept: at (39.159, 15.947), save (39.159, 15.947) | done, done, aborted |
| 11 | title | Browser.close (browser) | 352 ms | — | 184 ms | — | — | — |
| 12 | play | Browser.close (browser) | 336 ms | — | 233 ms | written | kept: at (39.568, 15.047), save (39.568, 15.047) | done, done, aborted |
| 13 | title | SIGTERM | 321 ms | — | 186 ms | — | — | — |
| 14 | play | SIGTERM | 237 ms | — | 174 ms | written | kept: at (38.657, 16.317), save (38.657, 16.317) | done, done, aborted |
| 15 | title | Browser.close (page) | 305 ms | — | 141 ms | — | — | — |
| 16 | play | Browser.close (page) | 478 ms | — | 329 ms | written | kept: at (38.786, 15.877), save (38.786, 15.877) | done, done, aborted |
| 17 | title | Browser.close (browser) | 321 ms | — | 189 ms | — | — | — |
| 18 | play | Browser.close (browser) | 562 ms | — | 264 ms | written | kept: at (38.999, 15.211), save (38.999, 15.211) | done, done, aborted |
| 19 | title | SIGTERM | 440 ms | — | 200 ms | — | — | — |
| 20 | play | SIGTERM | 324 ms | — | 215 ms | written | kept: at (39.539, 16.548), save (39.539, 16.548) | done, done, aborted |
| 21 | title | window.close(), 3 s, SIGTERM — stayed after the close: true | 54 ms (from the SIGTERM) | — | 2 ms | — | — | — |
| 22 | play | window.close(), 3 s, SIGTERM — stayed after the close: true | 88 ms (from the SIGTERM) | — | 6 ms | written | kept: at (38.659, 16.553), save (38.659, 16.553) | done, done, aborted |
