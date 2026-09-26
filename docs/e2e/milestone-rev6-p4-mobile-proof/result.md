# E2E · rev 6 phase 4 · D7 browser proof: first pass (the seams) and second pass (the land on the phone)

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

## Second pass: the land on the phone

The phone now draws the joined world's land and walks it. The mobile shell mounts the one land view
(`LandView2D`, 16-bit look) through `showWorldLand`, over the world's genesis pack (the cartridge the
`pack` event names, fetched by hash, checked against the genesis pin, kept in IndexedDB). The docked
touch stick walks it through the one action map. The world (notes, lists, composer) opens over the
land as a layer from a thumb button or Y. Where the player stands is kept per world. Other members
are drawn from the service's presence frames through `hearPresence`, with no change to `net/**`.

At 375 × 812 with touch only, the one clean run shows all of this:

- a player joins from an invite, and the land is drawn;
- the stick moves the player, with probe numbers before and after;
- a note is left on the tile under the player, and read back from the page's own fold;
- the note appears in desktop app B, a member of the same world that joined through its own UI;
- the two players draw each other;
- a second note is left with the service stopped;
- with the page server stopped too, a reload still draws the land where the player stood, from
  IndexedDB and the cached pack;
- once both are back, the page resyncs by itself, and B gets that note too.

No model was called anywhere (see Model below).

### Replay (pass 2)

```bash
SCR=$(mktemp -d); D=docs/e2e/milestone-rev6-p4-mobile-proof; REPO=$(pwd)
mkdir -p "$SCR/service-data" "$SCR/seed" "$SCR/chrome-profile" "$SCR/shots" "$SCR/ud-b"
# B must not reach a model: pin it to a loopback port nothing listens on (the repo's .env
# would otherwise make OpenAI its default).
echo '{"kind":"llamacpp","baseUrl":"http://127.0.0.1:8098/v1","model":"local","apiKeyEnv":null,"sidecar":null}' \
  > "$SCR/ud-b/inference.json"
UNMAPPED_SERVICE_TEST=1 bun run service -- --port 8799 --data "$SCR/service-data" \
  --browser-origin http://localhost:5190 &
bunx vite --config $D/vite.e2e.config.mts &     # :5190; alone in a checkout, `bun run browser:dev`
bun --tsconfig-override tsconfig.node.json scripts/seed-shared-world.ts make \
  --service ws://127.0.0.1:8799 --out "$SCR/seed" | tee "$SCR/seed/make.txt"
bun --tsconfig-override tsconfig.node.json scripts/seed-shared-world.ts invite \
  --out "$SCR/seed" | tee "$SCR/seed/invite-b.txt"
~/Library/Caches/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-mac-arm64/chrome-headless-shell \
  --remote-debugging-port=9342 --user-data-dir="$SCR/chrome-profile" --no-first-run \
  --window-size=375,812 http://localhost:5190/ &
AETHER_TEST_USER_DATA="$SCR/ud-b" bunx electron-vite dev --remoteDebuggingPort 9347 &   # app B
L=$(grep '^unmapped://' "$SCR/seed/make.txt"); LB=$(grep '^unmapped://' "$SCR/seed/invite-b.txt")
E=${L//&/\\&}; EB=${LB//&/\\&}
run() { CDP_PORT=$1 bun scripts/cdp-drive.ts "$(sed "s|__INVITE_B__|$EB|; s|__INVITE__|$E|; \
  s|__SHOTS__|$SCR/shots|g; s|/__REPO__|$REPO|g" "$D/$2")"; }
run 9342 run-p2-land.json          # A: join, the land, the stick, a note at the player's tile
run 9347 run-p2-desktop-b.json     # B: desktop app B joins and reads that note
run 9342 run-p2-presence.json      # C: the phone walks to B's player; each draws the other
run 9347 run-p2-presence-b.json
kill $(lsof -tiTCP:8799 -sTCP:LISTEN); run 9342 run-p2-offline.json   # D: service gone
kill $(lsof -tiTCP:5190 -sTCP:LISTEN); run 9342 run-p2-reload.json    # E: page server gone too
UNMAPPED_SERVICE_TEST=1 bun run service -- --port 8799 --data "$SCR/service-data" \
  --browser-origin http://localhost:5190 &
bunx vite --config $D/vite.e2e.config.mts &
run 9342 run-p2-resync.json        # F: back online, the outbox note is sequenced
run 9347 run-p2-resync-b.json      #    and B holds it
```

Environment:

- Code and build: main `51817a3` plus this pass's uncommitted files and other sessions' work in
  progress in the same tree.
- Tools: Vite 8.3.0 with the dev CSP, which allows loopback, and Playwright's
  `chrome-headless-shell` 1243.
- Phone: a 375 × 812 viewport at device scale 2 with touch emulation. Its UI language is `en`, the
  headless default.
- Desktop app B: `electron-vite dev` on a fresh userData. Its UI is in zh-TW, the system language.

Phone input is touch only: `tap`, `tapText`, drags held on the stick at (78, 734), and text typed
into the focused field. B's input is clicks, typed text, `select()` on its name field, and the N and
Esc keys.

Evals only read:

