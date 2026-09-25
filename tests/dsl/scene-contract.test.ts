import { parseScene, serializeScene } from "@dsl/index";
import { describe, expect, it } from "vitest";

const source = [
  'root = Scene("Entrance", "ruined_castle", [contract, ground, exit])',
  'contract = Contract("entrance", "tps_exploration@1", [], ["brass_key"], "carry", ["entered_vault"], false)',
  'ground = Floor(8, 8, "stone")',
  'exit = Exit(7, 7, "Open the vault", "vault")',
].join("\n");

describe("Scene Contract DSL", () => {
  it("round-trips stable scene and exit identities separately from display text", () => {
    const parsed = parseScene(source);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value.contract).toEqual({
      sceneId: "entrance",
      kit: "tps_exploration@1",
      requiresFlags: [],
      requiresItems: ["brass_key"],
      inventoryPolicy: "carry",
      grantsFlags: ["entered_vault"],
      terminal: false,
    });
    expect(parsed.value.exits[0]).toMatchObject({
      to: "Open the vault",
      targetSceneId: "vault",
    });
    const serialized = serializeScene(parsed.value);
    expect(parseScene(serialized)).toEqual(parsed);
  });
});
