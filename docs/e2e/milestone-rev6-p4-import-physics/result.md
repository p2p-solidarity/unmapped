# E2E · rev 6 phase 4 · `p4-import-physics` (D5)

Plan row (`docs/plans/rev6-phase4.md`, E2E 7):
- A `.world` on unsupported physics is refused with `physics-newer`.
- A never-attached world whose genesis is `aether-land` 1.2.0 has no `pack` event, so its file
  carries an exporter-made `genesisPack`. It is exported with one `owner.add` and imported on
  another device where 1.3.0 is installed.
- There it is adopted: a new world id, and no `owner.add` carried over. The save is pinned to 1.2.0
  and its physics, with a `world.json` pin and an empty `progress.json`.

**Verdict: pass.** Nothing had to change. The known gap (`createInstance` takes no physics, so an
import pinned to other physics is refused `import-physics-pin`) was not hit: this world is on
physics 1, the build's own.

## Replay

```bash
SCR=<scratch dir>; R=<repo root>; D=docs/e2e/milestone-rev6-p4-import-physics
# the tree: see ../milestone-rev6-p4-rehost (origin/main 8813246 snapshot); physics99.ts.txt → $SCR/tree/e2e-tools/physics99.ts
cd $SCR/tree && bun --tsconfig-override tsconfig.node.json e2e-tools/physics99.ts <any valid .world> $SCR/files/physics99.world
cp $SCR/files/physics99.world $SCR/files/a2.world
AETHER_TEST_USER_DATA=$SCR/udA2 AETHER_TEST_WORLD_PATH=$SCR/files/a2.world node_modules/.bin/electron-vite dev --remoteDebuggingPort 9344 &
cd $R; step() { CDP_PORT=$1 bun scripts/cdp-drive.ts "$(cat $D/$2)"; }
step 9344 run-03-a-english.json; step 9344 run-04-a-inspect-physics99.json
step 9344 run-05-a-play-120.json; step 9344 run-07-a-owner-add-export.json   # step 7 names the throwaway key (step 6)
cp $SCR/files/a2.world $SCR/files/b2-import.world
AETHER_TEST_USER_DATA=$SCR/udB2 AETHER_TEST_WORLD_PATH=$SCR/files/b2-import.world node_modules/.bin/electron-vite dev --remoteDebuggingPort 9345 &   # from $SCR/tree
step 9345 run-10-b-english.json; step 9345 run-11-b-import.json; step 9345 run-13-b-reexport.json
```

`run.json` holds the env, the model and all 15 steps (7 cdp-drive, 8 command).

**How the physics-99 file was made** (`physics99.ts.txt`):
1. The script reads a real `.world`: `b-export1.world` from p4-rehost.
2. It copies that world's genesis body with `physicsVersion: 99`, a fresh `createdAt` and a name
   suffix.
3. It signs this as a new genesis with a throwaway Ed25519 key, the secret
   `sha256("p4-import-physics:throwaway-physics-99")`. The file therefore holds a new world:
   `h6y7nqgat72jjnh6mf5itn6loffugwvbgdhmo3sbpjt2k5gbwtv5a`, by `kzqr4ipq5k…`.
4. It sequences that genesis as a local-only log of one entry (`rsig: null`).
5. It builds the file with `buildWorldBundle`, the writer main and the service use, carrying the
   original's genesis pack, and signs `world.json` with the same throwaway key.

**How the 1.2.0 save was made.** Every device installs every shipped revision on first start
(`game/base.ts`), so Worlds → Cartridges lists aether-land 1.3.0, 1.2.0, 1.1.0 and 1.0.0.
Clicking the 1.2.0 row starts a run pinned to it, because hover selects and a click on the selected
row confirms. The recorded "Play" click then found nothing and is dropped from `run-05`. No backup
or fixture was used.

**How the one `owner.add` was made.** A local-only world has no member rows in the door, so the
page called `window.seed.world.addOwner(worldId, key)`, the preload call the door's "Make co-owner"
uses. It named a throwaway key, `k6dd3ubd6m…` from `throwaway-key.ts.txt`. The key is deliberately
not B's: since the working-tree `ensure.ts` fix, an owner's own device keeps a world instead of
adopting it.

## Checked

