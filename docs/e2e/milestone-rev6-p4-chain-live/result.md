# E2E · rev 6 phase 4 · D6 light chain, live on Ethereum Sepolia (`p4-chain-live`)

This is the live follow-up to `milestone-rev6-p4-chain` (a dry run only). `WorldProvenance` was
deployed on Ethereum Sepolia. A world service in test mode then recorded a shared world's stream and
three beats with real transactions, and the desktop app's door read them back from the chain.

The user asked for this deploy. Gas was paid by the lineage operator key (`UNWRITTEN_PRIVATE_KEY`
in the repo's `.env`, address `0x8eECf2cD24664EB2275BFd74E324D9E0541b51C3`). That key was passed
only as `SERVICE_CHAIN_KEY`, and only to the deploy process and the service process. It is not in
any file here.

## Replay

`run.json` has the env, the model, the full command sequence and the part files
(`run-a-settings.json`, `run-b-newgame-share-record.json`, `run-c-door-after-beats.json`).

The deploy step is already done: a replay finds the code at the CREATE2 address and skips it. A
replay then opens a new stream for its own new world. That costs one `openStream`, plus one
`recordBeats` per beat, paid by the recorder key it is given.

Environment:
- macOS 27.0, Bun 1.3.6, Electron 44.3.0.
- A private snapshot of origin/main `12c29e7` (`git archive`), with node_modules and .env
  symlinked, its own Vite cacheDir, and renderer port 5198. `main.log.txt` has no `page reload`
  line.
- Screenshots 2880 × 1674 px (the page at scale 2). UI switched to English in part A.
- Model: none answering. The HUD said "UNREACHABLE llamacpp · local" and "No model calls counted
  for this world yet." No model call was made.
- `ps eww` on Electron main (values masked):
  - `UNMAPPED_PROVENANCE_RPC_URL`, `_ADDRESS` and `_CHAIN_ID` were set.
  - `UNWRITTEN_PRIVATE_KEY` and `OPENAI_API_KEY` were empty.
  - There was no `SERVICE_*` variable.
- The service process had all four `SERVICE_CHAIN_*` / `SERVICE_PROVENANCE_ADDRESS` set.

## Transactions (all `status: success`; `receipts.json` read them back from the RPC)

| Step | Tx | Block | Gas used | Gas price (gwei) | Fee (ETH) |
| --- | --- | ---: | ---: | ---: | ---: |
| deploy `WorldProvenance` (CREATE2 via `0x4e59…956C`) | [`0x26b95de1…b88036`](https://sepolia.etherscan.io/tx/0x26b95de1a8d6a9f82c6cc043b42586feb013e5ef054d8065e140773566b88036) | 11,784,651 | 609,729 | 1.0826 | 0.000660097704807963 |
| `openStream` (the service, after beat 1) | [`0xd1a8e516…b417a0`](https://sepolia.etherscan.io/tx/0xd1a8e5165428d02a94a07115b144769206731d54ba557b8449c9d10108b417a0) | 11,784,679 | 98,464 | 1.0723 | 0.000105586892061696 |
| `recordBeats` · beat n=5, upTo 4 | [`0xd49e588a…d87917`](https://sepolia.etherscan.io/tx/0xd49e588a1d24c6dd96db3afeebf42fc24a68c2b3ec10c51d54d421fddfd87917) | 11,784,680 | 34,001 | 1.0077 | 0.000034263946121482 |
| `recordBeats` · beat n=6, upTo 5 | [`0xb314cea2…29124c`](https://sepolia.etherscan.io/tx/0xb314cea210d41f45051dc491cf2263e077ce5e0006a326a9ca2768146629124c) | 11,784,681 | 34,001 | 0.9299 | 0.000031618511202861 |
| `recordBeats` · beat n=7, upTo 6 | [`0xc3c14ec7…c8b49b`](https://sepolia.etherscan.io/tx/0xc3c14ec73cde2d9dee6e5c737bb7d51a0deac6212d6d7ba960eb5c16c4c8b49b) | 11,784,682 | 34,001 | 1.0460 | 0.000035565819556751 |
| **total (5 transactions)** | | | **810,196** | | **0.000867132873750753** |

- Contract: [`0xF625ec3c228e3BCE34977C0b7e97BD591291Ef02`](https://sepolia.etherscan.io/address/0xF625ec3c228e3BCE34977C0b7e97BD591291Ef02).
  - The block of the deploy has the timestamp 2026-09-26T07:09:00Z.
  - The address has 2,567 bytes of runtime code.
  - The address is the one the dry run predicted: CREATE2 over the committed
    `contracts/WorldProvenance.json` bytecode, salt `keccak256("unmapped.provenance:v1")`.
- The payer's balance went from 0.008221653728550632 to 0.007354520854799879 ETH, a difference
  of exactly the total fee. Its nonce went from 63 to 68.
- `streamOf(recorder, world)` after the run: `open: true`, `upTo: 6`,
  `openedBlock: 11,784,679`, `lastBlock: 11,784,682`.
- The `BeatRecorded.prevBlock` values were 0, then 11,784,680, then 11,784,681: each one links to
  the previous record.

## What was checked

| # | Expected | Observed | Verdict |
| --- | --- | --- | --- |
| 0 | `bun run provenance --dry-run` passes before anything is sent | 2 worlds made in memory, 4 beats each, all recomputed. Simulated gas: deploy 609,729; opens 98,464 / 98,476; a 4-beat catch-up batch 55,556; 2-beat passes 44,398 each. **5/5 refusals** fired. Signatures verified offline, and replays read `sequencer-sig-invalid`. Main's reader read "matches at 9 (4 beats walked back); a changed copy: differs at 3; one cut before the first beat: not synced" for both worlds (`provenance-dry-run.out.txt`, `provenance-dry-run-result.md`) | pass |
| 1 | `--deploy` deploys once, at the predicted address | The contract had no code before the deploy (checked at block 11,784,649). One transaction was sent: `deploy WorldProvenance 0x26b95de1…b88036 (609,729 gas)`. The script printed `SERVICE_PROVENANCE_ADDRESS=` / `UNMAPPED_PROVENANCE_ADDRESS=0xF625ec3c228e3BCE34977C0b7e97BD591291Ef02` and chain id 11155111 (`deploy.out.txt`) | pass |
| A | The service is set up in Settings | Test said "Reachable: unmapped-service/1, physics 1, 0 worlds kept. Health **16 ms**, greeting **19 ms**." The service key was `kexmkqnx…unx46q`, and it "runs in test mode" (`a-00`, `drive-a.out.txt`) | pass |
| B | New game, share, Record beats; with a chain set up and nothing recorded, the door says so | Play on `aether-land` 1.3.0, instance `utw3-x8qm-mui20hsx`, seed UTW3-X8QM. "Share on 127.0.0.1:8796" became "Shared on 127.0.0.1:8796 · Online" in **503 ms**. Service: `attached world houui35vqbxkwhgya6kia65ku62w4h5c7436b3vccgpgewmoln34a (3 entries)`. After "Record beats" the door read "Recording is now: Record beats.", then **"Not recorded on the chain."**. That is main's live read of Sepolia, before any stream existed. Head 4 (`b-00`, `drive-b.out.txt`) | pass |
| C1 | A beat never waits for the chain; the service opens the stream once, then records | Advance +7 d returned at once with beat n=5 (`advance.out.txt`). The service then logged `opened the stream` **12.7 s** after the beat's receipt time and `recorded 1 beats` **20.9 s** after it. For beats n=6 and n=7 (+7 d each, advanced only after the previous record landed), `recorded 1 beats` came **8.3 s** and **8.3 s** after the beat (`service.log.txt`) | pass |
| C2 | What is on chain equals the world's log | For upTo 4, 5 and 6, the on-chain `chain` equals the service log's `chain(upTo)` (3/3). The on-chain `fingerprint` equals the beat body's `fingerprint` (3/3). The app's `ud/histories/<world>/log.jsonl` has the same `chain` as the service's for **7/7** entries | pass |
| C3 | The door reads the chain and says the copy matches | The app held head 7, with beats upTo 4/5/6 (seasons 1/2/3). Opening the door showed, in the chain section: **"The chain matches your copy at entry 6."** (`c-00`). `window.seed.world.provenance(world)` took **300 ms** and returned `{status: "matches", upTo: 6}`, with one stream: recorder `0x8eecf2cd…51c3`, sequencer key `kexmkqnx…unx46q`, trust `verified`, and beats 4/5/6 each `matches`. "Check again" showed the same line | pass |
| D | A "differs" case | Not shown at the door; see "Differs" below. Main's live reader shows it on a copy of the app's log: "differs at 5", with beat 4 still `matches` and beats 5 and 6 `differs` (`differs.out.txt`) | pass (reader), door not reachable cheaply |
| E | Everything stopped | The service logged "world service: stopped (SIGTERM), snapshots written". Electron closed on CDP `Browser.close`. Afterwards `lsof -iTCP:<port> -sTCP:LISTEN` found nothing on 8796, 9342 or 5198, and `pgrep -f prov-live` found no process | pass |

## Differs

**Why the door cannot show "differs" cheaply.** `compareWithChain` (main) runs `verifyLog` on the
local copy before it compares anything. So a copy edited on disk is refused as a broken log and
never reads as "differs".

This run showed that refusal. One field was added to entry 3's body in a copy of the log. `compareWithChain` on
that copy returned `entry-rsig-unexpected` / "Entry 1 carries a receipt nobody pinned.". The edited
entry is the `sequencer` event that installs the service key, so no key is pinned for the receipts.

A copy that verifies but differs needs a validly signed fork of the world:
- by the owner's device key, which lives behind the OS keychain;
- or by the service key signing two histories.

Neither is cheap in an app run.

**What was run instead** (`differs-check.ts.txt`, run from the snapshot with
`bun --tsconfig-override tsconfig.node.json`). It read the live contract through main's own
`provenanceReader()`, `readStreams()` and `compareWithChain()`, over a byte-identical copy of the
app's log (sha256 `25bcd23d…732d8b`, 7 entries):

1. `compareWithChain(copy)` returned `matches` at 6, with beats 4/5/6 `matches`, in **287 ms**.
2. `compareWithChain(copy with entry 3 edited)` returned `entry-rsig-unexpected`.
3. main's `readStreams` on the live chain, then `compareProvenance` (the comparator
   `compareWithChain` calls) with `chain` changed from entry 5 on, returned **`differs` at 5**: 4
   `matches`, 5 `differs`, 6 `differs`.
4. The same, with the copy cut to 4 entries (before the first beat), returned `not-synced` at 4.

## Found on the way (verbatim)

1. Bun prints this line at exit of `bun run provenance`, `bun run service` and the differs script.
   The exit code is still 0.
   `Internal error: directory mismatch for directory "<repo>/tsconfig.node.json", fd 3. You don't need to do anything, but this indicates a bug.`
2. `main.log.txt`: `[apple-local] native-helper-start: spawn …/snap/native/afm-bridge/.build/debug/afm-bridge ENOENT`.
   The snapshot has no built Apple bridge, because `bunx electron-vite dev` skips
   `build-afm-bridge`. The provider shown was llama.cpp (unreachable). No model was needed.
3. The door's Continent section shows the known
   `Error · continent-world-attached · This world is shared through a world service, so it cannot also join a continent.`
   (`b-00`, `c-00`), as in `milestone-rev6-p4-chain`.

## Files

- Run files: `run.json`, `run-a-settings.json`, `run-b-newgame-share-record.json`,
  `run-c-door-after-beats.json`.
- Driver output: `drive-a.out.txt`, `drive-b.out.txt`, `drive-c.out.txt`.
- Script output: `deploy.out.txt` (the deploy's console output), `provenance-dry-run.out.txt` and
  `provenance-dry-run-result.md` (the dry run), `advance.out.txt` (the three `/v1/test/advance`
  replies).
- On-chain data: `receipts.json`, every receipt and decoded event, read back from the RPC.
- Logs: `service.log.txt`, the service's log with the stream and record tx hashes;
  `main.log.txt`, the app's log.
- The differs check: `differs-check.ts.txt` (the script) and `differs.out.txt` (its output).
- Screenshots: `a-00-settings-service`, `b-00-door-recording`, `c-00-door-chain-matches`.
- Scratch paths are shown as `$SCR` / `$SCRATCH`, and the repo root as `<repo>`.
