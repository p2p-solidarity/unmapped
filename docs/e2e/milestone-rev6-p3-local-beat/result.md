# E2E · rev 6 phase 3 · `local-beat` (D13)

A local-only world, already migrated and pinned, is relaunched with
`UNMAPPED_TEST_CLOCK_DAYS=92`. The catch-up beat on this pinned open must fog a chunk and turn the
season. The world is the fixture world after the `older-build` run. It holds chunk 2,1, witnessed
today by the phase-2 build and caught up into the history; 2,1 lies 2 rings from home, so it may
fog. The first, migrating open writes no beat: in the `migrate` run the migration wrote entries 1–21
and no beat, and the first beat (n=23) came on the next, pinned open.

## Replay

```bash
SCR=<the migrate run's scratch dir>; D=docs/e2e/milestone-rev6-p3-local-beat
mkdir -p "$SCR/localbeat/ud"; (cd "$SCR/older/ud" && cp -Rp blobs cartridges histories identity instances \
  mods profiles work-drafts work-plays works workspaces "$SCR/localbeat/ud/")
echo '{"kind":"llamacpp","baseUrl":"http://127.0.0.1:8859/v1","model":"none","apiKeyEnv":null,"sidecar":null}' \
  > "$SCR/localbeat/ud/inference.json"
OPENAI_API_KEY= THESYS_API_KEY= AETHER_TEST_USER_DATA="$SCR/localbeat/ud" bun run dev --remoteDebuggingPort 9352 &
CDP_PORT=9352 bun scripts/cdp-drive.ts "$(cat $D/run.json)"             # part A: today
CDP_PORT=9352 bun docs/e2e/milestone-rev6-p3-migrate/close-app.ts.txt
UNMAPPED_TEST_CLOCK_DAYS=92 OPENAI_API_KEY= THESYS_API_KEY= AETHER_TEST_USER_DATA="$SCR/localbeat/ud" \
  bun run dev --remoteDebuggingPort 9352 &
CDP_PORT=9352 bun scripts/cdp-drive.ts "$(cat $D/run-b-92-days.json)"   # part B: 92 days later
jq -c 'select(.event.kind=="beat") | {n, rt, body: .event.body}' "$SCR/localbeat/ud/histories/"h*/log.jsonl
```

Build: main `51817a3` plus the uncommitted working tree of every session, with this session's
planner fix. Model: none. `inference.json` points the app at a llama.cpp endpoint where nothing
listens, so the land can never send a request.

## What was checked

| Check (plan) | Observed | Verdict |
| --- | --- | --- |
| The open is a pinned one, not the first, migrating open | `world.json` was pinned by the `migrate` run. Part A (today, no clock) opened it with no beat due: the last beat was n=23 at 2026-09-26T03:25:12Z, less than 6 h before. Part A appended only a `profile` (n=28) | pass |
| The catch-up beat on the pinned open with the clock 92 days ahead | Part B's Continue wrote **n=29 `beat`**, rt **2026-12-27T03:44:51.617Z** (92 days after today), `upTo: 28`, fingerprint `sha256:b90ef2e73c7f09b937576c336ca50c28becfde5eb9fdb50d7c8b25b2a038c52d`, 1 rumor slot (cite = the 2,1 witness, listener `ren` at 1,0). The fold admitted it (it deep-equals the recomputation), and `ignored` is `[]` (`beats.jsonl`) | pass |
| …fogs a chunk | `fog: ["2,1"]`. The fold's care for 2,1 is **52,570 µpt**, under 100,000; the chunk is untouched for 92 days and 2 rings out. The land store marks 2,1 `fogged: true`. At 2,1 the HUD reads "In the mist — this place faded from memory and can be witnessed anew." and "Legend · Chimney Shore". The resident is gone and mist covers the chunk in both looks (`b-01` HD-2D, `b-02` 16-bit). The town ring did not fog: 1,0 has care 80,048 µpt (also under 100,000) and `fogged: false`. The witness entry is still in the log (4 `witness` lines; history is never deleted) | pass |
| …and turns the season | Beat n=23 had `season: 0`; beat n=29 has **`season: 1`**. The genesis rt is 2026-09-22T08:00Z: 95.8 days, floor(95.8 / 7) = 13, and 13 mod 4 = 1 | pass |
| No model call | 0 `[inference]` lines in parts A and B. Walking into the fogged chunk showed "The model is not reachable, so new land stays unwritten." and sent nothing | pass |

## The first attempt (r1, kept for the record)

The first try used the same userData without `inference.json`, with the player standing on 2,1.
The beat was the same (n=28 then, rt 2026-12-27T03:40:48Z, `season: 1`, `fog: ["2,1"]`). But by
then another session's working-tree change had made the default provider, `apple-fm · system`,
read ONLINE. The land tried to re-witness the fogged chunk under the player twice, and both tries
were refused inside main before anything was sent:

```
[inference] fail c6854767-1860-455b-ba4a-710a30bdc9b8 · witness · apple-fm system · 1 ms · model-context-too-small
[inference] fail 81f97c5e-fb2b-4df7-a5df-4dbba23610e2 · witness · apple-fm system · 1 ms · model-context-too-small
```

The usage ledger recorded both as `outcome: "failed"`, `input: null`, `output: null`: no tokens counted.
Screenshot `r1-00`. The recorded run above pins a dead endpoint and moves the player off 2,1 first.

## Seen on the way (not part of the check)

- The HUD says "Few come here — it is fading into mist." on the town ring (1,0 / 0,1 / -1,0), which
  never fogs. `src/renderer/history/landView.ts` `chunkMarks` sets `fading` from care alone
  (`care < FADING_BELOW`), without the `FOG_SAFE_RINGS` exemption. This file is outside this
  session's area and was not changed.
