# E2E · rev 6 phase 3 · `fog` (Done 3)

Plan row (`docs/plans/rev6-phase3.md`, "E2E flows"): `advance {days: 92}` plus a beat: mist and a
legend on both clients, and the entry still in the log. A re-witness gets `witness:legend` and
goes live. The season changes. Fingerprints are equal on the service and both apps.

**Verdict: pass.** One view bug found and fixed: a chunk witnessed after the last beat read
"fading" at once (below).

## Replay

The fog flow runs on the rumors flow's world N after its step 13 (A = owner on 9356, B = member
on 9357, service data `svc-n` on 8802): see `docs/e2e/milestone-rev6-p3-rumors/result.md` for the
setup commands, then:

```bash
D=docs/e2e/milestone-rev6-p3-fog; step() { CDP_PORT=$1 bun scripts/cdp-drive.ts "$(cat $D/$2)"; }
step 9356 run-01-a-to-east-edge.json; step 9357 run-02-b-to-east-edge.json
curl -s -X POST http://127.0.0.1:8802/v1/test/advance -H 'content-type: application/json' -d '{"days":92}'
step 9356 run-04-a-after-beat.json; step 9357 run-05-b-after-beat.json
step 9356 run-06-a-wide-legend.json; step 9357 run-07-b-wide-legend.json
step 9356 run-08-a-fingerprints.json; step 9357 run-09-b-fingerprints.json
step 9357 run-10-b-rewitness.json; step 9356 run-11-a-after-rewitness.json
step 9357 run-12-b-reopen-after-fix.json
```

Model: openai `gpt-5.4-mini`. The service's receipt clock was already +1 day (the rumors beat).

## What was checked

| # | Check | Observed | Verdict |
| --- | --- | --- | --- |
| 1 | Before | Head n=20, season 0, one beat (n=11). Care at that beat (µpt): (0, 0) 2,855,085, (1, 0) 2,855,085, (2, 0) 7,613,560. (2, 0)'s last touch 2026-09-26T04:10:28.350Z (B's deed). A and B stood inside (1, 0) near its east edge (`a-00`, `b-00`) | – |
| 2 | `advance {days: 92}` plus a beat | `{"offsetDays":93,"now":"2026-12-28T04:17:42.814Z","beats":[{"world":"hf52k37e…","n":21}]}`. Beat **n=21** at 2026-12-28T04:17:42.801Z, upTo 20, **fog `["2,0"]`**, 1 slot. Care: (0, 0) 30,018, (1, 0) 30,018, (2, 0) **80,048** (8 points × `DECAY_PPM[93]` 10,006, under 100,000). (0, 0) and (1, 0) are in the town ring and do not fog | pass |
| 3 | Mist and a legend on both clients | A and B: `chunks["2,0"].fogged: true`, live still n=8 "East Bus Field", the land draws (2, 0) as unwritten, `marks["2,0"] = {fogged: true, live: "East Bus Field"}`. Thick mist over (2, 0) in both looks on both apps (`a-01`, `a-02`, `b-01`, `b-02`); on a 2600 px wide page the label **"Legend · East Bus Field"** over (2, 0)'s centre (`a-03`, `a-04`, `b-03`, `b-04`). The HUD in (1, 0): "Few come here — it is fading into mist." | pass |
| 4 | The entry still in the log | `window.seed.world.read` on A and on B: 22 entries from n=1, and the witness `hvd6y73q…` is entry **n=8**, kind `witness`, verdict ok, "East Bus Field" | pass |
| 5 | The season changes | Season 0 (beat n=11) → **1** (beat n=21) on the service log, A and B | pass |
| 6 | Fingerprints equal: service and both apps | n=11 `sha256:e9a99ce48ca55f9336c52af4b63ea09a1442e8c79e6b37fbb256cdbedd4ee114`; n=21 `sha256:e946134216819452ca4282f24e8622f6428fa0d09b1a9596e20462531b3b1145`. Same value in the service's `log.jsonl`, in a recomputation from that log (`entryVerdict` + `foldEntries` + `computeBeat`), and recomputed in A's and B's pages from the log main served (`equal: true` for the whole body). `ignored: []` on both apps | pass |
| 7 | A re-witness gets `witness:legend` and goes live | B walked into (2, 0): HUD "WITNESSING… In the mist — this place faded from memory and can be witnessed anew. Legend · East Bus Field" (`b-05`). One witness call `8d016ef9`, 7,102 ms, **4,024**+1,264 tokens (the first witness of (2, 0) had 3,552 in: +472 for the legend section). New witness **n=23** "Summer Bus Field" (Gen, Mika), body **`supersedes: hvd6y73q…`** (the legend is attached only when `legendOf` finds the fogged witness, the same object that gives `supersedes`), fogged false, `legends: ["East Bus Field"]`; HUD "WRITTEN · Summer Bus Field / Legend · East Bus Field" (`b-06`) | pass |
| 8 | Both flip at the same n, the viewer with 0 calls | A: (2, 0) live = n=23 "Summer Bus Field", legend "East Bus Field"; A's `[inference] done` count stayed 4 (chapter, witness, 2 rumor batches) (`a-05`) | pass |

Other calls in this flow: A's second rumor batch for the fog beat's one slot (it cites the probe's
`member.join`): `7f7636ab`, 1,245 ms, 1,558+89 tokens → n=22 "Yui of Pole and Windmill says Probe
came here for the first time at Windmill Field. She says the wind was strong that day."

## Found here

1. **A chunk witnessed after the last beat read as fading at once (fixed).** Right after the
   re-witness, both A and B showed "Few come here — it is fading into mist." on the brand-new
   "Summer Bus Field" (`a-05`, `b-06`). `landView.ts` judged `fading` from `now.care`, the last
   beat's figures, where (2, 0) held the old witness's 80,048 µpt (and a chunk first witnessed
   after a beat has no entry at all, so 0). Fix (`src/renderer/history/landView.ts`, a view only,
   no fold or physics change): care is `careAt(now.touches, dayOf(now.rt))`, the per-day sums the
   fold already keeps, as of the newest receipt. Check: with the fixed module and the same fold,
   (2, 0) fading **false** while (0, 0) and (1, 0) stay **true** (touches `{"2,0": {"20722": 8,
   "20815": 3}, "0,0": {"20722": 3}, "1,0": {"20722": 3}}`). After a reload and Continue, B's HUD
   at (2, 0) read "WRITTEN · Summer Bus Field / Legend · East Bus Field" with no fading line; B's
   day visit (n=24) had touched all three chunks by then, so all read not fading (`b-07`).

## Files

`run.json` (every step with its app, port and actions), `run-NN-*.json` (one step each),
screenshots `a-00` … `a-05`, `b-00` … `b-07`, `service-log-summary.jsonl` (world N's log, 24
entries, as the service holds it).
