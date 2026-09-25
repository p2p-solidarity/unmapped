import { createHarness, type Harness } from "@harness";
import type { EffectOutcome, GameEffect } from "@shared/effects";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

describe("ctx.effects", () => {
  let harness: Harness;
  let applied: GameEffect[];

  const install = (): (() => void) =>
    harness.ctx.effects.provider((effect) => {
      applied.push(effect);
      return Promise.resolve<EffectOutcome>({ ok: true, message: `applied ${effect.kind}` });
    });

  beforeEach(() => {
    harness = createHarness();
    applied = [];
  });

  afterEach(async () => {
    await harness.dispose();
  });

  it("refuses everything until a world provides an applier", async () => {
    expect(await harness.ctx.effects.apply({ kind: "narrate", text: "a bell rings" })).toEqual({
      ok: false,
      message: "no world is loaded",
    });
  });

  it("allows one provider at a time and frees the slot on dispose", () => {
    const drop = install();
    expect(() => install()).toThrowError(/already registered/);
    drop();
    expect(() => install()).not.toThrow();
  });

  it.each([
    ["an unknown kind", { kind: "explode_world" }],
    ["a bad colour", { kind: "mutate_world", skyColor: "red" }],
    ["fog outside the engine's range", { kind: "mutate_world", fogDensity: 3 }],
    ["an unknown biome", { kind: "mutate_world", biome: "space" }],
    ["an off-map coordinate", { kind: "teleport_player", x: 99, z: 0 }],
    [
      "a monster bigger than the engine allows",
      { kind: "spawn_monster", monster: { id: "m", kind: "slime", x: 1, z: 1, level: 1, size: 9 } },
    ],
    ["an empty id", { kind: "remove_entity", id: "" }],
    ["an empty quest text", { kind: "add_quest", quest: { id: "q", text: "" } }],
    ["no materials at all", { kind: "grant_materials", materials: [] }],
    ["an empty narration", { kind: "narrate", text: "" }],
    ["not an object", "narrate"],
  ])("rejects %s without reaching the world", async (_label, effect) => {
    install();
    const outcome = await harness.ctx.effects.apply(effect);
    expect(outcome.ok).toBe(false);
    expect(outcome.message).toMatch(/^invalid effect: /);
    expect(applied).toEqual([]);
  });
});
