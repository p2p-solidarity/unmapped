# E2E · rev 6 phase 3 · `rumors` (Done 4)

Plan row (`docs/plans/rev6-phase3.md`, "E2E flows"): B's `deed` becomes a slot. A's batch (usage
`rumor`) cites it, and the listener names B. `world-probe.ts` submits rumors with an uncited label,
a bad slot and a visitor author: the service refuses each with its code. The same via IPC is
refused by main.

**Verdict: pass.** Two probe bugs were fixed on the way (existing-world mode read the fold before
the served entries arrived). The fog flow ran on this same world after step 13.

## Replay

```bash
SCR=$(mktemp -d); R=$PWD; SNAP=$SCR/tree; mkdir -p $SNAP
rsync -a --exclude node_modules --exclude .git --exclude docs --exclude native --exclude .cache --exclude out ./ $SNAP/
ln -s $R/node_modules $SNAP/node_modules; ln -sf $R/.env $SNAP/.env; mkdir -p $SNAP/native && cp -cR native/afm-bridge $SNAP/native/
perl -0pi -e 's/renderer: \{\n    plugins:/renderer: {\n    cacheDir: resolve(__dirname, ".vite-cache"),\n    plugins:/' $SNAP/electron.vite.config.ts
(cd $SNAP && UNMAPPED_SERVICE_TEST=1 bun run service -- --port 8802 --data $SCR/svc-n) &
(cd $SNAP && AETHER_TEST_USER_DATA=$SCR/ud-an bun run dev --remoteDebuggingPort 9356) &
D=docs/e2e/milestone-rev6-p3-rumors; step() { CDP_PORT=$1 bun scripts/cdp-drive.ts "$(cat $D/$2)"; }
sub() { python3 -c "import sys; print(open(sys.argv[1]).read().replace('__INVITE__', open(sys.argv[2]).read().strip()))" "$1" "$2"; }
step 9356 run-01-a-settings.json; step 9356 run-02-a-newgame.json
step 9356 run-03-a-share-invite.json | tail -1 | python3 -c "import json,sys; open('$SCR/inv-b.txt','w').write(json.loads(sys.stdin.read()))"
(cd $SNAP && AETHER_TEST_USER_DATA=$SCR/ud-bn bun run dev --remoteDebuggingPort 9357) &
step 9357 run-05-b-settings.json; CDP_PORT=9357 bun scripts/cdp-drive.ts "$(sub $D/run-06-b-join.json $SCR/inv-b.txt)"
step 9357 run-07-b-walk-east.json; step 9357 run-08-b-clear-e1.json
curl -s -X POST http://127.0.0.1:8802/v1/test/advance -H 'content-type: application/json' -d '{"days":1}'
sleep 20; step 9356 run-10-a-listener.json
step 9356 run-11-a-public-probe-invite.json | tail -1 | python3 -c "import json,sys; open('$SCR/inv-p.txt','w').write(json.loads(sys.stdin.read()))"
(cd $SNAP && bun run world:probe -- --service ws://127.0.0.1:8802 join --link "$(cat $SCR/inv-p.txt)" --key-file $SCR/probe.key --name Probe)
(cd $SNAP && bun run world:probe -- --service ws://127.0.0.1:8802 rumors --world <worldId> --key-file $SCR/probe.key)
step 9357 run-13-b-ipc-refusals.json
# then the fog flow; then run-14 on B; run-15 on the door flow's C; the self-contained probe on a fresh service
```

Count `[inference]` lines in each app's stdout. New game rolls the seed, so names and ids differ
on a replay. Environment: macOS 27.0, Bun 1.3.6, Electron 44.3.0; the working tree of
2026-09-26T04:04:51Z as a snapshot (see `run.json` `env.build`). Model: openai `gpt-5.4-mini`.
Service key `kdeurti22qd4…`, ws://127.0.0.1:8802, test mode, beat every 6 h.

## What was checked