- `samplePlayer()`, `sampleRemotePlayers()` and the land, session and engine stores, imported by the
  exact `/@fs/<path>` URL the page itself uses;
- IndexedDB;
- `window.seed.world.read` / `badges`.

**Model: none.** The page and the service never call one. The seed script writes no model output.
Its one witnessed chunk is the DSL's own worked example, `CHUNK_EXAMPLE`, kept from pass 1. It is
not a model's witness, and nothing else is invented. B's `inference.json` names an unreachable
loopback llama.cpp, and B's HUD said so ("無法連線到模型…") at every step. Chapter prefetch showed
its `story-model-offline` error instead of calling anything. B's userData has no `usage.jsonl` at the
end. The land draws the pack's entry scene and its seeded ground. No chunk was witnessed on the
phone, and no fake witness was added.

### What was checked (pass 2)

| # | Expected | Observed |
| --- | --- | --- |
| S | The seed script announces a real pack: the shipped revision is validated, packed and read back, uploaded by hash, then announced | Genesis pins `aether-land@1.3.0` `sha256:57f17e0d…e81b`, seed `9KRYXBZC`, gates from its story. The pack is `sha256:c0fcdf1a…25c0`, **4,875 bytes**; `unpackCartridge` reads it back as that revision. The `PUT` is signed by the owner and the pack is announced at head 7. The service keeps the blob, 4,875 bytes |
| A1 | Join from the invite; the land is drawn | Tap Join → canvas up and `Online · Entry 8` after **372 ms** (`p2-a-01`). Screen `play`, look `pixel`, canvas "UNMAPPED, 16-bit view" at 750 × 1624. Seed `9KRYXBZC`, `aether-land@1.3.0`, scene `origin`, land mode `history`, witnessed chunk `1,0`, chunk (0, 0) |
| A2 | The genesis pack is fetched by hash and kept | IndexedDB `blobs`: `[sha256:c0fcdf1a…, 4875]`; `entries` 8; `outbox` empty |
| A3 | The touch stick walks the player (position probe, read-only) | Before: `origin` (8.5, 8.5), yaw 0. Drag the stick +50 px (x axis 0.81) and hold 1.5 s. After: **(15.366, 8.5)**, yaw 1.571, so **Δx = +6.866 tiles** (`p2-a-02`) |
| A4 | Where the player stands is kept per world | About 3.8 s later, IndexedDB `places`: `{origin, 15.366, 8.5}` |
| A5 | The World layer opens from the thumb button, and the land takes no input under it | Tapping World at (287, 635) opens `[data-layer]` "World". `inputLocked` is true and the screen stays `play`. The composer reads "Left where you stand: 0, 0 · tile 15, 8" |
| A6 | A note is left on the player's tile, and the page's own fold reads it back | The note "Left from a phone, right where I stood." reached `Entry 9 · 0 waiting` after **265 ms**. `window.seed.world.read`: head 9, note n 9 by Rin (`k2fjjqmg…`), coord **{cx 0, cz 0, x 15, z 8}**, which is `floor(15.366)`, `floor(8.5)`. The list shows "— Rin · at 0, 0" (`p2-a-03`). Back to the land closes the layer |
| B1 | Desktop app B, a member of the same world, joins through its own UI and shows the phone's note | B clicked 世界 → 加入世界, pasted its own invite, then 看看這個世界 and 加入並開始遊玩 with the name "Kai". It installed 1.3.0 and opened Play. B's land store holds the note with coord (0, 0, 15, 8), writer key `k2fjjqmg…` (the phone's), not pending. B's notes panel (N) lists "Rin · 格 15,8 · … Left from a phone, right where I stood." (`p2-b-00`) |
| C1 | Presence: each draws the other | The phone's roster already held **Kai (8.5, 8.5)**, facing south. Two 350 ms stick drags west took the phone from 15.366 to **10.567** (2.07 tiles from Kai), and Kai is drawn with his name (`p2-c-00`). B's roster: itself at (8.5, 8.5), and **Rin at (10.57, 8.5)**, the phone's own probe to 1/100 tile, drawn with her name (`p2-c-01`). B's read right after entering Play (B1) was still empty; the next read, under a minute later, had Rin |
| D1 | Service stopped and page offline: a note left on the land waits in the outbox | The bar reads `Offline — what you write waits here · Entry 10 · 0 waiting`. "Written with no network, on the land." left at tile 10, 8 gives `Entry 10 · 1 waiting to send` and "— Rin · at 0, 0 · not yet shared". IndexedDB `outbox: [1]`, `places` (10.567, 8.5) (`p2-d-00`) |
| E1 | Page server stopped too: a reload still draws the land from IndexedDB and the cached pack | `fetch('/?probe')` → "origin unreachable". After the reload, `controlledBySw` true and `onLine` false. The land comes back with the 16-bit canvas, seed `9KRYXBZC`, `aether-land@1.3.0`, scene `origin`, mode `history` and 3 notes. The bar says `Offline · Entry 10 · 1 waiting to send`. IndexedDB: blob 4,875 bytes, `outbox: [1]` (`p2-e-00`) |
| E2 | The reload starts where the player stood, and the land still walks offline | Probe after the reload: **(10.567, 8.5)**, yaw −1.571, the kept position. A stick drag down for 0.7 s moved z from 8.5 to **11.966** |
| F1 | Service and page server back: the socket reconnects by itself and the outbox note is sequenced | `Online · Entry 11 · 0 waiting to send` after **3,029 ms** of the run. `read`: head 11, note n 11 by Rin at (0, 0, 10, 8). IndexedDB `outbox: []`, `entries` 11, `places` (10.567, 11.966) (`p2-f-00`) |
| F2 | B gets the offline note too | B's notes include "Written with no network, on the land." at (0, 0, 10, 8), key `k2fjjqmg…`, not pending (`p2-f-01`). B's model config was still the unreachable loopback |
| L | The service's history | `log.jsonl` has 11 entries, each with a receipt: 1–7 are Mira's (genesis, profile, witness, note, signpost, sequencer, pack); 8 is `member.join` Rin; 9 is Rin's note; 10 is `member.join` Kai; 11 is Rin's offline note |

### Found on the way (pass 2)

1. **Other sessions' edits reload the dev page.** Vite's watcher reloaded the page 10 times in
   3 minutes while other sessions edited `i18n/strings/*` and `dsl/history/migrateLand.ts`. One
   exploratory drag went nowhere because a reload landed on it. The run serves the page with
   `vite.e2e.config.mts`, which is the repo's config with no watcher and no HMR.
2. **`/@fs/` plus an absolute path gives `//`.** That URL loads a second copy of a module, whose
   `samplePlayer()` is null. The first attempt at A read `null` twice while the device's own keeper
   stored (15.3, 8.5). That attempt was discarded and the whole phone side restarted clean. The
   replay replaces `/__REPO__`.
3. **Desktop dev picks OpenAI from the repo's `.env`.** `defaultConfig`, with `OPENAI_API_KEY` in the
   environment, would make B witness land and write chapters on the paid key. B's `inference.json`
   is therefore pinned to an unreachable loopback endpoint.
4. **A built-in world announces no pack.** The desktop's genesis plan leaves the `pack` event out for
   a shipped revision (`dsl/history/migrate.ts`). A real desktop world on aether-land 1.3.0 would
   show `browser-pack-none` on a phone. The seed script announces one, so this run does not show the
   gap. (Fixed later: "Built-in worlds on the phone" below.)
5. **Pass 1's run files replay against `6887c98` only.** The composer now leaves a note on the tile
   underfoot instead of offering place chips, so `run-offline.json`'s tap on "Home (0, 0)" finds
   nothing today.

### Code of this pass

- `src/renderer/mobile/`:
  - `WorldScreen.tsx`: the world's one fold, and the land or the page. It has the World layer
    (`data-layer`, `role="dialog"`, input locked, B/Esc close) and the thumb spot for World / Back to
    the land.
  - `LandScreen.tsx`: `showWorldLand` in a layout effect before `LandView2D` mounts. It sets screen
    `play` and the pixel look, keeps the position every 3 s, on `pagehide` or hidden, and on leaving.
  - `usePhoneLand.ts`: asks the device for the land, and asks again when the fold names another pack,
    or when a land that had not arrived can now be fetched.
  - `usePhonePresence.ts`: sends at most 4 frames a second plus a 2 s heartbeat. It checks every
    incoming frame with `presenceSchema` and `AUTHOR_KEY`, and draws it through `hearPresence`.
  - `TouchPad.tsx`: releases a button that is unmounted while held, and adds `THUMB_SPOT`.
  - `MobileShell.tsx` and `WorldPanel.tsx` were reshaped around these.
- `src/browser/land.ts`: the pack is fetched over HTTP even while the socket is still connecting,
  which it is just after a join. A failure then reads as `browser-pack-missing`.
- `scripts/seed-shared-world.ts`: the real pack (row S).
- `i18n/strings/mobile.ts`: `landLoading` and `positionUnkept` in en, zh-TW and ja.
- **The partial-instance cast stays** in `showWorldLand.ts`. `LandView2D.tsx` is 597 lines. Optional
  props for the seed, the story and the start need at least six more lines (props, doc, type import,
  seed, start, story), which would break Rule 1. The only way around that is to split a file the
  desktop shares and another session may be editing. `LandView2D.tsx` is untouched.

### Not run, or not in this pass

- **Talking, chapters and places.** The phone draws the story's gate marker ("The Twice-a-Day Bus")
  but has no dialogue, chapter or place UI, so A is not offered on the land.
- **The shipped build.** `out/browser`'s CSP refuses loopback, as in pass 1, so it was not driven.
- **Real hardware.** No real phone, iOS Safari or Android Chrome was tested, and eviction under real
  quota pressure was not exercised.
- **The zh-TW and ja wording** of the two new strings was not seen on screen. The i18n test passes:
  placeholders match and zh-TW holds no Simplified characters.

### Checks (pass 2)

`bun run typecheck` (all four projects), `bun run lint` (1,093 files), `bun run lines`,
`bunx vitest run tests/browser` (3 files, 9 tests), `bunx vitest run tests/i18n` (3 tests) and
`bun run browser:build` (1.74 MB script, 0.44 s) all pass on the tree as it stood after the run.

## Removed member on the phone

The desktop fix in `milestone-rev6-p3-door` ("Fixes after the run") made main stop writing for a key
the owner removed, and list what that key had waiting as refused. This run checks the phone page for
the same defect. The phone takes a member's role from its fold alone. A removed key's copy ends
before its own `member.remove`, so the fold still says member. On the service's `access-removed`
refusal the page kept writing and left its outbox waiting. The same steps were run twice from fresh
directories, once before the fix and once after it.

### Replay

```bash
SCR=$(mktemp -d); REPO=$(pwd); D=docs/e2e/milestone-rev6-p4-mobile-proof
# The page runs from a snapshot, so other sessions' edits never reload it.
mkdir -p "$SCR/snap" && git archive origin/main | tar -x -C "$SCR/snap"
cp scripts/seed-shared-world.ts "$SCR/snap/scripts/"          # "before": only the script's `remove`
# "after" also copies src/browser/{store,live,sync,worlds}.ts, src/renderer/mobile/{LandScreen,WorldPanel}.tsx
ln -s "$REPO/node_modules" "$SCR/snap/node_modules"
cat > "$SCR/vite.e2e.config.mts" <<EOC
import { fileURLToPath } from "node:url";
import base from "./snap/vite.browser.config.ts";
const at = (path) => fileURLToPath(new URL(path, import.meta.url));
export default { ...base, cacheDir: at("./snap/.vite-e2e-cache"), server: { ...base.server,
  port: 5192, hmr: false, watch: null, fs: { allow: [at("./snap"), "$REPO/node_modules"] } } };
EOC
mkdir -p "$SCR/service-data" "$SCR/seed" "$SCR/chrome-profile" "$SCR/shots"
svc() { (cd "$SCR/snap" && UNMAPPED_SERVICE_TEST=1 bun run service -- --port 8799 \
  --data "$SCR/service-data" --browser-origin http://localhost:5192 &); }
seed() { (cd "$SCR/snap" && bun --tsconfig-override tsconfig.node.json scripts/seed-shared-world.ts "$@"); }
svc; (cd "$SCR/snap" && bunx vite --config "$SCR/vite.e2e.config.mts" &); sleep 3
seed make --service ws://127.0.0.1:8799 --out "$SCR/seed" | tee "$SCR/seed/make.txt"
~/Library/Caches/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-mac-arm64/chrome-headless-shell \
  --remote-debugging-port=9344 --user-data-dir="$SCR/chrome-profile" --no-first-run \
  --window-size=375,812 http://localhost:5192/ &
sleep 3
L=$(grep '^unmapped://' "$SCR/seed/make.txt"); E=${L//&/\\&}
run() { CDP_PORT=9344 bun scripts/cdp-drive.ts "$(sed "s|__INVITE__|$E|; s|__SHOTS__|$SCR/shots|g" "$D/$1")"; }
run run-rm-1-join-note.json                                        # join as Rin, one note
kill $(lsof -tiTCP:8799 -sTCP:LISTEN); run run-rm-2-offline-note.json   # a note waits; page parked
svc; sleep 2
KEY=$(bun -e 'for (const l of require("fs").readFileSync(process.argv[1], "utf8").trim().split("\n")) {
  const e = JSON.parse(l); if (e.event.kind === "member.join") console.log(e.event.author); }' \
  "$SCR"/service-data/worlds/*/log.jsonl)
seed remove --out "$SCR/seed" --key "$KEY"                          # the owner removes the phone
run run-rm-3-reconnect.json                                        # the phone opens and reconnects
kill $(lsof -tiTCP:8799 -sTCP:LISTEN); run run-rm-4-reload-offline.json # reload, no service
```

Environment:

- **Code:** a snapshot of `origin/main` `e0710c6`. Before: plus the seed script's new `remove`.
  After: plus the fix below.
- **Tools:** Vite 8.3.0 with the dev CSP (no watcher, no HMR, a private cache), and Playwright's
  `chrome-headless-shell` 1243 on CDP 9344. The service ran on 8799 in test mode, with
  `--browser-origin http://localhost:5192`.
- **Phone:** 375 × 812 at device scale 2, touch emulation, UI language `en`.
- **Model:** none. The page and the service never call one.
- **Input:** touch and typed text only, with these exceptions. Evals read the page text,
  `window.seed.world.read/badges` and IndexedDB. Two evals navigate: the page is parked on `/sw.js`
  and then opened again. One eval calls `window.seed.world.append` directly, with
  `crypto.subtle.sign` wrapped to count signatures. That draft bypasses the composer, which the fix
  hides.
- **Records:** the driver's full output is in `removed-before/driver.txt` and
  `removed-after/driver.txt`, with the invite link left out. The screenshots are in the same two
  folders.

### What was checked

World "Glass Harbor", made by Mira. Entries 1–7 are the owner's, and the phone joins as Rin.

| Step | Before (origin/main) | After (with the fix) |
| --- | --- | --- |
| RM-1: join and leave a note | `Online · Entry 8` after 848 ms. The note reached `Entry 9 · 0 waiting` after 220 ms. IndexedDB: 9 entries, empty outbox | 819 ms and 220 ms. Same state (`rm-a-00`) |
| RM-2: service stopped, a second note | `Offline — what you write waits here`. The note waits: pending 1, and the IndexedDB outbox holds it (221 ms). Then the page is parked on `/sw.js` | Same, 203 ms (`rm-b-00`) |
| The owner removes the phone's key | `member.remove` sequenced as entry 10 | Entry 10 |
| RM-3: the phone opens and reconnects. Land bar | "The service refused this device · Entry 9 · 1 waiting to send · 0 refused" | "**The owner removed this device** · Entry 9 · **0 waiting** to send · **1 refused**" (`rm-c-00`) |
| Status | link `refused`, role **member**, writable **true**, pending 1, refused 0, error `access-removed` | link `refused`, role **removed**, writable **false**, pending **0**, refused **1**, error `access-removed` |
| IndexedDB | The outbox holds the offline note. Refused list 0, and no removal kept | **The outbox row is gone.** The refused list holds 1 entry (the offline note, `access-removed`), and the record keeps `removed: access-removed` |
| The World layer | "Made by Mira · You are a member". No refused list. The composer offers "Leave the note" | "Made by Mira · The owner removed this device". Under "The world refused these": "note · The owner removed this key from the world." with Dismiss. The composer is replaced by "You can read this world, but not write in it." (`rm-c-01`) |
| A note sent straight to `world.append` | **1 signature**. `ok`, id `h3zo2hmr…`, n null, then pending 2 and 2 notes in the outbox | **0 signatures**. `access-removed` "The owner removed this key from the world." Pending 0, refused 1 and the outbox empty, all unchanged (`rm-c-02`) |
| The service's `log.jsonl` | 10 entries. 2 are by the phone's key: n 8 `member.join` and n 9 the first note | Same: 10 entries, 2 by the phone's key |
| RM-4: service stopped again, then a reload | "Offline — what you write waits here · Entry 9 · 2 waiting". Member, writable. A second direct append was **signed** (1 signature): pending 3, 3 notes in the outbox | "The owner removed this device · Entry 9 · 0 waiting · 1 refused". Link offline, role removed, writable false, error `access-removed`. The append made 0 signatures and got `access-removed`. Outbox empty, refused 1 (`rm-d-00`) |

The refused state was on screen at the first check after the page opened. That check came 1,954 ms
(before) and 1,955 ms (after) into the page load, behind a fixed 2 s wait, so both numbers are upper
bounds.

The page keeps refused events where it always has: the `refused` list of the world's record in the
`worlds` store. That is the store a `rejected` event already moved to, so no new object store was
added and the database version did not change.

### Found on the way

1. **A live page can beat the owner.** The page's socket retries on a backoff of 1–30 s whether or
   not `navigator.onLine` is true. After the service restarts, a page that stayed open could
   reconnect and submit its waiting note before the owner's removal. The note would then be
   sequenced, which is correct behaviour but not this test. So the run parks the page on `/sw.js`
   (same origin, no app code) while the service restarts and the owner acts, and the reconnect is
   the page opening again. A refusal arriving on a socket that reconnected by itself goes through
   the same `onFrame` branch, but it was not driven.
2. **The first after-pass waited out its 20 s cap.** The wait conditions in RM-3 and RM-4 matched
   only the wording from before the fix ("refused this device", "Offline"). The page's state was
   already correct. Both conditions now accept either wording, and both runs above were replayed
   from fresh directories with the final run files.

### Code of this fix

- `src/browser/store.ts`: `WorldRecord.removed` holds the service's `access-removed` until the
  service opens the world again. The field is optional because records written earlier do not have
  it. `putWorldAndOutbox` writes the record and the outbox in one IndexedDB transaction, so an event
  moved to refused is never also waiting, and is never lost between two writes.
- `src/browser/live.ts`: `removalOf`. `statusOf` reports role `removed`, `writable: false`, and the
  removal as the error when there is no link error.
- `src/browser/sync.ts`: an `access-removed` refusal runs in the world's serial queue. It records
  the removal and moves the whole outbox to refused, through `refuseQueued`, which a `rejected` event
  now uses too. `opened` clears the removal.
- `src/browser/worlds.ts`: `append` refuses with `access-removed` before the signer is asked.
- `src/renderer/mobile/LandScreen.tsx` and `WorldPanel.tsx`: for a removed key, the land bar shows
  `mobile.role_removed` where the link line was, and the header drops the link line. That stops the
  page saying "what you write waits here". No new strings: `mobile.role_removed`,
  `mobile.refusedTitle`, `mobile.readOnly` and `access-removed` (errors-world.ts) already exist in
  all three languages.
- `scripts/seed-shared-world.ts`: `remove --out <dir> --key <k…>`, the owner's `member.remove`.
  `note` now shares its open, submit and wait helper.

### Not run, or not reachable

- **Clearing the removal.** The service never opens a world again for a removed key: `readAccess`
  answers `access-removed` before it checks any invite. The clearing path in `opened` is therefore
  unreachable here.
- **A removal pushed to an open session.** The service refuses a removed key's open session at once,
  but a phone that is online has no waiting note to move. That path was not driven.
- **Other languages and hardware.** The zh-TW and ja wording was not seen on screen, and no real
  phone was used.
- **No isolated test.** The page and its `window.seed` run in one JS context, so E2E reaches every
  path, including the direct append above. The one failure E2E cannot reach is the page dying
  between the record write and the outbox write, and the single transaction closes it. vitest here
  has no IndexedDB.

### Checks

`bun run typecheck` (all four projects), `bun run lint` (1,098 files), `bun run lines`,
`bunx vitest run tests/browser` (3 files, 9 tests) and `bun run browser:build` (1.75 MB script,
0.38 s) all pass on the working tree with this fix.

## Built-in worlds on the phone

A world started with New game on the built-in `aether-land` had no `pack` event. The genesis plan
leaves it out for a shipped revision (`dsl/history/migrate.ts`), because a desktop joiner installs
that revision from its own build. A phone has no build, so it showed `browser-pack-none` and drew no
land (pass 2, "Found on the way" 4).

Now the owner's device announces the pinned revision's pack once the world is shared
(`src/main/histories/builtInPack.ts`). It packs the revision with `packPinnedRevision`, which the
`.world` export uses too. It uploads the blob first and only then signs the `pack`. This happens in
two places:

- **At attach** (`attach.ts`).
- **For a world attached before this change:** whenever the owner's device opens it with the
  service's whole log in hand (`syncWorld.ts`, on `opened` at the head or on the `entries` that
  reach it).

