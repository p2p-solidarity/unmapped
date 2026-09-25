import { createHash } from "node:crypto";
import { parseScene, serializeScene } from "@dsl/index";
import { builtinAssetRef } from "@shared/assets";
import { describe, expect, it } from "vitest";
import { PROP_SHAPE } from "../../src/renderer/engine/palette/props";

describe("declared built-in assets", () => {
  it("resolves and round trips a declared asset, and refuses unknown geometry", () => {
    const source =
      'root = Scene("Gallery", "ruined_castle", [f, p])\nf = Floor(12, 12, "stone")\np = Prop("tree", 2, 3, 1, null, false, "builtin:tree")';
    const result = parseScene(source);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.props[0]?.assetId).toBe("builtin:tree");
    expect(parseScene(serializeScene(result.value))).toEqual(result);
    expect(parseScene(source.replace("builtin:tree", "missing:tree")).ok).toBe(false);
    expect(parseScene(source.replace("builtin:tree", "builtin:rock")).ok).toBe(false);
  });
  it("hashes the actual geometry recipes", () => {
    for (const [kind, recipe] of Object.entries(PROP_SHAPE)) {
      const ref = builtinAssetRef(kind as keyof typeof PROP_SHAPE);
      expect(ref.contentHash).toBe(
        `sha256:${createHash("sha256").update(JSON.stringify(recipe)).digest("hex")}`,
      );
    }
  });
});
