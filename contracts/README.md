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

One ENSv2 name tree under `unmapped.eth`, names first. A cartridge revision is
`<cartridge>.unmapped.eth`; a remix hangs under its parent's name (`moss-hollow.aether-land.…`); a
player's save is `<save>.<cartridge>.unmapped.eth`, held by the player's PasskeyAccount. Launching a
cartridge's name puts it on the market: its token is sold in a Uniswap Continuous Clearing Auction
priced in the parent's token and graduates into a v4 pool whose hook pays a 1% royalty up the family
line to whoever holds each name. Design and decisions: `docs/plans/lineage-market.md`.

| File | Contract |
| --- | --- |
| `lineage/LineageRegistry.sol` | `register` (a cartridge's name + its children's registry), `recordSave` / `updateSave` (a save held by its caller), `launch` / `registerAndLaunch` (token + CCA via LBPStrategy), `revise`, `graduate` |
| `lineage/LineageHook.sol` | v4 hook: only LBPStrategy opens world pools; `afterSwap` royalty 50 / 30 / 20 up the line; `claim` pays the name holder |
| `lineage/LineageRouter.sol` | exact-input `buy` / `sell` along the family line in one unlock |
| `lineage/PasskeyAccount.sol` | a passkey-owned account (OpenZeppelin WebAuthn, EIP-7951 P-256 precompile) and its CREATE2 factory |
| `lineage/WorldToken.sol` | fixed-supply ERC-20 |
| `lineage/LaunchTypes.sol`, `lineage/EnsTypes.sol` | the Uniswap launcher / CCA and ENSv2 layouts these call |

Uniswap v4 (PoolManager `0xE03A1074c86CFeDd5C142C4F04F1a1536e203543`), LBPStrategy v3.1.0
(`0x96641d91e223c766F45b19d09494F5925C3cE000`) and the CCA factory v2.1.0
(`0x000000001F26a0044BaA66024e7b6599c61963F8`) are Uniswap's own Sepolia deployments; the full list
is in `src/main/chain/lineageCalls.ts`.

Deployed on Sepolia under `unmapped.eth` (v2, 2026-09-26, block 11,781,460;
`docs/e2e/milestone-lineage-names/`). The v1 registry `0x439F…5237` from the first deploy still exists
but `unmapped.eth` no longer points at its tree.

