import {
  altarId,
  exitId,
  monsterLabel,
  NEAR_RADIUS,
  nearestTarget,
  sceneTargets,
  triggersWithin,
  triggerTarget,
} from "@renderer/engine/targets";
import { describe, expect, it } from "vitest";
import { exit, makeScene, monster, npc, prop, treasure, trigger } from "./fixtures";

describe("sceneTargets", () => {
  it("labels every interactable kind", () => {
    const scene = makeScene({
      npcs: [npc("npc-1", 1, 1, "Hana")],
      monsters: [monster("mon-1", 2, 2, "fox_spirit", 3)],
      treasures: [treasure("chest-1", 3, 3)],
      exits: [exit(4, 4, "Sunken Terrace")],
      props: [prop("altar", 5, 5), prop("tree", 6, 6)],
      triggers: [trigger("bell-rings", 7, 7)],
      quests: [{ id: "q1", text: "Find the bell" }],
    });

    const byKind = new Map(sceneTargets(scene).map((t) => [t.kind, t]));

    expect(byKind.get("npc")).toMatchObject({ id: "npc-1", label: "Hana", x: 1.5, z: 1.5 });
    expect(byKind.get("monster")).toMatchObject({ id: "mon-1", label: "fox spirit Lv.3" });
    expect(byKind.get("treasure")).toMatchObject({ id: "chest-1", label: "Treasure" });
    expect(byKind.get("exit")).toMatchObject({ id: exitId(4, 4), label: "Sunken Terrace" });
    expect(byKind.get("altar")).toMatchObject({ id: altarId(5, 5), label: "Altar" });
    expect(byKind.get("trigger")).toMatchObject({ id: "bell-rings", label: "bell-rings" });
  });

  it("only turns altar props into targets, and never quests", () => {
    const scene = makeScene({
      props: [prop("tree", 1, 1), prop("torch", 2, 2), prop("altar", 3, 3)],
      quests: [{ id: "q1", text: "anything" }],
    });
    const targets = sceneTargets(scene);
    expect(targets).toHaveLength(1);
    expect(targets[0]?.kind).toBe("altar");
  });

  it("drops treasures the player already opened", () => {
    const scene = makeScene({ treasures: [treasure("a", 1, 1), treasure("b", 2, 2)] });
    expect(sceneTargets(scene, ["a"]).map((t) => t.id)).toEqual(["b"]);
  });

  it("humanises monster kinds", () => {
    expect(monsterLabel("fox_spirit", 12)).toBe("fox spirit Lv.12");
    expect(monsterLabel("slime", 1)).toBe("slime Lv.1");
  });
});

describe("nearestTarget", () => {
  const scene = makeScene({
    npcs: [npc("near", 5, 5, "Near"), npc("far", 20, 20, "Far")],
    monsters: [monster("closer", 5, 4)],
  });
  const targets = sceneTargets(scene);

  it("returns the closest target and its distance", () => {
    const found = nearestTarget(targets, 5.5, 4.5);
    expect(found).not.toBeNull();
    expect(found?.id).toBe("closer");
    expect(found?.distance).toBeCloseTo(0);
  });

  it("ignores anything beyond 2 tiles", () => {
    expect(NEAR_RADIUS).toBe(2);
    expect(nearestTarget(targets, 12, 12)).toBeNull();
  });

  it("includes a target exactly on the radius and excludes one just past it", () => {
    const single = sceneTargets(makeScene({ npcs: [npc("n", 5, 5, "N")] }));
    expect(nearestTarget(single, 5.5 + NEAR_RADIUS, 5.5)?.id).toBe("n");
    expect(nearestTarget(single, 5.5 + NEAR_RADIUS + 0.001, 5.5)).toBeNull();
  });

  it("keeps the earlier entry on a tie so the prompt does not flicker", () => {
    const tied = sceneTargets(
      makeScene({ npcs: [npc("first", 5, 5, "A")], monsters: [monster("second", 5, 5)] }),
    );
    expect(nearestTarget(tied, 5.5, 5.5)?.id).toBe("first");
  });

  it("returns null for an empty scene", () => {
    expect(nearestTarget(sceneTargets(makeScene()), 0, 0)).toBeNull();
  });
});

describe("triggers", () => {
  const triggers = [trigger("wide", 5, 5, 2.5), trigger("tight", 8, 8, 0.4)];

  it("uses each trigger's own radius, not the interaction radius", () => {
    expect(triggersWithin(triggers, 7.5, 5.5).map((t) => t.id)).toEqual(["wide"]);
    expect(triggersWithin(triggers, 8.5, 8.5).map((t) => t.id)).toEqual(["tight"]);
    expect(triggersWithin(triggers, 0, 0)).toEqual([]);
  });

  it("builds a NearbyTarget the app layer can log", () => {
    const target = triggerTarget(triggers[0] ?? trigger("wide", 5, 5), 5.5, 5.5);
    expect(target).toEqual({ kind: "trigger", id: "wide", label: "wide", distance: 0 });
  });
});
