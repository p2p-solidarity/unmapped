# E2E · rev 6 phase 3 · `gift-race` (D3)

Plan row (`docs/plans/rev6-phase3.md`, "E2E flows"): B and C take one gift: one `gift.take` is
live, and the loser's inventory is unchanged, with "someone took it first".

**Verdict: pass after a fix.** Race 1 (B and C, the plan's) decided correctly in the history and
the bags, but the loser was never told "someone took it first" (finding 1). Race 2 re-checked the
fix.

## Setup

The door flow's world F, public since door run-15 (service `svc-f` on 8802): A = owner (9356),
B = member "Bea" (9357), C = a visitor from A's restored backup (9358). To make a real race, both
takes are sent while the service is stopped: each waits in its device's outbox, and the service
sequences them when it comes back.

## Replay

```bash
D=docs/e2e/milestone-rev6-p3-gift-race; step() { CDP_PORT=$1 bun scripts/cdp-drive.ts "$(cat $D/$2)"; }
step 9356 run-01-a-leave-gift.json; step 9357 run-02-b-see-gift.json; step 9358 run-03-c-see-gift.json
kill <service pid>
step 9357 run-05-b-take.json & step 9358 run-06-c-take.json; wait
(cd $SNAP && UNMAPPED_SERVICE_TEST=1 bun run service -- --port 8802 --data $SCR/svc-f) &
step 9357 run-08-b-after.json & step 9358 run-09-c-after.json; wait
# race 2, after the fix
step 9356 run-10-a-reload.json; step 9357 run-10-b-reload.json; step 9358 run-10-c-reload.json
step 9358 run-11-c-leave-gift.json; step 9356 run-12-a-see-second.json; step 9357 run-12-b-see-second.json
kill <service pid>
step 9357 run-14-b-take-second.json & step 9356 run-14-a-take-second.json; wait
(cd $SNAP && UNMAPPED_SERVICE_TEST=1 bun run service -- --port 8802 --data $SCR/svc-f) &
step 9357 run-16-b-after-second.json & step 9356 run-16-a-after-second.json; wait
```

Which take wins depends on which device reconnects first; B won both times here.

## What was checked

| # | Check | Observed | Verdict |
| --- | --- | --- | --- |
| 1 | A gift | A (N → Leave a gift → Umbrella tag → "For whoever gets here first." → Anyone → Leave it here): `gift` **n=43** at tile (12, 10) of (0, 0), item `k_umbrella`; A's bag `[k_umbrella]` → `[]` (`a-00`). B and C next to it see it with "Take it"; bags before: B `[]`, C `[k_umbrella: Umbrella tag]` (C's restored bag) (`b-00`, `c-00`) | – |
| 2 | B and C take one gift | Service stopped at 04:37:49Z. Both pressed Take it: each "Waiting for the world's service — the gift is yours once it is shared.", `pending: 1`, link offline, their own take shown pending (`b-01`, `c-01`). Service back at 04:38:05Z; decided by 04:38:27Z | – |
| 3 | One `gift.take` is live | Service log: **n=44 `gift.take` by B** (`k6zrlcc2r2…`); C's take is not in the log. Both folds: gift 43 taken by Bea, not pending. B: bag `[gift-ejr434wc: Umbrella tag]`, toast "Umbrella tag is in your bag." (`b-02`) | pass |
| 4 | The loser's inventory is unchanged | C: `refused: 1` (`gift.take: gift-taken`, kept in `refused.jsonl`), bag still `[k_umbrella: Umbrella tag]` (`c-02`) | pass |
| 5 | … with "someone took it first" | **Race 1: not shown.** C's panel read "Taken by Bea" and still "Waiting for the world's service — the gift is yours once it is shared."; no "Someone took it first." anywhere (finding 1). **Race 2 (after the fix):** C left its Umbrella tag as gift **n=45** at (12, 12); A and B took it with the service stopped (04:41:24Z–04:41:28Z); **n=46 `gift.take` by B**; A (the loser): `refused: 1` (`gift-taken`), bag `[]` unchanged, panel "Taken by Bea / **Someone took it first.**"; B: bag `+ gift-kulyaemi`, panel "Taken by Bea / Umbrella tag is in your bag." (`c-03`, `a-03`…`a-05`, `b-03`…`b-05`) | pass (after fix) |

Calls: 0 in this flow. Receipt times: the restarted service's clock has no test offset, so the
entries after each restart were clamped to the last rt (44–46 all `2026-09-28T04:37:23.248Z`),
as `sequenceEvent` does.

## Found here

1. **An offline take that lost the race was never told so (fixed).** `takeGift` waits 10 s for
   the outcome; offline it returns "waiting", and the gift row kept that text for good. The
   subscription that settles offline takes only put a winner's item in the bag and toasted it; a
   loser got nothing. Fix: `src/renderer/app/land/TracePanel.tsx` keeps a "waiting" marker and,
   once the fold has sequenced a take, says "Umbrella tag is in your bag." or "Someone took it
   first." from the fold; `src/renderer/app/land/traces.ts` remembers takes still waiting when
   `takeGift` returned and, when the history decides them, toasts "Someone took it first." (or the
   refusal) — the winner's toast was already there. Checked in race 2 (row 5) with the panel open.

## Not run

- The toast path of the fix (the loser's panel closed when the race is decided): race 2 was read
  with the panel open, so only the panel line was observed.
- Race 2's takers were A and B, not B and C: after race 1 A's bag was empty, so C (a visitor may
  leave a gift in a public world) gave the Umbrella tag from its restored bag.
