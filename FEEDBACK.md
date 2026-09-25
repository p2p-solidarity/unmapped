# Feedback for Uniswap

From the team behind **UNMAPPED / 無界之地**, written after building a market on the Uniswap
stack for ETHGlobal Tokyo 2026. Everything below happened to us; times are rough.

## What we built, in three lines

Players make game worlds with AI, and remix each other's worlds. Every world gets a token.
A remix's token is sold in a **Continuous Clearing Auction (CCA)** priced in its parent world's
token, then graduates into a **v4 pool** whose **hook** takes 1% of each swap and pays it up the
family tree (50 / 30 / 20 across generations) to whoever holds each world's ENS name.

| Our contract | The Uniswap part it uses |
| --- | --- |
| [`LineageRegistry.sol`](contracts/src/lineage/LineageRegistry.sol) — `launch` (line 143), `_startAuction` (lines 244–282), `graduate` (line 196) | Liquidity Launcher `LBPStrategy` v3.1.0 and the CCA factory v2.1.0, as deployed on Sepolia |
| [`LineageHook.sol`](contracts/src/lineage/LineageHook.sol) — permissions (line 63), `_beforeInitialize` (line 96), `_afterSwap` (line 104), `claim` (line 83) | v4 hooks: `beforeInitialize`, `afterSwap`, `afterSwapReturnDelta` |
| [`LineageRouter.sol`](contracts/src/lineage/LineageRouter.sol) | v4 `unlock`: buy or sell along a whole family line in one call |
| [`LaunchTypes.sol`](contracts/src/lineage/LaunchTypes.sol) | the launcher and CCA structs, copied by hand |

Deployed on Sepolia on 2026-09-26: registry `0x439F5982163D4D4AbA6FAB2bF494d866bD2B5237`, hook
`0x0f1167F421fD246c5C78cF88a26f225cb3336044`, router `0x57C5Ea5F82a132c6F2f8FF42133c354027A1609C`.
The full dry run (three generations of launch → auction → graduation → swaps → royalties) is in
[`docs/e2e/milestone-lineage-market/`](docs/e2e/milestone-lineage-market/result.md).

## What was great

- **We did not have to pick a price.** Without CCA we would have seeded a pool at a number we made
  up. The auction finds the price and LBPStrategy opens the v4 pool at it. For remixes, where nobody
  knows what a new world is worth, that is the whole point.
- **Graduation lands straight in a pool with our hook.** Auction → pool → royalties is one pipeline,
  not three systems glued together.
- **`afterSwapReturnDelta` made royalties simple.** The hook takes its 1% inside the swap and only
  records who is owed; paying out is a separate `claim`.
- **`unlock` made multi-hop easy.** Buying a grandchild world is three hops, and the tokens in the
  middle net to zero inside one unlock.
- **v4 tooling just worked.** `BaseHook` from the v4-periphery 1.0.3 npm package compiled with
  solc-js 0.8.37 (`evmVersion: cancun`, no `viaIR` needed). `StateView` read prices on Sepolia
  without surprises. Mining the hook address for flags `0x2044` took a few thousand to ~30,000
  CREATE2 tries, under a second in TypeScript.

## Where we got stuck

1. **Finding the addresses (~15 min).** The Liquidity Launcher docs overview lists no testnet
   addresses, and the CCA README's deployment table has no chain column, so we ran `eth_getCode` on
   Sepolia to see which factory versions exist there. The liquidity-launcher README does list
   LBPStrategy v3.1.0 for Sepolia; which PoolManager, PositionManager and CCA factory go with it we
   only learned by calling `poolManager()`, `positionManager()` and `initializerFactory()` on it.
2. **Deployed version ≠ repo HEAD, and no interface package (~20 min).** To read the right structs
   we had to check out the exact deployed commits (LBPStrategy v3.1.0 = `873cbb23`, CCA v2.1.0 =
   `7d7602d2`). There is no npm package with the launcher/CCA interfaces, so `MigratorParameters`,
   `PoolParameters`, `AuctionParameters`, `PositionDefinition` and `LiquidityAllocationBracket` are
   copied field by field in `LaunchTypes.sol`. Miss one field and `abi.decode` quietly reads a
   *different* auction. Nothing fails at compile time.
