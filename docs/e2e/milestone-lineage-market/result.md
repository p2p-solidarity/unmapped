# E2E milestone · Lineage market (ENSv2 × Uniswap CCA and v4 hook)

Session change: `contracts/src/lineage/` — launching a world names it in ENSv2 under its parent
world's name, mints its token, and sells it in a Uniswap Continuous Clearing Auction priced in the
parent's token. When the auction graduates, it becomes a v4 pool whose hook pays a 1% royalty up
the family line to whoever holds each world's name. Design: `docs/plans/lineage-market.md`. This
run checks the whole chain side on Sepolia's real ENSv2 and Uniswap contracts. No app screen
changed, so nothing was driven in the window.

## Replay

Needs no key and sends nothing. Every call is replayed as simulated blocks (`eth_simulateV1`) on
the Sepolia block the run starts from. Output: `dry-run.log`.

```bash
bun run contracts:build            # the artifact under test; committed, rebuild only after edits
bun run lineage:market --dry-run   # a fresh <label>.eth each time
```

Environment: macOS, public RPC `ethereum-sepolia-rpc.publicnode.com`, artifact
`contracts/LineageMarket.json` as committed (a rebuild during this session was byte-identical).
Chain addresses: `run.json`.

## Checked

Each numbered failure is listed at the top of `scripts/lineage-market.ts`; the run throws if any
check does not hold.

| Step | Expected | Observed |
| --- | --- | --- |
| Deploy | registry makes its own resolver and root registry; hook address carries exactly beforeInitialize + afterSwap + afterSwapReturnDelta (2) | registry 4,084,941 gas; hook salt 23721 → `0x8C1a…2044` (1,351,265 gas); router 1,132,625 gas |
| Parent | `lineage-920654.eth` registered through the ETH Registrar, subregistry = the registry's root | 8.000021 MockUSDC / 365 days; commit → 62 s → register (235,064 gas) |
| Launch `zelda` (1) | CCA deployed by LBPStrategy exactly where the registry predicts; name + records written | 5,739,286 gas; auction holds the 500,000 auction supply (checked in-contract) |
| `zelda` auction → pool (1) | 1,000 MockUSDC bid at 10 ticks over a 0.01 floor fills; graduation emits `Migrated`, not `MigrationFailed`; hook maps the pool to the world | cleared at 0.009999 MockUSDC; filled 100,000 ZELDA; graduate 628,917 gas; hook ✓ |
| Launch `mushroom` under `zelda` (1, 5) | priced in ZELDA; Universal Resolver walks `mushroom.zelda.lineage-920654.eth` to the launched token | 5,820,630 gas; cleared at 0.1 ZELDA, filled 10,000; `unwritten.token` = the token, `unwritten.hash` = its sha256 |
| Buy `mushroom` with 10 MockUSDC (4) | two hops, 1% royalty on each hop's output; hop 2 split 30 / 70 between parent and world | got 3,260.384 MUSHROOM (357,052 gas); hop 1: zelda 9.775 ZELDA; hop 2: zelda 9.880 + mushroom 23.053 = 1/99 of what the buyer got |
| Claim `zelda` (4) | paid to the name's holder, exactly what was owed | 9.775 ZELDA (62,927 gas) |
| Emancipation (7) | the first-generation registry and `zelda`'s remix registry report `isEmancipated()` | both true |
| Hand `mushroom`'s name on (4, 7) | a *safe* ERC-1155 transfer goes through; the next claim pays the new holder and not the old one | transfer 88,407 gas; new holder got 23.053 MUSHROOM; old holder's balance unchanged |
| Sell 1,000 MUSHROOM (4) | back down the line into MockUSDC | got 5.4318 MockUSDC (350,945 gas) |
| Launch `night` under `mushroom`, buy with 10 MockUSDC (1, 4) | three hops; hop 3 split 20 / 30 / 50 across grandparent, parent, world | got 3,612.798 NIGHT (441,355 gas); zelda 7.299 + mushroom 10.948 + night 18.246 = 1/99 of what the buyer got; shares exact |
| Refusals (3, 6) | pool opened under the hook by anyone but LBPStrategy; `mushroom` paired with MockUSDC; revise by a non-holder; a second `zelda` | all four refused |
| Repo | `bun run check` | green three times in a row: 102 files / 430 tests |

## Found and fixed during the run

- The registry used `msg.sender` as its admin. Deployments go through the CREATE2 deployer, so
  that was the deployer contract, and `setHook` was refused. The admin is now a constructor
  argument.
- ENSv2 refused the safe transfer of a world's name (`TransferUnsafeUntilRegistryIsEmancipated`).
  The registry held `SET_SUBREGISTRY` and `SET_RESOLVER` at root in order to attach remix registries
  later. Now each world's remix registry is made at launch, and the registry keeps only `REGISTRAR`
  and `SET_PARENT`, neither of which is in `UNEMANCIPATED_ROLE_BITMAP`. First-generation worlds
  live in the registry's own root registry, which `<label>.eth` points at.
- Two dry-run executor fixes. Block-number gaps are now sent as explicit empty blocks; the node
  filled them itself, and viem's reply mapping broke. The simulation is also pinned to its start
  block, because the real chain overtook the simulated numbers mid-run.
- `build-contracts.mjs` compiling both contract sets pushed an existing artifact test past 5 s under
  load. The lineage build is now `scripts/build-lineage.mjs`; `contracts:build` runs both.

## Not verified

- **No real transaction.** `bun run lineage:market <label>` needs a funded Sepolia key; none was
  used. The dry run sends the same calldata, just not through `wallet.sendTransaction`.
- **The app does not launch or trade yet.** There is no IPC or screen for it. Cartridge names from
  `ens:setup` still use `claimCartridgeName` under their own parent.
- **Only one bidder per auction.** The clearing price never rose above the floor. A failed
  graduation (`MigrationFailed` → reserves recovered) and exact-output swaps (royalty on the input
  side) were not exercised.
- **Known limits, not bugs in this run:**
  - The full-range position minted to the registry cannot be withdrawn, and neither can its LP fees
    (nothing collects them).
  - The LP reserve the pool did not need goes to the world's owner: 449,999.99 ZELDA of the owner's
    549,999.99 in this run. Unsold auction tokens wait in the auction for the owner to call
    `sweepUnsoldTokens`; the run did not call it.
  - Anyone can launch, and a label is first come, first served under its parent.

## Isolated tests

None added. The seven failures in the script header (on-chain encoding, faked lineage, silent loss
of royalties, name/market disagreement, unauthorised revision, emancipation) are what Rule 0 lets an
isolated check guard. They run against Sepolia's real contracts in the dry run, not a mocked EVM.
