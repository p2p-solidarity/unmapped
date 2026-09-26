# E2E · rev 6 phase 3 · `physics` (D18)

`world-probe.ts` attaches a genesis pinned to physics 2 to a real world service, which must refuse
it `physics-newer`. A `.spire-backup` pinned to physics 2 must be refused on import by the app.

## Replay

```bash
SCR=<the migrate run's scratch dir>; D=docs/e2e/milestone-rev6-p3-physics; F="$SCR/physics/files"
UNMAPPED_SERVICE_TEST=1 bun run service -- --port 8800 --data "$SCR/physics/svc" &      # background
bun run world:probe -- --service ws://127.0.0.1:8800 physics                            # = probe.out.txt
mkdir -p "$F" "$SCR/physics/udP"
bun --tsconfig-override tsconfig.node.json $D/craft-physics2.ts.txt "$SCR/backup/files/b1.spire-backup" "$F"
echo '{"kind":"llamacpp","baseUrl":"http://127.0.0.1:8859/v1","model":"none","apiKeyEnv":null,"sidecar":null}' \
  > "$SCR/physics/udP/inference.json"
cp "$F/genesis2.spire-backup" "$F/io.spire-backup"
AETHER_TEST_BACKUP_PATH="$F/io.spire-backup" OPENAI_API_KEY= THESYS_API_KEY= \
  AETHER_TEST_USER_DATA="$SCR/physics/udP" bun run dev --remoteDebuggingPort 9352 &
CDP_PORT=9352 bun scripts/cdp-drive.ts "$(cat $D/run.json)"   # copy pin2, then b1, onto io.spire-backup where it says so
kill $(lsof -tiTCP:8800 -sTCP:LISTEN)
```

The two crafted backups (`craft-physics2.ts.txt`) both start from the `backup` run's B1:
- **genesis2** sets `runtimePin.physicsVersion: 2` in `instance.json` and `save.json`. It replaces
  the history with a one-entry log: a genesis whose body is B1's with `physicsVersion: 2`, signed
  by a throwaway Ed25519 key (world `hqhslolh…vxva`). `world.json` is re-pinned to it, with
  `migrated: null` and no `progress.json`. This is what a physics-2 build's save would carry,
  reduced to its genesis.
- **pin2** sets only `runtimePin.physicsVersion: 2` and keeps B1's physics-1 history, so the
  restore's own pin check is exercised as well.

Build: main `51817a3` plus the uncommitted working tree of every session, with this session's
planner fix. Model: none (0 `[inference]` lines).

## What was checked

| Check (plan) | Observed | Verdict |
| --- | --- | --- |
| The service reproduces physics 1 only | `GET /v1/health`: `{"version":"unmapped-service/1","protocol":2,"physics":[1],"worlds":0,"test":true}` | – |
| `world-probe.ts` attaches a genesis with physics 2: `physics-newer` | `physics` scenario, **6/6 steps ok**, exit 0 (`probe.out.txt`): attaching a fresh genesis pinned to physics 2 got `physics-newer` ("the service reproduces physics 1"); opening that world afterwards got `world-unknown` (it was not stored); attaching a physics-1 genesis got `opened:owner` (control); opening that world with `physics: [2]` got `physics-newer`; with `[1, 2]`, `opened:owner` (control); every frame the service sent read with `readFromService` (0 unreadable). The service data dir holds only the control world (genesis `physicsVersion: 1`, then its `sequencer`), and its log says `attached world hm6caxzp… (2 entries)` (`service.log.txt`) | pass |
| A backup pinned to physics 2 is refused on import | **genesis2**: Restore backup showed "This world was made with physics 2; this build has 1. — Update UNMAPPED to open it." The IPC result was `{"code":"physics-newer","message":"This world was made with physics 2; this build has 1.","hint":"Update UNMAPPED to open it."}`, from the history check in `readHistoryBackup` at unpack. Afterwards `instances/` was empty and there was no `histories/` (`b-00`). **pin2**: the same `physics-newer` result, from `verifyRuntimePin` in the restore, which runs before any history is written; `instances/` was still empty and there was still no `histories/` (`b-01`) | pass |
| Control: the same import path accepts physics 1 | Restoring B1 on the same userData: "Restored 無界之地 · 23QC-6PQS", with `instances/23qc-6pqs-mucdvy80` and `histories/hivribsq…fwtoa` written (`b-02`) | pass |

Not run: attaching from the app to a service that lacks the world's physics. The plan's check is
the probe, which talks to the socket directly. The app sends `physics: [1]` on attach
(`main/histories/attach.ts`), and nothing in this build makes a physics-2 world to attach.
