// The app's side of the ledger: what it makes of a reply, and what it says when nothing is set up.
// The contract's own rules are covered in ledger.test.ts by running it in an EVM.

import { readFileSync } from "node:fs";
import {
  ledgerClients,
  ledgerConfig,
  lookupRevision,
  publishRevisionOnChain,
} from "@main/chain/ledger";
import { fromBytes32, toBytes32 } from "@shared/chain";
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
});

describe("ledger adapter", () => {
  it("says what is configured and refuses to guess when nothing is", async () => {
    expect(ledgerConfig({})).toEqual({
      readable: false,
      writable: false,
      chainId: null,
      address: null,
      explorer: null,
    });
    const configured = ledgerConfig({
      rpcUrl: "https://example.invalid",
      address: ADDRESS,
      privateKey: "0x01",
      chainId: "84532",
    });
    expect(configured).toMatchObject({ readable: true, writable: true, chainId: 84532 });
    expect(configured.explorer).toContain("basescan");
    const missing = ledgerClients({});
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.error.code).toBe("ledger-not-configured");
  });

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

  it("will not publish without a signing key, and says how to get one", async () => {
    const result = await publishRevisionOnChain(
      { contentHash: HASH, parent: null, kind: "world", uri: "" },
      clientsAnswering({}),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("ledger-read-only");
      expect(result.error.hint).toContain("UNWRITTEN_PRIVATE_KEY");
    }
  });
});
