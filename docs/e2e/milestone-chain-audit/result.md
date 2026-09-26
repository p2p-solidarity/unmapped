# Chain audit — every chain part of UNMAPPED against live Ethereum Sepolia (2026-09-26)

Read-only. Nothing was signed and no transaction was sent: every read script builds a public client
and nothing else, both dry runs ran through `eth_simulateV1` with `UNWRITTEN_PRIVATE_KEY=` and
`SERVICE_CHAIN_KEY=` blanked, and the app ran with no passkey linked, `UNWRITTEN_SIGN_BROWSER=none`
and no key. A grep of every output file for the operator key and the OpenAI key found neither.

Contract reads are pinned to **block 11,785,145** (2026-09-26T08:48:00Z) unless a row says
otherwise; log queries run from the deployment block to that block. Replay: `run.json`.

Environment: macOS 27.0, Bun 1.3.6, Electron 44.3.0, viem 2.56.5 (its Sepolia Universal Resolver
is `0xeEeE…eEeE`). The app was a snapshot of origin/main `27e623d` (`git archive`, node_modules and
`.env` symlinked, its own Vite cacheDir and renderer port 5196), CDP 9346, a fresh userData. Model:
none — the OpenAI key was blanked and the provider switched to Ollama (nothing listens on 11434),
because another session's llama-server held 8080; no `usage.jsonl` was written.

## 1. World provenance (`WorldProvenance`)

World `houui35vqbxkwhgya6kia65ku62w4h5c7436b3vccgpgewmoln34a` and service key
`kexmkqnx…unx46q` from `milestone-rev6-p4-chain-live`; recorder `0x8eEC…51C3`.

| Checked | Observed | Block | Verdict |
| --- | --- | --- | --- |
| Code at `0xF625ec3c228e3BCE34977C0b7e97BD591291Ef02` | 2,567 bytes (the live run recorded 2,567) | 11,785,145 | pass |
| The address is the committed bytecode's CREATE2 address | the dry run computes `0xF625…Ef02` from `contracts/WorldProvenance.json` + salt `keccak256("unmapped.provenance:v1")` and says "already deployed on Sepolia: the run uses it" | — | pass |
| `idToBytes32(world)` / `keyToBytes32(service key)` | `0x75288df6…6ef8` / `0x25d8a836…bf3d` = the `StreamOpened` values in `receipts.json` | offline | pass |
| `recorders(world, key, 0, 64)` | `[0x8eECf2cD24664EB2275BFd74E324D9E0541b51C3]`, total 1 | 11,785,145 | pass |
| `streamOf(recorder, world)` | `open: true, upTo: 6, openedBlock: 11,784,679, lastBlock: 11,784,682` = result.md | 11,785,145 | pass |
| `StreamOpened` since deploy (all worlds) | exactly one: tx `0xd1a8e516…b417a0`, block 11,784,679, cartridgeHash `0x57f17e0d…e81b` (= aether-land 1.3.0), ownerKey `0x596cf2cf…6a56` | 11,784,651..11,785,145 | pass |
| `BeatRecorded` since deploy | three, exactly as `receipts.json`: upTo 4 chain `c7da5a02…77a6` fp `d81fb32f…6e01` prev 0 (block 11,784,680); upTo 5 chain `2bd28aa4…0c03` fp `7d8e96d6…a056` prev 11,784,680; upTo 6 chain `a9dc5298…d58e` fp `698ec55e…a3d3` prev 11,784,681 | 11,784,651..11,785,145 | pass |
| Fingerprints = the app's beats | `drive-c.out.txt` of the live run: `d81fb32f…`, `7d8e96d6…`, `698ec55e…` — equal (3/3) | — | pass |
| Main's own reader (`provenanceReader` + `readStreams`, as the door runs it) | 1 stream, beats 4/5/6 with the same chain and fingerprint values, 1,270 ms | latest | pass |
| Signatures verify offline from what the chain alone carries (`streamSignatures`) | `{genesis: true, sequencer: true}` | offline | pass |
| `bun run provenance --dry-run` | passes: 2 worlds in memory, 4 beats each, all recompute; opens 98,488 gas each, a 4-beat batch 55,592, 2-beat passes 44,386 / 44,410; **5/5 refusals** (StreamNotOpen, StreamAlreadyOpen, 3 × UpToNotRising); main's reader "matches at 9 … differs at 3 … not synced" for both | simulated on latest | pass |

Only the one world from the live run has a stream; no other world is recorded yet.

