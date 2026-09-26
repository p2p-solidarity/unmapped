# E2E · rev 6 phase 3 · `continent` (D12)

Plan row (`docs/plans/rev6-phase3.md`, "E2E flows"): A migrated local world opens a continent with
another world. A visitor note waits for confirmation, then becomes an owner-signed note. An
attached world is refused `continent-world-attached`.

**Verdict: pass**, with one bug found on the visitor's side and fixed (finding 1).

## Replay

```bash
# SNAP = the working-tree snapshot (see run.json env.build and the rumors flow's replay block)
(cd $SNAP && PORT=4454 node node_modules/y-webrtc/bin/server.js) &
(cd $SNAP && UNMAPPED_SERVICE_TEST=1 bun run service -- --port 8802 --data $SCR/svc-f) &
(cd $SNAP && bun --tsconfig-override tsconfig.node.json scripts/fixtures/legacy-land.ts $SCR/ud-af > $SCR/fixture.json)
(cd $SNAP && AETHER_TEST_BACKUP_PATH=$SCR/f-world.spire-backup AETHER_TEST_USER_DATA=$SCR/ud-af bun run dev --remoteDebuggingPort 9356) &
(cd $SNAP && AETHER_TEST_USER_DATA=$SCR/ud-bf bun run dev --remoteDebuggingPort 9357) &
D=docs/e2e/milestone-rev6-p3-continent; step() { CDP_PORT=$1 bun scripts/cdp-drive.ts "$(cat $D/$2)"; }
step 9356 run-02-a-settings.json; step 9357 run-03-b-settings.json
step 9356 run-04-a-resume-migrate.json; step 9357 run-05-b-newgame.json
step 9356 run-06-a-open-door.json     # prints A's door number; run-07 types it (PVWU76 in this run)
step 9357 run-07-b-walk-through.json; step 9357 run-08-b-note-on-a-land.json
step 9356 run-09-a-keep-note.json; step 9356 run-10-a-attach.json; step 9357 run-11-b-after-attach.json
step 9357 run-12-b-leave.json
# the fix check: two fresh worlds (ud-ah on 9356, ud-cv on 9358), run-20 … run-24 (door number AQYUSA in this run)
```

The door number comes from the world id, so a replay types its own (edit run-07 / run-22).

## What was checked

| # | Check | Observed | Verdict |
| --- | --- | --- | --- |
| 1 | A migrated local world | Fixture `legacy-land` (instance `23qc-6pqs-mucdvy80`, `fixture-manifest.json`). Worlds → Saves → Resume: "This save's land now lives in its world's history (21 entries). 3 things stay on this device only … 2 things were adjusted on the way in". Link **local**, role owner, head 21: genesis 1, profile 1, witness 3, note 4, place 2, story.more 1, chapter 4, deed 5 (`a-01`) | pass |
| 2 | … opens a continent with another world | A: door → "Open my door to friends" → "Continent **PVWU76** … Live · 0 peers here · This world's offset: 0 · 0" (`a-02`). B (a New game, `VCGE-KENQ`, local): door → PVWU76 → Walk through → "Live · 1 peer here", "This world's offset: **6 · 0**", other worlds "player-7JCQ · 無界之地 · 0 · 0 · online" (`b-02`). "Go to their door": B at (-180.5, 8.5), chunk (-6, 0), HUD "player-7JCQ's land · 無界之地 / WRITTEN · Steam Lane / CONTINENT PVWU76 · LIVE · 1 PEER" (`b-03`, `b-04`) | pass |
| 3 | A visitor note waits for confirmation | B (N) left "Bea from the next world over: your windmill field is lovely at dusk." on A's land (author player-46PE, `b-05`). A's history still had 4 notes (head 23). A's door: "Notes visitors left on your land / Left by player-46PE, not kept yet · 0 · 0 · 9/26/2026, 1:27:40 PM / … / Keep it · Not now" (`a-03`) | pass |
| 4 | … then becomes an owner-signed note | "Keep it" → **n=24** `note`, author A's key `kv4ifyp72l…`, `name: "player-46PE"`, **`via: "continent"`**, coord (0, 0, 11, 11), anchored to the live witness of (0, 0); the offer list emptied (`a-04`) | pass |
| 5 | An attached world is refused `continent-world-attached` | A: "Share on 127.0.0.1:8802" → online in 535 ms while on the continent. The world left the continent at once (`getActiveContinent()` null, no continent line in the HUD, toast "This world is shared through a world service, so it cannot also join a continent."). Door: "Error · **continent-world-attached**" with its hint; `openMyDoor()` → `{"ok":false,"error":{"code":"continent-world-attached",…}}` (`a-05`). B: "CONTINENT PVWU76 · LIVE · 0 PEERS", worlds `[]` (`b-06`) | pass |

Calls: A 2 witnesses (the fixture save stood in unwritten (-1, -1): `011d10b8`, 7,339 ms,
3,810+1,152; A's walk to its door crossed the unwritten origin (0, 0), "Steam Lane": `8d81f2c8`,
7,336 ms, 4,114+1,065); B's New game: chapter `22555dac` 7,984 ms 2,157+1,052 and witness
`5c53a54a` 8,717 ms 3,332+1,363. After the attach the service beat world F (n=26, 6 slots) and A
wrote a rumor batch (`b1dc3f64`, 2,413 ms, 1,935+282); that belongs to the door flow's world.

## Found here

1. **A visitor whose host world leaves the continent is stranded on its own never-walked land
   (fixed).** When A's world left (step 5), B stood at (-180.5, 11.3): its **own** chunk (-6, 0),
   "UNWRITTEN", no longer tagged `visiting:` (A's territory was gone), 6 chunks from its home. The
   next checkpoint stored it: B's `save.json` position `{"sceneId":"origin","x":-180.5,"y":0.1,
   "z":11.2924…}` at 04:28:24Z — exactly what `bringVisitorHome` prevents when the player leaves or
   switches continents. Any further step there would witness B's own far land. Fix:
   `src/renderer/net/continentSync.ts` (`refresh`): when a new view turns a visiting sample into a
   non-visiting one, `sendPlayerHome()` (split out of `bringVisitorHome` in
   `src/renderer/net/continentActions.ts`). **Check (run-20 … run-24, fresh worlds):** host A2
   (door AQYUSA), visitor C2 at (-180.5, 10.6), `sceneId: "visiting:dmkl-urr5-muhwri84"`; A2 "Leave
   the continent"; C2 then stood at **(11.5, 8.5)**, `sceneId: "origin"`, chunk (0, 0), next to its
   door; its `save.json` position `(11.5, 0.1, 8.5)` at 04:48:00Z (`c2-00`, `c2-01`). Calls for the
   check: A2 chapter `c349452b` 4,110 ms 2,157+645, witness `013e4238` 4,719 ms 3,332+909; C2
   chapter `6aaf3713` 6,371 ms 2,157+954, witness `f1ae98e7` 7,159 ms 3,332+1,263.
2. The fixture save's own position is in an unwritten chunk, so migrating it with a model set up
   costs one witness at once (step 1). Not a bug; noted for the migrate flows' call counts.

## Files

`run.json`, `run-NN-*.json`, screenshots `a-00` … `a-05`, `b-00` … `b-06`, `c2-00`, `c2-01`,
`fixture-manifest.json`, `service-log-summary.jsonl` (world F as the service holds it at the end
of the door flow).
