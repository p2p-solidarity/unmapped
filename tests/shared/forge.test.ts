import { parseRules, parseScene, serializeRules, serializeScene } from "@dsl/index";
import { compileCapabilities, SUBSTITUTIONS } from "@shared/capabilities";
import { BUILTIN_MODULES, isSelectable } from "@shared/capability-modules";
import { kitFor, rulesFor, sceneFor } from "@shared/forge";
import {
  MODE_CATALOG,
  type ModeAxis,
  type ModeDescriptor,
  type ModeSelection,
  requirementsFor,
  searchModes,
} from "@shared/mode-catalog";
import { SCENE_BASES } from "@shared/scene-bases";
import { describe, expect, it } from "vitest";

const AXIS_FIELD: Record<ModeAxis, keyof ModeSelection> = {
  genre: "genres",
  timing: "timings",
  structure: "structures",
  setting: "settings",
};

function profileFor(modes: ModeDescriptor[]) {
  const selection: ModeSelection = { genres: [], timings: [], structures: [], settings: [] };
  for (const mode of modes) {
    (selection[AXIS_FIELD[mode.axis]] as string[]).push(mode.id);
  }
  const requirements = requirementsFor(selection);
  const accepted = Object.fromEntries(
    SUBSTITUTIONS.filter((one) =>
      requirements.some((r) => `${r.key}:${r.value}` === one.missing),
    ).map((one) => [one.missing, one.use]),
  );
  const resolution = compileCapabilities({
    requirements,
    modules: BUILTIN_MODULES,
    overrides: {},
    accepted,
  });
  return resolution.contexts[0]?.profile ?? null;
}

const base = SCENE_BASES[0];

describe("forge: profile → cartridge", () => {
  it("turns every selectable mode into rules the DSL accepts", () => {
    for (const mode of MODE_CATALOG.filter(isSelectable)) {
      const profile = profileFor([mode]);
      expect({ mode: mode.id, hasProfile: profile !== null }).toEqual({
        mode: mode.id,
        hasProfile: true,
      });
      if (profile === null) continue;

      const parsed = parseRules(serializeRules(rulesFor(profile)));
      expect({ mode: mode.id, ok: parsed.ok }).toEqual({ mode: mode.id, ok: true });
    }
  });

  it("turns every selectable mode into a scene the DSL accepts", () => {
    if (base === undefined) return;
    for (const mode of MODE_CATALOG.filter(isSelectable)) {
      const profile = profileFor([mode]);
      if (profile === null) continue;
      const scene = sceneFor({
        base,
        profile,
        sceneId: "opening",
        title: base.name,
        monsters: 4,
      });
      const parsed = parseScene(serializeScene(scene));
      expect({ mode: mode.id, ok: parsed.ok }).toEqual({ mode: mode.id, ok: true });
    }
  });

  it("picks the kit that matches the camera and movement the modes asked for", () => {
    const byId = (id: string) => MODE_CATALOG.find((mode) => mode.id === id);
    const vn = byId("visual_novel");
    const maze = byId("dungeon_crawler");
    const fps = byId("first_person_shooter");
    const platform = byId("platformer");
    if (vn === undefined || maze === undefined || fps === undefined || platform === undefined) {
      return;
    }
    const kit = (mode: ModeDescriptor) => {
      const profile = profileFor([mode]);
      return profile === null ? null : kitFor(profile);
    };
    expect(kit(vn)).toBe("vn_fixed@1");
    expect(kit(maze)).toBe("dungeon_grid@1");
    expect(kit(fps)).toBe("fps_puzzle@1");
    expect(kit(platform)).toBe("platformer_2_5d@1");
  });

  it("only arms a cartridge whose modes asked for combat", () => {
    const shooter = MODE_CATALOG.find((mode) => mode.id === "first_person_shooter");
    const puzzle = MODE_CATALOG.find((mode) => mode.id === "puzzle");
    if (shooter === undefined || puzzle === undefined) return;

    const armed = profileFor([shooter]);
    const calm = profileFor([puzzle]);
    if (armed === null || calm === null) return;

    expect(rulesFor(armed).weapons).toHaveLength(1);
    expect(rulesFor(armed).combat).not.toBeNull();
    expect(rulesFor(calm).weapons).toEqual([]);
    expect(rulesFor(calm).combat).toBeNull();
  });

  it("declares generation only when a mode asked for a generated layout", () => {
    const rogue = MODE_CATALOG.find((mode) => mode.id === "roguelike");
    const story = MODE_CATALOG.find((mode) => mode.id === "story_rich");
    if (rogue === undefined || story === undefined) return;
    const rogueProfile = profileFor([rogue]);
    const storyProfile = profileFor([story]);
    if (rogueProfile === null || storyProfile === null) return;
    expect(rulesFor(rogueProfile).generation).not.toBeNull();
    expect(rulesFor(storyProfile).generation).toBeNull();
  });

  it("always leaves the scene with exactly one exit for the generator to reach", () => {
    if (base === undefined) return;
    for (const one of SCENE_BASES) {
      const profile = profileFor([MODE_CATALOG[0] as ModeDescriptor]);
      if (profile === null) continue;
      const scene = sceneFor({ base: one, profile, sceneId: "s", title: one.name, monsters: 0 });
      expect(scene.exits).toHaveLength(1);
      expect(scene.exits[0]?.x).toBeGreaterThan(0);
      expect(scene.exits[0]?.x).toBeLessThan(one.width - 1);
    }
  });
});

describe("the combinations that used to be impossible", () => {
  // "2D Mario with a gun" split into two contexts — a platformer with no gun and a shooter that is
  // not 2D — because shooting was only reachable through genres that also pinned a camera.
  it("builds a side-on platformer that shoots, as one context", () => {
    const runAndGun = MODE_CATALOG.find((mode) => mode.id === "run_and_gun");
    expect(runAndGun).toBeDefined();
    if (runAndGun === undefined) return;

    const profile = profileFor([runAndGun]);
    expect(profile).not.toBeNull();
    if (profile === null) return;

    const specs = profile.entries.map((one) => `${one.key}:${one.value}`);
    expect(specs).toEqual(expect.arrayContaining(["camera:side", "combat:shooter"]));
    expect(kitFor(profile)).toBe("platformer_2_5d@1");
    expect(rulesFor(profile).weapons).toHaveLength(1);
  });

  it("finds it from the words people actually use", () => {
    for (const query of ["瑪利歐拿槍", "Contra", "run and gun"]) {
      expect(searchModes(query).map((mode) => mode.id)).toContain("run_and_gun");
    }
  });
});