## 2. ENS (ENSv2 Sepolia)

Every name was read three ways: the registry (`nameOf`, `holderOf`), the Universal Resolver
(`getEnsResolver`, `getEnsText` for the eight `unwritten.*` keys and `description`, pinned), and the
app's own `lookupEnsName` (renderer, Universal Resolver, latest). The three agree for every name.
The list is the docs' names plus every `NameRegistered` the registry ever emitted — the same 10
names.

| Name | Holder (registry `holderOf`) | Records | Leads back to a hash the repo / E2E knows? |
| --- | --- | --- | --- |
| `unmapped.eth` | .eth registry `getState`: `latestOwner 0x8eEC…51C3` (operator), expiry 1,821,891,636 = 2027-09-25T17:00Z; subregistry `0x11E9…4491` = `registry.rootRegistry()`, resolver `0x36bE…876c` = `registry.resolver()` | none (`lookupEnsName` → null, as expected for the parent) | — |
| `players.unmapped.eth` | `0x8eEC…51C3` | cartridge `unmapped-players` v1, hash `sha256:475aafb6…82b8`, kind cartridge, description "Player names of UNMAPPED: …" | yes: the hash is sha256 of that description (recomputed) |
| `kidney.players.unmapped.eth` | `0xfBaB…8537` | kind save, save `sha256:25e9d79b…f6c9`, progress "UNMAPPED player" | E2E ens-players step 6 (tx `0x1ed6a310…5157`) |
| `aether-land.unmapped.eth` | `0x8eEC…51C3` | aether-land 1.3.0 `sha256:57f17e0d…e81b`, kind cartridge, token `0xa801…dbb6`, auction `0xab2d…6203` | **yes**: pinned in `tests/shared/cartridge-pack.test.ts` |
| `moss-hollow.aether-land.unmapped.eth` | `0x0E50…5c07` | moss-hollow 1.0.0 `sha256:86d407fb…3dcd`, kind cartridge, no token | name and id: lineage-names step 4; **the hash and the bytes are nowhere in the repo** (an E2E-only fixture) |
| `kidney-run.aether-land.unmapped.eth` | `0x0E50…5c07` | aether-land 1.3.0 `57f17e0d…`, save `sha256:1b593fec…f209`, "0 chapters cleared · 1 deed" | cartridge yes; the save hash is not in the E2E records (old fingerprint, as lineage-names says) |
| `first-light.aether-land.unmapped.eth` | `0xfBaB…8537` | aether-land 1.3.0, save `sha256:cf063883…4dbc`, "0 chapters cleared · 1 deed" | **yes**: lineage-names steps 9–11 (`cf063883…4dbc`; its first record `53c4df88…` is in the SaveRecorded log) |
| `misty-harbor.unmapped.eth` | `0xfBaB…8537` | `xn--9iq609e681a-3fec58` 1.0.0 `sha256:3733086e…97e2`, token `0x9552…8fd0`, auction `0x373c…1c1e` | name, token and launch tx: ens-in-game steps 4–5; **the hash and the bytes are nowhere in the repo** |
| `my-save.misty-harbor.unmapped.eth` | `0xfBaB…8537` | save `sha256:45cddf86…a2ef`, "2 chapters cleared · 17 deeds", description "UNMAPPED save · door GEC2AA" | progress and door GEC2AA = ens-in-game steps 8, 19; cartridge bytes not in the repo |
| `lantern-quay.aether-land.unmapped.eth` | `0xfBaB…8537` | lantern-quay 1.0.1 `sha256:7678d239…a558`, token `0x42eb…031d`, auction `0x5532…a01f` | name and launch: ens-in-game steps 11–14; **the hash and the bytes are nowhere in the repo** |
| `kidney-mui0pchb.aether-land.unmapped.eth` | `0xfBaB…8537` | aether-land 1.3.0, save `sha256:171feb3f…52c6`, "2 chapters cleared · 17 deeds", "door TRLVDV" | cartridge yes; progress and door = ens-players steps 9, 16 |

Other ENS facts (block 11,785,145): `registry.rootNode()` = `namehash("unmapped.eth")`
(`0xe6374192…6537`); `registry.rootDnsName()` = `unmapped.eth`; the root registry holds `players`,
`aether-land` (operator) and `misty-harbor` (`0xfBaB…8537`), each with expiry 2^64−1. No
`CartridgeRevised` events. `SaveRecorded` events: 8 (kidney-run 1, first-light 2, my-save 2,
kidney 1, kidney-mui0pchb 2).

