# E2E · rev 6 phase 3 · `migrate` (D6)

The legacy fixture (`scripts/fixtures/legacy-land.ts`, a phase-2 save of the built-in world) is
opened by this build. Play runs `world.ensure`, which migrates the save into a world history. The
run checks the counts per kind against the fixture, that the source files are unchanged, that the
oversized chunk stays `legacyOnly` (reported and still drawn), that a rerun adds 0 entries, and
that no model is called. Part C repeats the migration on a fresh copy of the fixture after this
session's planner fix, with the same device key and display name.

## Replay

```bash
SCR=$(mktemp -d); D=docs/e2e/milestone-rev6-p3-migrate
bun run fixture:legacy-land "$SCR/migrate/ud" > "$SCR/migrate/fixture.json"   # = fixture-manifest.json
(cd "$SCR/migrate/ud" && find . -type f | sort | xargs shasum -a 256) > "$SCR/before.sha256"   # 45 files
OPENAI_API_KEY= THESYS_API_KEY= AETHER_TEST_USER_DATA="$SCR/migrate/ud" \
  bun run dev --remoteDebuggingPort 9350 &                                       # background
CDP_PORT=9350 bun scripts/cdp-drive.ts "$(cat $D/run.json)"                      # part A
CDP_PORT=9350 bun $D/close-app.ts.txt                                            # then kill the Electron pid if 9350 still listens
(cd "$SCR/migrate/ud" && awk '{print $2}' "$SCR/before.sha256" | xargs shasum -a 256) | diff "$SCR/before.sha256" -
bun --tsconfig-override tsconfig.node.json $D/digest.ts.txt "$SCR/migrate/ud" 23qc-6pqs-mucdvy80
OPENAI_API_KEY= THESYS_API_KEY= AETHER_TEST_USER_DATA="$SCR/migrate/ud" bun run dev --remoteDebuggingPort 9350 &
CDP_PORT=9350 bun scripts/cdp-drive.ts "$(cat $D/run-b-restart.json)"            # part B
# part C, after the planner fix: a pristine fixture, part A's device key, a dead model endpoint
bun run fixture:legacy-land "$SCR/pristine"; cp -Rp "$SCR/pristine" "$SCR/migrate2/ud"
cp -Rp "$SCR/migrate/ud/identity" "$SCR/migrate2/ud/"
echo '{"kind":"llamacpp","baseUrl":"http://127.0.0.1:8859/v1","model":"none","apiKeyEnv":null,"sidecar":null}' > "$SCR/migrate2/ud/inference.json"
OPENAI_API_KEY= THESYS_API_KEY= AETHER_TEST_USER_DATA="$SCR/migrate2/ud" bun run dev --remoteDebuggingPort 9351 &
CDP_PORT=9351 bun scripts/cdp-drive.ts "$(cat $D/run-c-pristine-after-fix.json)"
W=hivribsqepe5ifl3nxixjesz3mxdw3wnataqtttfeldkeagqfwtoa
cmp <(head -21 "$SCR/migrate/ud/histories/$W/log.jsonl") <(head -21 "$SCR/migrate2/ud/histories/$W/log.jsonl")
grep -c '\[inference\]' <each dev log>
```

Environment: macOS 27.0, Bun 1.3.6, Electron 44.3.0. Build: main `51817a3` plus the uncommitted
working tree of every session (others edited `src/shared/llm.ts`, `src/main/inference/**` and i18n
tables during the run; Vite hot-reloaded). Parts A and B ran before the planner fix, part C after
it. Model: none. Bun printed `Internal error: directory mismatch for directory ".../tsconfig.node.json"`
on every `--tsconfig-override` run; the exit code was 0 each time.

## The fixture (`fixture-manifest.json`)

Instance `23qc-6pqs-mucdvy80`, `aether-land@1.3.0` (`sha256:57f17e0d…e81b`). Counts: chunks **4**,
lore **12**, notes **4**, places **2**, storyMore **1**, episodes **4**, errands **4**, karma **29**.
Oversized chunk **1,1**: 13 errands and 13 keepsakes, over the caps of 12 and 12.

