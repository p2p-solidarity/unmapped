# E2E · rev 6 phase 4 · D7 browser proof, first pass (the seams, without the land view)

The first pass of `docs/plans/rev6-phase4.md` D7 in a real phone-sized Chromium: a page on its own
origin installs its own `window.seed` (the `world` namespace runs the device side of the shared-world
protocol in the page) and mounts the mobile shell. On a 375 × 812 touch viewport, a player **opens
an invite, moves focus and chooses with the touch stick and A, reads what the world's history holds
(places witnessed, notes, signposts), leaves a note, sees the owner's note arrive live, leaves a note
with no network, reloads with no page server and no world service, and gets that note sequenced when
both come back.** Every step below is from the one clean replay (run 2).

**Not in this pass (stated, not faked):** the land itself. `LandView2D` reads the desktop's land and
session stores, which the phase-3 session is still changing, so the shell draws no land and has no
position; "walk with a touch stick" is proven only as far as the stick driving the one action map
(menu focus here). The touch pad is merged into `readPad()` and will walk the land once the land
view mounts. Presence, blobs over HTTP (the service sends no CORS yet) and LRU eviction under real
quota pressure are not exercised here; blobs and the LRU have isolated tests (below).

## Replay

```bash
SCR=$(mktemp -d)                                   # run 2 used a scratchpad dir; any empty dir works
mkdir -p "$SCR/service-data" "$SCR/seed" "$SCR/chrome-profile" "$SCR/shots"
UNMAPPED_SERVICE_TEST=1 bun run service -- --port 8797 --data "$SCR/service-data" &   # background
bun run browser:dev &                                                                   # :5190
bun --tsconfig-override tsconfig.node.json scripts/seed-shared-world.ts make \
  --service ws://127.0.0.1:8797 --out "$SCR/seed" | tee "$SCR/seed/make.txt"
~/Library/Caches/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-mac-arm64/chrome-headless-shell \
  --remote-debugging-port=9341 --user-data-dir="$SCR/chrome-profile" --no-first-run \
  --window-size=375,812 http://localhost:5190/ &
D=docs/e2e/milestone-rev6-p4-mobile-proof; SHOTS="$SCR/shots"
LINK=$(grep '^unmapped://' "$SCR/seed/make.txt"); ESC=${LINK//&/\\&}   # sed treats & as the match
run() { CDP_PORT=9341 bun scripts/cdp-drive.ts "$(sed "s|__INVITE__|$ESC|; s|__SHOTS__|$SHOTS|g" "$D/$1")"; }
run run.json                                        # A: join, touch focus, A, note
bun --tsconfig-override tsconfig.node.json scripts/seed-shared-world.ts note --out "$SCR/seed" \
  --text "Welcome, Rin. The heron nests upstream."
run run-live.json                                   # B: the owner's note arrives live
kill $(lsof -tiTCP:8797 -sTCP:LISTEN); run run-offline.json            # C: service gone, offline
kill $(lsof -tiTCP:5190 -sTCP:LISTEN); run run-reload.json             # D: page server gone too
UNMAPPED_SERVICE_TEST=1 bun run service -- --port 8797 --data "$SCR/service-data" &
bun run browser:dev &
run run-resync.json                                 # E: back online, the outbox note sequenced
```

Environment: macOS 27, main `84dbe86` plus the uncommitted working tree of every session (phase 3 in
progress), Vite 8.3.0 dev server (the dev CSP, which allows loopback), Playwright's
`chrome-headless-shell` 1243, viewport 375 × 812 at device scale 2 with touch emulation, UI
language `en` (the headless default). No model: the proof makes no model call, and neither does the
service. Input after the first shot: touch only (`tap`, `tapText`, a `drag` held on the stick, a
tap on A) and text typed into the focused field; the evals only read the page and IndexedDB, except
the one that scrolls to the top and blurs (what a player does by scrolling and tapping empty space).

## What was checked (run 2)

