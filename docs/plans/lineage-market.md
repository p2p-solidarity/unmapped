# Lineage market — ENSv2 names the family tree, Uniswap prices it

Status (2026-09-26): v2 (names first) is deployed on Sepolia under `unmapped.eth` — addresses in
`contracts/README.md`. Worlds are named, launched, bid on, settled and traded from the app with a
passkey and a gas station (`docs/e2e/milestone-lineage-{names,relay,demo}`), and the names are in
the game itself (`docs/e2e/milestone-ens-in-game`). The v1 registry `0x439F…5237` still exists but
`unmapped.eth` no longer points at it.

## Product shape

Every published world can be **launched**. It gets an ENS name under its parent world's name, a
token, and a fair launch through a Uniswap Continuous Clearing Auction. A remix's name hangs under
the world it came from, and its token is priced in that world's token:

```
<label>.eth                              LineageRegistry's root registry
└─ zelda.<label>.eth        $ZELDA       auction and pool priced in MockUSDC
   └─ mushroom.zelda…       $MUSHROOM    priced in $ZELDA
      └─ night.mushroom…    $NIGHT       priced in $MUSHROOM
```

Buying `night` goes USDC → ZELDA → MUSHROOM → NIGHT, so every buy is also a buy of each ancestor.
Every hop pays a 1% royalty split up the line: 50% to the world, 30% to its parent and 20% to its
grandparent. It is paid to whoever holds each world's ENS name at claim time, so **the name is
the royalty right**. Names are emancipated ENSv2 tokens, so they change hands with a safe transfer.

Rule 13 still holds. Content never goes on chain: only the cartridge id, version, sha256 hash,
token and auction are written, as text records. Play never depends on any of this.

## Pieces

| Contract | Job |
| --- | --- |
| `LineageRegistry` | `launch()` does four things in one transaction: register the ENS name, make the world's remix registry, mint a `WorldToken`, and call `LBPStrategy.initializeDistribution`. It also writes the records, and offers `revise`/`describe` (only the name's holder may call them), `graduate`, and the views the hook and router need. |
| `LineageHook` | A v4 hook with an `InitializerHook`-compatible surface. `beforeInitialize` accepts only LBPStrategy, and only for a pool the registry recognises as world × parent currency. `afterSwap` + `afterSwapReturnDelta` take the royalty and credit it up the line. `claim()` pays the current name holder. |
| `LineageRouter` | Exact-input `buy`/`sell` along `pathTo(world)` in one `unlock`. The intermediate currencies net to zero, so only the first input is paid and the last output taken. |
| `WorldToken` | A fixed-supply ERC-20. Nothing can mint, burn, pause or tax it. |

Uniswap parts used as deployed on Sepolia: PoolManager, PositionManager, LBPStrategy v3.1.0, the
CCA factory v2.1.0, StateView and Permit2. Addresses are in `src/main/chain/lineageCalls.ts`, read
off the chain.

## Decisions and why

- **Emancipated names.** ENSv2 refuses a safe transfer while any root account holds
  `SET_SUBREGISTRY`, `SET_RESOLVER`, `UNREGISTER` or `UPGRADE`. So the registry makes each world's
  remix registry at launch and keeps only `REGISTRAR` and `SET_PARENT`. Nobody, the registry
  included, can repoint, take back or upgrade a world's name. The name holder gets only
  `CAN_TRANSFER_ADMIN`, so they cannot cut a branch out of the tree either.
- **A dedicated `<label>.eth`.** First-generation worlds live in the registry's own root registry,
  and the parent name points its subregistry there. (The older `ens:setup` parent was removed from
  the app and the scripts on 2026-09-26; one tree is easier to explain and to trust.)
- **CCA instead of seeding liquidity by hand.** The auction discovers the price, and LBPStrategy
  opens the v4 pool at it. Half of what is raised seeds the pool (`LP_SHARE_MPS`); the rest goes to
  the owner as launch revenue. A remix's auction takes bids in the parent's token.
- **The hook ignores `sender`.** Royalties go to worlds, not to traders, so the "`sender` is the
  router" problem does not arise, and any v4 router works. Ours only adds lineage paths.
- **Pull payments.** `afterSwap` only credits `owed[world][currency]`. Paying out happens in
  `claim`, to the name holder at that moment.
- **Launch is permissionless.** A label is first come, first served under its parent. That lineage
  is real is backed by the sha256 in the records, which anyone can check against the cartridge's
  `lineage.parent`.

## Names in the game (2026-09-26)

- **Found by cartridge id.** The app finds a revision's name from `NameRegistered` + `nameOf`, the
  earliest registered for that cartridge id, instead of re-deriving a label. So the first naming picks
  the label: a world called 霧之港 has the id `xn--9iq609e681a-…`, whose derived label
  `xn-9iq609e681a-…` no longer decodes; the player names it `misty-harbor` instead.
- **Players without a player kind.** The registry has no player kind, and a v3 deploy would reset
  the live market. The operator registers one cartridge-kind name, `players.<root>`
  (`bun run lineage:demo players`), and a player's own name is a `recordSave` under it, held by their
  PasskeyAccount, whose `unwritten.save` is the sha256 of the passkey's public key. Honest wart: its
  `unwritten.kind` says `save`; the app and the web view read the `players` branch as players.
- **A save's door in `description`.** A save name also carries its continent door number in the
  standard ENS `description` (`UNMAPPED save · door ABC234`), so a friend can walk in by name. The
  door comes from the save's instance id, which also tells two runs of a world apart when neither
  hash matches (a new run no longer offers to overwrite an older run's name).
- **Launch from the app.** The holder signs `launch(node, LAUNCH_TERMS)`; the gas station pays a
  launch alone in its batch under a 7M gas cap and `MAX_LAUNCH_FEE_GWEI` (default 5).

## Run it

```bash
bun run contracts:build                                     # → contracts/LineageMarket.json
bun run lineage:market --dry-run                            # everything, simulated, no key
UNWRITTEN_PRIVATE_KEY=0x… bun run lineage:market <label>    # real deploy; you run it (gas)
```

A live deploy prints `UNWRITTEN_LINEAGE_PARENT`, `_REGISTRY`, `_HOOK` and `_ROUTER`. The Sepolia gas
measured in the dry run:

| Step | Gas |
| --- | --- |
| Deploy: registry + hook + router + `setHook` | ≈ 6.6M |
| Register `<label>.eth` | ≈ 0.4M |
| Each world launch (token, CCA, remix registry, name, 5 records) | ≈ 5.7–5.8M |

## Known limits

- The full-range LP position minted to the registry is locked, and nothing collects its fees yet.
- The LP reserve the pool did not need, and unsold auction tokens, go to the owner. That is the
  usual LBP outcome, but it lets an owner sell into their own pool.
- Only single-bidder auctions, exact-input swaps and three generations have been exercised.

## Next

1. **A player kind in the registry** (`<label>.players.<root>` with `unwritten.kind = player` and an
   `addr` record, so it can be a primary name), in the next deploy.
2. **Explorer page** (the live link the ENS prize asks for). Type a name to see the tree, prices
   and auctions, and bid, buy or claim with a browser wallet.
3. **Collect LP fees** to the owner, if they turn out to matter.
4. Optional:
   - a CCA `IValidationHook` for bidders (for example, early access for holders of the parent)
   - wildcard version names (`v3.zelda.<label>.eth`)
