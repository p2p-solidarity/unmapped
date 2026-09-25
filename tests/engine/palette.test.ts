import {
  BIOME_PALETTE,
  CHARACTER_THEME_COLORS,
  ENTITY_PALETTE,
  HUMANOID_PALETTE,
  MONSTER_LOOK,
  PROP_SHAPE,
  TILE_TINT,
} from "@renderer/engine/palette";
import { BIOMES, MONSTER_KINDS, PROP_KINDS, TILES } from "@shared/world";
import { describe, expect, it } from "vitest";

const HEX = /^#[0-9a-f]{6}$/;

describe("palette coverage", () => {
  it("has a palette for every biome", () => {
    for (const biome of BIOMES) {
      const entry = BIOME_PALETTE[biome];
      expect(entry, biome).toBeDefined();
      for (const [role, value] of Object.entries(entry)) {
        expect(value, `${biome}.${role}`).toMatch(HEX);
      }
    }
    expect(Object.keys(BIOME_PALETTE)).toHaveLength(BIOMES.length);
  });

  it("has a tint for every tile", () => {
    for (const tile of TILES) expect(TILE_TINT[tile], tile).toMatch(HEX);
    expect(Object.keys(TILE_TINT)).toHaveLength(TILES.length);
  });

  it("has a shape for every prop kind", () => {
    for (const kind of PROP_KINDS) {
      const shape = PROP_SHAPE[kind];
      expect(shape, kind).toBeDefined();
      expect(shape.parts.length, kind).toBeGreaterThan(0);
      for (const part of shape.parts) {
        expect(part.color, `${kind}.color`).toMatch(HEX);
        expect(part.offset, `${kind}.offset`).toHaveLength(3);
        expect(part.size, `${kind}.size`).toHaveLength(3);
        expect(
          part.size.every((n) => n > 0),
          `${kind}.size > 0`,
        ).toBe(true);
        expect(part.emissive, `${kind}.emissive`).toBeGreaterThanOrEqual(0);
      }
      expect(shape.collider, kind).toBeGreaterThanOrEqual(0);
      if (shape.light !== null) expect(shape.light, kind).toMatch(HEX);
    }
    expect(Object.keys(PROP_SHAPE)).toHaveLength(PROP_KINDS.length);
  });

  it("has a look for every monster kind", () => {
    for (const kind of MONSTER_KINDS) {
      const look = MONSTER_LOOK[kind];
      expect(look, kind).toBeDefined();
      expect(look.color, kind).toMatch(HEX);
      expect(look.accent, kind).toMatch(HEX);
      expect(look.height, kind).toBeGreaterThan(0);
      expect(look.radius, kind).toBeGreaterThan(0);
    }
    expect(Object.keys(MONSTER_LOOK)).toHaveLength(MONSTER_KINDS.length);
  });

  it("keeps flowers and mushrooms walk-through and torches lit", () => {
    expect(PROP_SHAPE.flower.collider).toBe(0);
    expect(PROP_SHAPE.mushroom.collider).toBe(0);
    expect(PROP_SHAPE.torch.light).not.toBeNull();
    for (const kind of PROP_KINDS) {
      if (kind === "torch") continue;
      expect(PROP_SHAPE[kind].light, kind).toBeNull();
    }
  });

  it("uses hex literals for the non-enum entity colours too", () => {
    for (const [role, value] of Object.entries(ENTITY_PALETTE)) {
      expect(value, role).toMatch(HEX);
    }
  });

  it("gives every humanoid part colour that is not the NPC's own a hex value", () => {
    for (const [role, value] of Object.entries(HUMANOID_PALETTE)) {
      expect(value, role).toMatch(HEX);
    }
    // `body`, `accent` and `glow` come from the NpcSpec and must NOT be hard-coded here.
    for (const role of ["body", "accent", "glow"]) {
      expect(Object.hasOwn(HUMANOID_PALETTE, role), role).toBe(false);
    }
  });

  it("keeps every character theme a full hex set", () => {
    for (const [theme, colors] of Object.entries(CHARACTER_THEME_COLORS)) {
      for (const [role, value] of Object.entries(colors)) {
        expect(value, `${theme}.${role}`).toMatch(HEX);
      }
    }
  });
});
