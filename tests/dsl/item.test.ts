import { parseItem } from "@dsl/index";
import { LIMITS } from "@dsl/limits";
import { EXAMPLE_ITEM } from "@dsl/prompts/item";
import { describe, expect, it } from "vitest";
import { fixture } from "./fixtures";

const ITEM_LINE = (mesh: string, power = 38, curse = "null") =>
  `root = Item("steam_ladle", "Steam Ladle", "tool", ${power}, "Draws hot water.", ${curse}, ${mesh}, ["water"], "Bent from the inn's last ladle.")`;

describe("parseItem", () => {
  it("reads an item and keeps only parts the engine can build", () => {
    const result = parseItem(fixture("item.oui"));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const item = result.value;
    expect(item.id).toBe("steam_ladle");
    expect(item.kind).toBe("tool");
    expect(item.power).toBe(38);
    expect(item.curse).toContain("never feels cold");
    expect(item.meshDna).toEqual(["shaft_bamboo", "shell_round", "core_ember"]);
    expect(item.archetype).toEqual(["water", "restoration"]);
    expect(item.flavor).toContain("Hana");
  });

  it("accepts a null curse and clamps power", () => {
    const result = parseItem(ITEM_LINE('["blade_thin", "hilt_bone"]', 999));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.curse).toBeNull();
    expect(result.value.power).toBe(LIMITS.power.max);
  });

  it("fails when no mesh part exists", () => {
    const result = parseItem(ITEM_LINE('["sword_of_doom", "wings_of_fate"]'));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("dsl-invalid-mesh-dna");
    expect(result.error.hint).toContain("blade_curved");
  });

  it("rejects a kind the engine has no slot for", () => {
    const result = parseItem(
      'root = Item("x", "X", "spaceship", 10, "p", null, ["blade_thin"], ["metal"], "f")',
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("dsl-invalid-props");
    expect(result.error.errors[0]?.message).toContain("kind");
    expect(result.error.errors[0]?.message).toContain("spaceship");
  });

  it("parses the program shipped inside the prompt", () => {
    expect(parseItem(EXAMPLE_ITEM).ok).toBe(true);
  });
});
