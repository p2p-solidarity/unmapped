import { chunkTerrain } from "@shared/chunks";
import { landSeedOf } from "@shared/land";
import { formatSeedCode, isSeedCode, normalizeSeedCode, randomSeedCode } from "@shared/seedCode";
import { describe, expect, it } from "vitest";

const cartridge = {
  cartridgeId: "aether-land",
  version: "1.0.0",
  contentHash: "sha256:x" as const,
};

describe("world seeds", () => {
  it("rolls readable codes and accepts them retyped with separators", () => {
    const seed = randomSeedCode();
    expect(isSeedCode(seed)).toBe(true);
    expect(normalizeSeedCode(` ${formatSeedCode(seed).toLowerCase()} `)).toBe(seed);
    expect(isSeedCode("ABCD1234")).toBe(false);
  });

  it("gives each seed its own land and keeps seedless saves on their cartridge's land", () => {
    const origin = { floor: { width: 16, depth: 16, tile: "grass" as const } };
    const land = (seed: string | undefined) =>
      chunkTerrain({
        seed: landSeedOf({ cartridge, ...(seed === undefined ? {} : { seed }) }),
        coord: { cx: 3, cz: -2 },
        origin,
      });
    expect(land("ABCD2345")).toEqual(land("ABCD2345"));
    expect(land("ABCD2345")).not.toEqual(land("WXYZ6789"));
    expect(landSeedOf({ cartridge })).toBe(landSeedOf({ cartridge: { ...cartridge } }));
  });
});
