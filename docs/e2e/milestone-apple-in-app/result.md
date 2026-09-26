# E2E milestone · Apple's on-device model inside the app

Apple Foundation Models used to answer chat through `fm serve`, a separate `/usr/bin/fm` server
the app started on `127.0.0.1:11535` — and `fm` refuses to run until someone runs `sudo fm license`
once. Chat now goes through the app's own Swift helper (`native/afm-bridge`, method `chat`, bridge
0.3.0), the same process that already writes structured scenes: no server, no port, no licence
step. This run checks that on a Mac where `fm`'s terms were never accepted.

## Replay

```bash
mkdir -p "$TMPDIR/ud-apple"   # then write run.json's env.seed there as inference.json
AETHER_TEST_USER_DATA="$TMPDIR/ud-apple" bun run dev --remoteDebuggingPort 9361
CDP_PORT=9361 bun scripts/cdp-drive.ts "$(cat docs/e2e/milestone-apple-in-app/run.json)"
```

The seed is the `inference.json` the previous build wrote for Apple (`fm serve` on :11535 with an
`/usr/bin/fm` sidecar). `.env` holds an OpenAI key, so a refused config would have fallen back to
OpenAI; it did not. The run was driven in consecutive calls against one app; `run.json` joins them.

## Observed

| Step | Result |
| --- | --- |
| Legacy config | `getConfig()` → `{kind:"apple-fm", baseUrl:"http://apple-fm.invalid/v1", model:"system", sidecar:null}`: the old `fm serve` config was read as Apple-in-app, not refused. |
| Settings → Model | Apple on-device selected, "已在這台電腦偵測到", no Start/Stop button; route line "Apple 裝置端 · 這台電腦 · system"; probe "已連線 · 83 毫秒"; "4096 token 上下文（model）" (`01-settings-model-apple.jpg`). |
| No `fm` process | `pgrep -fl /usr/bin/fm` → none during the whole run. The app's `afm-bridge` was its only helper. |
| Create → 撰寫世界 (zh-TW) | Readiness "使用 apple-fm · system（407 毫秒）". The bible streamed into the preview through bridge partial events: first text at 9,272 ms (`03-world-streaming.jpg`). Main log: `done … bible · apple-fm system · 52871 ms · max 1400 · 1231+1400 tokens`. |
| Its repair round | Refused before sending: `model-context-too-small` — "about 5770 tokens of prompt … Apple on-device holds 4096" (`04-context-refused.jpg`). No card was made from a partial answer. |
| Why | The model looped: the second attempt's preview ended in the same line repeated until the 1,400-token cap ("– 漂浮是未來的方式。" × ~90; 2,222 characters in 41,006 ms). With the language set to en-US (`05-en-world-streaming.jpg`) the model still wrote Chinese from the Chinese idea and looped on "– 在無名之中，生活是禮物。". Draft usage after three attempts: 6 calls · 3,686 in / 4,200 out. |
| Tool turn through main | `window.seed.inference.chat` with one tool (`give_item`): step 1 returned a tool call `{"item":"loaf of bread","count":2}` in 3,236 ms (353+26 tokens, no text); step 2, with the tool result appended, streamed 9 deltas into "Good choice, traveler. Two loaves are yours—may they warm your heart." in 1,518 ms (451+25 tokens, 450 cached). |
| Cancel | Aborting after the third delta ended the request with `aborted` after 4 deltas (7,293 ms); the usage ledger wrote `outcome:"aborted"`. A probe right after: reachable, 60 ms, context 4096 (model). |
| Usage ledger | Every Apple call wrote a `provider:"apple-fm", model:"system"` line with the bridge's token counts (e.g. `input:451, output:25, cached:450`). |

Before the app run, the helper was driven over raw NDJSON: a plain chat streamed 4 `partial`
events then `result` "Welcome, traveler." (74+9 tokens); a tool turn returned the call with valid
arguments for the integer range and enum in the schema. The first continuation line after a tool
result ("Continue, using the tool results above.") made the model call the tool again; the line
now says the tools have run and to answer, and three runs out of three answered in-world
(466 input / 465 cached / 31–35 output tokens).

## Checks

- `swift test` (native/afm-bridge): 17 tests, 0 failures, including two new ones for partial event
  numbering and a cancel after partials.
- `bun run typecheck`, `bun run lint`, `bun run lines`: pass.
- `bun run test`: 799 of 801 pass. The two failures are property tests in files this change does not
  touch (`tests/app/land-traces.test.ts`, `tests/engine2d/remoteMotion.test.ts`); both exceeded the
  5,000 ms test timeout at load average 24 (other sessions' apps running). Run alone,
  `remoteMotion` passes and `land-traces` again fails only with "Test timed out in 5000ms".

## Limits

Update: the first two limits are addressed and verified in
[milestone-apple-create](../milestone-apple-create/result.md) (guided bible, the model's own token
count); Create now runs end to end on Apple. What is still open is listed there.

- Apple's model did not finish a Create world bible: it loops on the long bible prompt and its
  answer fills the budget, so the repair cannot fit 4,096 tokens. This is the model's output, not
  the transport — the same prompt through OpenAI works (milestone-rev6-p2-create) — but Create with
  Apple on-device is not usable yet.
- Main's token estimate (`budget.ts`, 1.1 tokens per CJK character) read ~5,770 prompt tokens for a
  repair whose real size was about 1,231 + 1,400 + the repair note. Apple's own counter
  (`SystemLanguageModel.tokenCount`) could replace the estimate for this provider; not done here.
- The tool turn was driven through the chat API, not through an NPC choice on screen:
  `resolveChoice` only runs in bounded legacy scenes, which open land does not mount.
