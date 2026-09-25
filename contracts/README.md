# Contracts

`src/UnwrittenLedger.sol` — two ledgers on the identity the app already uses, the sha256 content
hash of an immutable revision (a cartridge, or an AI-written world):

- `publish(contentHash, parent, kind, uri)` — the fact ledger: who published which exact revision,
  what it was remixed from, and where the bytes can be fetched. One hash, one author, forever.
  Content itself never goes on chain; a downloader recomputes the hash and compares.
- `witness(contentHash, note)` — the para-ledger: what players say about a revision they have seen.
  Notes are anchored to a published hash, may contradict each other, and are never reconciled.

This is optional. With no chain configured the app plays, generates and saves exactly the same;
every screen says plainly when the ledger is not set up.

## Build and test

```bash
bun run contracts:build   # solc → contracts/UnwrittenLedger.json (committed artifact)
bunx vitest run tests/chain   # runs the contract in an in-process EVM
```

## Deploy (spends gas — run it yourself)

```bash
# .env
UNWRITTEN_RPC_URL=https://sepolia.base.org
UNWRITTEN_CHAIN_ID=84532
UNWRITTEN_PRIVATE_KEY=0x…      # main process only; never reaches the renderer

bun run contracts:deploy       # prints UNWRITTEN_LEDGER_ADDRESS=0x…
```

Put the printed address in `.env` as `UNWRITTEN_LEDGER_ADDRESS`. Reading provenance needs only the
RPC URL and the address; publishing also needs the key.

## Lineage market (`src/lineage/`, Ethereum Sepolia)

A world's ENS name hangs under its parent world's name (`mushroom.zelda.<label>.eth`); its token is
sold in a Uniswap Continuous Clearing Auction priced in the parent's token and graduates into a v4
pool whose hook pays a 1% royalty up the family line to whoever holds each name. Design and
decisions: `docs/plans/lineage-market.md`.

| File | Contract |
| --- | --- |
| `lineage/LineageRegistry.sol` | `launch` (ENS name + remix registry + token + CCA via LBPStrategy), records, `revise`, `graduate` |
| `lineage/LineageHook.sol` | v4 hook: only LBPStrategy opens world pools; `afterSwap` royalty 50 / 30 / 20 up the line; `claim` pays the name holder |
| `lineage/LineageRouter.sol` | exact-input `buy` / `sell` along the family line in one unlock |
| `lineage/WorldToken.sol` | fixed-supply ERC-20 |
| `lineage/LaunchTypes.sol`, `lineage/EnsTypes.sol` | the Uniswap launcher / CCA and ENSv2 layouts these call |

Uniswap v4 (PoolManager `0xE03A1074c86CFeDd5C142C4F04F1a1536e203543`), LBPStrategy v3.1.0
(`0x96641d91e223c766F45b19d09494F5925C3cE000`) and the CCA factory v2.1.0
(`0x000000001F26a0044BaA66024e7b6599c61963F8`) are Uniswap's own Sepolia deployments; the full list
is in `src/main/chain/lineageCalls.ts`.

Deployed on Sepolia under `unmapped.eth` (2026-09-26, `docs/e2e/milestone-lineage-market/`):

| Contract | Address |
| --- | --- |
| LineageRegistry | `0x439F5982163D4D4AbA6FAB2bF494d866bD2B5237` |
| LineageHook | `0x0f1167F421fD246c5C78cF88a26f225cb3336044` |
| LineageRouter | `0x57C5Ea5F82a132c6F2f8FF42133c354027A1609C` |
| root registry / resolver (made by the registry) | `0x6DE11Ad63229E1a2d269bAd0d1E6FBD5792f6aEb` / `0x3886fa704952a8B900B884b4A3C48dBD9696DEB7` |

```bash
bun run contracts:build                                    # also → contracts/LineageMarket.json
bun run lineage:market --dry-run                           # deploy + launch + auctions + swaps, simulated
UNWRITTEN_PRIVATE_KEY=0x… bun run lineage:market <label>   # real deploy (gas) under <label>.eth
```