**Every name the demo shows resolves, and the aether-land ones lead back to a revision the repo ships.**
The three E2E-made cartridges (`moss-hollow`, `misty-harbor`, `lantern-quay`) point at revisions
that exist only in those runs' deleted userData: "Open by ENS name" on `misty-harbor.unmapped.eth`
says `xn--9iq609e681a-3fec58@1.0.0 不在你的收藏裡。請匯入它的 .cartridge 檔，雜湊必須是 sha256:3733086e…97e2。`
(screenshot 08). All ten names in the tree are held by the operator (`aether-land`, `players`) or by two E2E passkey
accounts (`0xfBaB…8537`, `0x0E50…5c07`, both CDP virtual authenticators); the presenter's own
passkey holds none of them.

## 3. Uniswap: the lineage market

### 3a. Contracts (block 11,785,145)

| Checked | Observed | Verdict |
| --- | --- | --- |
| Code at README addresses | LineageRegistry `0xda80…dAf6` 20,595 B; LineageHook `0x59FA…a044` 5,937 B; LineageRouter `0x2201…39BE` 4,981 B; PasskeyAccountFactory `0x7B8b…9bE5` 1,696 B; root registry `0x11E9…4491` and resolver `0x36bE…876c` 77 B each (proxies); v1 registry / hook / router `0x439F…5237` / `0x0f11…6044` / `0x57C5…609C` still there | pass |
| Uniswap and ENS deployments the code names | PoolManager 24,009 B, PositionManager 23,877, StateView 3,531, Permit2 9,152, LBPStrategy v3.1.0 20,624, CCA factory v2.1.0 24,214, MockUSDC 4,309, ENSv2 root / .eth registry 16,000 each | pass |
| Registry wiring | `hook()` = the README hook; `lbpStrategy()` `0x9664…E000`; `auctionFactory()` `0x0000…63F8`; `rootCurrency()` MockUSDC; `ensFactory()` / `userRegistryImpl()` = `ENSV2_SEPOLIA` | pass |
| Hook wiring | `authorized()` = LBPStrategy; `registry()` = the registry; `poolManager()` = PoolManager; `ROYALTY_PIPS` 10,000 (1%); permissions beforeInitialize + afterSwap + afterSwapReturnDelta, and the address's low 14 bits are `0x2044` (exactly those flags) | pass |
| Router / factory | `router.poolManager()` and `router.registry()` correct; `factory.implementation()` `0x720e…5f2f` | pass |
| README line anchors (`contracts/README.md` "Where to look") | all 27 anchors land on the named function in `contracts/src/lineage/*.sol` | pass |

### 3b. Launched worlds (`WorldLaunched` since block 11,781,460: three)

The CCA v2.1.0 contracts have no `requiredCurrencyRaised()` getter (it reverts), so the launch
terms were decoded from each launch transaction (`chain-audit-launches.ts.txt`).

| World | Token | Launch (tx, gas, fee) | Auction | Pool (StateView) |
| --- | --- | --- | --- | --- |
| `aether-land.unmapped.eth` | AETHERLAND `0xA801…dBb6`, supply 1,000,000 | `0xe8637a01…10c2` by the operator, 5,872,109 gas, 0.00642 ETH; 500,000 LP reserve, 50 blocks, floor 0.009999 USDC, required 10 USDC | `0xAB2D…6203`, blocks 11,781,472–11,781,522: **ended, graduated**; 4 bids; clearing 0.018636 (floor 0.009999, +86%); raised 9,024.999999 USDC; tokens left in the auction 2.5e-11 | **open**: key USDC / AETHERLAND, fee 3,000, tickSpacing 60, **hooks = LineageHook**; `hook.worldOf(poolId)` = the token; liquidity 33,054,700,700,880,568; price 0.018719 USDC/AETHERLAND |
| `misty-harbor.unmapped.eth` | MISTYHARBOR `0x9552…8FD0` | `0x56f32d4c…89fa` by the station (passkey batch), 5,126,613 gas, 0.00538 ETH; 100 blocks, floor 0.009999 USDC, required 10 USDC | `0x373c…1C1e`, blocks 11,783,699–11,783,799: **ended, 0 bids, raised 0 < 10, not graduated**; 500,000 tokens still in the auction | none (sqrtPrice 0; the key names LineageHook) |
| `lantern-quay.aether-land.unmapped.eth` | LANTERNQUAY `0x42eb…031d`, priced in AETHERLAND | `0x2157511e…9df3` by the station, 5,153,739 gas, 0.00556 ETH; 100 blocks, floor 0.1 AETHERLAND, required 10 AETHERLAND | `0x5532…a01F`, blocks 11,783,802–11,783,902: **ended, 0 bids, raised 0, not graduated**; `pathTo` = [AETHERLAND, LANTERNQUAY] | none |