3. **What a hook must do to be accepted by LBPStrategy is only in the source.** The rules live in
   `MigratorParams.validateHook`: ERC-165 `IInitializerHook`, `authorized() == strategy`, and the
   `BEFORE_INITIALIZE` flag. We also couldn't inherit `InitializerHook`: its `_beforeInitialize` is
   not `virtual`, and we need an extra check (the pool must be world × parent token) plus
   `afterSwap`. So we re-implemented the interface ourselves.
4. **`initializeDistribution` doesn't return the auction address.** We need to store the auction
   address in the same transaction, so we recompute it from LBPStrategy's internal salt rule —
   `keccak256(abi.encode(salt, migrationParams))` → `factory.getAddress` — and double-check it by the
   token balance the auction holds.
5. **Prices and schedules in raw units, with rules we learned by failing.** Floor price and tick
   spacing are Q96 raw-currency-per-raw-token; the floor must be a multiple of the tick spacing
   (else `TickPriceNotAtBoundary`) and at least 2^32 + 1. `auctionStepsData` is packed
   `bytes8 = uint24 mps << 40 | uint40 blockDelta`, and Σ(mps × blocks) must be exactly 1e7 — so a
   one-step auction's length must divide 1e7. We wrote `auctionPrices()` (in
   `src/main/chain/lineageCalls.ts`) to turn "0.01 USDC per token" and decimals into Q96.
6. **ERC-20 bids go through Permit2, which the interface doesn't show.** `submitBid` pulls with
   `permit2TransferFrom`, so a bidder needs `token.approve(Permit2)` *and*
   `Permit2.approve(token, auction, amount, expiration)`. We found out by reading the source.
7. **Getting your money back after the auction.** Only bids priced above the final clearing price
   can use `exitBid`; partly filled or outbid ones need `exitPartiallyFilledBid` with checkpoint
   hints you compute yourself. For the demo we side-stepped it by bidding with a high max price.
8. **A failed graduation looks like a success.** `migrate()` catches the error, emits
   `MigrationFailed` and refunds — the transaction itself succeeds. Not a bug, but easy to misread as
   "the pool is open", so our scripts always check for `Migrated` in the logs.
9. **Where the leftovers go.** The full-range position NFT goes to `positionRecipient` (for us the
   registry, where it is now locked), and collecting its fees needs your own PositionManager
   actions. Unused LP reserve and the non-LP part of what was raised go to `recipient`. With a single
   bidder the price stayed at the floor and ~450,000 of the 500,000 reserved tokens came back.

Not tested yet, so no feedback: auctions with many bidders moving the price, a real
`MigrationFailed`, and exact-output swaps through the hook.

## Suggestions for CCA

Short version: make a correct auction as easy to set up as it is to explain.

1. **One address table per release**, chain × contract, testnets included, saying which CCA factory
   each LBPStrategy uses. (Fixes stuck point 1.)
2. **An npm (and Foundry) package of interfaces for every release**, pinned to the deployed commit:
   structs, events, ABIs. Nobody should hand-copy a struct whose field order decides which auction
   you get. (2)
3. **Write down what a hook needs for LBP migration**, and make `InitializerHook._beforeInitialize`
   `virtual` so a hook can add its own checks and still inherit it. (3)
4. **Return the auction address from `initializeDistribution`.** (4)
5. **A price and schedule helper**, in the SDK and in the docs: "X currency per token" + decimals →
   a valid floor and tick spacing already on a boundary; an auction length → `auctionStepsData` that
   sums to exactly 1e7 (using a second step when the length doesn't divide it). Errors in words, not
   only a revert selector. (5)
6. **Say "bids use Permit2" where `submitBid` is documented**, with the two approvals as a snippet. (6)
7. **A view that returns the checkpoint hints** for `exitPartiallyFilledBid`, so any UI can refund
   any bid. (7)
8. **Make graduation a state you can ask for** — e.g. `migrationStatus()` → pending / migrated /
   failed + reason — instead of only an event. (8)
9. **One diagram of where every token and every unit of currency goes** after the auction:
   sold, LP reserve, unused reserve, unsold, raised currency, the position NFT and what a contract
   `positionRecipient` must be able to do with it. (9)

Thank you — CCA plus v4 hooks gave us fair launch prices and royalties that follow a family tree,
which we could not have built in a weekend otherwise.
