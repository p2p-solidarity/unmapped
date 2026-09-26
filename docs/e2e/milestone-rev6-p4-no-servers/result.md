# E2E · rev 6 phase 4 · `p4-no-servers` (flow 10)

Plan flow 10 (`docs/plans/rev6-phase4.md`): with only the desktop app and a local model, play,
Create, witnessing and `.world` export/import all work, and no screen asks for an account.

This run had no world service, no gateway and no signaling server of its own. The app had no
`.env`, and every key was blank. **This machine has no local model that answers.** Apple's
on-device model is installed (`/usr/bin/fm`), but its terms were never accepted, so `fm serve`
exits with code 69. llama.cpp and Ollama are not installed, and nothing listens on :8080. So the
local-model half is **not run: no local model on this machine**. What the app said instead is
recorded below, word for word.

**Verdict: partial.**
- Pass: no screen asks for an account; plain play (walk, notes); the no-service door; `.world`
  export, offline verify and import on a second fresh userData.
- Not run: talking to a resident (none exists without a model), and Create and witnessing with a
  local model (none answers).
- Found: choosing llama.cpp with no `llama-server` installed is refused as `untrusted-config`
  (item 1 below).

## Replay

```bash
SCR=$(mktemp -d); R=<repo root>; D=docs/e2e/milestone-rev6-p4-no-servers
mkdir -p $SCR/snap $SCR/ud1 $SCR/ud2 $SCR/files
git -C $R archive origin/main | tar -x -C $SCR/snap          # 0a03e29; no .env in it
ln -s $R/node_modules $SCR/snap/node_modules
# $SCR/snap/electron.vite.config.ts, renderer section, add:
#   cacheDir: resolve(__dirname, ".vite-cache"), server: { port: 5197, strictPort: true },
cp $D/close-app.ts.txt $SCR/close-app.ts
blank="OPENAI_API_KEY= THESYS_API_KEY= UNMAPPED_GATEWAY_URL= UNMAPPED_GATEWAY_KEY= UNMAPPED_COMMERCIAL="
(cd $SCR/snap && env $blank AETHER_TEST_USER_DATA=$SCR/ud1 AETHER_TEST_WORLD_PATH=$SCR/files/ns-export.world \
  bunx electron-vite dev --remoteDebuggingPort 9344) &                               # launch 1
cd $R; step() { CDP_PORT=9344 bun scripts/cdp-drive.ts "$(cat $D/$1)"; }
for s in 01-title-settings 02-play 03-note 04-door 05-apple-model 06-create-apple \
         07-witness-apple 08-llamacpp 09-export; do step run-$s.json; done
(cd $SCR/snap && sandbox-exec -p '(version 1)(allow default)(deny network*)' \
  bun run verify-world -- $SCR/files/ns-export.world)                               # offline
CDP_PORT=9344 bun $SCR/close-app.ts; lsof -nP -iTCP:9344 -iTCP:5197 -sTCP:LISTEN     # nothing
cp $SCR/files/ns-export.world $SCR/files/ns-import.world
(cd $SCR/snap && env $blank AETHER_TEST_USER_DATA=$SCR/ud2 AETHER_TEST_WORLD_PATH=$SCR/files/ns-import.world \
  bunx electron-vite dev --remoteDebuggingPort 9344) &                               # launch 2
step run-10-import.json
CDP_PORT=9344 bun $SCR/close-app.ts
```

`run.json` holds the env, the model, the sequence, launch 1's actions (steps 1–9) and launch 2's
actions (`actionsLaunch2`, step 10).

Environment:
- macOS 27.0 (26A428), Bun 1.3.6, Electron 44.3.0 (Chrome 152).
- The tree is a snapshot of origin/main `0a03e29`, with no `.env`, a private Vite cache and a
  fixed dev port. The snapshot has no built `afm-bridge` (`[apple-local] native-helper-start: spawn
  …/afm-bridge ENOENT`), because another session is changing it.
- Ports: CDP 9344 and Vite 5197 only.
- `ps eww` on Electron main showed `OPENAI_API_KEY`, `THESYS_API_KEY`, `UNMAPPED_GATEWAY_URL`,
  `UNMAPPED_GATEWAY_KEY` and `UNMAPPED_COMMERCIAL` present and empty. It showed no `UNWRITTEN_*`,
  `UNMAPPED_PROVENANCE_*` or `SERVICE_*`.
- The UI starts in the system language (zh-TW); step 1 switches it to English.

## What was checked

