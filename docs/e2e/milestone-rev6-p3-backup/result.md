# E2E · rev 6 phase 3 · `backup` (D6, D7)

The migrated fixture world from the `migrate` run is exported as a `.spire-backup`, wiped from the
device and imported: the world, progress and history must come back. An import onto a history
that has diverged must keep both copies (`backup-history-diverged`). A restore on another userData,
which has another device key, must adopt: new world id, land intact, and the world writable there.
Both backup dialogs are answered by `AETHER_TEST_BACKUP_PATH` (`main/instances/backupDialog.ts`).

## Replay

```bash
SCR=<the migrate run's scratch dir>; D=docs/e2e/milestone-rev6-p3-backup; F="$SCR/backup/files"
mkdir -p "$SCR/backup/udA" "$SCR/backup/udB" "$SCR/backup/udC" "$F"
(cd "$SCR/migrate/ud" && cp -Rp blobs cartridges histories identity instances mods profiles \
  work-drafts work-plays works workspaces worlds "$SCR/backup/udA/")
DEAD='{"kind":"llamacpp","baseUrl":"http://127.0.0.1:8859/v1","model":"none","apiKeyEnv":null,"sidecar":null}'
for u in udA udB udC; do echo "$DEAD" > "$SCR/backup/$u/inference.json"; done
app() { AETHER_TEST_BACKUP_PATH="$F/io.spire-backup" OPENAI_API_KEY= THESYS_API_KEY= \
  AETHER_TEST_USER_DATA="$SCR/backup/$1" bun run dev --remoteDebuggingPort 9352 & }
drive() { CDP_PORT=9352 bun scripts/cdp-drive.ts "$(cat $D/$1)"; }
close() { CDP_PORT=9352 bun docs/e2e/milestone-rev6-p3-migrate/close-app.ts.txt; }
app udA; drive run.json            # cp "$F/io.spire-backup" "$F/b1.spire-backup" after the first export,
                                   # cp "$F/io.spire-backup" "$F/b2.spire-backup" after the second
close; W=hivribsqepe5ifl3nxixjesz3mxdw3wnataqtttfeldkeagqfwtoa
rm -rf "$SCR/backup/udA/instances/23qc-6pqs-mucdvy80" "$SCR/backup/udA/histories/$W" "$SCR/backup/udA/histories/index.json"
cp "$F/b1.spire-backup" "$F/io.spire-backup"; app udA
drive run-b-wipe-restore-diverge.json   # cp "$F/b2.spire-backup" "$F/io.spire-backup" before its last restore
close; cp "$F/b2.spire-backup" "$F/io.spire-backup"; app udB; drive run-c-other-device.json
close; cp "$F/b1.spire-backup" "$F/io.spire-backup"; app udC; drive run-d-after-ensure-fix.json
```

Build: main `51817a3` plus the uncommitted working tree of every session, with this session's
planner fix. Parts A–C ran before this session's one-line `ensure.ts` change and part D after it.
Model: none. Every userData points at a dead llama.cpp endpoint, and there were 0 `[inference]`
lines in all five app launches.

## What was checked

| Check (plan) | Observed | Verdict |
| --- | --- | --- |
| Export | Worlds → Saves → Backup save: "Exported to …/io.spire-backup". **B1** is 27,582 bytes and holds `instance.json`, the save (`save.json`, `karma.jsonl`, `lore.jsonl`, `notes.jsonl`, 16 files under `chunks/` for 4 chunks), `world.json`, `progress.json` and `history/log.jsonl` (**24 entries**). Its `world.json` and `progress.json` are byte-identical to the device's. Its log has the same JSON values; the bytes differ only because `event.id` sits first in the backup's key order. After note Y, **B2** holds 26 entries (n=25 `profile`, n=26 note Y) | pass |
| Export → wipe → import restores the world, progress and history | Wipe: the instance folder, the world's history folder and `histories/index.json` were removed, and Saves read empty (`b-00`). Restore backup → "Restored 無界之地 · 23QC-6PQS" (`b-01`). Against B1: the history has the same values, **24 lines**; `progress.json`, `world.json`, `karma.jsonl`, `lore.jsonl`, `notes.jsonl` and every chunk file are **identical**; `save.json` is identical except `updatedAt`; `index.json` was rebuilt (world → instance, owner). Resume → the same world `hivribsq…fwtoa`, `migrated: false`, `added: 0`, `adoptedFrom: null`, `lost: []`, 3 live chunks, and 1,1 still drawn from its frozen files (`b-02`) | pass |
| Import onto a diverged history keeps both copies (`backup-history-diverged`) | After the restore, the device wrote n=25 `profile` and n=26 note X, while B2 holds n=25 `profile` (another `at`) and n=26 note Y: neither log is a prefix of the other. Restoring B2 showed the `backup-history-diverged` notice: "This device already holds another history of this world; both are kept." / "The backup's copy is kept aside, unmerged, as restored-2026-09-26T03-49-54-050Z.jsonl in histories/hivribsq…fwtoa/." (`b-03`). The device's `log.jsonl` is byte-identical to before (`cmp`). `restored-*.jsonl` has B2's 26 entries (same JSON values). The instance id was taken, so the save came back under `23qc-6pqs-mucdvy80-rmuhupq82`, pinned to the same world | pass |
| Restore on another userData adopts: new world id | On udB (fresh; its own device key), restoring B2 and choosing Resume showed "This world was made on another device; this device now keeps its own copy of it." New world **`h6fiddyb…xoa`**, owner `ke6zekbh…` (B's key), `adoptedFrom: hivribsq…fwtoa`, and the genesis `from: {instanceId: 23qc-6pqs-mucdvy80, world: hivribsq…, head: {n: 26, chain: sha256:774628bf…}}`. The old history folder stays next to it, value-identical to B2 (`c-00`, `c-00b`, `c-01`) | pass |
| …land intact | The adopted log re-signs B2's 26 entries except its beat (by design: a beat binds the old chain), then adds a fresh local beat (n=26) and B's profile (n=27). Kinds match the old log: witness 3, note 5, place 2 (p1, p2), story.more 1, chapter 4, deed 5, visit 1, genesis 1, profile 3 + 1. `ignored: 0`, `lost: []`. `progress.json` was re-keyed to the new witness ids (3 errands, same stages; places p1 and p2 unchanged). The 3 skips carry over, and 1,1 is drawn as "Kept on this device only" | pass |
| …witnessing works | **Not run with a model**: this flow was to make no model call. Instead, B wrote to the adopted world: its note n=28 is signed by `ke6zekbh…` and admitted (`c-02`). On the unwritten chunk 1,2, the only thing stopping a witness is "The model is not reachable, so new land stays unwritten." — no membership or ownership error (`c-03`) | partial |
| After the `ensure.ts` change (part D) | On udC (fresh), restoring B1 still adopts: world `hswiijwy…6q`, owner `ksrelprr…`, `adoptedFrom: hivribsq…`, `lost: []`, 3 chunks, `ignored: 0` (`d-00`). On udA (the owner), `world.ensure` of both `23qc-6pqs-mucdvy80` and `…-rmuhupq82` returned `adoptedFrom: null`, `added: 0`, head 26: the owner's device never adopts | pass |
