// Cartridge ENS names — only what an E2E run cannot reach (Rule 0).
//
// Ways this fails:
// 1. On-chain encoding: a cartridge id becomes a label the registry refuses or the Universal
//    Resolver cannot find (upper case, spaces, underscores, runs of hyphens, over 63 characters),
//    so a claimed name never resolves.
// 2. On-chain encoding: an id with nothing nameable (only CJK, only symbols) still produces a label,
//    and every such cartridge collides on the same name.
// 3. Untrusted input: records someone else wrote on chain — a missing key or a hash that is not a
//    sha256 content hash — are taken as a pointer, so "Open by ENS name" offers the wrong revision.

import { cartridgeLabel, pointerFromTexts } from "@shared/ensNames";
import { describe, expect, it } from "vitest";

const hash = `sha256:${"ab".repeat(32)}`;

describe("cartridge ENS names", () => {
  it("encodes any cartridge id as one DNS-safe label (1)", () => {
    expect(cartridgeLabel("tide-keep-1a2b3c4d")).toBe("tide-keep-1a2b3c4d");
    expect(cartridgeLabel("My Remix__v2")).toBe("my-remix-v2");
    const long = cartridgeLabel(`${"x".repeat(62)}-y`);
    expect(long).toHaveLength(62);
    expect(long?.endsWith("-")).toBe(false);
  });

  it("gives an unnameable id no label at all (2)", () => {
    expect(cartridgeLabel("潮汐")).toBeNull();
    expect(cartridgeLabel("__--__")).toBeNull();
  });

  it("only accepts complete records with a real content hash (3)", () => {
    expect(pointerFromTexts({ cartridge: "a", version: "1", hash })).toEqual({
      cartridgeId: "a",
      version: "1",
      contentHash: hash,
    });
    expect(
      pointerFromTexts({ cartridge: "a", version: "1", hash: `sha256:${"AB".repeat(32)}` }),
    ).toBeNull();
    expect(pointerFromTexts({ cartridge: "a", version: "1", hash: "0xabab" })).toBeNull();
    expect(pointerFromTexts({ cartridge: "a", version: null, hash })).toBeNull();
    expect(pointerFromTexts({ cartridge: "", version: "1", hash })).toBeNull();
  });
});