`bun run lineage:demo status --dry-run` printed the same (and "pool: not open yet (opens when the
auction is settled)" for the two failed auctions, which is not true for them — see Found).

### 3c. Royalty accounting

| Checked | Observed | Block | Verdict |
| --- | --- | --- | --- |
| v2 hook `Royalty` events | one: world AETHERLAND, 5.337878782605684768 AETHERLAND, tx `0x89794d10…9344` | 11,782,741 | — |
| The swap it came from (PoolManager `Swap` on the aether-land pool) | amount0 −10 USDC, amount1 +533.787878260568476887 AETHERLAND; royalty / output = 0.0099999999999999999984 (= `floor(output × 10,000 / 1,000,000)`, exactly 1%); the buyer got 528.449999477962792119 — relay step 8 says 528.45 / 5.338 | 11,782,741 | pass |
| v2 hook `Claimed` | 5.337878782605684768 AETHERLAND to `0x8eEC…51C3` (= `ownerOf(token)` = the name's holder), tx `0xa2efd93f…86bd` | 11,782,750 | pass |
| `owed(world, token)` / `owed(world, currency)`, all three worlds | 0 / 0 everywhere | 11,785,145 | pass (nothing unpaid) |
| v1 (milestone-lineage-demo) | swap `0x0aca30e5…d55f`: output 540.801414238352402925, royalty 5.408014142383524029 (1%), buyer 535.393400095968878896 = the demo's 535.393400 / 5.408014; claimed to `0x8eEC…51C3` in `0x3161c788…d819`. A second v1 swap (relay round 1, 5 USDC): 269.51 output, 2.695119 royalty (1%), claimed in `0xe9101e71…74e1` | 11,781,124 / 11,781,386 | pass |
| 50 / 30 / 20 | never exercised on chain: every real swap was on a first-generation world, so 100% of the 1% went to it (as the docs say). `bun run lineage:market --dry-run` today: hop 2 zelda 9.879952624527248341 + mushroom 23.053222790563579465 (30 / 70); hop 3 zelda 4.632559943350609076 + mushroom 6.948839915025913614 + night 11.581399858376522692 = 0.2000 / 0.3000 / 0.5000 of the total (exact to 1e-19) | simulated | pass (simulation) |

### 3d. `bun run lineage:market --dry-run`

Confirmed first that `--dry-run` selects `dryExec` (`scripts/lib/chainExec.ts`: `simulateBlocks` on
a pinned Sepolia block, a throwaway account with a state-override balance) and that no other path
sends. **Passed**: deploy (registry 4,939,665 / hook 1,351,265 / router 1,132,625 / factory
1,958,279 simulated gas), parent `lineage-646332.eth` registered through the ETH registrar, zelda →
mushroom → night launched, bid, settled and graduated, buys along the line (10 USDC → 3,260.384
MUSHROOM; 10 USDC → 2,293.117 NIGHT), name hand-over (the new holder gets 23.053 MUSHROOM, the old
one nothing), 3 passkey refusals, names and saves (atlas, globe.atlas, kidney.zelda) with 4
refusals, 4 final refusals, "Dry run passed — nothing was sent." (`lineage-market-dry-run.out.txt`).

## 4. Gas station

| Checked | Observed | Verdict |
| --- | --- | --- |
| `GET https://unmapped-relay.gimmychang.workers.dev/status` (08:51:32Z) | HTTP 200 `{"ok":true,"chainId":11155111,"relayer":"0xB62Ccd1A90896911b21546a60eC78E934f9fFd3D","balanceWei":"31752774978495655"}` — it holds its key. `/status` carries **no version field** | pass |
| Deployed version (`wrangler deployments list`, read-only) | `f539261a-adf3-4c19-afe7-4a22ca370786`, 2026-09-26T06:23:37Z (the redeploy of milestone-ens-players step 1); `src/relay`, `src/shared/relay.ts` and `web/lineage-relay` last changed on origin/main at 04:37Z (`4a8e71e`), so it carries this build's rules | pass |
| A browser `Origin` is refused | `GET /status` with `Origin: https://example.com` → 403 `relay-forbidden` "Not for browsers." | pass |
| Paying address balance | `0xB62C…Fd3D`: **0.031752774978495655 ETH**, nonce 15 (block 11,785,145) | — |
| Operator key (pays `lineage:demo launch/seed-bids/settle` and was the provenance recorder) | `0x8eEC…51C3`: **0.007354520854799879 ETH**, nonce 68 | — |

**Is it enough?** Gas price at the read: 1.03 gwei. Measured costs: an in-app launch 5.13–5.15M gas
(0.0054–0.0056 ETH at ~1.05 gwei), naming a cartridge ~0.92–0.97M, recording a save ~0.90–0.95M,
updating it ~0.28M, a first buy ~0.37M, a faucet 0.05M, royalties 0.07M. At 1.03 gwei the station
can pay about **6 launches**, or about 32 names / save records, or about 85 buys. The ENS script
alone (name + launch a new world, record + update a save, name + launch a remix) is ≈ 0.014 ETH; the
Uniswap script (faucet, buy, royalties, a launch, a bid) ≈ 0.007 ETH. **A rehearsal plus the live
demo (≈ 0.04 ETH) does not fit in 0.0318 ETH**, and the station lets a launch wait for gas up to 5
gwei (`MAX_LAUNCH_FEE_GWEI`), where one launch costs ≈ 0.026 ETH. The operator key's 0.0074 ETH
covers about one `lineage:demo launch` (≈ 5.9M gas) and not its seed bids.

## 5. The web view

| Checked | Observed | Verdict |
| --- | --- | --- |
| Deployed files vs origin/main | `index.html` (5,702 B), `app.js` (19,454 B), `style.css` (9,357 B) all **byte-identical** to `web/lineage-auction/public/`; deployed 2026-09-26T06:25:36Z (`31d6df21…`) | pass |
| Its data calls (headless Chrome 153, every JSON-RPC request logged) | only `ethereum-sepolia-rpc.publicnode.com`; `eth_getLogs` / `eth_call` to the registry `0xda80…dAf6`, the hook `0x59FA…a044`, StateView `0xE1Dd…7E4C`, MockUSDC, the world tokens and the auctions `0x5532…a01F` / `0xAB2D…6203` — the same contracts as above | pass |
| Default view (`web-01`) | opens on the **newest** world, `lantern-quay.aether-land.unmapped.eth · AUCTION ENDED`, raised 0, "below the graduation threshold", 0 bids — and under "After the auction": "The auction has ended; the pool opens when it is settled (anyone may call graduate)." (block 11,785,170) | pass (renders) — the copy is wrong, see Found |
| `/#aether-land` (`web-02`) | `GRADUATED · POOL OPEN`, clearing 0.01864 (+86%), raised 9,025 USDC, 100% sold, 4 passkey bids all CLAIMED, pool 0.01872, royalties owed 0 → `0x8eEC…51C3`; the family tree lists all 10 names (block 11,785,177) | pass |

## 6. The app (read-only)

| # | Screen | Observed | Shot |
| --- | --- | --- | --- |
| 1 | Title | `繼續 · 世界 · 創造世界 · 設定` | 00 |
| 2 | 世界 → 市場 | three worlds: `aether-land.unmapped.eth 交易中 · 0.019 USDC/AETHERLAND`, `misty-harbor.unmapped.eth 競標已結束 · 0.01 USDC/MISTYHARBOR`, `lantern-quay.aether-land.unmapped.eth 競標已結束 · 0.1 AETHERLAND/LANTERNQUAY`; account block offers `用 Touch ID（在瀏覽器開啟）` / `在 app 內使用安全金鑰` | 02 |
| 3 | 市場 → aether-land | `交易中 · $AETHERLAND · 名字持有人 0x8eEC…51C3`, `Uniswap 池價 0.019 USDC／AETHERLAND`, `花費（USDC）`, `用 passkey 買入` | 03 |
| 4 | 市場 → lantern-quay | `名字持有人 kidney.players.unmapped.eth (0xfBaB…8537)`, `已募 0 AETHERLAND，共 0 筆出價`, and it offers **`結算拍賣`** with "結算會把代幣發給每位出價者，並開啟 Uniswap 池。" — for an auction that raised 0 of 10 and cannot graduate (not clicked) | 04 |
| 5 | 世界 → 卡帶, aether-land 1.3.0 | `ENS aether-land.unmapped.eth · 指向這個版本`, `已在市場上——到「世界 → 市場」查看。` | 05 |
| 6 | 卡帶 → aether-land 1.2.0 | `ENS aether-land.unmapped.eth · 由 0x8eEC…51C3 持有，指向 1.3.0` | 06 |
| 7 | 用 ENS 名稱開啟 `kidney-mui0pchb.aether-land.unmapped.eth` | `這是 aether-land@1.3.0 的一個存檔：2 chapters cleared · 17 deeds（進度雜湊 171feb3f…52c6）。 aether-land@1.3.0 已在你的收藏裡。` + 開始玩 | 07 |
| 8 | 用 ENS 名稱開啟 `misty-harbor.unmapped.eth` | `xn--9iq609e681a-3fec58@1.0.0 不在你的收藏裡。請匯入它的 .cartridge 檔，雜湊必須是 sha256:3733086e…97e2。` | 08 |
| 9 | 用 ENS 名稱開啟 `aether-land.unmapped.eth` | `aether-land@1.3.0 已在你的收藏裡。` | 09 |
| 10 | 世界 → 大陸 (no save yet) | field label `夥伴的門牌或 ENS 名稱`, `穿過這扇門` | 10 |
| 11 | 設定 | sections 語言 · 模型 · 帳號 · 方案 · 圖片 · 信令伺服器 · 共享世界 (there is no 「系統」 menu any more) | 11 |
| 12 | Door of a shared world (New game on aether-land 1.3.0, shared on a test-mode service with no chain env; English UI) | `Shared on 127.0.0.1:8797 · Online` in 502 ms; chain section `Recorded on a public chain · Don't record | Record beats … Not recorded on the chain. · Check again`; `window.seed.world.provenance()` → `{status: "not-recorded"}`, no streams — main's live read of WorldProvenance. Record beats was not clicked | 12 |
| 13 | HUD | player card chip `aether-land.unmapped.eth`, title "This world's ENS name: aether-land.unmapped.eth. This run has no name of its own yet." | 13 |
| 14 | Worlds → Saves | `ENS name for this save · ENS aether-land.unmapped.eth · points at this version`, `run-mui5tkmp.aether-land.unmapped.eth is free.`, `Now: 0 chapters cleared · 0 deeds · 3f733075…b604`, door 42YEJR, `Record with passkey` (not clicked) | 14 |

Afterwards: Electron closed through CDP `Browser.close` ("[quit] exit 0 237 ms after the request"),
the service logged "world service: stopped (SIGTERM)", headless Chrome closed through CDP;
`lsof -iTCP:<port> -sTCP:LISTEN` found nothing on 9346, 5196, 8797 or 9347.

## 7. Demo docs vs reality

What was wrong or stale in `docs/demo-flow/*` and `docs/demo/lineage-market.md`, and whether this
run fixed it (only fixes that are plain facts from the reads above or from `src/renderer/i18n/strings`).

| Where | Statement | Reality | Fixed? |
| --- | --- | --- | --- |
| track-ens 0:00–0:40, 1:10–2:30 | type the label `misty-harbor`, register it; `my-save.misty-harbor.unmapped.eth` | `misty-harbor.unmapped.eth` is **taken** (held by the E2E account `0xfBaB…8537`, cartridge `xn--9iq609e681a-3fec58`); by the code (`cartridgeStatus` in `src/main/chain/names.ts` → state `taken`; `CartridgeEns.tsx`), a new world labelled `misty-harbor` shows 「這個名稱已屬於另一個世界，請換一個標籤。」 and no register button (read from the code, not driven). `lantern-quay` and `moss-hollow` under aether-land are taken too | yes: the script says to pick an unused label and lists the taken ones |
| track-ens "要講清楚" | "`bun run relay:deploy` 部署之前，線上的代付站會拒絕 `launch`" | redeployed 06:23Z (version `f539261a`); a real launch through the deployed station is still unrun (only a forged probe) | yes |
| track-ens | players names: "登記並實機驗證之前，不要放進 demo" | `players.unmapped.eth` registered (tx `0x8f88cbdd…87b7`, block 11,784,427) and claimed in the app (ens-players) | yes (the fact; whether to show it is left open) |
| track-ens / track-uniswap | "5.338 AETHERLAND 付給名字持有人（`0xa2efd93f…86bd`）" | `0xa2efd93f…86bd` is the tx; the holder is `0x8eEC…51C3` | yes |
| track-ens | "所有讀取走 ENSv2 Universal Resolver（`ensCalls.ts` 的 `ENSV2_SEPOLIA`，不寫死地址）" | the renderer's name lookups use viem's Universal Resolver (address not hard-coded); the Market / Cartridges lines read the registry's own Permissioned Resolver; `ENSV2_SEPOLIA` hard-codes the ENSv2 deployment | yes |
| track-ens "已部署" link | milestone-lineage-market (v1) | v2 is milestone-lineage-names | yes |
| track-ens / lineage-market.md 鏈上現況 | lantern-quay "上市" / "priced in AETHERLAND" | both in-app auctions ended with **0 bids** and cannot graduate | yes (added) |
| track-uniswap | "README … 還沒有行號 … **缺**" | `contracts/README.md` has the table; all 27 anchors correct | yes (README.md checklist too) |
| track-uniswap | 3-hop royalties "7.30／10.95／18.25（50／30／20）" | today's dry run: 4.633 / 6.949 / 11.581 (grandparent 20 / parent 30 / world 50, exact); the old numbers were from the v1-era dry run | yes |
| track-uniswap, README.md, video.md | web view "現在顯示 GRADUATED · POOL OPEN" | it opens on the newest world, lantern-quay (AUCTION ENDED, 0 bids); `/#aether-land` opens the graduated one | yes: links now use `/#aether-land` |
| track-uniswap | "改編世界的拍賣大約 10 分鐘" | an in-app launch is 100 blocks (≈ 20 min, decoded above); 50 blocks (≈ 10 min) only with `lineage:demo launch --blocks 50`, paid by the operator key | yes |
| overall act 4, track-uniswap | "見 … 的「簽名的限制」" | no such heading; it is 「簽名與 gas（上台前一定要知道）」 / 「簽名」 | yes |
| overall act 1 | 標題「創作遊戲」; "目前版本一定要填名稱" | the entry is 「創造世界」; the name is optional (「世界名稱（選填：留白時從你的描述取名）」); Create has a look step and a quote | yes (click path); the timings are still the pre-phase-2 rehearsal |
| overall act 3 | B「← 主頁」→「加入大陸」; 「夥伴的門牌代碼」; 「繼續遊戲」 | 「← 主頁」→「世界」→「大陸」; 「夥伴的門牌或 ENS 名稱」; 「繼續」 | yes |
| video 1:25–2:10 | "a friend's door code（夥伴的門牌代碼）"; HUD "Live · 1 peer here" | "Friend's door number or ENS name（夥伴的門牌或 ENS 名稱）"; HUD `CONTINENT XXXXXX · LIVE · 1 PEER`（`大陸 XXXXXX · 已連線 · 1 位夥伴`） | yes |
| setup, explainer | 「系統 → 模型」「系統 → 信令伺服器」 | 「設定 → 模型」「設定 → 信令伺服器」 | yes |
| setup | `.env`: `UNWRITTEN_PRIVATE_KEY=0x...  # 中繼器付 Sepolia gas` | the app holds no key; it needs `UNWRITTEN_LINEAGE_*` + `UNWRITTEN_LINEAGE_RELAY` (+ `UNMAPPED_PROVENANCE_*` for the door); the key is only for operator commands | yes |
| setup | B 用「新遊戲」→「開始」 | 「世界 → 新遊戲 → 開始」 | yes |
| demo-flow README | "第二段正在實作 … 標題會變成「繼續・世界・創造世界・設定」" | phase 2 is live (screenshot 00) | yes (section rewritten as done; the rehearsal re-run is still open) |
| lineage-market.md | station "keep it above 0.02 Sepolia ETH; 5 player actions cost about 0.0018" | true, but a launch alone costs 0.0054–0.0056 ETH (up to ≈ 0.026 at the 5-gwei cap); balance now 0.0318 | yes (added launch cost and today's balance) |
| lineage-market.md "Other names" | missing `players`, `kidney.players`, `kidney-mui0pchb` | all registered | yes |
| explainer.html | the chain section says nothing about WorldProvenance | deployed and live | no — adding a section is a judgement call |

Addresses in every doc (`contracts/README.md`, `lineage-market.md`, `track-*`, `.env`,
`web/lineage-relay/wrangler.jsonc`, the web view) match the chain. No demo doc mentions the removed
`ens:setup`; `bun run ens:setup` is not in `package.json`.

## Found (verbatim, not fixed — code is out of scope)

1. **The Market offers `結算拍賣` for an auction that cannot graduate.** lantern-quay (and misty-harbor):
   0 bids, raised 0 of the required 10, `isGraduated() = false`; the detail reads
   `拍賣已結束。結算會把代幣發給每位出價者，並開啟 Uniswap 池。` with the button. `readWorld` in
   `src/main/chain/market.ts` never reads `isGraduated`, so `phase` is `"ended"` for both kinds;
   `src/renderer/app/market/WorldDetail.tsx:150` shows the button on `"ended"`. Not clicked: what
   the station does with that `graduate` (simulation refusal, or a paid `MigrationFailed`) is
   unknown.
2. **The web view says the same.** `web/lineage-auction/public/app.js:293`: "The auction has ended;
   the pool opens when it is settled (anyone may call graduate)." under a panel that says "below the
   graduation threshold"; it is also the page's default view, because `renderWorlds` picks
   `state.worlds.at(-1)` (the newest launch).
3. **`bun run lineage:demo status`** (`scripts/lineage-demo.ts`, `status`): "pool: not open yet (opens
   when the auction is settled)" for the two failed auctions.
4. **Three names point at bytes nobody has.** `moss-hollow` 1.0.0, `misty-harbor`
   (`xn--9iq609e681a-3fec58`) 1.0.0 and `lantern-quay` 1.0.1 were published only inside E2E userData
   that is gone; "Open by ENS name" asks for a `.cartridge` that does not exist. Their 500,000-token
   auctions hold their supply with no bids.
5. `GET /status` has no version; the deployed version is only visible through `wrangler`.
6. `land.friendDoorCode` ("a friend's door code" / 「夥伴的門牌代碼」) is no longer used by any
   component (`friendDoorOrName` replaced it).
7. Bun prints at exit of every `--tsconfig-override` run (exit code 0):
   `Internal error: directory mismatch for directory "<snap>/tsconfig.node.json", fd 3. You don't need to do anything, but this indicates a bug.`
8. `main.log.txt`: `[apple-local] native-helper-start: spawn …/afm-bridge ENOENT` (the snapshot has no
   built Apple bridge), and `sandbox_extension_issue_file failed for …/Electron Helper.app/Contents/Resources: 1 (Operation not permitted)`.

## Needs a person before the demo

- **Top up the gas station** `0xB62Ccd1A90896911b21546a60eC78E934f9fFd3D` (0.0318 ETH now; a rehearsal
  plus the live ENS + Uniswap scripts is ≈ 0.04 ETH at 1 gwei, and one launch at the 5-gwei cap is
  ≈ 0.026). ≥ 0.1 Sepolia ETH leaves room.
- **Top up the operator key** `0x8eECf2cD24664EB2275BFd74E324D9E0541b51C3` (0.0074 ETH) if the
  "bidding live" path (`lineage:demo launch` + `seed-bids`) or live beat recording is planned.
- **Pick fresh labels** for the world and remix made on stage (`misty-harbor`, `lantern-quay`,
  `moss-hollow` are taken), and rehearse once with the Touch ID passkey that will be used: it holds
  none of today's names.
- A real launch through the **deployed** station has not run (only locally and a forged probe).
- The overall script's timings are from the pre-phase-2 rehearsal (`milestone-demo-flow`); it has not
  been re-run since the title and Create changed.

## Files

- Read scripts: `chain-audit.ts.txt` (parts 1–4), `chain-audit-launches.ts.txt` (launch terms),
  `chain-audit-web.ts.txt` (web view in headless Chrome); run from the snapshot as `scripts/*.ts`.
- Outputs: `audit.out.txt` + `audit.json` (every read with its block), `launches.out.txt`,
  `provenance-dry-run.out.txt` + `provenance-dry-run-result.md`, `lineage-market-dry-run.out.txt`,
  `lineage-demo-status.out.txt`, `relay-status.json`, `relay-origin.txt`, `relay-deployments.txt`,
  `auction-deployments.txt` (author lines redacted), `web-0*-network.json`, `web-0*-text.txt`,
  `main.log.txt`, `service.log.txt`.
- App runs: `run.json`, `run-menus.json`, `run-door-a-settings.json`, `run-door-b-share.json`,
  `run-saves.json`. Screenshots `00`–`14` (app, 2880 × 1674 at scale 2) and `web-01`, `web-02`
  (1440 wide). Scratch paths are shown as `$SCR` / `<snap>`.
