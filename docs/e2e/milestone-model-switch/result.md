# E2E milestone · Model switching and Create

## Replay

Run the dev app on macOS with an empty, throwaway userData directory and the repo's OpenAI key in
`.env`; no key is copied into this artifact. The UI language was zh-TW. The test key in `run.json`
is deliberately fake and is saved only for the local custom endpoint, then removed before Create.

```bash
mkdir -p /tmp/unwritten-model-switch-ud
AETHER_TEST_USER_DATA=/tmp/unwritten-model-switch-ud bun run dev --remoteDebuggingPort 9333
bun scripts/cdp-drive.ts "$(cat docs/e2e/milestone-model-switch/run.json)"
```

The run was performed through `scripts/cdp-drive.ts` in several consecutive calls against one
running app. `run.json` joins those actions, with longer waits for model generation so it can be
replayed as one call. Screenshots are from the actual run.

## Observed

| Flow | Result |
| --- | --- |
| System → Model, Cloud API | OpenAI was selected from `.env`; model probe connected in 3,157 ms (`01-cloud.jpg`). No key value appeared on screen or in CDP output. |
| On-device detection | Apple model, Ollama and llama.cpp choices appeared; Apple bridge and `fm` CLI were detected (`02-local-detection.jpg`). |
| Switch to Apple | Config changed to `apple-fm`; its chat server did not answer because `fm serve` requires `sudo fm license` once. The specific reason and command appeared in the UI (`03-apple-license.jpg`). No local generation was claimed. |
| Keychain write path | Entered fake `test-key-12345` for Custom API on `http://127.0.0.1:8080/v1`; the password field contained 14 characters, then cleared. `keyStatus()` returned only `{set:true, source:"saved", boundTo:"http://127.0.0.1:8080/v1"}`. Removed the saved key. The renderer never read its value back. |
| Switch back to cloud | `getConfig()` returned `openai`, `gpt-5.4-mini`, `sidecar:null`. |
| Create readiness | Create showed `openai · gpt-5.4-mini` and said the world plan, chapters and origin use that model (`04-create-readiness.jpg`). |
| Complete Create flow | With no story, the model wrote a zh-TW bible, then a starting scene. The app published and opened `月光之島`; the land appeared, with a generated place `燈樹灘` recorded in the HUD (`05-created-world.jpg`). No stock scene was inserted. |

Main log timings for Create: bible 2,996 ms, 1,062 prompt + 368 completion tokens; origin
4,291 ms, 2,413 prompt + 718 completion tokens. After entering the world, two ordinary scene
requests took 8,496 ms (3,275 + 1,586 tokens) and 6,099 ms (6,244 + 1,467 tokens). The screenshot
HUD showed 38 FPS. No `[renderer:ERR]` line appeared in this run.

`bun run typecheck`, `bun run lines` and `bun run test` passed (94 files, 396 tests). Biome checked
all 32 changed TypeScript files with no diagnostics. `bun run check` itself stops at `bun run lint`
because this checkout is under `.claude/worktrees/`, which the repo's `biome.json` excludes; it
reports “Checked 0 files”. This is a worktree location limitation, not a lint finding. The same
commands need rerunning after integration into a normal checkout.

## Limits

The Apple bridge was detected, but no on-device story or scene was generated: this Mac has not
accepted the system-wide `fm` CLI terms. Ollama and llama.cpp generation were not exercised in
this run. The app's local context budget path was reviewed in code, but has not been exercised
against a live local model on this machine.

After this run, the AI Worlds screen gained a warning when the selected local model reports less
than the 16,000-token generation budget, and model error hints were updated to point to
System → Model. Those two screen changes were checked with typecheck, targeted Biome, line check
and the test suite; they were not captured in this E2E run. A live local model is still needed to
verify the exact context limit and warning during AI Worlds generation.
