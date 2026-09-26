# E2E · rev 6 phase 3 · `variant` (D15)

Plan row: with the service stopped, A and B witness one chunk. After restart: one live copy and
one 異聞 on both, both in the log.

**Verdict: pass.** 2 witness calls, as planned.

## Replay

This flow starts where `milestone-rev6-p3-presence` ended: world `hryt3f2x…d4bgq`, A (CDP 9353)
and B (CDP 9354) in Play, online, head 9. The environment is the same as in
`milestone-rev6-p3-offline-visit`.

```bash
D=docs/e2e/milestone-rev6-p3-variant
step() { CDP_PORT=$1 bun scripts/cdp-drive.ts "$(cat "$D/$2")"; }
step 9353 run-01-a-variant-setup.json & step 9354 run-02-b-variant-setup.json; wait   # both next to (0, -1)
kill "$(lsof -tiTCP:8801 -sTCP:LISTEN)"                                                  # stop the service
step 9353 run-04-a-variant-witness-A.json; step 9354 run-05-b-variant-witness-B.json
(cd "$SCR/tree" && UNMAPPED_SERVICE_TEST=1 bun run service -- --port 8801 --data "$SCR/svc") &   # same data dir
step 9353 run-07-a-variant-after-A.json; step 9354 run-08-b-variant-after-B.json
step 9354 run-09-b-variant-notes-probe.json; step 9354 run-10-b-variant-panel-B.json; step 9353 run-11-a-variant-panel-A.json
```

Model: openai `gpt-5.4-mini`.

## What was checked

| # | Check | Observed | Verdict |
| --- | --- | --- | --- |
| 1 | The service is stopped; both go offline | After the kill, both links read `offline` with pending 0. Head 9 on both | pass |
| 2 | A witnesses (0, -1) offline | The claim got no answer, so A wrote locally: "North of the Windmill", pending **1**. The HUD read "WRITTEN · North of the Windmill · Not shared yet — waiting for the world's service." `[inference] done c8b76c12-… · witness · openai gpt-5.4-mini · 6294 ms · max 3200 · 4030+1417 tokens (2816 cached)` (`v-a-00`) | pass |
| 3 | B witnesses the same chunk offline | "Spring Tree Stop", pending **1**, the same "Not shared yet" line. `[inference] done 1447e5cb-… · witness · openai gpt-5.4-mini · 5351 ms · max 3200 · 4040+1138 tokens (2816 cached)`. Each outbox held 1 line (`v-b-00`) | pass |
| 4 | After restart both events are in the log | The service restarted at ~03:43:29Z on the same data dir. Service log: **n=10** `witness` by A (`h422dm4l…`, seen 9, at 03:42:59.123Z, rt **03:43:49.890Z**) and **n=11** `witness` by B (`hpjvlrwl…`, seen 9, at 03:43:11.927Z, rt **03:43:49.976Z**). Both outboxes emptied. The reconnect took about 20 s (the 1–30 s backoff) | pass |
| 5 | One live copy and one 異聞 on A | `live`: n=10, A, "North of the Windmill". `variants`: [n=11, B, "Spring Tree Stop"]. HUD: "WRITTEN · North of the Windmill · Variants ×1". The tellings panel: "Standing · North of the Windmill · Written by player-B7WR · entry 10" and "Variant 1 · Spring Tree Stop · Written by Bea · entry 11" (`v-a-01`, `v-a-02`) | pass |
| 6 | The same on B | The same live, variant and panel text. B's land now draws A's "North of the Windmill" where it had drawn its own provisional "Spring Tree Stop" (`v-b-01`, `v-b-02`) | pass |
| 7 | Everyone holds one history | Head n=11, chain `sha256:af8c70ce…0568` on A, B and the service. All 11 entries have equal chains and event ids in A's and B's `log.jsonl` and the service's | pass |

Which telling stands is decided by arrival order, not writing order. A wrote first and reconnected
first here, so A's is live. Both events carry `seen: 9`, and the lower `n` is live, as D15 states.

## Found here

Nothing broke in this flow. The UI shows 異聞 as "Variant" in English and "異聞" in zh-TW / ja
(`traces.variantRow`).

## Files

- `run.json` plus `run-NN-*.json` per step. Steps 3 and 6 are shell steps (stop / start the
  service) and have no action file.
- `v-a-00`, `v-b-00`: offline, provisional. `v-a-01`, `v-b-01`: after the restart. `v-a-02`,
  `v-b-02`: the tellings panel.