This run shows both, on one userData:

- W1 is shared by origin/main code. A phone that joins it gets `browser-pack-none`.
- A is relaunched with this change, and **Continue** alone makes it announce the pack. The phone,
  never reloaded, then draws the land by itself.
- W2 is shared with this change and has its `pack` from attach. A fresh phone joins it and walks.
- Every pack hash equals the `.world` export's genesis pack, and the service's own export has the
  same one.

### Replay (built-in pack)

`run-bp.json` has the env, the ports, the model and the whole sequence. `bp-tools.txt` holds
`run.sh`, `svc-state.sh`, `close-browser.ts`, `vite.page.mts`, the origin/main pack script and the
`electron.vite.config.ts` edit.

```bash
PK=<scratch dir>; R=<repo root>; D=docs/e2e/milestone-rev6-p4-mobile-proof
mkdir -p $PK/{snap,snap-main,svc,udA,files,chrome-1,chrome-2,logs}
git -C $R archive origin/main | tar -x -C $PK/snap-main          # 81601d2: before the change
git -C $R archive origin/main | tar -x -C $PK/snap               # plus the change's files (run-bp.json)
for s in snap snap-main; do ln -s $R/node_modules $R/.env $PK/$s/; done
# both snapshots: renderer cacheDir .vite-cache, port 5193 strictPort (bp-tools.txt)
echo '{"kind":"llamacpp","baseUrl":"http://127.0.0.1:8098/v1","model":"local","apiKeyEnv":null,"sidecar":null}' > $PK/udA/inference.json
(cd $PK/snap && UNMAPPED_SERVICE_TEST=1 bun run service -- --port 8799 --data $PK/svc \
  --browser-origin http://localhost:5192 &)
(cd $PK/snap && bunx vite --config $PK/vite.page.mts &)                          # the phone page, 5192
appA() { (cd $PK/$1 && env OPENAI_API_KEY= THESYS_API_KEY= UNMAPPED_GATEWAY_URL= UNMAPPED_GATEWAY_KEY= \
  UNWRITTEN_PRIVATE_KEY= UNWRITTEN_LINEAGE_RELAY= UNWRITTEN_LINEAGE_REGISTRY= AETHER_TEST_USER_DATA=$PK/udA \
  AETHER_TEST_WORLD_PATH=$PK/files/$2.world bunx electron-vite dev --remoteDebuggingPort 9343 &); }
phone() { ~/Library/Caches/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-mac-arm64/chrome-headless-shell \
  --remote-debugging-port=9344 --user-data-dir=$PK/$1 --no-first-run --window-size=375,812 http://localhost:5192/ & }
appA snap-main old
$PK/run.sh 9343 run-bp-1-a-settings.json bp
$PK/run.sh 9343 run-bp-2-a-newgame-share.json bp-old          # W1; its INVITE line → $PK/invite-w1.txt
phone chrome-1; $PK/run.sh 9344 run-bp-3-phone-join-none.json bp-old $PK/invite-w1.txt
bun $PK/close-browser.ts 9343; appA snap w2-before
$PK/run.sh 9344 run-bp-5-phone-land-arrives.json bp-w1 &      # the phone watches first
$PK/run.sh 9343 run-bp-4-a-continue-announce.json bp-w1
$PK/run.sh 9343 run-bp-6-a-newgame-export.json bp-w2          # W2 and w2-before.world
$PK/run.sh 9343 run-bp-7-a-share-w2.json bp-w2                # its INVITE line → $PK/invite-w2.txt
pkill -f chrome-1; phone chrome-2; $PK/run.sh 9344 run-bp-8-phone-join-w2.json bp-w2 $PK/invite-w2.txt
bun $PK/close-browser.ts 9343; appA snap w2-after
$PK/run.sh 9343 run-bp-9-a-reopen-export.json bp-w2
(cd $PK/snap && bun run service -- export <W1 id> --data $PK/svc --out $PK/files/w1-service.world)
(cd $PK/snap-main && bun --tsconfig-override tsconfig.node.json scripts/.pk/main-pack.ts)
```

