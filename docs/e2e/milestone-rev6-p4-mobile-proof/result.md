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
   gap.
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
