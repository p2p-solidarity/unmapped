// Sends calls either to Sepolia itself or to a simulation of it. The dry run replays every call so
// far as simulated blocks (eth_simulateV1) on top of Sepolia's latest state — real contracts, real
// storage, nothing sent — so a whole flow can be checked before anyone spends gas.

import {
  type Abi,
  type Address,
  createWalletClient,
  decodeFunctionResult,
  encodeFunctionData,
  type Hex,
  http,
  type Log,
  type PublicClient,
  parseEther,
} from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";

export interface Call {
  to: Address;
  data: Hex;
}

export interface Exec {
  account: Address;
  /** Runs `call` on the latest state (as `from`, default the account); throws if it reverts. */
  read(call: Call, from?: Address): Promise<Hex>;
  send(call: Call, what: string): Promise<Log[]>;
  /** Lets `seconds` of chain time pass. */
  wait(seconds: bigint): Promise<void>;
  /** Moves on until the next send lands in block `block` or later. */
  mineTo(block: bigint): Promise<void>;
  /** The block the next send lands in. */
  nextBlock(): Promise<bigint>;
}

const say = (line: string) => process.stdout.write(`${line}\n`);

export function liveExec(client: PublicClient, key: Hex, rpcUrl: string): Exec {
  const account = privateKeyToAccount(key);
  const wallet = createWalletClient({ account, chain: sepolia, transport: http(rpcUrl) });
  const pause = () => new Promise((done) => setTimeout(done, 4_000));
  return {
    account: account.address,
    read: async (call, from) =>
      (await client.call({ account: from ?? account.address, ...call })).data ?? "0x",
    send: async (call, what) => {
      const hash = await wallet.sendTransaction(call);
      const receipt = await client.waitForTransactionReceipt({ hash });
      if (receipt.status !== "success") throw new Error(`${what} reverted (${hash})`);
      say(`  ✓ ${what}  ${hash}  (${receipt.gasUsed.toLocaleString("en")} gas)`);
      return receipt.logs;
    },
    wait: async (seconds) => {
      const until = (await client.getBlock()).timestamp + seconds;
      while ((await client.getBlock()).timestamp < until) await pause();
    },
    mineTo: async (block) => {
      while ((await client.getBlockNumber()) + 1n < block) await pause();
    },
    nextBlock: async () => (await client.getBlockNumber()) + 1n,
  };
}

interface SimBlock {
  number: bigint;
  time: bigint;
  /** null for a block that only lets chain height pass. */
  call: Call | null;
  from: Address;
}

/** Every send becomes one simulated block; reads re-run all blocks, then the read. */
export function dryExec(client: PublicClient): Exec {
  const account = privateKeyToAccount(generatePrivateKey()).address;
  const blocks: SimBlock[] = [];
  // Every simulation builds on the same Sepolia block, so the real chain moving on mid-run cannot
  // overtake the simulated block numbers.
  let base: bigint | null = null;
  let number: bigint | null = null;
  let time = BigInt(Math.floor(Date.now() / 1000)) + 15n;
  const start = async () => {
    if (number === null) {
      base = await client.getBlockNumber();
      number = base + 1n;
    }
    return number;
  };
  const run = async (extra: Call, from: Address) => {
    const all = [...blocks, { number: await start(), time, call: extra, from }];
    const result = await client.simulateBlocks({
      blockNumber: base ?? undefined,
      blocks: all.map((block, index) => ({
        blockOverrides: { number: block.number, time: block.time },
        stateOverrides: index === 0 ? [{ address: account, balance: parseEther("10") }] : undefined,
        calls: block.call
          ? [{ account: block.from, to: block.call.to, data: block.call.data }]
          : [],
      })),
    });
    const last = result.at(-1)?.calls[0];
    if (last === undefined || last.status !== "success") {
      throw new Error(last?.error?.message ?? "simulation returned nothing");
    }
    return last;
  };
  return {
    account,
    read: async (call, from) => (await run(call, from ?? account)).data,
    send: async (call, what) => {
      const outcome = await run(call, account);
      blocks.push({ number: await start(), time, call, from: account });
      number = (await start()) + 1n;
      time += 12n;
      say(`  ✓ ${what}  (simulated, ${outcome.gasUsed.toLocaleString("en")} gas)`);
      return outcome.logs as Log[];
    },
    wait: async (seconds) => {
      time += seconds;
    },
    // The node would fill a gap in block numbers on its own, and its reply would no longer line up
    // with the blocks we sent, so the empty blocks are sent explicitly.
    mineTo: async (block) => {
      for (let next = await start(); next < block; next++) {
        blocks.push({ number: next, time, call: null, from: account });
        number = next + 1n;
        time += 12n;
      }
    },
    nextBlock: start,
  };
}

export function call(to: Address, abi: Abi, functionName: string, args: readonly unknown[]): Call {
  return { to, data: encodeFunctionData({ abi, functionName, args }) };
}

export async function read(
  exec: Exec,
  to: Address,
  abi: Abi,
  functionName: string,
  args: readonly unknown[],
  from?: Address,
): Promise<unknown> {
  const data = await exec.read(call(to, abi, functionName, args), from);
  return decodeFunctionResult({ abi, functionName, data });
}

/** Resolves when `attempt` reverts; throws when it goes through. */
export async function expectRevert(what: string, attempt: Promise<unknown>): Promise<string> {
  try {
    await attempt;
  } catch (cause) {
    const reason = cause instanceof Error ? cause.message.split("\n")[0] : String(cause);
    say(`  ✓ refused: ${what}`);
    return reason ?? "";
  }
  throw new Error(`${what} went through, but it must be refused`);
}
