// The ledger's rules, run in an in-process EVM: one author per content hash, lineage must exist,
// notes only on published revisions. The committed artifact must match a fresh compile.

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createEVM } from "@ethereumjs/evm";
import { Address, hexToBytes } from "@ethereumjs/util";
import {
  type Abi,
  decodeErrorResult,
  decodeEventLog,
  decodeFunctionResult,
  encodeDeployData,
  encodeFunctionData,
} from "viem";
import { beforeAll, describe, expect, it } from "vitest";

const artifact = JSON.parse(readFileSync("contracts/UnwrittenLedger.json", "utf8")) as {
  abi: Abi;
  bytecode: `0x${string}`;
  solc: string;
};
const AUTHOR = new Address(hexToBytes("0x1111111111111111111111111111111111111111"));
const OTHER = new Address(hexToBytes("0x2222222222222222222222222222222222222222"));
const HASH_A = `0x${"aa".repeat(32)}` as const;
const HASH_B = `0x${"bb".repeat(32)}` as const;
const MISSING = `0x${"cc".repeat(32)}` as const;
const ZERO = `0x${"00".repeat(32)}` as const;

let evm: Awaited<ReturnType<typeof createEVM>>;
let contract: Address;

async function call(data: `0x${string}`, caller = AUTHOR) {
  return evm.runCall({
    to: contract,
    caller,
    origin: caller,
    data: hexToBytes(data),
    gasLimit: 5_000_000n,
  });
}

beforeAll(async () => {
  evm = await createEVM();
  const created = await evm.runCall({
    caller: AUTHOR,
    origin: AUTHOR,
    data: hexToBytes(encodeDeployData({ abi: artifact.abi, bytecode: artifact.bytecode })),
    gasLimit: 10_000_000n,
  });
  const address = created.createdAddress;
  if (address === undefined) throw new Error("deployment produced no address");
  contract = address;
});

describe("UnwrittenLedger", () => {
  it("records who published a revision, its lineage and where to fetch it", async () => {
    const published = await call(
      encodeFunctionData({
        abi: artifact.abi,
        functionName: "publish",
        args: [HASH_A, ZERO, 1, "ipfs://world"],
      }),
    );
    expect(published.execResult.exceptionError).toBeUndefined();
    const log = published.execResult.logs?.[0];
    expect(log).toBeDefined();
    const event = decodeEventLog({
      abi: artifact.abi,
      topics: (log?.[1] ?? []).map(
        (topic) => `0x${Buffer.from(topic).toString("hex")}`,
      ) as unknown as [`0x${string}`, ...`0x${string}`[]],
      data: `0x${Buffer.from(log?.[2] ?? new Uint8Array()).toString("hex")}` as `0x${string}`,
    }) as unknown as { eventName: string; args: Record<string, unknown> };
    expect(event.eventName).toBe("Published");
    expect(event.args.contentHash).toBe(HASH_A);
    expect(String(event.args.author).toLowerCase()).toBe(`0x${AUTHOR.toString().slice(2)}`);

    const read = await call(
      encodeFunctionData({ abi: artifact.abi, functionName: "revisionOf", args: [HASH_A] }),
    );
    const revision = decodeFunctionResult({
      abi: artifact.abi,
      functionName: "revisionOf",
      data: `0x${Buffer.from(read.execResult.returnValue).toString("hex")}` as `0x${string}`,
    }) as unknown as { author: string; uri: string; kind: number };
    expect(revision.uri).toBe("ipfs://world");
    expect(revision.kind).toBe(1);
  });

  it("refuses a second publisher of the same hash and an unknown parent", async () => {
    const again = await call(
      encodeFunctionData({
        abi: artifact.abi,
        functionName: "publish",
        args: [HASH_A, ZERO, 1, "ipfs://steal"],
      }),
      OTHER,
    );
    expect(again.execResult.exceptionError).toBeDefined();
    const reason = decodeErrorResult({
      abi: artifact.abi,
      data: `0x${Buffer.from(again.execResult.returnValue).toString("hex")}`,
    });
    expect(reason.errorName).toBe("AlreadyPublished");

    const orphan = await call(
      encodeFunctionData({
        abi: artifact.abi,
        functionName: "publish",
        args: [HASH_B, MISSING, 1, ""],
      }),
    );
    expect(
      decodeErrorResult({
        abi: artifact.abi,
        data: `0x${Buffer.from(orphan.execResult.returnValue).toString("hex")}` as `0x${string}`,
      }).errorName,
    ).toBe("UnknownParent");
  });

  it("takes notes only on published revisions, and only short ones", async () => {
    const ok = await call(
      encodeFunctionData({
        abi: artifact.abi,
        functionName: "witness",
        args: [HASH_A, "我走到燈塔，信還在。"],
      }),
      OTHER,
    );
    expect(ok.execResult.exceptionError).toBeUndefined();
    expect(ok.execResult.logs?.length).toBe(1);

    const unknown = await call(
      encodeFunctionData({ abi: artifact.abi, functionName: "witness", args: [MISSING, "hi"] }),
    );
    expect(
      decodeErrorResult({
        abi: artifact.abi,
        data: `0x${Buffer.from(unknown.execResult.returnValue).toString("hex")}` as `0x${string}`,
      }).errorName,
    ).toBe("UnknownRevision");

    const long = await call(
      encodeFunctionData({
        abi: artifact.abi,
        functionName: "witness",
        args: [HASH_A, "x".repeat(281)],
      }),
    );
    expect(
      decodeErrorResult({
        abi: artifact.abi,
        data: `0x${Buffer.from(long.execResult.returnValue).toString("hex")}` as `0x${string}`,
      }).errorName,
    ).toBe("NoteTooLong");
  });

  it("refuses an oversized uri, so one entry cannot grow without bound", async () => {
    const long = await call(
      encodeFunctionData({
        abi: artifact.abi,
        functionName: "publish",
        args: [`0x${"ee".repeat(32)}`, ZERO, 0, "i".repeat(401)],
      }),
    );
    expect(
      decodeErrorResult({
        abi: artifact.abi,
        data: `0x${Buffer.from(long.execResult.returnValue).toString("hex")}` as `0x${string}`,
      }).errorName,
    ).toBe("UriTooLong");
  });

  it("the committed artifact is what the current source compiles to", () => {
    execFileSync("node", ["scripts/build-contracts.mjs"], { stdio: "pipe" });
    const fresh = JSON.parse(readFileSync("contracts/UnwrittenLedger.json", "utf8")) as {
      bytecode: string;
    };
    expect(fresh.bytecode).toBe(artifact.bytecode);
    // solc-js compiles in-process: seconds when idle, well past vitest's 5 s default under load.
  }, 60_000);
});