**Environment:**

- **Code:** two `git archive` snapshots of origin/main `81601d2`. The before snapshot is that
  alone. The after snapshot adds this change's seven files, byte for byte the ones in the tree.
  The eighth file, `builtIn.ts`, changed only in its header comment, after the run.
- **Ports:**
  - A: CDP 9343, renderer 5193.
  - Phone: CDP 9344, page 5192.
  - Service: 8799, test mode, with `--browser-origin http://localhost:5192`.
- **A:** one fresh userData for all three launches, UI switched to English in BP-1.
- **Phone:** Playwright's `chrome-headless-shell` 1243, 375 × 812 at device scale 2 with touch
  emulation, UI language `en`.

**Model: none.**

- A's `inference.json` names a loopback port nothing listens on, and the model keys are blanked in
  its environment.
- The HUD said "UNREACHABLE llamacpp · local" and "No model calls counted for this world yet."
  (`bp-w1-a-02`). The origin stayed unwritten ("The model is not reachable, so new land stays
  unwritten") and chapter prefetch showed `story-model-offline`.
- `udA` has no `usage.jsonl` at the end. The phone drew each world's seeded ground and the gate
  marker, nothing witnessed.

**Input:**

- A: clicks, typed text and the E and Escape keys. Three clicks go through the DOM because the
  button's text is not unique on the page: the Shared worlds **Test**, and **Export .world** in
  one world's row (twice).
- Phone: touch and typed text only.
- Evals only read: the stores, `worldNow()`, `window.seed.world.read/badges`, IndexedDB and
  `samplePlayer()`.

`bp-driver.txt` has every driver output (invite links left out), the service's files after the run,
and the three `.world` manifests with their `verify-world` reports.

### What was checked (built-in pack)

Every pack below is `sha256:c0fcdf1af0a1d9dad2fbba2cbe9ad8ed62b6d2d2059d3d4ea6f7e89511c925c0`,
**4,875 bytes**. It is the pack of `aether-land@1.3.0`
(`sha256:57f17e0d…e81b`), and pass 2's seed script made the same one (row S). A's device key is
`kymitdlv…`.

| # | Expected | Observed |
| --- | --- | --- |
| BP-2 | Before the change: New game, then Share, gives a history with no `pack` | W1 `hptzkfaa…` "無界之地 · PUVP-WTSE" is `aether-land@1.3.0`. Online **510 ms** after Share. After 10.5 s: head 3 = `genesis profile sequencer`, `pack: null`, 0 waiting (`bp-old-a-01`). The service holds no blob |
| BP-3 | …so a phone that joins cannot draw it | Join took **352 ms** to reach `Error · browser-pack-none`, "This world's maker has not shared its cartridge with the world yet.", with no canvas. The page's fold: head 4 (its `member.join`), `pack: null`, online, member (`bp-old-p-00`) |
| BP-4 | With the change, the owner's next open of that already-shared world announces the pack. The blob goes up first | Title → **Continue**: Play in 419 ms. The `pack` was in A's fold and sequenced as **n 5**, 471 ms after the click, author A, 0 waiting, 0 refused, no error (`bp-w1-a-02`). The service's `blobs.txt` for W1 lists the blob at 4,875 B, and `blobs/c0fcdf1a…` hashes to its name. A's `uploaded-packs.json` notes it for `ws://127.0.0.1:8799` |
| BP-5 | The phone, left open on the error, draws the land when that entry arrives, with no reload | Canvas at **800 ms** after A's Continue click, and 329 ms after A saw the pack sequenced (polled every 250 ms). The bar reads `Online · Entry 5`. Stores: screen `play`, look `pixel`, canvas 750 × 1624, seed `PUVPWTSE`, `aether-land@1.3.0`, scene `origin`, mode `history`, chunk (0, 0). IndexedDB `blobs: [c0fcdf1a…, 4875]`, entries 5, outbox empty (`bp-w1-p-01`) |
| BP-5 | The touch stick walks it | Probe (8.5, 8.5), then a 50 px drag held 1.5 s, then **(15.766, 8.5)**, yaw 1.571: **Δx = +7.266 tiles** (`bp-w1-p-02`) |
| BP-6 | A new built-in world's `.world`, exported before it is shared, packs the revision itself | W2 `h4jazrup…` "無界之地 · YATG-NFUK": head 2, `pack: null`. Worlds → World files → its **Export .world** wrote `w2-before.world` (7 KiB) (`bp-w2-a-03`). `world.json` `genesisPack` is **the same hash**, and the file carries `blobs/c0fcdf1a…` at 4,875 B. `verify-world`: signature valid, 2 entries, no problems |
| BP-7 | Sharing a built-in world with the change announces the pack at attach | Share → Online in **811 ms**. By 815 ms: head 4 = `genesis profile sequencer pack`, the `pack` with **the same hash**, 0 waiting, 0 refused (`bp-w2-a-01`). The service lists the blob for W2 too (one file in `blobs/`, 4,875 B) |
| BP-8 | A fresh phone joins W2 and draws and walks the land | Join took **377 ms** to canvas plus `Online · Entry 5`. Fold: pack = **the same hash**, member, no `browser-pack` error. Stores: seed `YATGNFUK`, `aether-land@1.3.0`, scene `origin`, mode `history`. IndexedDB `blobs: [c0fcdf1a…, 4875]` (`bp-w2-p-01`). Stick: 8.5 → **15.5**, **Δx = +7.0 tiles** (`bp-w2-p-02`) |
| BP-9 | Never a second `pack`: A relaunched again, both worlds opened and synced | Continue → W2: head 6 (the phone's `member.join`, A's `visit`), pack events **[4]** only. Saves → W1: head 5, pack events **[5]** only. Both 0 waiting, 0 refused. The service's logs after the run have **1** `pack` in each world |
| BP-9 | The file and the service agree | `w2-after.world`, exported after sharing: `genesisPack` **the same hash**, the one the `pack` names; 6 entries, `verify-world` no problems (`bp-w2-a-04`). `service -- export` of W1 gives `genesisPack` **the same hash**, 5 entries, verify ok. origin/main's own code path, which installs 1.3.0 as `ensureBaseGame` does and packs it with `packCartridgeReproducibly` (`main-pack.ts`), also gives **the same hash**, 4,875 B |

### Found on the way (built-in pack)

1. **The first `Browser.close` at the end did not quit A.** DevTools accepted it, but the app
   stayed up. A second call, about a minute later, quit it. The two earlier quits in this run each
   took one call. This was not looked into here, because the quit path is another session's work.
2. **Clicking a save's row can resume it at once.** In Worlds → Saves, the click on W1's row
   opened W1 without **Resume**. The row was already the selected one, and a click on the
   selected row resumes. `run-bp-9` leaves the Resume click out.

### Code of this change

- **`src/main/histories/builtInPack.ts`** (new): `announceBuiltInPack` and `announceWhenDue`.
  - Admit accepts a `pack` from any owner at any time; its one rule is the cartridge hash.
    Refusing a repeat there would change what earlier builds admitted, which means a
    `PHYSICS_VERSION` bump.
  - So the writer makes sure there is never a second one:
    - only while the fold, outbox included, has no `pack`;
    - only from a device that holds the service's whole log;
    - only the world's first current owner writes it (`currentOwners(now)[0]`), so two owners'
      devices opening together never both do; any owner still uploads it (`ownPacks`);
    - one pass per world at a time, and the fold is checked again under the world's lock before
      signing.
  - The blob goes up (`sendPackOnce`) before the event is signed.
  - A failed pass is logged and tried again at the next `opened`, not on every entry.
- **`attach.ts`:** announces after a successful attach and before the first upload pass. A
  failure shows as the attach status's error.
- **`syncWorld.ts`:** calls `announceWhenDue` on `opened` when the device is at the service's head,
  and on `entries` that bring it there.
- **`packs.ts`:** `packPinnedRevision(deps, ref)`. It installs a shipped revision first, packs the
  installed revision reproducibly, and gives null when the installed content hash is not the
  genesis's. `bundles/export.ts` now uses it, so the export and the announcement share one code
  path.
- **`workPacks.ts`:** `sendPackOnce` is taken out of `packWorkFor`, in the same `packs:<world>`
  queue as `uploadOwnPacks`.
- **`builtIn.ts`:** the header comment only.

### Isolated test (`tests/main/builtin-pack.test.ts`)

It covers the failures E2E cannot reach. Each is named in the file's failure list:

- two passes started together sign two `pack`s;
- a pack queued or sequenced gets another at the next open;
- a co-owner's device announces a second one. The test also checks that once the maker is removed,
  the next owner announces it;
- the `pack` is announced although the service refused the blob;
- a genesis that pins `aether-land@1.3.0` under another content hash gets the shipped revision's
  pack, which admit alone would accept.

With the first-owner check loosened to "any owner", failure 3 goes red. With the upload result
ignored, failure 4 goes red.

### Not run (built-in pack)

- **Two owners' devices opening one pack-less world at the same moment.** Only the isolated test
  covers this.
- **A pass that fails at attach and is retried at the next `opened`.** The service accepted every
  upload in this run.
- **A desktop joiner of a built-in world that now has a `pack`.** `receiveCartridge` still
  installs from its own build before looking at any pack, and that is not changed here.
- **Real hardware and other languages.** No real phone was used, and no zh-TW or ja page was seen.

### Checks (built-in pack)

`bun run check` passes on the after snapshot (origin/main `81601d2` plus this change, with
`electron.vite.config.ts` back to origin/main's):

- typecheck;
- lint (1,100 files);
- lines;
- vitest: 161 files, 826 tests.

It passes on the working tree too, with every session's work in progress: 1,104 files and 162 test
files with 831 tests. An earlier run on the tree was red on another session's
`src/renderer/narrative/witness.ts(85,77): error TS2554`, which that session has since fixed.
