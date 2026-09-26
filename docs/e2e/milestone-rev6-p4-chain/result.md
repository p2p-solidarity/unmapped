# E2E · rev 6 phase 4 · D6 light chain (flow 8, `p4-chain`)

This checks plan flow 8 (`docs/plans/rev6-phase4.md`). A New Game on the built-in world is shared
on a test-mode world service. The owner turns on "Record beats" at the door, the service's clock is
moved forward so four beats are written, and the owner leaves two notes between them. The service
is then stopped, and `bun run provenance --dry-run --from <its data dir>` runs over what it wrote.
The dry run simulates on top of Ethereum Sepolia with eth_simulateV1: nothing is sent and no gas is
spent. `--deploy` was never run, and no chain key was set. No chain env was set anywhere: the
service, the app and the shell had no `SERVICE_CHAIN_*` or `UNMAPPED_PROVENANCE_*`, and the app's
`UNWRITTEN_*` values were blanked.

**Stopped early.** The coordinator paused the stage before the no-chain pass with the service
stopped (G) was finished. Steps not run are marked **not run** below.

## Replay

```bash
SCR=$(mktemp -d); mkdir -p "$SCR/service" "$SCR/ud" "$SCR/prov"
D=docs/e2e/milestone-rev6-p4-chain
UNMAPPED_SERVICE_TEST=1 bun run service -- --port 8796 --data "$SCR/service" &          # background
OPENAI_API_KEY= THESYS_API_KEY= UNWRITTEN_LINEAGE_ACCOUNTS= UNWRITTEN_LINEAGE_FROM_BLOCK= \
  UNWRITTEN_LINEAGE_HOOK= UNWRITTEN_LINEAGE_PARENT= UNWRITTEN_LINEAGE_REGISTRY= \
  UNWRITTEN_LINEAGE_RELAY= UNWRITTEN_LINEAGE_ROUTER= UNWRITTEN_PRIVATE_KEY= \
  AETHER_TEST_USER_DATA="$SCR/ud" bun run dev --remoteDebuggingPort 9343 &              # background
drive() { CDP_PORT=9343 bun scripts/cdp-drive.ts "$(cat "$D/$1")"; }
adv() { curl -s -X POST http://127.0.0.1:8796/v1/test/advance \
  -H 'content-type: application/json' -d "{\"days\":$1}"; echo; }
drive run.json                  # = parts A, A2, B, C, D: service in Settings, New game, share, Record beats
adv 7; drive run-e1-note.json   # beat 1, then walk + note 1
adv 7; drive run-e2-note.json   # beat 2, then walk + note 2
adv 7; adv 7; adv 1             # beats 3 and 4, then a quiet check
drive run-f-door-after-beats.json
kill $(lsof -tiTCP:8796 -sTCP:LISTEN)                                                    # stop the service
SERVICE_CHAIN_KEY= bun run provenance --dry-run --from "$SCR/service" --out "$SCR/prov"
drive run-g1-play-door.json     # G: not finished in this run (see below)
```

Note: `kill` on the electron-vite process tree did not close Electron (it kept 9343 open). It was
closed with CDP `Browser.close` on the browser target.

Environment:
- macOS 27.0, Bun 1.3.6, Electron 44.3.0 (Chrome 152).
- main `84dbe86` plus the uncommitted working tree of every session.
- Window 1440 × 868 CSS px at scale 2. UI switched to English in part A.
- Model: **none**. The app's provider was `apple-fm · system`, shown UNREACHABLE. The OpenAI and
  Thesys keys were blanked. The HUD said "No model calls counted for this world yet." throughout.

## What was checked

