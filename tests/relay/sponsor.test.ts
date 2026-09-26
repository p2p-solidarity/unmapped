// The gas station's rules for a passkey batch that launches a world — only what an E2E run cannot
// reach (Rule 0): untrusted input the station must refuse before it spends anything.
//
// Ways this fails:
// 1. Untrusted input: a batch puts a launch next to other calls, so those calls ride on the launch's
//    7M gas cap and the station pays for work it would refuse on its own.
// 2. Untrusted input: `registerAndLaunch` (the operator's call, which names any owner) slips through
//    as if it were the holder's own `launch`, so anyone launches on the station's gas.
// 3. Silent spend: a lone launch is checked against the ordinary 1.5M cap (every launch refused) or,
//    worse, against the launch cap but the ordinary 30 gwei ceiling, so one launch can drain the
//    station at a gas spike; and a batch without a launch gets the launch cap.

import type { RelayRequest } from "@shared/relay";
import { encodeFunctionData, type Hex, parseAbi, parseGwei } from "viem";
import { describe, expect, it } from "vitest";
import { type RelayEnv, sponsor } from "../../src/relay/sponsor";

const REGISTRY = "0xda8051e3e2855C125AAd6050f97Ea64cf203dAf6";
const USDC = "0x00000000000000000000000000000000000000aa";
const word = `0x${"11".repeat(32)}` as Hex;

const abi = parseAbi([
  "function launch(bytes32 node, (uint128 supply, uint128 lpReserve, uint64 auctionBlocks, uint256 floorPriceQ96, uint256 tickSpacingQ96, uint128 requiredCurrencyRaised) lp)",
  "function registerAndLaunch((bytes32 parent, string label, address owner, string cartridgeId, string version, bytes32 contentHash) p, (uint128 supply, uint128 lpReserve, uint64 auctionBlocks, uint256 floorPriceQ96, uint256 tickSpacingQ96, uint128 requiredCurrencyRaised) lp)",
  "function describe(bytes32 node, string description)",
  "function approve(address spender, uint256 amount)",
]);
const lp = {
  supply: 10n ** 24n,
  lpReserve: 5n * 10n ** 23n,
  auctionBlocks: 100n,
  floorPriceQ96: 10n ** 20n,
  tickSpacingQ96: 10n ** 18n,
  requiredCurrencyRaised: 10n ** 7n,
};
const launch = encodeFunctionData({ abi, functionName: "launch", args: [word, lp] });

function batch(calls: { target: string; data: Hex }[]): RelayRequest {
  return {
    kind: "execute",
    qx: word,
    qy: word,
    calls: calls.map((c) => ({ target: c.target as Hex, value: "0", data: c.data })),
    deadline: "9999999999",
    auth: {
      r: word,
      s: word,
      challengeIndex: 23,
      typeIndex: 1,
      authenticatorData: `0x${"00".repeat(37)}`,
      clientDataJSON: "{}",
    },
  };
}

/** A station whose chain answers `gas` and `fee`, and records what it would send. */
function station(gas: bigint, fee: bigint) {
  const sent: { gas?: bigint }[] = [];
  let reads = 0;
  const env: RelayEnv = {
    RPC_URL: "http://127.0.0.1:1",
    REGISTRY,
    HOOK: "0x00000000000000000000000000000000000000bb",
    ROUTER: "0x00000000000000000000000000000000000000cc",
    ACCOUNTS: "0x00000000000000000000000000000000000000dd",
    USDC,
    PERMIT2: "0x00000000000000000000000000000000000000ee",
  };
  const s = {
    env,
    relayer: "0x00000000000000000000000000000000000000ff",
    public: {
      estimateGas: async () => {
        reads += 1;
        return gas;
      },
      estimateFeesPerGas: async () => ({ maxFeePerGas: fee, maxPriorityFeePerGas: 1n }),
      readContract: async () => {
        reads += 1;
        throw new Error("not a market contract");
      },
    },
    wallet: {
      account: undefined,
      sendTransaction: async (tx: { gas?: bigint }) => {
        sent.push(tx);
        return word;
      },
    },
  };
  return { s: s as never, sent, reads: () => reads };
}

describe("gas station: launching a world", () => {
  it("refuses a launch with company, before touching the chain (1)", async () => {
    const chain = station(5_800_000n, parseGwei("1"));
    const describeCall = encodeFunctionData({
      abi,
      functionName: "describe",
      args: [word, "door ABCDEF"],
    });
    const answer = await sponsor(
      chain.s,
      batch([
        { target: REGISTRY, data: launch },
        { target: REGISTRY, data: describeCall },
      ]),
    );
    expect(answer).toMatchObject({ ok: false, code: "relay-refused" });
    expect(chain.reads()).toBe(0);
    expect(chain.sent).toHaveLength(0);
  });

  it("refuses registerAndLaunch, the operator's call (2)", async () => {
    const chain = station(5_800_000n, parseGwei("1"));
    const data = encodeFunctionData({
      abi,
      functionName: "registerAndLaunch",
      args: [
        {
          parent: word,
          label: "x",
          owner: USDC,
          cartridgeId: "x",
          version: "1",
          contentHash: word,
        },
        lp,
      ],
    });
    const answer = await sponsor(chain.s, batch([{ target: REGISTRY, data }]));
    expect(answer).toMatchObject({ ok: false, code: "relay-refused" });
    expect(chain.sent).toHaveLength(0);
  });

  it("pays a lone launch under the launch cap and its own fee ceiling (3)", async () => {
    const cheap = station(5_800_000n, parseGwei("2"));
    expect(await sponsor(cheap.s, batch([{ target: REGISTRY, data: launch }]))).toEqual({
      ok: true,
      txHash: word,
    });
    expect(cheap.sent[0]?.gas).toBeLessThanOrEqual(7_000_000n);

    const spike = station(5_800_000n, parseGwei("6"));
    const refused = await sponsor(spike.s, batch([{ target: REGISTRY, data: launch }]));
    expect(refused).toMatchObject({ ok: false, code: "relay-gas-price" });
    expect(spike.sent).toHaveLength(0);
  });

  it("keeps the ordinary cap for a batch without a launch (3)", async () => {
    const chain = station(5_800_000n, parseGwei("1"));
    const describeCall = encodeFunctionData({
      abi,
      functionName: "describe",
      args: [word, "door ABCDEF"],
    });
    const answer = await sponsor(chain.s, batch([{ target: REGISTRY, data: describeCall }]));
    expect(answer).toMatchObject({ ok: false, code: "relay-too-much-gas" });
    expect(chain.sent).toHaveLength(0);
  });
});
