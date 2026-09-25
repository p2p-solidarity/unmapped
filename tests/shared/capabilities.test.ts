import { compileCapabilities, SUBSTITUTIONS } from "@shared/capabilities";
import { BUILTIN_MODULES, isSelectable, unmetFor } from "@shared/capability-modules";
import {
  defersTiming,
  EMPTY_MODE_SELECTION,
  MAX_SELECTED_MODES,
  MODE_CATALOG,
  type ModeAxis,
  type ModeDescriptor,
  type ModeSelection,
  requirementsFor,
  searchModes,
} from "@shared/mode-catalog";
import { describe, expect, it } from "vitest";

function compile(selection: Partial<ModeSelection>, overrides = {}) {
  return compileCapabilities({
    requirements: requirementsFor({ ...EMPTY_MODE_SELECTION, ...selection }),
    modules: BUILTIN_MODULES,
    overrides,
  });
}

function missingKeys(resolution: ReturnType<typeof compile>): string[] {
  return resolution.missingModules.map((requirement) => `${requirement.key}:${requirement.value}`);
}

describe("mode catalog", () => {
  it("keeps every mode id unique across the four axes", () => {
    const ids = MODE_CATALOG.map((mode) => mode.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("searches ids, Chinese labels and aliases", () => {
    expect(searchModes("FPS").map((mode) => mode.id)).toContain("first_person_shooter");
    expect(searchModes("種田").map((mode) => mode.id)).toContain("farming");
    expect(searchModes("2.5D").map((mode) => mode.id)).toContain("platformer");
  });

  it("offers a real pacing axis, not just turn-based", () => {
    const timings = MODE_CATALOG.filter((mode) => mode.axis === "timing").map((mode) => mode.id);
    // The values a Seed Mod can switch between (plan.md §4) must all be selectable up front.
    expect(timings).toEqual(
      expect.arrayContaining([
        "realtime",
        "turn_based",
        "turn_bar",
        "initiative",
        "phase_based",
        "revolver",
      ]),
    );
  });

  it("treats \u96a8\u4fbf as deferring the decision, not as a pacing", () => {
    const selection: ModeSelection = { ...EMPTY_MODE_SELECTION, timings: ["timing_any"] };
    expect(defersTiming(selection)).toBe(true);
    // It asks for nothing, so the engine's realtime default stands until the interview settles it.
    expect(compile({ timings: ["timing_any"] }).status).toBe("ready");
    const timing = requirementsFor(selection).find((one) => one.key === "timing");
    expect(timing?.value).toBe("realtime");
    expect(timing?.sourceModes).toEqual([]);
  });

  it("never lets a setting tag block Forge", () => {
    const requirements = requirementsFor({ ...EMPTY_MODE_SELECTION, settings: ["survival"] });
    const fromSurvival = requirements.filter((one) => one.sourceModes.includes("survival"));
    expect(fromSurvival.length).toBeGreaterThan(0);
    expect(fromSurvival.every((one) => !one.required)).toBe(true);
  });
});

describe("capability compiler", () => {
  it("is ready for what the engine already does", () => {
    // puzzle needs proximity prompts and flag gates, both implemented today.
    expect(compile({ genres: ["puzzle"] }).status).toBe("ready");
  });

  it("runs the benchmark combo on real modules, and is honest about the one gap", () => {
    const resolution = compile({
      genres: ["first_person_shooter"],
      timings: ["turn_based"],
      structures: ["team"],
      settings: ["sci_fi"],
    });
    // Camera, physics, shooting, turn order and the squad are all implemented.
    expect(resolution.selectedModules.map((module) => module.moduleId)).toEqual(
      expect.arrayContaining([
        "fps_camera",
        "grounded_physics",
        "shooter_combat",
        "turn_scheduler",
        "team_party",
      ]),
    );
    // Only the multiplayer session is genuinely missing, and it says so.
    expect(missingKeys(resolution)).toEqual(["network:session"]);
    expect(resolution.status).toBe("needs_plugin");
  });

  it("offers an honest way out of the gap instead of a dead end", () => {
    const selection: ModeSelection = {
      ...EMPTY_MODE_SELECTION,
      genres: ["first_person_shooter"],
      timings: ["turn_based"],
      structures: ["team"],
    };
    const blocked = compile(selection);
    expect(blocked.substitutions.map((one) => one.missing)).toContain("network:session");

    // Accepting it swaps that one value and unblocks Forge, without dropping the squad.
    const resolved = compileCapabilities({
      requirements: requirementsFor(selection),
      modules: BUILTIN_MODULES,
      overrides: {},
      accepted: { "network:session": "network:offline" },
    });
    expect(resolved.status).toBe("ready");
    expect(resolved.selectedModules.map((one) => one.moduleId)).toContain("team_party");
  });

  it("never invents a substitute where the game would stop being the genre asked for", () => {
    // Racing without vehicle physics is a box sliding around; there is deliberately no way out.
    const racing = compile({ genres: ["racing"] });
    expect(missingKeys(racing)).toContain("physics:vehicle");
    expect(racing.substitutions.map((one) => one.missing)).not.toContain("physics:vehicle");
    expect(racing.status).toBe("needs_plugin");
  });

  it("splits two cameras into two play contexts instead of calling it a conflict", () => {
    // plan.md §0.9: one cartridge may hold an FPS stretch and a 2.5D stretch.
    const resolution = compile({ genres: ["first_person_shooter", "platformer"] });
    expect(resolution.conflicts).toEqual([]);
    expect(resolution.splitKeys).toContain("camera");
    expect(resolution.contexts).toHaveLength(2);
    expect(resolution.contexts.map((context) => context.sourceModes)).toEqual([
      ["first_person_shooter"],
      ["platformer"],
    ]);
    const cameras = resolution.contexts.flatMap((context) =>
      context.requirements.filter((one) => one.key === "camera").map((one) => one.value),
    );
    expect(cameras).toEqual(["first_person", "side"]);
  });

  it("keeps one pacing across both contexts when only one was asked for", () => {
    const resolution = compile({
      genres: ["first_person_shooter", "platformer"],
      timings: ["turn_based"],
    });
    for (const context of resolution.contexts) {
      const timing = context.requirements.filter((one) => one.key === "timing");
      expect(timing.map((one) => one.value)).toEqual(["turn_based"]);
    }
  });

  it("splits two pacings too, so a game can be real-time then turn-based", () => {
    const resolution = compile({ timings: ["realtime", "turn_based"] });
    expect(resolution.conflicts).toEqual([]);
    expect(resolution.splitKeys).toContain("timing");
    expect(resolution.contexts).toHaveLength(2);
    // Both pacings are implemented, so a cartridge really can run one stretch in real time and
    // the next in rounds.
    expect(resolution.contexts.map((context) => context.status)).toEqual(["ready", "ready"]);
  });

  it("keeps each context's own systems out of the other contexts", () => {
    // FPS + RTS + racing + a pacing + a setting tag: three contexts, and the RTS unit board must
    // not show up as a missing module inside the shooter context.
    const resolution = compile({
      genres: ["first_person_shooter", "real_time_strategy", "racing"],
      timings: ["turn_bar"],
      settings: ["cyberpunk"],
    });
    expect(resolution.contexts).toHaveLength(3);
    const [shooter, rts, racing] = resolution.contexts;
    const specs = (context: (typeof resolution.contexts)[number] | undefined): string[] =>
      (context?.requirements ?? []).map((one) => `${one.key}:${one.value}`);

    expect(specs(shooter)).toEqual(
      expect.arrayContaining(["camera:first_person", "combat:shooter"]),
    );
    expect(specs(shooter)).not.toContain("ui:unit_command");
    expect(specs(shooter)).not.toContain("content:unit_board");
    expect(specs(shooter)).not.toContain("content:track_layout");

    expect(specs(rts)).toEqual(expect.arrayContaining(["camera:top_down", "content:unit_board"]));
    expect(specs(rts)).not.toContain("combat:shooter");

    expect(specs(racing)).toEqual(
      expect.arrayContaining(["physics:vehicle", "content:track_layout"]),
    );
    expect(specs(racing)).not.toContain("ui:unit_command");

    // The one pacing and the engine defaults are genuinely shared by all three.
    for (const context of resolution.contexts) {
      expect(specs(context)).toContain("timing:turn_bar");
      expect(specs(context)).toContain("network:offline");
    }
  });

  it("keeps a coherent selection as a single context", () => {
    const resolution = compile({
      genres: ["first_person_shooter"],
      timings: ["turn_based"],
      structures: ["team"],
    });
    expect(resolution.splitKeys).toEqual([]);
    expect(resolution.contexts).toHaveLength(1);
    expect(resolution.contexts[0]?.contextId).toBe("main");
  });

  it("gives three different combos three different requirement sets", () => {
    const fps = compile({
      genres: ["first_person_shooter"],
      timings: ["turn_based"],
      structures: ["team"],
    });
    const racing = compile({ genres: ["racing", "racing_sim"] });
    const farm = compile({ genres: ["farming", "automation"] });
    const shape = (resolution: ReturnType<typeof compile>): string =>
      missingKeys(resolution).sort().join("|");
    expect(new Set([shape(fps), shape(racing), shape(farm)]).size).toBe(3);
    expect(missingKeys(racing)).toEqual(expect.arrayContaining(["content:track_layout"]));
    expect(missingKeys(farm)).toEqual(expect.arrayContaining(["progression:tech_tree"]));
  });
});

const AXIS_FIELD: Record<ModeAxis, keyof ModeSelection> = {
  genre: "genres",
  timing: "timings",
  structure: "structures",
  setting: "settings",
};

/** Substitutions the player would be offered for this one mode. */
function resolutionSubstitutions(mode: ModeDescriptor) {
  return SUBSTITUTIONS.filter((one) => mode.requires.includes(one.missing));
}

describe("selection limits and availability", () => {
  it("caps a selection at six modes", () => {
    expect(MAX_SELECTED_MODES).toBe(6);
  });

  it("marks a mode unselectable only when nothing implements it and nothing can stand in", () => {
    const fps = MODE_CATALOG.find((mode) => mode.id === "first_person_shooter");
    const racing = MODE_CATALOG.find((mode) => mode.id === "racing");
    const competitive = MODE_CATALOG.find((mode) => mode.id === "competitive");
    if (fps === undefined || racing === undefined || competitive === undefined) return;

    expect(isSelectable(fps)).toBe(true);
    // Racing has no vehicle physics and deliberately no substitute.
    expect(isSelectable(racing)).toBe(false);
    expect(unmetFor(racing)).toContain("physics:vehicle");
    // Competitive has no session module, but "NPC opponents" is an honest stand-in.
    expect(isSelectable(competitive)).toBe(true);
    expect(unmetFor(competitive)).toEqual([]);
  });

  it("never offers a selectable mode that would then block Forge", () => {
    for (const mode of MODE_CATALOG.filter(isSelectable)) {
      const resolution = compileCapabilities({
        requirements: requirementsFor({
          ...EMPTY_MODE_SELECTION,
          [AXIS_FIELD[mode.axis]]: [mode.id],
        } as ModeSelection),
        modules: BUILTIN_MODULES,
        overrides: {},
        accepted: Object.fromEntries(
          resolutionSubstitutions(mode).map((one) => [one.missing, one.use]),
        ),
      });
      // `needs_decision` is fine: that is an optional capability a setting tag merely hints at,
      // and it never blocks. What must never happen is a blocking status.
      expect({ mode: mode.id, blocked: resolution.status }).not.toEqual({
        mode: mode.id,
        blocked: "needs_plugin",
      });
      expect(resolution.conflicts).toEqual([]);
      expect(resolution.missingModules.filter((one) => one.required)).toEqual([]);
    }
  });
});