| # | Expected | Observed | Verdict |
| --- | --- | --- | --- |
| A | Settings → Shared worlds takes `ws://127.0.0.1:8796`, saves it, and Test reaches it | Saved: localStorage `unwritten.worldServices` = `ws://127.0.0.1:8796`. Test: "Reachable: unmapped-service/1, physics 1, 0 worlds kept. Health **13 ms**, greeting **14 ms**." Service key `kd7z7css…656a`, "runs in test mode" (`a-01`) | pass |
| B | Worlds → New game → Start plays the built-in world | Play on `aether-land` 1.3.0, instance `8mk4-weu4-muhpjw59`, seed 8MK4-WEU4. The toast said "This save's land now lives in its world's history (2 entries)." (`b-00`) | pass |
| C | E at home opens the door; "Share on 127.0.0.1:8796" attaches the world | The door read "Local: only this device keeps this world". After the click: "Shared on 127.0.0.1:8796 · Online · You own this world" in **503 ms**. Service log: `attached world hmx3uh22…wmraa (3 entries)` (`c-00`, `c-01`) | pass |
| D | The owner turns on recording at the door (a `chain` event) | "Record beats" went disabled/active and the door read "Recording is now: Record beats." Service `log.jsonl` n=4 is `chain {"record": true}`, signed by the owner key `kghxqun37…`. The provenance line read "No chain is set up on this device, so nothing is compared. Everything else works as usual." (`d-00`) | pass |
| E | Beat passes write beats; notes between them make the upTo values differ | Five `POST /v1/test/advance` calls (see "Beats written" below) wrote beats at n = **5, 7, 9, 10**; the fifth (+1 day) was skipped as `"quiet"`. Notes "The first week passed quietly on this road." (tile 8,2 → n=6) and "Two weeks in, the wind turned." (tile 14,2 → n=8) were left after walking with W and then D (`e-00`, `e-01`) | pass |
| E' | The service with no chain env records nothing and says nothing | `service.log.txt` has no `provenance:` line; the only lines are the start line, the attach line and the stop line | pass |
| F | The app's own copy folds the same beats; the door still works; main answers `provenance-not-configured` | The app's `worldNow()` gave head **10** and 4 beats (upTo 4/6/8/9, seasons 1/2/3/0), with the same four fingerprints as the service log. The `ud/histories/<world>/log.jsonl` chains equal the service's for **10/10** entries. The files are not byte-identical: `event.id` is in a different key position on the 4 beat lines, but the JSON values are equal. `window.seed.world.provenance()` returned `{code: "provenance-not-configured", message: "No provenance chain is configured.", hint: "Set UNMAPPED_PROVENANCE_RPC_URL and UNMAPPED_PROVENANCE_ADDRESS in .env to compare worlds with the fingerprints their services recorded."}`. The door showed "Shared on 127.0.0.1:8796 · Online" and the calm "No chain is set up…" line, with no error block (`f-00`) | pass |
| P | `provenance --dry-run --from <service dir>` reproduces the fingerprints and chains, and the refusals fire | See "Provenance dry run" below: 1 world, 10 entries, **4 beats, 4 recompute**, record requested true. Main's reader read back "matches at 9 (4 beats walked back)", "a changed copy: differs at 4", and "one cut before the first beat: not synced". **5/5 refusals** fired, and the offline signature checks passed. The service dir's sha256 was unchanged by the run | pass |
| G-a | Service stopped, no chain env: play still works | After Continue (G0, service already stopped) the land drew at 60 FPS with LAND 0 · 0, and S moved the player to (14.57, 8.50) (`g0-04`). The walk with the service stopped was not measured cleanly: G0 and G1 were cut short by Vite reloads (below) | partial |
| G-b | Service stopped, no chain env: Worlds → Saves works | Saves listed "無界之地 · 8MK4-WEU4 · Shared on 127.0.0.1:8796 · aether-land@1.3.0 · Resume · Backup save" and the plain line "No ENS tree is set up on this machine (UNWRITTEN_LINEAGE_* in .env)." (`g0-02`) | pass |
| G-c | Service stopped, no chain env: the door's chain section (screenshot), a W walk of 1500 ms with a HUD read, and Worlds → Cartridges / Market / Settings | **not run.** G0 reached Cartridges and Market only after a reload had already returned the app to the title (`g0-03`). G1 began on the title after another reload. Then the coordinator paused the stage. The chain section with no chain env *and the service online* is in `d-00` and `f-00` | not run |

