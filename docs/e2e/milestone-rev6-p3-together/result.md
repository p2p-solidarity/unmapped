# E2E · rev 6 phase 3 · `together` (Done 2)

Plan row: A is `granted`, B is `writing`. The streamed-text hash is equal on both. Exactly 1
witness call across both logs. Both folds flip at the same `n`.

**Verdict: pass.** One screenshot is missing: B's mid-stream shot. B's walk was held while the
stream layer was open, and its first shot came after the flip (see "Found here").

## Replay

This flow starts where `milestone-rev6-p3-offline-visit` ended: world
`hryt3f2xlraunkooui3ax5aoko6k2qf4wc6dx7hnjads7etfd4bgq`, A (restarted, CDP 9353) and B (CDP 9354)
both in Play, online, head 8. The environment and snapshot are the same as that flow's replay block.

```bash
D=docs/e2e/milestone-rev6-p3-together
step() { CDP_PORT=$1 bun scripts/cdp-drive.ts "$(cat "$D/$2")"; }
step 9353 run-01-a-together-setup.json & step 9354 run-02-b-together-setup.json; wait
step 9353 run-03-a-together-a.json > a.out & step 9354 run-04-b-together-b.json > b.out; wait   # B waits 2 s itself
```

A's and B's steps start in the same second. B's list begins with a 2,000 ms wait, so A claims
first. The recorder (set up in steps 1–2) keeps `useLandStore.developing["chunk:-1,0"]`: its last
text, `sid`, `by` and `mine`. It also keeps every `world.onStream` frame and the first fold that
holds chunk (-1, 0), with that witness's `n`. Model: openai `gpt-5.4-mini` (the Settings → Model
default).

## What was checked

| # | Check | Observed | Verdict |
| --- | --- | --- | --- |
| 1 | A is `granted` | A's developing entry: `mine: true`, sid `qhU-qli34zt3cQL31Py_wA` (set by `relayFor`, which only a `granted` answer calls). A's HUD: "WITNESSING… · You are writing this; everyone here reads it as it arrives · The land at -1 · 0 · 1274 characters so far" (`t-a-00`) | pass |
| 2 | B is `writing` | B's developing entry: `mine: false`, `by` = A's key `k7a2usubb4vj74lfamkzzg5x7hrxbxz6kunatzmeamu3ukdfktykq`, the **same sid** (set by `watchWriting`, which only a `writing` answer calls). B got **31** stream frames, `k` 0…30, all `from` A | pass |
| 3 | The streamed-text hash is equal on both | sha256 of the last developing text: A `a822f634f8f8a17a4b4910a1ec411c2b86607db5531e1a95c5efabe09784806f` (4,108 chars, 33 updates); B `a822f634f8f8a17a4b4910a1ec411c2b86607db5531e1a95c5efabe09784806f` (4,108 chars, 32 updates; the frames sum to 4,108 chars) | pass |
| 4 | Exactly 1 witness call across both logs | A: `[inference] done 5e6379b3-… · witness · openai gpt-5.4-mini · 6309 ms · max 3200 · 3930+1332 tokens (2816 cached)`. B: no new `[inference]` line during the flow; B's only earlier line is its own offline-visit witness `71f6bb7b` | pass |
| 5 | Both folds flip at the same `n` | A: chunk (-1, 0) live at **n=9**, id `h4gvrs5ahkjmptta4tcwmkhxf3j5c3xqmxnh6kalz22zbmyu7upta`. B: **n=9**, the same id. Service log n=9: `witness`, author A, at 03:39:38.091Z, rt 03:39:38.170Z. Both HUDs then read "WRITTEN · Giant Tree Field" (`t-a-01`, `t-b-01`) | pass |

Timing, each on its own recorder clock (the two clocks started within the same second, but are not
compared here):
- A: walk at 17,503 ms, first developing at 17,737 ms (claim granted, 234 ms), last delta at
  24,185 ms, fold flip at 24,184 ms.
- B: walk at 19,510 ms, first developing at 19,769 ms (claim answered `writing`, 259 ms), last frame
  (k=30, 158 chars) at 24,153 ms, fold flip at 24,283 ms.

## Found here

1. **Walking stops while someone else's stream is shown.** B's pad took **7,883 ms** to walk about
   10 tiles. The same walk took A 1,505 ms. B's first screenshot (`t-b-00-after-flip`) was
   therefore taken after the flip and does not show the panel. `TogetherPanel` opens itself once
   for someone else's stream and holds the land's input while it is open. Its header documents
   that ("B, Escape or 'Keep walking' close it"), so this is by design. It is recorded because it
   hid B's mid-stream screenshot, and because the viewer cannot keep walking until they close the
   panel.
2. A's HUD chip counts characters as they arrive ("1274 characters so far" at the 2.5 s shot).
   The relay sends frames only from inside `delta`, so the last tokens after the final frame are
   not relayed. Here the last relayed text was the whole wire text: 4,108 chars on both.

## Files

- `run.json`: env, model and the 4 steps (ports 9353 / 9354, which run at the same time); each
  `run-NN-*.json` holds one step's exact actions.
- `t-a-00-streaming.jpg`: A mid-stream. `t-a-01-flipped.jpg`, `t-b-01-flipped.jpg`: both after
  the flip. `t-b-00-after-flip.jpg`: B's first shot, taken after the flip (see above).
