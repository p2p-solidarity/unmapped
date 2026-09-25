import { parseMeta, serializeMeta } from "@renderer/app/worldFiles";
import type { WorldMeta } from "@shared/world";
import { describe, expect, it } from "vitest";

const meta: WorldMeta = {
  id: "world-1",
  name: "A World",
  archetype: "delve",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  floor: 1,
  mutation: { skyColor: "#d9b06a", fogDensity: 0.08, biome: "abyss" },
  flags: { well_opened: true, bells: 2, keeper: "aoi" },
  mods: ["lantern-pack"],
};

describe("world metadata", () => {
  it("round-trips the current world mutation overlay", () => {
    expect(parseMeta(serializeMeta(meta))).toEqual({ ok: true, value: meta });
  });

  it("defaults legacy metadata without an overlay, flags or mods", () => {
    const legacy: Partial<WorldMeta> = { ...meta };
    delete legacy.mutation;
    delete legacy.flags;
    delete legacy.mods;
    const parsed = parseMeta(JSON.stringify(legacy));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value).toMatchObject({ mutation: null, flags: {}, mods: [] });
  });

  it("rejects flags and mods a human broke", () => {
    expect(parseMeta(JSON.stringify({ ...meta, flags: { bad: null } })).ok).toBe(false);
    expect(parseMeta(JSON.stringify({ ...meta, mods: [1] })).ok).toBe(false);
  });
});
