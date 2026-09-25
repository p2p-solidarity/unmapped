# Interactive web works — player (Prompt 2) + creation loop (Prompt 3)

Status: implemented 2026-09-23; acceptance run and measurements in
`docs/experiments/interactive-works-acceptance-2026-09-23.md`. Evidence for the design:
`docs/experiments/interactive-work-player-2026-09-22.md` (Prompt 1) and the isolation spike below.
The 2D open land (`src/renderer/engine2d`) and the Three.js path stay as they are; this adds a
sibling content type.

## Product shape

One sentence → an AI-written HTML/CSS/JS **world** → play it at once → change it with a sentence →
keep a version. Worlds of different genres (RPG → ARPG → maze → platformer) run in the **same**
player and can be chained into a **journey** that rotates through them; a small `carry` object
(items, coins, flags) travels from one world to the next. The host never learns a genre — every
rule lives in the world's own code.

## Format `interactive-web@1` (not Scene DSL)

| File | Owner | Changed by |
| --- | --- | --- |
| `main.js` | rules, state, input, drawing (DOM or Canvas) | "change a rule" |
| `style.css` | layout, colours, typography | "adjust the screen" |
| `assets.json` | `{ id: { src, note } }`; `src` = `library/<file>`, `assets/<file>` or `null` | "replace an asset" |
| `assets/*` | the world's own images (png/jpeg/webp/gif) | asset replacement |

Storage mirrors Rule 9 with separate directories so no old cartridge reader ever sees the new type:

- `works/<workId>/<version>/` — immutable revision: `work.json` (format, formatVersion, hostApi,
  title, lineage, file integrity table, root `contentHash`) + files.
- `work-plays/<playId>/play.json` — progress pinned to exact `{workId, version, contentHash}` per
  world: current world, per-world state, carry, completions.
- `work-drafts/<draftId>/` — mutable authoring: `draft.json` (head = last playable candidate,
  candidate history with request, summary, status, metrics) + `candidates/<id>/` snapshots.

## Isolation (spike-verified in Electron 44 on 2026-09-22)

- Each session is `<iframe sandbox="allow-scripts">` (no `allow-same-origin`) on a **fresh random
  host** `ulwork://w<token>/`, served by main via `protocol.handle` with its own CSP:
  `default-src 'none'; script-src 'nonce-…'; style-src 'unsafe-inline'; img-src data: blob:;
  media-src data: blob:; font-src data:; connect-src 'none'; frame-src 'none'; worker-src 'none';
  form-action 'none'; base-uri 'none'`. Assets are embedded as `data:` URLs.
- The host CSP adds only `frame-src ulwork:`, which also stops a frame navigating itself away.
  Preload runs only in the main frame, so `window.seed` does not exist in a work.
- Spike results: `window.seed/require/process` undefined; parent DOM, localStorage, eval,
  `new Function`, fetch, WebSocket, external images, popups and injected inline scripts blocked;
  a `while(true)` work ran in its own OS process while the host kept ticking; another host's work
  kept answering. Re-using the stalled host did not load → one host per session, and main kills a
  stalled session's process on request (never the main renderer's pid).
- Residual, documented: `RTCPeerConnection` exists in the frame (CSP cannot block it). A work only
  ever holds its own state, carry and assets; no credential or host object is sent to it.

## Host channel (versioned `postMessage`, `ulw: 1`)

Frame → host: `ready {rendered}`, `save {state}`, `complete {summary, carry}`, `status {text}`,
`error {message, line, column}`, `heartbeat`. Host → frame: `probe` (checker only). The host
accepts a message only if `event.source` is that session's iframe window, `event.origin === "null"`,
the token matches, the zod schema passes, the serialized size ≤ 256 KB and the rate ≤ 40/s.
Restart, exit and reload are host actions. A missed heartbeat for 4 s = unresponsive → kill +
visible error; other sessions and the host continue.

## Creation loop

Renderer orchestrates with the existing `chat()` (no new inference path). Output is a small line
protocol: `@@summary`, `@@file <path>` (whole file), `@@edit <path>` with SEARCH/REPLACE blocks,
`@@end`. Edits are applied to the head snapshot, so a rule change touches only `main.js`.
Every attempt is a draft candidate; a checker session must report `ready` + `rendered`, then
survive synthetic input (keys + click) with no error, and — if the world saved anything — a second
session resumed from that save must pass too. Errors (message, line)
go back to the model; **at most 2 repairs**. Only a passing candidate moves `head`, and only if
`head` still equals the base it started from (compare-and-set) — cancelled or late results never
overwrite. Revert moves `head` to an earlier playable candidate. "Save version" publishes `head`
as an immutable revision with lineage; plays stay pinned to the revision they started on (the
player shows the pinned `workId@version`) and a newer revision is played by starting a new journey
— progress is never migrated silently.

Metrics per candidate: wall time, prompt/completion tokens (cost stays `null` — the API does not
return it), repair count, pass/fail. The acceptance report only uses measured runs.

## Grill (answered before building)

- *Is the data-only DSL boundary enough?* No — this runs code. The boundary is process + origin +
  CSP + validated messages, verified by the spike, not by prompt compliance.
- *Can a world brick the next one?* Not via process reuse (fresh host per session) and not via the
  store (state size-capped, JSON-validated in main, atomic writes).
- *Why not WebContentsView/webview?* Overlay bounds sync and `webviewTag` widen the host's surface;
  the sandboxed OOPIF already gives a separate process with plain DOM layout.
- *Why not extend cartridges?* The cartridge manifest, validator and instance pin are Scene/kit
  specific; a sibling type keeps every old cartridge readable untouched.
- *Over-engineering check:* no module platform, no genre registry, no editor beyond prompt,
  history and revert; journey = an ordered list of pinned revisions plus one carry object.
