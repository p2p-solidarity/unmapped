# E2E · 2026-09-24 · ENSv2 lookups and cartridge names

Session change: ENS reads go through the ENSv2 Universal Resolver (Sepolia by default, mainnet
toggle), and every published cartridge can own `<cartridgeId>.<parent>.eth` on Sepolia ENSv2
(`bun run ens:setup`, Title → Cartridges). This run checks both halves: the chain side through a
full simulated setup, and the app side in the real window.

## Replay

On-chain half — simulates every transaction with `eth_simulateV1` on Sepolia, sends nothing, needs
no key (output: `dry-run.log`):

```bash
bun run ens:setup unwritten-e2e-20260924 --dry-run
```

App half — the three `UNWRITTEN_ENS_*` values are the dry run's output (a parent that is not
registered on chain), and the key is deliberately empty so nothing can be written:

```bash
mkdir -p "$TMPDIR/ud-e2e"   # must be empty: the run expects a fresh title menu
UNWRITTEN_ENS_PARENT=unwritten-e2e-20260924.eth \
UNWRITTEN_ENS_REGISTRY=0x6755B66a5e29C1F5070F1912CcEf95EC32Efa45D \
UNWRITTEN_ENS_RESOLVER=0xa62F4061BAD21e1dDe43697fAeD7bc97e0Dd1144 \
UNWRITTEN_PRIVATE_KEY= \
AETHER_TEST_USER_DATA="$TMPDIR/ud-e2e" bun run dev --remoteDebuggingPort 9333   # background
bun scripts/cdp-drive.ts "$(cat docs/e2e/2026-09-24-ensv2-cartridge-names/run.json)"   # repo root
```

Environment: macOS, dev build, empty userData, UI language zh-TW (system default, so `clickText`
uses 新遊戲 / 開始 / 主控台 / 查詢 / 主網 / 卡帶), inference preset `openai · gpt-5.4-mini` from
`.env` (New Game starts a witness in the background; this run does not wait for or judge it).
Public RPCs: `ethereum-sepolia-rpc.publicnode.com`, `ethereum-rpc.publicnode.com`.

## Checked — chain (dry run)

| Step | Expected | Observed |
| --- | --- | --- |
| Live deployment guard | Universal Resolver root and `.eth` registry match `ENSV2_SEPOLIA` | passed (no redeploy message) |
| Resolver + registry proxies | two `ProxyDeployed` events | both deployed (simulated) |
| Parent registration | commit → wait `MIN_COMMITMENT_AGE` → register via ETH Registrar | price 8.000021 MockUSDC / 365 days; waited 62 s of chain time; registered |
| Cartridge subname | `register` in our User Registry + one `multicall` of three `setText` | `dry-run-cartridge.unwritten-e2e-20260924.eth` registered, records written |
| What the app checks before writing | registry `getState` = registered (2) by our key; resolver returns `unwritten.cartridge` | `status 2`, owner = the simulated key, `unwritten.cartridge = dry-run-cartridge` |
| Resolution | Universal Resolver walks the ENSv2 tree to our resolver | `unwritten.hash = sha256:abab…ab` via resolver `0xa62F…1144` |

## Checked — app (`run.json`, 38 s)

| Step | Expected | Observed |
| --- | --- | --- |
| New Game | seed `ENSV2E2E` normalised, land opens | field `ENSV-2E2E`; play screen with the console button |
| F12 · Sepolia · ENSv2 (default) | `nick.eth` resolves through ENSv2 | address `0xb8c2C29ee19D8307cb7255e1Cd9CbDE883A267d5`, no `aether.seed` (`01-console-sepolia-ensv2.jpg`) |
| F12 · Mainnet toggle | choice persisted; CCIP-Read works inside the renderer's CSP | `aether.ensNetwork = mainnet`; `test.offchaindemo.eth` → `0x779981590E7Ccc0CFAe8040Ce7151324747cDb97`, the readiness page's expected value (`02-console-mainnet-ccip.jpg`) |
| Cartridges · name line | the base cartridge's name read live, read-only without a key | `ENS aether-land.unwritten-e2e-20260924.eth · 尚未認領` and `唯讀：這台機器沒有簽署金鑰。`, no claim button (`03-cartridge-name.jpg`) |
| Cartridges · Open by ENS name | a real name without cartridge records is not treated as one | `nick.eth` → `這個名稱沒有指向任何卡帶。` (`04-open-by-ens-name.jpg`) |
| Health | no renderer errors | `[renderer:ERR]` lines in the dev log: 0 |

## Not verified

- Real transactions: `bun run ens:setup <label>` without `--dry-run` and the in-app "claim" both
  need a funded Sepolia key; none was used. The dry run exercises the same call builders
  (`src/main/chain/ensCalls.ts`) the app sends, but not `wallet.sendTransaction` itself.
- "Open by ENS name → 開始玩": no cartridge name exists on chain yet, so the matched-revision branch
  has not been seen in the window.
- The first `run.json` attempt selected the cartridge with ArrowDown before the library had
  loaded and captured the save's detail instead; the step now clicks the cartridge row after a
  4 s wait, and the run above is the clean replay.

## Isolated tests

`tests/chain/ensNames.test.ts` guards only what E2E cannot reach (Rule 0): the on-chain label a
cartridge id encodes to, and untrusted chain records that must not become a pointer.