### Beats written (service `log.jsonl`, identical in the app's fold)

| advance | offsetDays | now (receipt clock) | beat n | upTo | season | fingerprint |
| --- | ---: | --- | ---: | ---: | ---: | --- |
| +7 d | 7 | 2026-10-03T01:26:20.345Z | 5 | 4 | 1 | `sha256:2d38bb93…62b5bf` |
| (note n=6) | | | | | | |
| +7 d | 14 | 2026-10-10T01:26:43.643Z | 7 | 6 | 2 | `sha256:fd9615a8…3411f70` |
| (note n=8) | | | | | | |
| +7 d | 21 | 2026-10-17T01:26:58.647Z | 9 | 8 | 3 | `sha256:81f4cf69…4d7571e` |
| +7 d | 28 | 2026-10-24T01:26:59.681Z | 10 | 9 | 0 | `sha256:cd738bbf…398a19` |
| +1 d | 29 | 2026-10-25T01:27:00.712Z | — | — | — | `skipped: "quiet"` |

This world has no witnessed chunks, so fog and slots stay empty. Each beat is written because the
season turns every 7 days. The +1 day pass changes nothing, so it is skipped as quiet.

### Provenance dry run (`provenance-result.md`, `provenance.out.txt`)

- Run: `SERVICE_CHAIN_KEY= bun run provenance --dry-run --from $SCR/service --out $SCR/prov`. It
  took 1.14 s wall-clock.
- RPC: `https://ethereum-sepolia-rpc.publicnode.com`, the script's built-in default for `--dry-run`
  (no `--rpc`, and nothing in `.env`). Chain id 11155111, checked by the script.
- Contract: `0xF625ec3c228e3BCE34977C0b7e97BD591291Ef02` (CREATE2, salt
  `0xa3557ee8…7622d`), solc 0.8.37. It is not yet on Sepolia, so the deploy was simulated.
- Recorder: a throwaway simulated sender, `0xa1803ab2…1b65`. Service key
  `kd7z7css756dolp5afymgjlpxc5gqnvawzxnqc6suqmyjeaed656a`, read from `service-key.json`.
- World read: `hmx3uh22ofakymbirjzn3gof6vkvt5a3bslexza6gydrfbh5wmraa`. 10 entries, 4 beats,
  **4 recompute**, record requested **true**. Nothing was skipped.

| Step | Gas | Gas per beat |
| --- | ---: | ---: |
| deploy WorldProvenance | 609,729 | |
| open the stream of hmx3uh22ofak… | 98,476 | |
| record 2 beats (catch-up batch) | 39,610 | 19,805 |
| record 1 beats (one pass) | 34,013 | 34,013 |
| record 1 beats (one pass) | 34,013 | 34,013 |

Refusals fired (5/5):
- a beat before its stream is open (3): `StreamNotOpen`
- a second open of one stream (2): `StreamAlreadyOpen`
- a falling upTo (4): `UpToNotRising`
- the same upTo again (4): `UpToNotRising`
- one upTo twice in one batch (4): `UpToNotRising`

Offline checks:
- The genesis and stream signatures verify.
- Replays under another recorder, or with chain id 1, read `"sequencer-sig-invalid"`.
- "The chain takes the same signatures from another sender; offline they do not count (5)".

Read back through main's `compareWithChain`, walking `prevBlock` over the simulated blocks:
- matches at **9**, with **4** beats walked back;
- a changed copy **differs at 4**;
- a copy cut before the first beat reads **not synced**.

The service data dir was hashed before and after the dry run and was unchanged:
- `service-key.json` `aee5c2c6…`
- `log.jsonl` `5bb3b97a…`
- `snapshot.json` `f52303f1…`

