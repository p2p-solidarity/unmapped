import { parseRules } from "@dsl/index";
import { openLandCartridge } from "@renderer/narrative/openLandCartridge";
import { describe, expect, it } from "vitest";

const ORIGIN = `root = Scene("Home", "countryside", [ground, sun1])
ground = Floor(16, 16, "grass")
sun1 = Light("sun", "#fff3d6", 1.4)
`;

const input = {
  cartridgeId: "play-style-test",
  version: "1.0.0",
  name: "Play style test",
  author: "tests",
  premise: "A test land.",
  originSource: ORIGIN,
  bible: { core: "core", style: "style" },
  createdAt: "2026-09-26T00:00:00.000Z",
};

async function rulesOf(play?: Parameters<typeof openLandCartridge>[0]["play"]) {
  const built = await openLandCartridge({ ...input, ...(play === undefined ? {} : { play }) });
  if (!built.ok) throw new Error(built.error.message);
  const rules = parseRules(built.value.rules);
  if (!rules.ok) throw new Error(rules.error.message);
  return rules.value;
}

describe("a world's play style is its first rules", () => {
  it("is peaceful by default, like the built-in game", async () => {
    const rules = await rulesOf();
    expect(rules.combat).toBeNull();
    expect(rules.weapons).toEqual([]);
  });

  it("starts with the chosen weapon under the player's own name", async () => {
    const rules = await rulesOf({ fights: "gun", weapon: "燈油槍" });
    expect(rules.defaultKit).toBe("tps_exploration@1");
    expect(rules.combat).not.toBeNull();
    expect(rules.weapons.map((weapon) => [weapon.name, weapon.kind])).toEqual([["燈油槍", "gun"]]);
    const blade = await rulesOf({ fights: "blade", weapon: "" });
    expect(blade.weapons[0]?.kind).toBe("melee");
  });
});