| # | Expected | Observed |
| --- | --- | --- |
| A0 | The page loads at 375 × 812 with `window.seed` installed before the shell mounts | Join panel, docked stick + A (`a-00`); (run 1: `typeof window.seed` "object", `world.join` a function) |
| A1 | Join with the invite: the history verifies, `member.join` is sequenced, the socket stays open | Tap Join → `Online · Entry 7 · 0 waiting · 0 refused` after **344 ms**; role "You are a member", made by Mira (`a-02`) |
| A2 | The history's contents are listed from the page's own fold | Places witnessed: **Kasumi Crossing** at 1, 0 — Mira; Places to enter: "No one has built a place here yet." (empty state, Rule 2); Notes: "The ford is shallow at dawn." — Mira; Signposts: "East to the crossing" at 0, 0 toward 1, 0 |
| A3 | The device key is WebCrypto Ed25519 and cannot be read out; the log is in IndexedDB | IndexedDB `device-keys`: `{algorithm: "Ed25519", extractable: false, usages: ["sign"]}`; `worlds`: 1 record (url `ws://127.0.0.1:8797`, name Rin, diverged null); `entries`: 7; `outbox`: empty |
| A4 | The touch stick drives the one action map (menu mode here) and A confirms | focus `body` → stick down → **Home (0, 0)** → stick right → **Kasumi Crossing**; `<html data-input="touch">`; tap A → that chip is the active one, with the focus ring (`a-03`) |
| A5 | A note left from the phone is checked, signed, sent and sequenced | "Left from a phone at the crossing." at Kasumi Crossing → `Entry 8 · 0 waiting` after **188 ms**, listed "— Rin · at 1, 0" (`a-04`) |
| B | The owner writes from another device; the phone shows it without a reload | `seed-shared-world.ts note` → "sequenced, head 9"; the page, never reloaded, showed "Welcome, Rin. The heron nests upstream." — Mira and `Entry 9` (`b-00`) |
| C | Service stopped + page offline: a note waits in the outbox, shown as not yet shared | `Offline — what you write waits here`, `navigator.onLine` false; "Written with no network." at Home → `Entry 9 · 1 waiting to send`, "— Rin · at 0, 0 · not yet shared"; IndexedDB `outbox: [1]` (`c-00`) |
| D | Page server stopped too: reload still shows the world from the device | `fetch('/?probe')` → "origin unreachable"; reload → controlled by the offline shell (`sw.js`); the full list and the pending note from IndexedDB, `Entry 9 · 1 waiting to send`, `entries: 9, outbox: [1]` (`d-00`) |
| E | Service and page server back: the socket reconnects by itself and the outbox is sent | `Online · Entry 10 · 0 waiting to send`, the note no longer "not yet shared" (already synced on the first check, within the ~2 s between the service's restart and the run); IndexedDB `entries: 10, outbox: []`; the service's `log.jsonl` line 10 is that note, author the phone's key, with a receipt (`e-00`) |

## Found on the way

1. **Emulated offline does not stop a loopback WebSocket.** `Network.emulateNetworkConditions`
   (`offline: true`) turned `navigator.onLine` false but left the open socket up, and the socket's
   backoff reconnected to `ws://127.0.0.1:8797` while "offline". A phone's socket can likewise
   linger half-open, so the page now drops its sockets on the browser's `offline` event and
   reconnects on `online` (`src/browser/socket.ts`). The E2E cuts the world off by stopping the
   service, and says so in `cdp-drive.ts`'s header.
2. **Emulation lasts one DevTools session.** Between separate `cdp-drive` calls the viewport and
   the offline condition reset; each run file therefore starts with `{viewport}` (and `{offline}`
   where it matters), and Chromium is launched at `--window-size=375,812`.
3. **`sed` and `&`.** The first replay pasted a mangled link (sed's `&` is the match): the page
   answered `invite-link-invalid · "That is not an invite link." · "Paste the whole link."` — the
   error state working as it should. The replay escapes `&` (above); run 2 is the clean one.
4. **The shipped CSP refuses loopback.** Served from `out/browser` (`vite preview`), the page loads
   at 375 × 812 with `connect-src 'self' https: wss:`, so joining the loopback test service cannot
   connect (by design: loopback is for `browser:dev` only). Production services are `wss://`.

## Isolated tests (the failures E2E cannot reach, `tests/browser/`)

- `signer.test.ts`: WebCrypto Ed25519 signatures are byte-identical to `@noble/curves`' for the same
  secret and verify under `sign.ts`'s strict `verifyText`; the author key spells as `authorKeyFor`;
  events, WebSocket auth and blob headers signed in the page pass `verifyEvent` / `verifyWsAuth` /
  `readBlobAuth`; a generated key is non-extractable and an extractable one is refused.
- `lru.test.ts`: never evicts an outbox, a waiting world's log, the current log or the current
  world's genesis pack; evicts oldest first and only what is needed; evicts nothing when nothing
  droppable makes room; a broken budget evicts nothing.
- `blobs.test.ts`: a flipped bit, another blob's bytes, a malformed hash or an oversized body is
  refused; a non-200 answer is not kept; the request is signed for the exact path fetched.

## Checks

- `bun run typecheck` for the files of this pass: clean in all four projects (`tsconfig.browser.json`
  is new and added to the script). The script as a whole was red at the time from other sessions'
  work in progress (`src/main/account/*`, `src/main/inference/route.ts`, `WorldDoorSection.tsx`,
  `ModelPanel.tsx`, `narrative/program.ts`, `tests/identity/pack.test.ts`).
- `bunx biome check` on every file of this pass: clean. `bun run lint` as a whole: red on other
  sessions' files (`app/land/{storyMore,traces}.ts`, `engine2d/traceLayer.ts`, …).
- `bun run lines`: red on `src/shared/ipc.ts` (605 lines, not touched here).
- `bunx vitest run`: 149 files, 730 tests passed.
- `bun run browser:build`: built in 0.3 s; one 933 kB script (the DSL and zod), CSS 9 kB, `sw.js`.

## Second pass (the land on the phone): not run

Stopped before any E2E run at the user's request. Code in progress, uncommitted to a run: the signer
now uses `sign.ts`'s text builders; the page keeps positions per world in IndexedDB (`places`, DB
version 2) and has a `PhoneDevice` (`src/browser/land.ts`: genesis pack from IndexedDB or fetched by
hash, `unpackCartridge`, checked against the genesis pin and the `pack` event, entry scene + rules as
`hydrateInstance` runs them); `src/renderer/history/showWorldLand.ts` fills the land, world and
session stores. The mobile shell does not mount `LandView2D` yet, and the seed script still announces
no pack. Every E2E step of this pass — the land at 375 × 812, the stick moving the player, a note at
the player's tile, the offline reload drawing the land, the resync, presence — is **not run**.