## Found on the way (verbatim)

1. **Live edits by other sessions reload the renderer.** They put the app back on the title
   mid-run. From `app.log`:
   - `10:29:36 AM [vite] (client) page reload i18n/strings/account.ts`
   - `10:29:52 AM [vite] (client) page reload i18n/strings/account.ts`
   - `10:30:45 AM [vite] (client) page reload i18n/strings/errors-browser.ts`
   - `10:30:57 AM [vite] (client) page reload i18n/strings/mobile.ts`
   - `10:31:05 AM [vite] (client) page reload i18n/strings/mobile.ts`

   G0 and G1 were cut short by these reloads. They are an environment effect, not an app failure.
2. **Escape with no layer open leaves Play by design.** `hotkeys.ts` maps it to `exit-play`. F0
   ended with an Escape after the door had failed to open, and that took the app to the title. F0
   had also passed the `useWorldStore.scene` Loadable instead of `scene.value` to `doorPosition`,
   so its target threw (`TypeError: Cannot read properties of undefined (reading 'width')`) and
   read as "no target". F fixed both issues.
3. **Part A's `clickText "Test"`** hit another panel's Test button first (at 779,103), and the
   Shared worlds line stayed "Not tested yet". A2 clicks the Test button under Shared worlds
   through the DOM instead. No key was set, so that first click could not spend anything.
4. **Bun prints this line at exit** of both `bun run service` and `bun run provenance` (exit code
   still 0 / success):
   `Internal error: directory mismatch for directory "/Users/kidney/Workspace/Hackathon/unmapped/tsconfig.node.json", fd 3. You don't need to do anything, but this indicates a bug.`
5. **The Continent section errors on a shared world.** The door shows
   `Error · continent-world-attached · This world is shared through a world service, so it cannot also join a continent.`
   This is the stated rule, and it is shown as an error block (`f-00`).

## Files

- `run.json`: env, model, the full sequence, and the actions of parts A–D.
- The part files: `run-a-settings.json`, `run-a2-test.json`, `run-b-newgame.json`,
  `run-c-share.json`, `run-d-record.json`, `run-e1-note.json`, `run-e2-note.json`,
  `run-f0-door-attempt.json`, `run-f-door-after-beats.json`, `run-g0-interrupted.json`,
  `run-g1-play-door.json`.
- `provenance-result.md`: the script's own report.
- `provenance.out.txt`: its console output.
- `service.log.txt`: the service's full log.
- Screenshots: `a-00`, `a-01`, `b-00`, `c-00`, `c-01`, `d-00`, `e-00`, `e-01`, `f-00`, `g0-02`,
  `g0-04`, `g0-03-title-after-reload`, `g1-00-title-after-reload`.

Scratch paths in the copied logs are shown as `$SCR`.

## Part G (finished)

This is a second session on 2026-09-26. It finishes G, the pass with no chain env anywhere and
the service stopped. It does not replace the G-a / G-c rows above.

It used a fresh userData and a fresh service dir on a private snapshot tree: origin/main
`0a03e29`, no `.env`, and its own Vite cache and port. That is why no other session's edit
reloaded it; `g2-main.log.txt` has no `page reload` line. The world is a new New game (seed
4QCL-JV9D), not the A–F world. It was shared on 8796, "Record beats" was turned on, and then the
service was stopped.

No chain env was set anywhere:
- The service was started with `env -u` for every `SERVICE_CHAIN_*` / `SERVICE_PROVENANCE_*`.
- The app was started with `env -u` for every `UNMAPPED_PROVENANCE_*`, and the `UNWRITTEN_*`
  values were blanked.
- `ps eww` on Electron main showed no `UNMAPPED_PROVENANCE_*` or `SERVICE_*`.

Model: none answering (`apple-fm · system`, UNREACHABLE). No model call was made.

### Replay

