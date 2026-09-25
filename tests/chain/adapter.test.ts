// The app's side of the ledger: how hashes and notes are encoded, and what it makes of a reply.
// The contract's own rules are covered in ledger.test.ts by running it in an EVM.

import { readFileSync } from "node:fs";
import { lookupRevision } from "@main/chain/ledger";
import { clipUtf8, fromBytes32, LEDGER_NOTE_MAX, toBytes32 } from "@shared/chain";
import { type Abi, createPublicClient, custom, encodeFunctionResult } from "viem";
import { describe, expect, it } from "vitest";

const artifact = JSON.parse(readFileSync("contracts/UnwrittenLedger.json", "utf8")) as {
  abi: Abi;
};
const HASH = `sha256:${"ab".repeat(32)}`;
const PARENT = `sha256:${"cd".repeat(32)}`;
const ADDRESS = "0x1234567890123456789012345678901234567890";

function clientsAnswering(value: unknown) {
  const transport = custom({
    request: async ({ method }) => {
      if (method === "eth_chainId") return "0x14a34";
      if (method === "eth_call") {
        return encodeFunctionResult({
          abi: artifact.abi,
          functionName: "revisionOf",
          result: value,
        });
      }
      throw new Error(`unexpected ${method}`);
    },
  });
  return {
    public: createPublicClient({ transport }),
    wallet: null,
    address: ADDRESS as `0x${string}`,
  };
}

describe("content hashes on the ledger", () => {
  it("maps the app's sha256 names to bytes32 and back", () => {
    expect(toBytes32(HASH)).toBe(`0x${"ab".repeat(32)}`);
    expect(toBytes32("sha256:short")).toBeNull();
    expect(fromBytes32(`0x${"ab".repeat(32)}`)).toBe(HASH);
    expect(fromBytes32(`0x${"00".repeat(32)}`)).toBeNull();
  });

  it("cuts a note to the contract's limit in bytes, never mid-character", () => {
    const note = clipUtf8("潮".repeat(200), LEDGER_NOTE_MAX);
    expect(new TextEncoder().encode(note).length).toBeLessThanOrEqual(LEDGER_NOTE_MAX);
    expect(note).toBe("潮".repeat(93));
    expect(clipUtf8("short", LEDGER_NOTE_MAX)).toBe("short");
  });
});

describe("ledger adapter", () => {
  it("reads a revision and reports an unpublished hash as null", async () => {
    const published = await lookupRevision(
      HASH,
      clientsAnswering({
        author: "0x000000000000000000000000000000000000dEaD",
        parent: toBytes32(PARENT),
        publishedAt: 1_700_000_000n,
        kind: 1,
        uri: "ipfs://bytes",
      }),
    );
    expect(published.ok).toBe(true);
    if (published.ok && published.value !== null) {
      expect(published.value.kind).toBe("world");
      expect(published.value.parent).toBe(PARENT);
      expect(published.value.uri).toBe("ipfs://bytes");
      expect(published.value.publishedAt.startsWith("2023-11-14")).toBe(true);
    }

    const unknown = await lookupRevision(
      HASH,
      clientsAnswering({
        author: "0x0000000000000000000000000000000000000000",
        parent: `0x${"00".repeat(32)}`,
        publishedAt: 0n,
        kind: 0,
        uri: "",
      }),
    );
    expect(unknown.ok && unknown.value).toBeNull();
    expect((await lookupRevision("not-a-hash", clientsAnswering({}))).ok).toBe(false);
  });
});