| # | Expected | Observed | Verdict |
| --- | --- | --- | --- |
| 1a | No screen asks for an account | Title buttons: 繼續 · 世界 · 創造世界 · 設定 (`01-00`). Settings sections: LANGUAGE, Model, Account, Plan, Images, Signaling servers, Shared worlds. No sign-in, log-in or sign-up text anywhere in Settings, and Account has no inputs and no buttons. The Worlds, Play, Create and World files screens (their full text is in the run output) never ask for one either | pass |
| 1b | Account and Plan say plainly that there is no gateway | Account: "An account on the generation gateway holds this device's key and its free allowance. Your own key and local models work without one." Then "Error · gateway-not-configured · This build has no generation gateway configured. · Set UNMAPPED_GATEWAY_URL in .env to the gateway's address and restart, or use your own key or a local model in Settings → Model." There is no `[data-account]`. Plan shows the same error, with `[data-plan]` count **0** and no price text (`01-01`) | pass |
| 1c | Model offers no "Free allowance" | The Cloud API chips are `OpenAI`, `OpenUI Gateway` and `Custom API`, and "Free allowance" appears nowhere on the page (`01-02`). The default is "Next call: Apple on-device · this computer · system", shown as "Model did not answer" | pass |
| 2a | New game on the built-in world; walk | Worlds → New game → Start opened Play on `aether-land` 1.3.0, instance `um7t-ewls-muhx0c2d`, seed UM7T-EWLS. The toast said "This save's land now lives in its world's history (2 entries)." HUD: LAND 0 · 0, 35 FPS, "UNREACHABLE apple-fm · system" (`02-00`). W for 1.5 s moved the player (8.5, 8.5) → (8.5, **2.36**), 6.14 tiles, at 32 FPS (`02-01`) | pass |
| 2b | Talk to a resident | **Not run: no resident exists without a model.** The 1.3.0 origin scene has 0 NPCs, and the land store had 0 written chunks. Residents come from chapter 1 (written by the model at its gate) or from witnessed land. The chapter card said "Error · story-model-offline · The model is not reachable, so the next chapter is not written ahead. · Start the model or check the provider in Console → Inference, then Retry." | not run |
| 2c | Open the notes | N opened "Notes · unwritten land (0 · 0) … Nobody has left a note here yet." (`02-02`). Step 3 left one note ("No servers here: this note stays on this device."): head 2 → **3**, notes 0 → **1** (`03-00`) | pass |
| 3a | Apple on-device chosen in Settings → Model | It was already the current model ("Current model", disabled). The panel said "Not installed or running": the bridge is absent in this tree. Check connection (**1056 ms**): "Model did not answer · fm serve exited with code 69 YOU HAVE NOT AGREED TO THE APPLE FOUNDATION MODELS CLI LEGAL NOTICE & TERMS. …run `sudo fm license` in Terminal, then start again." After Start local server, "Error · sidecar-exited · The server exited before becoming ready. YOU HAVE NOT AGREED TO THE APPLE FOUNDATION MODELS CLI LEGAL NOTICE & TERMS. …" was on screen when the poll read it, 15.1 s after the click. Store: probe `reachable: false`; sidecar `state: "error"`, port 11535 (`05-00`). Accepting the terms is a person's `sudo` step and was not done | not run (no local model) |
| 3b | Create's first step with it | Before the click, the readiness block said "Error · new-world-no-model · A new world is written by the model, and the model did not answer the last check. · Start a model or choose one in Settings → Model. You can still try: a real failure says what went wrong." "Write the world" then added "Error · connection-refused · Could not reach http://127.0.0.1:11535/v1. · select Apple on-device in Settings → Model (it starts fm serve); run `sudo fm license` once first" **1304 ms** after the click. Main: `[inference] fail fe111a3a… · bible · apple-fm system · 1168 ms · connection-refused`. `usage.jsonl`: `outcome: "failed"`, `ms: 1168`, tokens null. The draft line read "This draft: 0 calls · 0 in / 0 out · 0 cached · Not counted as calls: 1 that ended without an answer (1 refused or failed, 0 cancelled)." (`06-00`) | not run (no local model) |
| 3c | One witness with it | The player walked the z = 16 ford into chunk (1, 0): arrived (16.2, 15.6) in 1439 ms, then (40.2, 16.2) in 3571 ms. HUD: LAND 1 · 0, "UNWRITTEN · The model is not reachable, so new land stays unwritten. — Start the model or check the provider in Console → Inference. Walking still works." (`witness-model-offline`, `07-00`). The chunk never entered the land store, and the history had no witness. The app asks no model here: the probe says unreachable. Launch 1's log has 4 `[inference]` lines (2 chats, both Create `bible`) and none for a witness | not run (no local model) |
| 3d | What a llama.cpp choice says with nothing on :8080 | Selected: "Not installed or running · Model file: — · Choose a GGUF model… · Context window (tokens)". After "Use this model" and Check connection (**1109 ms**): "Error · untrusted-config · This inference endpoint or credential source is not trusted. · Use the OpenAI or OpenUI preset, a loopback local server, or a custom endpoint whose key is entered in Settings → Model; sidecars must be llama-server or Apple's fm." The saved config stayed `apple-fm`, and no "Start local server" button showed. Create → Write the world then still went to Apple: connection-refused on :11535 (main 1317 ms, screen +1548 ms). **No request ever went to :8080** (`08-00`, `08-01`). See item 1 below | recorded |
| 4a | Export this local world's `.world` (Worlds → World files) | Listed "無界之地 · UM7T-EWLS · 4 entries · on this device only · You own it". Export .world → "Wrote ns-export.world (8 KiB)." **266 ms** after the click (`09-00`). The file is 7,312 bytes, sha256 `58d9d42e…6c95e4` (`ns-export.world`) | pass |
| 4b | `verify-world` offline | Run under `sandbox-exec` with `(deny network*)`: exit **0**, "OK — every check passed.", "checked in **55 ms**" (0.22 s wall). Entries 4 by 1 key, owners 1, services "none (never attached)", beats 0, packs 1 (0 AI worlds), 8,504 bytes. The export signature is valid (`verify-ns-export.txt`) | pass |
| 4c | Import on a second fresh userData, as a second launch after closing the first | Launch 1 was closed first (9344 and 5197 free). On launch 2, Worlds → World files → Choose a .world file reported "4 entries, up to #4 · physics 1 · 1 owner · 1 writer · 0 beats · 0 AI worlds · Never shared on a world service. · Exported 9/26/2026, 2:01:58 PM, signed by kaoccgu7r…. · Every check passed: hashes, chain, receipts, verdicts, beats and packs." (`10-00`). Bring it in (name "Bo") reached Play in **570 ms** | pass |
| 4d | It is adopted, and the land draws | New world `hiph756v…` (the file's is `hqgq6fc…`), re-signed by this device's key `kxoz4smg…`. Its genesis `from` names world `hqgq6fc…` at head #4 `sha256:be1c8c38…`. Owners: this device only. The note came along, and head is 5 (the 5th entry is Bo's profile). The toast said "無界之地 · UM7T-EWLS was never shared, so it is now a world of this device." The save's `world.json` pins `hiph756v…`. The land drew: LAND 0 · 0, 35 FPS, canvas 2880 × 1686. W for 1.5 s moved (8.5, 8.5) → (8.5, 2.52), and N showed the imported note (`10-01`, `10-02`, `disk-after.txt`). Launch 2 made **0** `[inference]` calls | pass |
| 5 | The door says plainly that there is no world service, with a hint, and shows no online state | Sharing: "Local: only this device keeps this world · You own this world." Under "Share this world": "Error · world-services-none · This device lists no world service. · Add one in Settings → Shared worlds, then open the door again." There were 0 "Share on …" buttons and no "Online", "Connecting" or "Shared on". Settings → Shared worlds said "This device lists no world service yet: every world stays on this device until you add one." `unwritten.worldServices` = null (`04-00`). A local world's door has no chain section | pass |

## Found on the way (verbatim)

1. **llama.cpp cannot be chosen when `llama-server` is not installed, and the refusal is
   `untrusted-config`.**
   - `ModelPanel.tsx` `option("llamacpp", …)` sets `sidecar.binaryPath` to
     `detection?.llamacpp.binaryPath ?? ""`.
   - Main's `parseConfig` then refuses the empty path through `isTrustedSidecarBinaryPath`.
   - The message says "This inference endpoint or credential source is not trusted." It does not
     say that no llama-server was found.
   - A player with a llama-server already running on :8080 from a path the app did not detect
     cannot point the app at it through this choice.
   - Code: `src/renderer/app/title/ModelPanel.tsx:38-47`, `src/main/inference/config.ts:184-193`
     and `:238-245`.
2. **Create's "Back to the title" on the idea step goes to Create's draft list, not the title.**
   This is `useCreateController.back()`: a draft at `idea` clears the draft. On that list,
   "Continue" resumes the draft. Step 7a clicked that "Continue" as if it were the title's, so
   its walk ran on the Create screen (`07a-00`, `run-07a-misclick.json`). This is by design and was
   not an app failure. Step 7 clicks "Back to the title" twice.
3. **The no-service door uses an error block.** `world-services-none` is shown with `ErrorBlock`
   (`WorldDoorSection.tsx` `NO_SERVICES`). It is plain and has a hint, but it is styled as an
   error, unlike the chain's calm "not set up" line.
4. **Browser.close sometimes gets no reply.** The first `Browser.close` on launch 1 (a `bun -e`
   one-liner) left the app running. `close-app.ts` then closed it. Neither launch left a process.
5. Bun still prints this line at the exit of `bun run verify-world` (exit code 0):
   `Internal error: directory mismatch for directory ".../snap/tsconfig.node.json", fd 3. You don't need to do anything, but this indicates a bug.`

## Files

- `run.json`: env, model, sequence, and the actions of both launches.
- Step files: `run-01-title-settings.json`, `run-02-play.json`, `run-03-note.json`,
  `run-04-door.json`, `run-05-apple-model.json`, `run-06-create-apple.json`,
  `run-07a-misclick.json`, `run-07-witness-apple.json`, `run-08-llamacpp.json`,
  `run-09-export.json`, `run-10-import.json`.
- `close-app.ts.txt`: the CDP `Browser.close` helper.
- `ns-export.world`: the exported file.
- `verify-ns-export.txt`: the offline verify output.
- `disk-after.txt`: both userData histories, the import's index and pin, and `usage.jsonl`.
- `main-launch1.log.txt` and `main-launch2.log.txt`: the app logs.
- Screenshots: `01-00` to `10-02`, and `07a-00` from the misclick.

Scratch paths are written as `$SCR`.
