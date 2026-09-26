# E2E · rev 6 phase 3 · `older-build` (D1, D6)

The phase-2 build (`7cebb2f`, run from a `git worktree`) opens a copy of the migrated fixture
userData from the `migrate` run. It shows the land, witnesses one chunk (one model call) and leaves
one note. This build then opens the same userData and must report the catch-up and add exactly
those 2 events.

**A bug was found and fixed.** Before the fix, the catch-up added only the note. The phase-2
model's lore for the new chunk links to lore of the oversized chunk 1,1, which stays `legacyOnly`,
so the planner left the whole new chunk out (`lore-link-unknown`). After the fix
(`src/dsl/history/migrateLand.ts`), the same userData, restored from a snapshot taken right after
the phase-2 app closed, catches up with exactly the witness and the note.

## Replay

```bash
SCR=<the migrate run's scratch dir>; D=docs/e2e/milestone-rev6-p3-older-build; REPO=$(pwd)
mkdir -p "$SCR/older/ud"; (cd "$SCR/migrate/ud" && cp -Rp blobs cartridges histories identity instances \
  mods profiles work-drafts work-plays works workspaces worlds "$SCR/older/ud/")
git worktree add --detach "$SCR/p2" 7cebb2f
(cd "$SCR/p2" && bun install --frozen-lockfile && node node_modules/electron/install.js)
(cd "$SCR/p2" && OPENAI_API_KEY="$(grep '^OPENAI_API_KEY=' "$REPO/.env" | cut -d= -f2-)" \
  AETHER_TEST_USER_DATA="$SCR/older/ud" bun run dev --remoteDebuggingPort 9351 &)           # phase 2
CDP_PORT=9351 bun scripts/cdp-drive.ts "$(cat $D/run.json)"                                # part A
CDP_PORT=9351 bun docs/e2e/milestone-rev6-p3-migrate/close-app.ts.txt
cp -Rp "$SCR/older/ud" "$SCR/older/ud-after-p2-snapshot"
bun --tsconfig-override tsconfig.node.json docs/e2e/milestone-rev6-p3-migrate/digest.ts.txt "$SCR/older/ud" 23qc-6pqs-mucdvy80
OPENAI_API_KEY= THESYS_API_KEY= AETHER_TEST_USER_DATA="$SCR/older/ud" bun run dev --remoteDebuggingPort 9351 &
CDP_PORT=9351 bun scripts/cdp-drive.ts "$(cat $D/run-b-new-build-before-fix.json)"         # part B (pre-fix build)
# after the fix: rm -rf "$SCR/older/ud"; cp -Rp "$SCR/older/ud-after-p2-snapshot" "$SCR/older/ud"; relaunch
CDP_PORT=9351 bun scripts/cdp-drive.ts "$(cat $D/run-c-new-build-after-fix.json)"          # part C
git worktree remove "$SCR/p2"
```

The worktree's lockfile differs from main's only by `@noble/curves` and `@noble/hashes`, so
`node_modules` was installed, not symlinked. Electron's binary needed its install script run by
hand, because `bun install` did not run it. The phase-2 app got exactly one variable,
`OPENAI_API_KEY`; the worktree had no `.env`. A SIGTERM left the phase-2 Electron listening, and
`Browser.close` on the browser target closed it.

## What was checked

| Check (plan) | Observed | Verdict |
| --- | --- | --- |
| The phase-2 build opens a copy of the migrated userData and shows the land | Continue opened it at LAND 1 · 1, "WRITTEN · Lost-and-Found Shelter", karma 30 entries, and drew Chie and the shelter from the frozen `chunks/` folder (`a-01`). Phase 2 ignores `world.json`, `progress.json` and `histories/` | pass |
| It witnesses 1 chunk | Walking east into 2,1 witnessed "Chimney Shore" (`a-03`). **1 model call**: `[inference] done bae27a02… · witness · openai gpt-5.4-mini · 9375 ms · max 3200 · 3954+1316 tokens (0 cached)`. The HUD read "This world: 1 call · 3,954 in / 1,316 out · 0 cached" | pass |
| It leaves 1 note | Note `357761d1…` by `player-JKHF` at 2,1 tile 5,13, anchored to `chimney_shore@2,1`: "Left by the older build: the chimneys smoke even at noon." (`a-05`) | pass |
| Phase 2 writes only legacy files | After it closed, `world.json`, `progress.json` and `histories/…/log.jsonl` were byte-identical to before (`cmp`). `save.json` changed only in position and `updatedAt`. Main's `currentDigest` now differs from the pin (`same: false`): chunks 5, lore 15, notes 5, against the pinned 4, 12, 4 | pass |
| The new build reports the catch-up and adds exactly those 2 events | **Before the fix (part B):** the toast said "An older build changed this save: **1 thing** added to its world." Only the note was appended (n=25, `anchors: []`), and `world.json` gained the skip `{"what":"chunk","key":"2,1","code":"lore-link-unknown","message":"Lore shelf_and_tag@2,1 links to tag_it@1,1, which is not live."}` (`b-00`). **After the fix (part C):** "An older build changed this save: **2 things** added to its world." n=25 is the `witness` 2,1 (`hrfm57bk…`) and n=26 the `note`, now anchored to that witness. `adjusted` lists `{"what":"chunk","key":"2,1","code":"lore-link-missing","detail":"shelf_and_tag@2,1 → tag_it@1,1"}` beside the migration's note anchor and place move, and `skipped` is back to the migration's 3 (`c-00`). n=27 is a `profile`: this userData had no localStorage, so a new device name (`player-LDE3`); it is not counted in `added`. A second `world.ensure` returned `added: 0`, head 27. The digest was re-pinned (`same: true`, counts 5, 15, 5) | pass (after the fix) |
| No model call by the new build | 0 `[inference]` lines in parts B and C | pass |

## The bug (verbatim) and the fix

Part B's `world.json` `migrated.skipped[1]`:

```json
{"what":"chunk","key":"2,1","code":"lore-link-unknown","message":"Lore shelf_and_tag@2,1 links to tag_it@1,1, which is not live."}
```

The phase-2 witness prompt shows the neighbours' lore, so the model linked the new chunk to the
oversized chunk's lore. That chunk can never be live, because it is over the caps. So every chunk
witnessed beside a `legacyOnly` chunk would stay out of the shared history with it. The fix is in
`migrateChunks` (`src/dsl/history/migrateLand.ts`). A lore link that reaches neither the chunk's own
lore nor lore already live in the plan is dropped from the history's copy and reported as
`adjusted` (`lore-link-missing`), the way a note's anchor already is. The frozen `chunks/` files and
`lore.jsonl` keep the link. A chunk that still stays out for another reason reports no adjustment.
Chunks whose links all resolve plan exactly as before: the `migrate` run's part C re-migrated a
pristine fixture with the same key and got a byte-identical log.

## Seen on the way (not part of the check)

- At 2,1 the new build's HUD says "Few come here — it is fading into mist." right after the
  catch-up. Town-ring chunks (1,0 / 0,1 / -1,0) say the same in `local-beat`, although they never
  fog (see that run).