```bash
SCR=$(mktemp -d); R=<repo root>; D=docs/e2e/milestone-rev6-p4-chain
mkdir -p $SCR/snap $SCR/service $SCR/udG
git -C $R archive origin/main | tar -x -C $SCR/snap; ln -s $R/node_modules $SCR/snap/node_modules
# $SCR/snap/electron.vite.config.ts, renderer section, add:
#   cacheDir: resolve(__dirname, ".vite-cache"), server: { port: 5197, strictPort: true },
(cd $SCR/snap && env -u SERVICE_CHAIN_KEY -u SERVICE_CHAIN_ID -u SERVICE_CHAIN_RPC_URL -u SERVICE_PROVENANCE_ADDRESS \
  UNMAPPED_SERVICE_TEST=1 bun run service -- --port 8796 --data $SCR/service) &
(cd $SCR/snap && env -u UNMAPPED_PROVENANCE_RPC_URL -u UNMAPPED_PROVENANCE_ADDRESS -u UNMAPPED_PROVENANCE_CHAIN_ID \
  OPENAI_API_KEY= THESYS_API_KEY= UNMAPPED_GATEWAY_URL= UNMAPPED_GATEWAY_KEY= UNWRITTEN_LINEAGE_ACCOUNTS= \
  UNWRITTEN_LINEAGE_FROM_BLOCK= UNWRITTEN_LINEAGE_HOOK= UNWRITTEN_LINEAGE_PARENT= UNWRITTEN_LINEAGE_REGISTRY= \
  UNWRITTEN_LINEAGE_RELAY= UNWRITTEN_LINEAGE_ROUTER= UNWRITTEN_PRIVATE_KEY= \
  AETHER_TEST_USER_DATA=$SCR/udG bunx electron-vite dev --remoteDebuggingPort 9344) &
cd $R; part() { CDP_PORT=9344 bun scripts/cdp-drive.ts "$(cat $D/$1)"; }
part run-g2-a-settings.json; part run-g2-b-newgame-share-record.json
kill $(lsof -tiTCP:8796 -sTCP:LISTEN)                     # stop the service
part run-g2-c-door-chain-stopped.json; part run-g2-d-walk.json
part run-g2-e-screens.json; part run-g2-f-settings-test-stopped.json
```

`run-g2.json` holds the env, the model, the sequence, and the actions before the stop
(`actionsBeforeStop`) and after it (`actions`).

### What was checked

