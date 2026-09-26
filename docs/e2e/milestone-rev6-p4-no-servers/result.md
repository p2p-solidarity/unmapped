# E2E · rev 6 phase 4 · `p4-no-servers` (flow 10)

Plan flow 10 (`docs/plans/rev6-phase4.md`): with only the desktop app and a local model, play,
Create, witnessing and `.world` export/import all work, and no screen asks for an account.

This run had no world service, no gateway and no signaling server of its own. The app had no
`.env`, and every key was blank. **This machine has no local model that answers.** Apple's
on-device model is installed (`/usr/bin/fm`), but its terms were never accepted, so `fm serve`
exits with code 69. llama.cpp and Ollama are not installed, and nothing listens on :8080. So the
local-model half is **not run: no local model on this machine**. What the app said instead is
recorded below, word for word.

**Verdict: partial.** (The local-model half was run later with Qwen 3.5 4B on llama.cpp: see
[Local model: Qwen 4B](#local-model-qwen-4b) at the end.)
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

## Local model: Qwen 4B

The same flow, with a local model that answers: Qwen 3.5 4B (`Qwen3.5-4B-Q4_K_M.gguf`,
2,740,937,888 bytes, from unsloth/Qwen3.5-4B-GGUF) on llama.cpp from Homebrew (0.5.0, build
b11146-7fe450e19, `/opt/homebrew/bin/llama-server`). There was no world service, no gateway and no
own key, and no `.env`.

**Verdict: partial.**
- Pass: the app starts and stops llama-server itself (Settings → Model → Start local server). It
  also talks to a llama-server started by hand on :8080. The probe answers, and the quote says local
  models are free. Create's world and story steps work. The look step is skipped with no image
  provider. Chapter 1 is written in the background. Talking makes no model call. Two new chunks were
  witnessed.
- Fail: **Create never builds a world with Qwen 4B.** Seven builds made 21 origin calls, and every
  build ended in a `dsl-*` error after 2 repairs. So "Build, then enter" was not reached. Play ran on
  the built-in world (`aether-land` 1.3.0) with Qwen writing.
- Witnessing: 2 of 5 chunk writes landed (15 calls).

### Replay

```bash
SCR=$(mktemp -d); R=<repo root>; D=docs/e2e/milestone-rev6-p4-no-servers
mkdir -p $SCR/snap $SCR/ud $SCR/files
git -C $R archive origin/main | tar -x -C $SCR/snap          # 81601d2; no .env in it
ln -s $R/node_modules $SCR/snap/node_modules
# $SCR/snap/electron.vite.config.ts, renderer section, add:
#   cacheDir: resolve(__dirname, ".vite-cache"), server: { port: 5198, strictPort: true },
cp $D/close-app.ts.txt $SCR/close-app.ts
blank="OPENAI_API_KEY= THESYS_API_KEY= UNMAPPED_GATEWAY_URL= UNMAPPED_GATEWAY_KEY= UNMAPPED_COMMERCIAL="
(cd $SCR/snap && env $blank AETHER_TEST_USER_DATA=$SCR/ud \
  bunx electron-vite dev --remoteDebuggingPort 9345 > $SCR/files/main-launch1.log 2>&1) &   # launch 1
cd $R; step() { CDP_PORT=9345 bun scripts/cdp-drive.ts "$(cat $D/$1)"; }
for s in q01-model-panel q02-sidecar q03a-create-world q03b-look-story q03c-build \
         q03d-build-retry q03e-build-third q03f-build-more q04a-to-new-game q04b-first-writes \
         q04c-helper q04d-walk-witness q04e-talk q04f-retry-witness q05-health; do step run-$s.json; done
CDP_PORT=9345 bun $SCR/close-app.ts; lsof -nP -iTCP:9345 -iTCP:5198 -iTCP:8080 -sTCP:LISTEN   # nothing
llama-server -m ~/models/Qwen3.5-4B-Q4_K_M.gguf --port 8080 --ctx-size 16384 --jinja \
  --log-file $SCR/files/llama-launch3.log -lv 5 --log-timestamps --log-prefix &              # by hand
(cd $SCR/snap && env $blank AETHER_TEST_USER_DATA=$SCR/ud \
  bunx electron-vite dev --remoteDebuggingPort 9345 > $SCR/files/main-launch3.log 2>&1) &   # launch 3
step run-q07a-build-launch3.json; step run-q07b-witness-launch3.json
CDP_PORT=9345 bun $SCR/close-app.ts; kill -TERM %<llama-server job>; lsof ... 9345 5198 8080
```

`run-qwen.json` records the env, the model, the sequence and the actions of all three launches.
Launch 2 (`run-q06a-own-server.json`, `run-q06b-build-own-server.json`) is the hand-started server
with `-lv 1`, which logged nothing (see "Found" item 8). Launch 1 also set
`LLAMA_ARG_LOG_FILE/…_TIMESTAMPS/…_PREFIX/…_VERBOSITY=1` so the sidecar would log. That is left out
above, because with verbosity 1 it wrote nothing.

Environment:
- macOS 27.0 (26A428), 16 GB, Bun 1.3.6, Electron 44.3.0 (Chrome 152). Other sessions' apps were
  running on this machine the whole time. When launch 3 was measured, swap was 6,857 MB used and
  memory free was 20 %.
- The tree is a snapshot of origin/main `81601d2`, with no `.env`, a private Vite cache on :5198 and
  CDP on :9345. Main logs `[apple-local] native-helper-start: spawn …/afm-bridge ENOENT`: this tree
  has no bridge, so Apple is not the default.
- `ps eww` on Electron main showed the five keys present and empty.
- Scratch paths are written as `$SCR`.

### What was checked

| # | Expected | Observed | Verdict |
| --- | --- | --- | --- |
| Q1a | Settings → Model: what the llama.cpp choice offers | On a fresh userData with no key, no gateway and no Apple bridge, **llama.cpp is the default**. Config: `{kind: llamacpp, baseUrl: http://127.0.0.1:8080/v1, model: local, sidecar: {binaryPath: /opt/homebrew/bin/llama-server, modelPath: "", port: 8080, ctxSize: 16384}}`. `detectLocal` found `/opt/homebrew/bin/llama-server`, which is in `LLAMA_SERVER_PATHS`, so `isTrustedSidecarBinaryPath` accepts it. The panel shows "llama.cpp · GGUF", "Detected on this computer", "Model file: —", **Choose a GGUF model…**, "Context window (tokens)" = 16384, "Current model" (disabled), Check connection, **Start local server**, and "Next call: llama.cpp · GGUF · this computer · local". It says "Model did not answer" (`q01-00`). The player can choose the model file and the context size; the binary path is not shown and cannot be changed | recorded |
| Q1b | The app starts llama-server itself | Start local server with no model file gave "Error · model-missing · No .gguf model at (empty path). · brew install llama.cpp, then download a .gguf (e.g. https://huggingface.co/unsloth/Qwen3.5-4B-GGUF → ~/models/Qwen3.5-4B-Q4_K_M.gguf) and set it as the sidecar modelPath". "Choose a GGUF model…" opens a native open panel, which CDP cannot drive and which has no E2E override (item 4 below). So the run called the same `setConfig` IPC the panel calls after a pick and "Use this model", with `modelPath` set to the file. Then **Start local server**: `starting` (pid 26511) at 13 ms, then **`ready` at 3,779 ms**. The child of Electron main ran `/opt/homebrew/bin/llama-server -m …/Qwen3.5-4B-Q4_K_M.gguf --port 8080 -c 16384 --jinja --host 127.0.0.1 -ngl 99` (`q02-00`) | pass |
| Q1c | Check connection answers; model id and context | "Connected · 2 ms" and "16384 token context (server)". Probe: `reachable: true`, models `["/Users/kidney/models/Qwen3.5-4B-Q4_K_M.gguf"]`, serverName `llama.cpp`, context `{tokens: 16384, source: "server"}`. llama-server `/props`: 4 slots (`n_parallel` auto, `kv_unified = true`), `n_ctx` 16384 per slot | pass |
| Q1d | A llama-server started by hand also works | Launches 2 and 3 used the recommended command (plus logging flags) on :8080, with the same saved config. Check connection: "Connected · 5 ms", 16384 (server). The sidecar stayed `stopped`, and the panel still offered "Start local server" (not pressed) (`q06-00`) | pass |
| Q2a | Idea → world cards | Idea: "Salt-marsh villages where herons carry the mail." The readiness block said "Using llamacpp · local (4 ms) … Local context: 16384 tokens (server)" (`q03-00`). Write the world: first text streamed at 4.8 s, and the 7 cards were in at **13.9 s** (`q03-01`, `q03-02`). `[inference] bible · 13,771 ms · max 1400 · 1153+239 tokens`, **1 call, 0 repairs**. The name was taken from the words: "Salt-marsh villages where" | pass |
| Q2b | Look: skip the pictures; no image provider | On entry the look step drew 3 sketches at once: `[look] fail … openai · gpt-image-1-mini · 1–2 ms · no-api-key` ×3. The screen said "Error · no-api-key · No OpenAI key is set. · Enter one in Settings → Model (Cloud API → OpenAI), or add OPENAI_API_KEY to .env." and "Continue without a picture" (`q03-03`). The draft line added "Not counted as calls: 3 that ended without an answer (3 refused or failed, 0 cancelled)." Continue without a picture set `look: {pictures: [], chosen: null, skipped: true}` | pass |
| Q2c | Story | Written in the background from the look step. "Continue to build" was enabled **22.2 s** after "Continue to the look" (`q03-04`, `q03-05`). `[inference] story · 22,101 ms · max 4000 · 539+452`, **1 call, 0 repairs**. It wrote 5 chapters: The First Post (meet, Salt Pylon) · The Cracked Path (search) · The High Wire (climb) · The Silent Labyrinth (maze) · Beyond the Line (meet) | pass |
| Q2d | The quote shows a local model as free | "1 call to write the place you wake in, plus up to 2 repairs if it has to be fixed · llamacpp · local / First call: about 2,855 input tokens (measured from its prompt), at most 2,200 output tokens / If both repairs are needed: 3 calls, up to about 17,365 input and 6,600 output tokens / **Cost: free — this model runs on your own machine.**" Chapter 1's background call has its own line. The real first origin prompt was 2,748 tokens (`q03-06`) | pass |
| Q2e | Build, then enter | **7 builds, 21 origin calls, no world.** Every build ended with its third answer rejected (table below). The screen showed the error block, and "Build and play" stayed available (`q03-07`, `q03-08`, `q03-10`–`q03-12`, `q06-01`, `q07-00`). Nothing was published; `cartridges/` holds only `aether-land` | **fail** |
| Q2f | Scene GBNF in play for the origin | **The main log does not show it**: `[inference] chat <id> · 2 messages · 0 tools` only. llama-server's own debug log (launch 3) shows it. When a slot is launched again, the log prints the previous request's params. There, origin tasks 0 and 297 each carried a **742-byte grammar**, whose first line is `# UNMAPPED — Scene dialect of OpenUI Lang. Structural only; the parser checks types.` Witness tasks 922 and 2735 carried none (`q-llama-launch3-excerpt.txt`). The grammar is structural only (`arg ::= string \| number \| … \| ident`). So it cannot stop the mistakes below: `"none"` in an enum slot, a non-hex colour, the wrong number of arguments, or a bare `tint` | recorded |
| Q3a | Play (on the built-in world, since Create built none) | Worlds → New game → Start put `aether-land@1.3.0` in Play in **519 ms** (instance `8g7v-hnlt-mui33ndq`, seed 8G7V-HNLT). On entry two Qwen calls started at once: chapter 1 written ahead, and a witness of the spawn chunk (0, 0). HUD: 20 FPS while both ran (`q04-00`), 59 FPS after (`q04-01`) | pass |
| Q3b | Chapter 1, written in the background by Qwen | "The Twice-a-Day Bus", **2 calls, 1 repair**: 53,281 ms (2237+457), then `[repair] 1/2 · dsl-orphaned-statement · Defined but never used: talk_bus1, c1, c2, talk_bus2, c3, c4, talk_bus3, c5, c6`, then 45,819 ms (3345+487, 2233 cached). It was accepted. It has Kenji (farmer), Mio (elder), Taro (child) and a crate, with its gate at (80.5, 16.5). Qwen defined `c2` twice, and the second silently replaced the first (item 3) | pass |
| Q3c | Talk to a resident: 0 new calls | At the gate, the pad walked to Kenji, and A opened his line: "The grass grows up to the bench, but the grass at home grows deeper. We sit here until the sun gets low." The choices were "Tell me about your errands", "Not now" and "Walk away" (`q04-06`). A through the lines closed it; e1 `met: ["bus1"]` (`q04-07`). `[inference]` lines in main's log: **56 before, 56 after** | pass |
| Q3d | Witness 2 new chunks with Qwen | **(1, 0) written**: the player reached it 5.3 s into the walk, and the write settled 102.2 s into it. 3 calls, 2 repairs: 30,961 ms (3423+468), then `dsl-invalid-chunk · NPC hiro has 0 Talk statements`, then 31,413 ms (4670+634), then `Lore the_sand_coin links to "hiraoka_edge", which is neither known lore nor Lore in this program`, then 35,537 ms (4887+638). Name **"Hiraoka's Edge"**, residents Hiro (merchant) and Miyu (child), 8 props; history #4 (`q04-02`, `q04-03`). **(2, 0) failed first** after 91.9 s. 3 calls (26,747 / 29,010 / 32,644 ms). Repairs: `archetype` expects an array, then "The place has 0 residents". Final: "dsl-orphaned-statement · Defined but never used: talk_farmer, c1, c2, talk_birds, c3, talk_elder, c4. (still invalid after 2 repair rounds)" (`q04-04`). **Retry witnessing** on the HUD wrote it in **176.3 s**. 3 calls: 45,466 ms (3543+1168), 58,466 ms (6285+1292) and 72,267 ms (6399+1498). Name **"The Water's Mouth"**, residents Sato (farmer), Kana (child) and **Hiro** (stranger), and 21 props, 20 of them `rail_track`; history #5 (`q04-08`) | pass (2 chunks) |
| Q3e | Chunk writes that did not land | **(0, 0), the spawn chunk, on entry**: 3 calls (73,961 / 49,599 / 46,172 ms, run beside the chapter). Final: "dsl-invalid-chunk · 2 problem(s) with this Chunk program. 9 statement(s) stand inside the authored village (x < 16 and z < 16). (still invalid after 2 repair rounds)". **(3, 0)** in launch 3: 3 calls (84,833 ms 3691+1808; 96,862 ms 7982+2058; 111,039 ms 8019+2348), settled after **295.9 s**. Final: "dsl-invalid-chunk · 7 problem(s) with this Chunk program. NPC(...) has invalid arguments — held: Invalid option: expected one of "none"\|"staff"\|… (still invalid after 2 repair rounds)" (`q07-01`). Over all five writes: 15 witness calls, 824,988 ms in the ledger, 2 chunks written | recorded |
| Q3f | Names | No place is named like "Chunk x,y": "Hiraoka's Edge" and "The Water's Mouth". No resident reuses a chapter person's name (Kenji, Mio, Taro). But **"Hiro" is a resident of both (1, 0) and (2, 0)**, with id `hiro` in both | flagged |
| Q4a | Renderer console errors | `[renderer:ERR]` lines: **0** in each launch's main log (window.ts mirrors the renderer console). `[renderer:WARN]`: 19, 2 and 4, all `[repair]` lines. No failed call: 40 `[inference] chat`, and 40 `done` | pass |
| Q4b | llama-server memory | The app's sidecar (launch 1): RSS **3,370,064 KB** right after ready, 1,901,488 KB after Create, and 411,328–414,384 KB idle at the end of play. `vmmap` physical footprint **3.8 G** (peak 3.8 G). Hand-started (launch 3), after a build and a witness: RSS **3,418,288 KB** (20.4 %MEM), footprint 2.2 G (peak 2.3 G). RSS rises and falls with the machine's memory pressure (other apps, swap in use) | recorded |
| Q4c | tokens/s from llama-server's log | Launch 3 (`-lv 5`), one request at a time. **Prompt 290.9–350.5 tok/s, generation 24.4–26.1 tok/s.** Origin: 25.16, 26.14, 25.46. Witness: 24.62, 24.91, 24.37. There is no log for launch 1's sidecar or launch 2's server: verbosity 1 means errors only (item 8). End to end in the app, from `[inference]` lines: an origin call is 14–30 s, a witness call 27–111 s | recorded |
| Q5 | Stop the app and llama-server; lsof on 9345 and 8080 | Launch 1: close-app.ts quit the app, and **the app stopped its own sidecar on quit**. Afterwards there was no llama-server process, and lsof on 9345, 5198 and 8080 was empty (exit 1). The main log's last line was `[world] hfc5txeshdcj… visit of 2 chunks written on quit`. Launches 2 and 3: the first `Browser.close` left the app running both times (earlier item 4), and the second quit it. The hand-started server exited within 1 s of SIGTERM (code 0). **Final lsof on 9345, 5198 and 8080: nothing listening, and no process left** | pass |

#### The seven builds (each: 1 call + 2 repairs; `[repair]` lines from the renderer, finals verbatim)

| Build | ms to error | Calls (ms · prompt+completion) | Why each answer was rejected |
| --- | --- | --- | --- |
| 1 | 84,411 | 30,014 · 2748+403; 28,032 · 3719+546; 26,034 · 4807+426 | `dsl-unresolved-reference` "Referenced but never defined: tint ×8" (a bare `tint` in Prop); then 16 statements with invalid props (Prop tint not hex, dynamic a string); then final "10 statement(s) have arguments the engine cannot use. Prop(...) has invalid arguments — dynamic: Invalid input: expected boolean, received string (still invalid after 2 repair rounds)" |
| 2 | 81,712 | 25,039 · 2748+519; 28,119 · 3916+521; 28,295 · 3948+525 | `dsl-orphaned-statement` quest; then Quest missing `text` (`Quest(id*, text*)`); then final "5 statement(s)… NPC(...) has invalid arguments — body: Invalid option…; accent: trim colour must be a hex colour". The NPCs' `"none"` arguments were already in the first answer, but they were first reported in the final one |
| 3 | 60,442 | 17,816 · 2748+438; 20,885 · 3773+436; 21,502 · 3769+441 | NPC accent `"salt"`, then `""`, then `"whisper"`: final "3 statement(s)… NPC(...) accent: trim colour must be a hex colour" |
| 4 | 62,078 | 16,341 · 2748+367; 24,784 · 3734+387; 20,746 · 3693+402 | NPC body/accent `"none"`; then 13 args; then final "NPC takes 11 arg(s), got 15 (4 excess dropped)" |
| 5 | 60,153 | 17,791 · 2748+394; 20,663 · 3820+392; 21,408 · 3691+396 | Prop kind `"heron"`; then Quest missing `text`; then final "dsl-origin-unfit · The scene has 0 residents." |
| 6 (own server) | 50,014 | 21,377 · 2748+363; 14,393 · 3924+313; 14,172 · 3856+313 | Prop tint an object and dynamic a string; then NPC body/hat; then final NPC body |
| 7 (own server) | 49,484 | 19,435 · 2748+292; 14,909 · 3668+307; 14,992 · 3568+311 | Sky missing `fog`; then Prop tint/dynamic; then final "Prop(...) tint: expected string, received object; dynamic: expected boolean, received string; assetId: expected string, received boolean" |

Qwen's programs for builds 2–5, chapter 1, the (0, 0) witness and the (2, 0) retry are in
`q-model-outputs.txt`. For example, build 2's residents were
`bird1 = NPC("bird1", "Oryx", 5, 5, "stranger", "calm", "#708090", "none", "none", "none", "none")`.

### Found on the way

1. **A 4B local model cannot finish Create.** Two things combine:
   - Qwen fills optional positional slots with `"none"`, `""`, words, objects or extra arguments,
     instead of leaving them out. It does this for NPC body, hat, held and accent, and Prop tint,
     dynamic and assetId. It also writes `Quest` with only its text.
   - The parser reports mistakes one stage at a time: lang-core's errors, then unresolved or
     orphaned names (`parseRoot`), then per-prop checks (`toSceneGraph`), then `originIssues`.
     A program with three kinds of mistake cannot be fixed in two rounds.

   Ways out, none of them made here:
   - Give the Scene GBNF each component's arguments: enum literals, `"#"` hex, arity and
     `null`/omit for optional slots. Today it is structural only (`src/dsl/grammar.ts`).
   - Report every stage at once (`src/dsl/parse/program.ts`, `scene.ts`, `src/dsl/repair.ts`).
   - Show the optional slots as omitted in the origin prompt's examples (`src/dsl/prompts/newWorld.ts`).
2. **Witness prompt, for the agent editing `src/dsl/prompts/chunk.ts`.**
   - Qwen writes into the authored village at (0, 0) (x < 16 and z < 16).
   - It leaves Talk and Choice statements out of the root array.
   - It drops every resident while repairing.
   - It writes `archetype` as a string, and a `held` outside the list.
   - It floods props (20 `rail_track`; `rock_16` onward, all orphaned).
   - It reuses a neighbour's resident name ("Hiro" in (1, 0) and (2, 0)).
   2 of 5 writes landed.
3. **A statement defined twice is silently replaced.** Chapter 1 defined `c2` as "Thank you for
   waiting" (which gave a smooth stone) and then as "Not now". Only "Not now" is in the game.
   `parseRoot` says anything that would silently drop content fails instead, but a redefined name
   passes (`src/dsl/parse/program.ts`).
4. **"Choose a GGUF model…" has no E2E override.** Backups, cartridges and `.world` files each
   have one (`AETHER_TEST_BACKUP_PATH` / `_CARTRIDGE_PATH` / `_WORLD_PATH`). Because of that, this
   run set `modelPath` through `setConfig` rather than through the panel's own pick
   (`src/main/inference/modelIpc.ts`). Not changed.
5. **The app keeps no log of its sidecar.** llama-server's stdout and stderr go into a 50-line
   in-memory ring buffer (`sidecar.ts`, `STDERR_LINES`). Its text is shown only when the server
   fails. After a good start, nothing records its speed, memory or later errors.
6. **llama.cpp 0.5.0 runs 4 slots on one unified 16,384-token KV.** `/props` reports 16,384 per
   slot, and the app budgets each task against that number. On entry, the chapter and the (0, 0)
   witness ran at the same time: each call took longer (53 s and 74 s) than one on its own.
7. With a llama-server the player started, the panel shows "Connected" and still offers "Start local
   server". Pressing it was not tried.
8. A mistake in this run: `LLAMA_ARG_LOG_VERBOSITY=1` / `-lv 1` means **errors only** in llama.cpp
   0.5.0 (0 generic, 1 error, 2 warning, 3 info, 4 trace, 5 debug). So launch 1's sidecar log and
   launch 2's server log are empty (0 bytes), and the timings above come from launch 3 (`-lv 5`).
   The log file also stayed at 0 bytes until the process exited.
9. Create's look step starts drawing the moment it opens, with no image provider as well. The 3
   refusals show in the draft's usage line.

### Files (Qwen run)

- `run-qwen.json`: the env, the model, the sequence, and the actions of launches 1–3.
- Step files `run-q01-…` to `run-q07b-…`.
  - `run-q03e-build-third.json` and `run-q06b-build-own-server.json` note how their recorded run
    differed from the file.
  - One `{"clickText": "Back"}` sent by hand between q3f and q4a is covered by q4a's own Back loop.
- `q-main-launch1.log.txt` to `q-main-launch3.log.txt`: the app logs.
- `q-llama-launch3-excerpt.txt`: startup, every `print_timing` line, and the grammar size of each
  logged request. The full debug log has prompts in it and was not kept here.
- `q-model-outputs.txt`: what Qwen wrote in 20 of the calls.
- `q-disk-after.txt`: `inference.json`, `usage.jsonl` by purpose, the history log, e1's progress and
  the draft.
- Screenshots `q01-00` to `q07-02`.