| # | Check | Observed | Verdict |
| --- | --- | --- | --- |
| 1 | A's world, shared; B joins | A: New game `BLHG-4RLN` (world `hf52k37eeoany52p…`), origin "Windmill Field" (Aya, Gen, Mika) n=4, chapter e1 "The Twice-a-Day Bus" n=3. Share → online in 504 ms (sequencer n=5). B joined as "Bea" in 485 ms, member, head n=6 (`a-01`…`a-03`, `b-01`, `b-02`) | pass |
| 2 | B does a deed | B witnessed (1, 0) "Pole and Windmill" n=7 and (2, 0) "East Bus Field" n=8, then met Miwa, Ken, Haru and opened the locker at the e1 gate (80.5, 16.5): chapter cleared in 11,886 ms. **Deed n=9** by Bea, `chapter.cleared`, label "The Twice-a-Day Bus", where (2, 0) (`b-03`…`b-05`) | pass |
| 3 | B's deed becomes a slot | `advance {days: 1}` → beat **n=11** at 2026-09-27T04:10:47.905Z, upTo 10, 6 slots. **Slot 0 cites B's deed** (`hkfj3gstosxb…`), place "East Bus Field", listener `0,0:aya`. Slots 1–5: A's chapter e1, B's chapter e2 (written ahead by B's device, n=10), B's member.join, A's and B's witnesses | pass |
| 4 | A's batch, usage `rumor`, cites it | A (owner, switch on Auto) wrote the batch by itself: **one call**, `810fb58f`, 1,069 ms, 1,939+203 tokens; console `[rumors] beat hcdzf7la4: 6 written, 0 refused`; rumors n=12–17 received 3.1 s after the beat. `usage.jsonl`: `{"purpose":"rumor","scope":{"kind":"instance","id":"blhg-4rln-muhvd9qv"},"input":1939,"output":203,"ms":1069,"outcome":"done"}` | pass |
| 5 | The listener names B | Slot 0's rumor (n=12): "Aya says Bea saw The Twice-a-Day Bus through at East Bus Field." A walked to Aya at (0, 0) and talked: her stored words, then "They say… Aya says Bea saw The Twice-a-Day Bus through at East Bus Field." No call: A's `[inference] done` count stayed 3 (`a-04`) | pass |
| 6 | Probe (service) on world N, as a member key | After this session's probe fix: `rumor-uncited` ("They say the wind turned at dusk."), `rumor-names-other` ("…seen with player-9U7T."), `rumor-beat-unknown`, visitor (world set Public first) `access-visitor-kind`; the member's control rumor `accepted` and stands as a variant; the served log verifies (20 entries); the beat equals its recomputation. No "slot the beat did not open" step: this beat opened all six slots. A rerun got `quota-variant` for the control, as it must (the first run's control was the one variant allowed) | pass |
| 7 | Probe, self-contained (fresh service dir) | 20/20 steps ok, incl. `rumor-uncited`, `rumor-names-other`, **`rumor-slot-unknown`** (slot 3), `rumor-beat-unknown`, a visitor's rumor `access-visitor-kind`, control `accepted` and live, a second variant `accepted`, a third `quota-variant` (`probe-rumors-self.out.jsonl`) | pass |
| 8 | The same via IPC, refused by main | B (member), `window.seed.world.append` of 4 drafts: `rumor-uncited`, `rumor-names-other` ("names \"player-9U7T\""), slot 6 → `ipc-invalid` ("world:append: invalid 1.body.slot": the IPC schema caps slots at 5), `rumor-beat-unknown`. Head stayed 20, pending 0, refused 0. After the fog beat (1 slot): slot 1 → **`rumor-slot-unknown`** "Beat has no rumor slot 1." (run-14). A visitor (the door flow's C, public world F): **`access-visitor-kind`** "Only members write this world." (run-15) | pass |

### `[inference]` lines (world N up to step 13)

```
A  done aaf5f800 · chapter · openai gpt-5.4-mini · 4800 ms · max 2400 · 2157+904 tokens (1792 cached)
A  done 2c6a9159 · witness · openai gpt-5.4-mini · 5318 ms · max 3200 · 3332+1158 tokens (2304 cached)
B  done 06e510aa · witness · openai gpt-5.4-mini · 6526 ms · max 3200 · 3454+1277 tokens (2816 cached)
B  done 0af99479 · witness · openai gpt-5.4-mini · 3482 ms · max 3200 · 3552+746 tokens (2816 cached)
B  done 4e93318b · chapter · openai gpt-5.4-mini · 4807 ms · max 2400 · 2571+923 tokens (0 cached)
A  done 810fb58f · rumor · openai gpt-5.4-mini · 1069 ms · max 1200 · 1939+203 tokens (0 cached)
```

B's chapter call wrote e2 ahead after e1 was cleared (the next chapter, by design). The
service log of world N is `service-log-summary.jsonl`.

## Found here

1. **Probe, existing-world mode, read the slots before the history arrived (fixed).** The first
   run of `rumors --world … --key-file …` aborted: `"a rumor slot to write against (from the
   service's beats)","expect":"found","got":"none"`. `opened` comes before the `entries` it
   announces, and the scenario read `writer.mirror(id).now` at once. Fix:
   `scripts/lib/probeSocket.ts` keeps the head the `opened` frame announced (`Mirror.served`), and
   `scripts/lib/probeRumors.ts` waits for it (a new step, "the served history is folded here").
2. **Probe, a visitor's rumor was judged on an empty fold (fixed).** Next run: `"a valid rumor
   written by a visitor","expect":"access-visitor-kind","got":"probe-setup:access-members-only"`:
   the same race on the visitor's socket (its mirror held only the genesis, door "friends").
   Fix: wait for the visitor's served head before judging. Then `access-visitor-kind`.
3. No app code needed a change for this flow.

## Not run

- B talking to the listener: the "They say…" row was read on A (the world's owner) only.