| # | Check | Observed | Verdict |
| --- | --- | --- | --- |
| 1 | A `.world` on physics 99 shows `physics-newer`, with no "Bring it in" | `verify-world physics99.world`: 1 problem, `check 7 physics-newer: This world was made with physics 99; this build has 1.`, exit 1. On A: Worlds → World files → Choose a .world file shows the report "1 entries, up to #1 · physics 99", then "1 problems — this file cannot be brought in: Check 7: This world was made with physics 99; this build has 1." Buttons: no "Bring it in". `bundle.inspect()` → `problems: [{check: 7, code: "physics-newer"}]`. Calling `bundle.import(token, "Ann")` directly (the renderer is untrusted) → `physics-newer`, hint "Update UNMAPPED to open it."; A's userData then had no `histories/` and no instance (`a-01`, `verify-physics99.txt`) | pass |
| 2 | A: a never-attached world whose genesis is aether-land 1.2.0 | Worlds → Cartridges → 1.2.0 → run `run-muhw4l3b`: instance and `runtimePin` on `aether-land@1.2.0 sha256:d40a3f25…`. History `hl6m3ulxpsjtyj4fob4bfjwfpixpntarvppoxg4qfinuaytqefmpq`: genesis on 1.2.0, physics 1, `sequencer: null`, head 3 (genesis, profile, the origin witness "Pine Road Edge") (`a-02`, `a-03`) | pass |
| 3 | One `owner.add`, then export | `addOwner` → `{id: h5sekxto…, n: 4}`; owners = {A `kcngqn4r…`, `k6dd3ubd…`}. World files: "4 entries · on this device only · You own it" → Export .world → "Wrote a2.world (8 KiB)", 7,615 B, sha256 `1fb890bc…`. The log has 4 entries: genesis, profile, witness, `owner.add`; no `pack` event. `world.json` `genesisPack` = `sha256:3b66964b…`, a 3,908 B blob the exporter packed; `services: []`. `verify-world`: 4 entries, 1 key, **owners 2**, never attached, 1 pack, OK (`a-04`, `verify-a2-120.txt`) | pass |
| 4 | B (fresh; ships 1.0.0–1.3.0) imports it | The report reads "4 entries, up to #4 · physics 1 · 2 owners · 1 writers … Every check passed". Name "Bo" → Bring it in → Play in 769 ms, with the toast "無界之地 run was never shared, so it is now a world of this device." (`b-01`, `b-02`) | pass |
| 5 | Adopted: a new world id, no `owner.add` carried over | New world **`hjm7q4foskbj33yjm2f6232dfo4thstchzxyr3ib5kvjxj2bhj52q`** (the file's was `hl6m3ulx…`). Its genesis author is B's key `kfbjfoya…`; owners = {B} only. Log: genesis, profile, witness, profile "Bo", all re-signed by B, **no `owner.add`**. The file's history is kept beside it as `histories/hl6m3ulx…` (4 entries with the `owner.add`), listed in World files without "You own it" (`b-disk-after-import.txt`, `b-03`) | pass |
| 6 | The save is pinned to 1.2.0 and physics 1 | `instance.json`: cartridge `aether-land@1.2.0 sha256:d40a3f25…`, `runtimePin.cartridge` 1.2.0, `runtimePin.physicsVersion` **1**; `save.json` `runtimePin.physicsVersion` 1 | pass |
| 7 | `world.json` pin with `migrated: null` | `{"v":1,"worldId":"hjm7q4fo…","migrated":null}` | pass |
| 8 | An empty `progress.json` | `{"v":1,"worldId":"hjm7q4fo…","errands":{},"episodes":{},"places":{}}` | pass |
| 9 | The exporter-made genesis pack is reproducible | B's export of the adopted world has `genesisPack` **`sha256:3b66964b…`**, the same hash A's export carried. `verify-world b2-adopted.world`: OK, owners 1 (`verify-b2-adopted.txt`) | pass |
| 10 | The known gap (`import-physics-pin`) | Not hit: world physics 1 = build physics 1, and `createInstance` stamped 1 | not reached (as expected) |

### Model use

`openai · gpt-5.4-mini`: 1 call, A's origin witness (3,332 + 1,142 tokens, 2,816 cached,
7,326 ms). B made 0 calls: the import drew the land from the history. No picture was drawn.

## Not run

- **A `.world` pinned to another physics that this build still supports.** That is the
  `import-physics-pin` path, and this build supports only physics 1, so no such file can be made
  yet.
- **A `.world` plus a `.spire-backup` of the same world** (the reuse path of `saveFor`).

## Found here

1. **English plurals.** The report says "1 entries, up to #1", "1 owners · 1 writers" and "1
   problems — …" (`a-01`). It is the same `bundle.ts` gap noted in p4-rehost; that file is outside
   this run's fix list.
2. **After adoption, World files lists two worlds with the same name.** One is the adopted copy
   ("You own it"), the other the file's history kept beside it. Only that line tells them apart
   (`b-03`).
3. **The adopted log names B after the exporter first.** Adoption re-signs every entry, so B's
   history says B was first named "player-UZC9" (A's profile, now B's) and then "Bo". This is how
   `adopt.ts` carries a profile; it is recorded, not changed.

## Files

- `run.json` and `run-NN-*.json`: the steps.
- `a-*.jpg` (A), `b-*.jpg` (B): screenshots.
- `physics99.ts.txt`, `throwaway-key.ts.txt`: the scripts.
- `physics99.world`, `a2-120.world` (A's export), `b2-adopted.world` (B's re-export): the files.
  `verify-*.txt` hold their `verify-world` outputs.
- `b-disk-after-import.txt`: B's histories, instance pin, `world.json`, `progress.json` and blobs,
  read from disk after the run.