| Contract | Address |
| --- | --- |
| LineageRegistry | `0xda8051e3e2855C125AAd6050f97Ea64cf203dAf6` |
| LineageHook | `0x59FA49D974B4564Eade17EDDC4a3CCf8D819a044` |
| LineageRouter | `0x2201fBDB7f17BD687d8965B9Dc2Ae000689039BE` |
| root registry / resolver (made by the registry) | `0x11E97A5ea6a127F2Fb6050A3FeDbB25f20B14491` / `0x36bEafe8E54eAA2B1c6Aa31750bA51A8B1e2876c` |
| PasskeyAccountFactory (players' passkey accounts) | `0x7B8b8E17590cC85c315d459feD8fC9384C2c9bE5` |
| Player names | `<you>.players.unmapped.eth`: a `recordSave` under the directory `players.unmapped.eth`, which the operator registers once (`bun run lineage:demo players`) |
| Gas station key (pays for players; `src/relay`) | `0xB62Ccd1A90896911b21546a60eC78E934f9fFd3D` |

Where to look (line numbers are the deployed source):

| What | Code |
| --- | --- |
| Names first: a cartridge's ENSv2 name + its children's registry | [`LineageRegistry.register`](src/lineage/LineageRegistry.sol#L188), [`revise`](src/lineage/LineageRegistry.sol#L207), [`_newRegistry`](src/lineage/LineageRegistry.sol#L444) (emancipated: `REGISTRAR \| SET_PARENT` only, [L98](src/lineage/LineageRegistry.sol#L98)) |
| A save held by the player's passkey account | [`recordSave`](src/lineage/LineageRegistry.sol#L215), [`updateSave`](src/lineage/LineageRegistry.sol#L229), [`_writeSave`](src/lineage/LineageRegistry.sol#L424), [`holderOf`](src/lineage/LineageRegistry.sol#L271) |
| Launch: token + Uniswap CCA on an existing name | [`launch`](src/lineage/LineageRegistry.sol#L249), [`registerAndLaunch`](src/lineage/LineageRegistry.sol#L255), [`_launch`](src/lineage/LineageRegistry.sol#L322), [`_startAuction`](src/lineage/LineageRegistry.sol#L348) (LBPStrategy.initializeDistribution [L386](src/lineage/LineageRegistry.sol#L386), CCA address check [L392](src/lineage/LineageRegistry.sol#L392)) |
| Graduation into the v4 pool | [`LineageRegistry.graduate`](src/lineage/LineageRegistry.sol#L260) → LBPStrategy.migrate |
| v4 hook: permissions, lineage guard, royalty | [`getHookPermissions`](src/lineage/LineageHook.sol#L63), [`_beforeInitialize`](src/lineage/LineageHook.sol#L96), [`_afterSwap`](src/lineage/LineageHook.sol#L104), [`_split`](src/lineage/LineageHook.sol#L122) (50 / 30 / 20), [`claim`](src/lineage/LineageHook.sol#L83) (pays the ENS holder via [`ownerOf`](src/lineage/LineageRegistry.sol#L278)) |
| Multi-hop along the family line | [`LineageRouter.buy`](src/lineage/LineageRouter.sol#L48), [`sell`](src/lineage/LineageRouter.sol#L59), [`unlockCallback`](src/lineage/LineageRouter.sol#L68) |
| Passkey accounts (no wallet) | [`PasskeyAccount.digest`](src/lineage/PasskeyAccount.sol#L49), [`execute`](src/lineage/PasskeyAccount.sol#L53) (OpenZeppelin WebAuthn → P-256 precompile), [`PasskeyAccountFactory.execute`](src/lineage/PasskeyAccount.sol#L92) |
| Liquidity Launcher / CCA layouts we encode | [`LaunchTypes.sol`](src/lineage/LaunchTypes.sol) (liquidity-launcher v3.1.0, CCA v2.1.0) |

```bash
bun run contracts:build                                    # also → contracts/LineageMarket.json
bun run lineage:market --dry-run                           # deploy + names + saves + auctions + swaps, simulated
UNWRITTEN_PRIVATE_KEY=0x… bun run lineage:market <label>   # real deploy (gas) under <label>.eth
bun run relay:key && bun run relay:deploy                  # the gas station (Cloudflare Worker, src/relay)
```

## Light chain (`src/provenance/WorldProvenance.sol`, Ethereum Sepolia)

Where a shared world began and what each of its beats said: a world service opens one stream per
world it sequences (`openStream`) and records each beat's `upTo`, `chain(upTo)` and fingerprint
(`recordBeats`). Only hashes go on chain; the Ed25519 signatures are checked offline. The service
signs and pays (`SERVICE_CHAIN_*`, `SERVICE_PROVENANCE_ADDRESS`); the app only reads
(`UNMAPPED_PROVENANCE_*`). No owner, no constructor argument: it is deployed through the
deterministic CREATE2 deployer (`0x4e59b44847b379578588920cA78FbF26c0B4956C`, salt
`keccak256("unmapped.provenance:v1")`), so the address follows from the committed
`WorldProvenance.json` bytecode alone.

Deployed on Sepolia 2026-09-26, block 11,784,651 (`docs/e2e/milestone-rev6-p4-chain-live/`).

| Contract | Address |
| --- | --- |
| WorldProvenance | `0xF625ec3c228e3BCE34977C0b7e97BD591291Ef02` |

```bash
bun run provenance --dry-run [--from <service data dir>]     # deploy + streams + beats + refusals, simulated
SERVICE_CHAIN_KEY=0x… bun run provenance --deploy            # real deploy (gas); skips if already there
```