| # | Expected | Observed | Verdict |
| --- | --- | --- | --- |
| G2-A | The service is set up in Settings | Shared worlds took `ws://127.0.0.1:8796`, and Test said "Reachable: unmapped-service/1, physics 1, 0 worlds kept. Health **22 ms**, greeting **23 ms**." Service key `kezrdmpp…oonina`, "runs in test mode" (`g2-00`) | pass |
| G2-B | New game, share, Record beats | Play on `aether-land` 1.3.0, instance `4qcl-jv9d-muhxfj0q`. "Share on 127.0.0.1:8796" read "Shared on 127.0.0.1:8796 · Online" after **505 ms**. Service log: `attached world h7eh5pro…w2zq (3 entries)`. "Record beats" went disabled (active), and the door read "Recording is now: Record beats." The service's `log.jsonl` n=4 is `chain {"record": true}`. The provenance line read "No chain is set up on this device, so nothing is compared. Everything else works as usual." (`g2-01`, `g2-service-disk.txt`) | pass |
| — | Service stopped | `kill` (SIGTERM) on the pid on 8796 at 05:06:16Z. The service logged "world service: stopped (SIGTERM), snapshots written". `lsof` then found nothing on 8796, and `curl /v1/health` exited 7 | — |
| G1 | The door's chain section with the service stopped says no chain is set up, with no error block | Sharing: "Shared on 127.0.0.1:8796 · Offline: your changes wait here and go out when the service answers. · You own this world." Chain section: "Recorded on a public chain", the chips "Don't record" / "Record beats" (Record beats active), the public-metadata note, and "No chain is set up on this device, so nothing is compared. Everything else works as usual." The chain section has **no** error block. `window.seed.world.provenance()` → `provenance-not-configured` ("No provenance chain is configured."). The only error block in the whole door is the Continent section's known `continent-world-attached` (item 5 above) (`g2-02`, `g2-03`) | pass |
| G2 | Play still works: W for 1.5 s, with HUD reads before and after | Before: (10.4, **8.5**), LAND 0 · 0, 41 FPS. After: (10.4, **2.55**), 5.95 tiles, LAND 0 · 0, 40 FPS. The HUD lines were the same both times: seed, "UNWRITTEN · The model is not reachable…", KARMA 0 entries, CARRIED 0 items · 0 mats, "Story 0/3 · next: The Twice-a-Day Bus (Last Stop)", "UNREACHABLE apple-fm · system", "No model calls counted for this world yet." (`g2-04`, `g2-05`). After Settings and Continue, Play opened again at (10.4, 2.55), 49 FPS, head 4 (`g2-12`) | pass |
| G3a | Worlds → Saves | "無界之地 · 4QCL-JV9D · Shared on 127.0.0.1:8796 · aether-land@1.3.0 · Resume · Backup save", then "No ENS tree is set up on this machine (UNWRITTEN_LINEAGE_* in .env)." (`g2-06`) | pass |
| G3b | Worlds → Cartridges says plainly what is not set up | All 4 revisions listed (1.3.0, 1.2.0, 1.1.0, 1.0.0). The selected 1.3.0 shows "1 run: 無界之地 · 4QCL-JV9D", "No ENS tree is set up on this machine (UNWRITTEN_LINEAGE_* in .env).", Play / Remix / Export .cartridge / Import .cartridge / Open by ENS name. **0** error blocks (`g2-07`) | pass |
| G3c | Worlds → Market says plainly what is not set up | "Bid on and trade worlds on Sepolia. Your passkey signs every move and UNMAPPED's gas station pays the gas — no wallet, no ETH." Then "Error · market-not-configured · No lineage market is configured on this machine. · Run `bun run lineage:market <label>` and put the UNWRITTEN_LINEAGE_* lines it prints in .env." The screen works; the not-configured line is drawn as an error block, not a calm line (`g2-08`) | pass |
| G3d | Settings | It opened with LANGUAGE, Model, Account, Plan, Images, Signaling servers and Shared worlds. The only error blocks are Account and Plan `gateway-not-configured`, because this run blanked `UNMAPPED_GATEWAY_URL`. Shared worlds lists `ws://127.0.0.1:8796` "Not tested yet." (`g2-09`, `g2-10`). Its Test with the service stopped: "Error · service-unreachable · Cannot reach http://127.0.0.1:8796/v1/health: fetch failed · Check the address and that the service runs." (`g2-11`) | pass |
| G4 | No crash anywhere | `g2-main.log.txt` has no renderer error, no uncaught exception and no Vite reload. Every step ended on the screen it meant to reach | pass |

**Part G verdict: pass.** With the chain switched off everywhere and the service gone, the door's
chain section is one calm line, play goes on, and Saves, Cartridges, Market and Settings each say
what is not set up. Market draws that as an error block, Cartridges and Saves as a plain line.

### Part G files

- `run-g2.json`: env, model, sequence, all actions.
- Part files: `run-g2-a-settings.json`, `run-g2-b-newgame-share-record.json`,
  `run-g2-c-door-chain-stopped.json`, `run-g2-d-walk.json`, `run-g2-e-screens.json`,
  `run-g2-f-settings-test-stopped.json`.
- Logs: `g2-service.log.txt` (the service's log), `g2-service-disk.txt` (its stored log after the
  stop), `g2-main.log.txt` (the app's log).
- Screenshots: `g2-00` to `g2-12`.
- The app was closed with CDP `Browser.close`; the first attempt got no reply and the second
  closed it. At the end nothing listened on 9344, 8796 or 5197.
