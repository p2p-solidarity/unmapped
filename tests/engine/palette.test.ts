import { PROP_SHAPE } from "@renderer/engine/palette";
import { PROP_KINDS } from "@shared/world";
import { describe, expect, it } from "vitest";

describe("palette coverage", () => {
  // Props.tsx keys one instanced mesh per part by shape + offset + size; the gear's crossed
  // spokes share the first two, so a recipe with two fully identical parts would collide.
  it("tells the parts of a recipe apart by shape, offset and size", () => {
    for (const kind of PROP_KINDS) {
      const keys = PROP_SHAPE[kind].parts.map(
        (part) => `${part.geo}-${part.offset.join("_")}-${part.size.join("_")}`,
      );
      expect(new Set(keys).size, kind).toBe(keys.length);
    }
  });
});
