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
