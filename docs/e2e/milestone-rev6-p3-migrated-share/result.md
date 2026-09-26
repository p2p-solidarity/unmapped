# E2E · rev 6 phase 3 · `migrated-share` (D6, D10)

Plan row: the fixture world is attached. B joins and sees its old chunks, notes and places, and
enters the otherworld (work pack fetched, verified, sandboxed) with 0 calls.

**Verdict: pass.** B made 0 model calls in this world. The owner's device F made 5 calls of its
own (4 `witness`, 1 `rumor`, all automatic), listed below with the reasons.

## Replay

```bash
# the environment and snapshot of milestone-rev6-p3-offline-visit ($SCR/tree, service on 8801);
# B (CDP 9354) is the same device and userData as in the other flows.
D=docs/e2e/milestone-rev6-p3-migrated-share
step() { CDP_PORT=$1 bun scripts/cdp-drive.ts "$(cat "$D/$2")"; }
mkdir -p "$SCR/udF"
(cd "$SCR/tree" && bun --tsconfig-override tsconfig.node.json scripts/fixtures/legacy-land.ts "$SCR/udF") > fixture-manifest.json
(cd "$SCR/tree" && AETHER_TEST_USER_DATA="$SCR/udF" bun run dev --remoteDebuggingPort 9353) &
step 9353 run-04-f-f-settings.json; step 9353 run-05-f-f-open.json; step 9353 run-06-f-f-resume.json
step 9353 run-07-f-f-witness-home.json; step 9353 run-08-f-f-share.json
step 9353 run-09-f-f-invite.json | tail -1 | python3 -c "import json,sys; open('$SCR/invite2.txt','w').write(json.loads(sys.stdin.read()))"
step 9354 run-10-b-b-to-title.json
CDP_PORT=9354 bun scripts/cdp-drive.ts "$(python3 -c "import sys; print(open(sys.argv[1]).read().replace('__INVITE__', open(sys.argv[2]).read().strip()))" "$D/run-11-b-ms-b-join.json" "$SCR/invite2.txt")"
for s in 12-b-ms-probe 13-b-ms-places-probe 14-b-ms-e1-probe 15-b-ms-b-walk 16-b-ms-b-enter 17-b-ms-b-notes 18-b-ms-b-notes2; do step 9354 run-$s.json; done
step 9353 run-19-f-f-door-after.json
```

Model: openai `gpt-5.4-mini` on both devices. The fixture uses the default seed `legacy-land`
(manifest in `fixture-manifest.json`): instance `23qc-6pqs-mucdvy80`, 4 chunks (1,1 oversized:
13 errands / 13 keepsakes over the 12 / 12 caps), 12 lore, 4 notes, 2 places, 1 storyMore,
4 episodes, 4 errands, 29 karma lines.

## What was checked