## What was checked

| Check (plan) | Observed | Verdict |
| --- | --- | --- |
| Counts per kind equal the fixture's | The first Resume migrated to world `hivribsq…fwtoa`, **21 entries** (toast: "This save's land now lives in its world's history (21 entries)."): genesis 1, pack 0 (a shipped built-in), profile 1, **witness 3 + 1 legacyOnly = 4 chunks**, **note 4**, **place 2**, **story.more 1**, **chapter 4** (e1 `work`, e2 and e3 `land`, e4 `side` with `more`), **deed 5**. The lore sits inside the witnesses: 3 + 3 + 3 = 9, plus 3 on the legacy-only 1,1 = **12**. The karma deed lines were 6: 5 became deeds, and "finished lost_umbrella" was reported (its chunk stayed out). Errands were 4: 3 are in `progress.json` under `<witnessId>:<errandId>` and `1,1:lost_umbrella` was reported. The visitor note kept `name: "Mika"` and `via: "continent"`. The contesting note points at that note's event id (`log-summary.jsonl`, `world.json`) | pass |
| Adjustments reported | Toast "2 things were adjusted on the way in". Place p1 moved from 2,-1 (e4's gate) to **2,-2** (log n=10). Note `ed9ab977…` lost its anchor `lost_shelter@1,1`, now `anchors: []` (n=9) | pass |
| Source sha256 unchanged | Re-hash of the 45 fixture files after part A: every `chunks/`, `lore.jsonl`, `notes.jsonl`, cartridge and work file is identical. `instance.json` and `save.json` differ only by Play's checkpoint: `updatedAt`, and `player.y` 0 → 0.1. The later `karma.jsonl` append is play: "arrived for tide_word", written to `progress.json`, not `land.errands`. The legacy land fields hash the same as the pristine fixture's: canonical `{places, storyMore, episodes, errands}` sha256 `632cb014…dc41` on both. Main's own `currentDigest` equals the pinned `world.json` source: chunks `f1b5016d…`, lore `d326ba90…`, notes `3d211a97…`, land `51b61c5e…`, `same: true` (`digest.ts.txt`) | pass |
| The oversized chunk is `legacyOnly`, reported and still drawn | `world.json` `skipped`: `chunk 1,1 event-invalid "body.index.errands: Too big: expected array to have <=12 items"`, `deed "finished lost_umbrella" deed-ref-missing`, `errand 1,1:lost_umbrella errand-chunk-legacy`. Toast: "3 things stay on this device only and are not in the shared history." Land store `marks["1,1"]`: `legacyOnly: true`, `live: null`. At 1,1 the HUD reads "WRITTEN · Lost-and-Found Shelter" and "Kept on this device only — not in the world's shared history." Chie is drawn, and talking shows her stored words with 0 calls (`a-04`, `b-01`) | pass |
| A rerun adds 0 entries | In-session `world.ensure` → `migrated: false, added: 0`. After an app restart, Continue's ensure → `migrated: false, added: 0, adoptedFrom: null`. The log grew only by play: n=22 `visit` (the walk), n=23 the local catch-up `beat` (D13: 8 h after the migrated rt, on this pinned open; the migrating open wrote none), and n=24 a `profile` (the device name changed to `player-JMXL` when the restart lost localStorage). Part C, after the fix: a pristine fixture with the same device key and name migrated to the same world, and its **first 21 log lines are byte-identical** to part A's (`cmp`) | pass |
| 0 `[inference]` lines | dev logs A: **0**, B: **0**, C: **0**. The HUD read "No model calls counted for this world yet." throughout | pass |

## Notes

- The first migration's `progress.json` has `e1.playId` `p-d923a7d1d51267eb` and places
  `p1: {cleared: true}` and `p2: {cleared: false, playId: "p-16873c63c2c53ae5"}`, as in the fixture.
- **Not run:** a timing of the migration (not instrumented).