| # | Check | Observed | Verdict |
| --- | --- | --- | --- |
| 1 | The fixture save opens and migrates | Worlds → Saves listed "無界之地 · 23QC-6PQS … No world history yet". Resume → world `ready` in **1,646 ms**. Toasts: "This save's land now lives in its world's history (21 entries)." · "3 things stay on this device only and are not in the shared history." · "2 things were adjusted on the way in (a place moved, a note's link dropped)." Kinds: genesis 1, profile 1, witness 3, note 4, place 2, story.more 1, chapter 4, deed 5 (no `pack`: the genesis pins the built-in 1.3.0). The oversized (1, 1) is still drawn on F from its own files and is not in the history (`f-01`, `f-02`) | pass |
| 2 | The legacy source is not written | Compared with a fresh fixture written from the same seed: 42 of 45 fixture files are byte-identical. The three that differ are `instance.json`, `save.json` and `karma.jsonl`. In `save.json` only `position` and `updatedAt` changed; `land.places`, `land.storyMore`, `land.episodes` and `land.errands` are equal. `karma.jsonl` keeps its 29 lines as a prefix, plus F's 2 witness lines | pass |
| 3 | The fixture world is attached | F walked home, pressed E, clicked "Share on 127.0.0.1:8801" → Online in **502 ms**. Service: `attached world haophqvg…oufhq (24 entries)`. Two work packs went up: `aee91724…63db` (2,016 B, Firefly Jar, named in place p2's body) and `20a434fd…e66b` (1,750 B, The Twice-a-Day Bus, chapter e1 of kind `work`), both in `blobs.txt` (`f-03`, `f-04`) | pass |
| 4 | B joins | Preview: "Made by player-W6B3 · Kept on 127.0.0.1:8801 · Door: Friends · 0 members · 31 entries". Join and play → Play in **1,249 ms**, role member. F's door then listed "Bea · member since entry 32" (`b-01`, `b-02`, `f-06`) | pass |
| 5 | Same history | Head n=32, chain `sha256:bde1cbc0…b600` on F, B and the service; 32 of 32 chains equal in each `log.jsonl` | pass |
| 6 | B sees the old chunks | B's fold and land: (-1, 0) "Unmanned Station", (0, 1) "Breakwater Steps" and (1, 0) "Pole Row Crossing", all migrated, plus F's (-1, -1) and (0, 0), all `written`. B walked (0, 0) → (-1, 0) → (-1, -1) and saw each as WRITTEN (`b-03`, `b-04`) | pass |
| 7 | B sees the old notes | 4 notes. In (0, 1) the notes panel read "Mika · tile 9,23 · A visitor's note, kept by the world's owner. · 防波堤のいちばん上の段に貝がらが七つ。…" and "Aki · tile 10,22 · another version of Mika's note · Only five shells when I came by. Kei says the tide takes two." (`b-06`) | pass |
| 8 | B sees the old places | p1 "Rail Cutting Run" (side) at (2, -2), moved from (2, -1) because the next chapter's gate had taken that chunk (the "place moved" line in row 1). p2 "Firefly Jar" (otherworld) at (-1, -1), work `w-9c4f870b@1.0.0`. Standing at the rift, B's HUD offered "A · Enter · Firefly Jar" (`b-04`) | pass |
| 9 | Work pack fetched and verified | The join fetched both packs: `udB/blobs/` holds `20a434fd…` and `aee91724…`, and the sha256 of each file equals its name. `histories/<world>/received-works.json` lists both with their `contentHash` and `pack`. Both are installed under `udB/works/w-9c4f870b/1.0.0/` and `w-d665a63e/1.0.0/` | pass |
| 10 | Entering the otherworld is sandboxed | E opened the `otherworld` layer "Firefly Jar · world 1/1 · w-9c4f870b@1.0.0 · carry null · Fireflies: 0 / 5". Its frame: `src="ulwork://w82faf5f8c8015157fb24e3f419e52a2c/"`, `sandbox="allow-scripts"`, `allow="gamepad"`, 1440 × 785. "Leave the otherworld" brought B back to (-15.6, -13.6) (`b-05`) | pass |
| 11 | 0 calls on B | B's stdout has 2 `[inference]` lines in total. Both belong to world `hryt3f2x…` and were written before this flow: `71f6bb7b` (offline-visit) and `1447e5cb` (variant). B's HUD in this world read "No model calls counted for this world yet." throughout | pass |

### The owner's calls (F), all automatic

```
[inference] done 90ccc078-… · witness · openai gpt-5.4-mini · 4134 ms · max 3200 · 3810+942 tokens (2816 cached)
[repair] 1/2 · dsl-invalid-chunk · 3 problem(s) with this Chunk program. · This place's custom does not link to any neighbouring custom.
[inference] done 47cbf1b6-… · witness · openai gpt-5.4-mini · 2983 ms · max 3200 · 5820+888 tokens (3328 cached)
[repair] 2/2 · dsl-unresolved-reference · Referenced but never defined: reward_tag.
[inference] done c1badd76-… · witness · openai gpt-5.4-mini · 2881 ms · max 3200 · 5581+856 tokens (2816 cached)
[inference] done 7ae2bcfd-… · witness · openai gpt-5.4-mini · 7662 ms · max 3200 · 4113+1584 tokens (2304 cached)
[inference] done 2974a95f-… · rumor · openai gpt-5.4-mini · 1356 ms · max 1200 · 1929+244 tokens (0 cached)
[rumors] beat h5ysbrhib: 6 written, 0 refused
```

- The fixture's player stands at (-15.5, -14.1), which is chunk (-1, -1). That chunk has no
  witness in the fixture, so opening the save witnessed it: 1 call plus 2 repairs, "Pole and
  Chimney", n=22.
- The fixture also has no (0, 0), and a joiner spawns there. F therefore walked home and witnessed
  it ("Spring Verge", n=23), so B would stand on written land and could show 0 calls with a model
  configured.
- The rumor batch: 2 s after the attach the service wrote a catch-up **beat** at n=25 (the
  fixture's receipts date from 2026-09-22 … 25). F's device ("Write rumors in the background", on
  by default for the owner) then wrote its 6 slots as n=26 … 31 in one call.

### Service log

```
2026-09-26T03:47:28.883Z attached world haophqvg7ao4mpvgiyqid62ykuof23ljztr5odhbgdik3xvroufhq (24 entries)
```

## Found here

1. **A migrated phase-2 save can put the owner on an unwritten chunk.** Here the save stands on
   (-1, -1), the otherworld's chunk, which phase 2 never witnessed. The spawn chunk (0, 0) is
   unwritten too. So the first open of a migrated save costs a witness call, and a joiner with a
   model witnesses the spawn chunk unless the owner went there first. This is expected under D6
   (migration adds no chunks), but it means `migrated-share` cannot show "0 calls" for B without
   the owner walking home first.
2. **The owner's profile is the device's display name** ("player-W6B3", random on a fresh
   localStorage), not the legacy save's player name "Aki". The migrated notes keep "Aki". This is
   as D6 states (the profile carries the name the renderer passes to `ensure`), and is recorded
   so nobody expects "Aki".
3. **A work chapter reads as cleared for a new member.** B's HUD read "Chapter 2 · 1 cleared".
   e1 is a Rule 13 chapter played as an AI work, and `renderer/history/progress.ts` makes such a
   chapter read `cleared: true` for everyone ("reads as told"). That is the documented rule. It
   does mean a member's story count starts at 1.

## Files

- `run.json` plus `run-NN-*.json` per step (F on 9353, B on 9354; steps 1–3 are shell steps).
  `fixture-manifest.json` is the fixture script's output (ids, counts, file hashes).
- `f-00` … `f-06` (owner), `b-01` … `b-06` (joiner). The shot of step 17 (notes in (0, 0),
  empty) was overwritten by step 18's `b-06`.
