// The builtin module registry: exactly what this engine implements today, and nothing else.
//
// This file is the one place that answers "can Unwritten Land actually do X?". Adding a line for
// something that does not run is the failure plan.md §2.3 forbids, so every entry carries an
// `implementedBy` receipt naming real code. Splitting it out of `capabilities.ts` keeps the
// compiler (an algorithm) separate from the inventory (data that changes as modules land).

import { type CapabilityModule, type CapabilitySpec, SUBSTITUTIONS } from "./capabilities";
import type { ModeDescriptor } from "./mode-catalog";

export const BUILTIN_MODULES: readonly CapabilityModule[] = [
  {
    moduleId: "fps_camera",
    version: "1",
    source: "builtin",
    provides: ["camera:first_person"],
    requires: [],
    deterministic: true,
    implementedBy: "src/renderer/engine/CameraRig.tsx (fps branch, pointer lock)",
  },
  {
    moduleId: "tps_camera",
    version: "1",
    source: "builtin",
    provides: ["camera:third_person"],
    requires: [],
    deterministic: true,
    implementedBy: "src/renderer/engine/CameraRig.tsx (orbit branch)",
  },
  {
    moduleId: "side_camera",
    version: "1",
    source: "builtin",
    provides: ["camera:side"],
    requires: [],
    deterministic: true,
    implementedBy: "src/renderer/engine/CameraRig.tsx (side branch)",
  },
  {
    moduleId: "topdown_camera",
    version: "1",
    source: "builtin",
    provides: ["camera:top_down"],
    requires: [],
    deterministic: true,
    implementedBy: "src/renderer/engine/CameraRig.tsx (topdown branch)",
  },
  {
    moduleId: "grounded_physics",
    version: "1",
    source: "builtin",
    provides: ["physics:grounded"],
    requires: [],
    deterministic: false,
    implementedBy: "src/renderer/engine/Player.tsx (Rapier kinematic capsule, static colliders)",
  },
  {
    moduleId: "rigid_body",
    version: "1",
    source: "builtin",
    // Freely simulated bodies plus the verb that makes them a sandbox rather than debris.
    provides: ["physics:rigid_body"],
    requires: ["grounded_physics@1"],
    deterministic: false,
    implementedBy:
      "src/renderer/engine/sandbox/ (dynamic Prop bodies, PhysGun grab/throw) + src/shared/grab.ts",
  },
  {
    moduleId: "proximity_interaction",
    version: "1",
    source: "builtin",
    // The same target registry powers the walk-up prompt and the first-person click-to-inspect.
    provides: ["ui:proximity_prompt", "ui:inspect_hotspot"],
    requires: [],
    deterministic: true,
    implementedBy: "src/renderer/engine/Proximity.tsx + engine/targets.ts + CameraRig inspect",
  },
  {
    moduleId: "flag_progression",
    version: "1",
    source: "builtin",
    // `requiresItems` on a scene contract is exactly an ability gate: no grapple, no door.
    provides: ["progression:flag_gate", "progression:ability_gate"],
    requires: [],
    deterministic: true,
    implementedBy: "src/shared/sceneTransition.ts (requiresFlags / requiresItems / grantsFlags)",
  },
  {
    moduleId: "offline_session",
    version: "1",
    source: "builtin",
    provides: ["network:offline"],
    requires: [],
    deterministic: true,
    implementedBy: "single-process play; no session protocol involved",
  },
  {
    moduleId: "realtime_timing",
    version: "1",
    source: "builtin",
    provides: ["timing:realtime"],
    requires: [],
    deterministic: false,
    implementedBy: "src/renderer/engine/Player.tsx useFrame loop (no scheduler, wall-clock pacing)",
  },
  {
    moduleId: "turn_scheduler",
    version: "1",
    source: "builtin",
    provides: [
      "timing:turn_based",
      "timing:turn_bar",
      "timing:initiative",
      "timing:phase_based",
      "timing:revolver",
      "timing:tick",
      "timing:real_time_with_pause",
    ],
    requires: [],
    deterministic: true,
    implementedBy: "src/shared/timing.ts + engine/combat/CombatControl.tsx (pause key, tick clock)",
  },
  {
    moduleId: "shooter_combat",
    version: "1",
    source: "builtin",
    // A melee swing is the same hitscan with a short-range Weapon; the DSL already declares both.
    provides: ["combat:shooter", "combat:melee"],
    requires: [],
    deterministic: true,
    implementedBy: "src/shared/combat.ts (hitscan, damage) + engine/combat/CombatControl.tsx",
  },
  {
    moduleId: "team_party",
    version: "1",
    source: "builtin",
    provides: ["party:squad"],
    requires: ["shooter_combat@1"],
    deterministic: true,
    implementedBy: "src/renderer/engine/combat/Squad.tsx + encounter roster",
  },
  {
    moduleId: "run_progression",
    version: "1",
    source: "builtin",
    provides: ["progression:run_based", "progression:score_run", "progression:stat_growth"],
    requires: [],
    deterministic: true,
    implementedBy: "src/shared/progression.ts + renderer/state/runStore.ts",
  },
  {
    moduleId: "dialogue_ui",
    version: "1",
    source: "builtin",
    provides: ["ui:dialogue_choices"],
    requires: [],
    deterministic: false,
    implementedBy: "src/renderer/narrative/ui/DialogueCard.tsx + narrative/dialogue.ts",
  },
  {
    moduleId: "wish_crafting",
    version: "1",
    source: "builtin",
    provides: ["progression:crafting"],
    requires: [],
    deterministic: false,
    implementedBy: "src/renderer/narrative/ui/AltarPanel.tsx + narrative/item.ts",
  },
  {
    moduleId: "narrative_layer",
    version: "1",
    source: "builtin",
    provides: ["content:narrative"],
    requires: [],
    deterministic: false,
    implementedBy: "src/renderer/narrative (scene / dialogue / item generation against the DSL)",
  },
  {
    moduleId: "fixed_camera",
    version: "1",
    source: "builtin",
    provides: ["camera:fixed"],
    requires: [],
    deterministic: true,
    implementedBy: "src/renderer/engine/CameraRig.tsx (fixed branch) + the vn_fixed@1 kit",
  },
  {
    moduleId: "grid_movement",
    version: "1",
    source: "builtin",
    provides: ["physics:grid_step"],
    requires: [],
    deterministic: true,
    implementedBy: "src/renderer/engine/gridStep.ts + Player.tsx grid branch (dungeon_grid@1 kit)",
  },
  {
    moduleId: "maze_generation",
    version: "1",
    source: "builtin",
    // A real generated layout with a guaranteed route, so roguelikes get the thing they mean.
    provides: ["content:procedural_runs", "content:maze"],
    requires: [],
    deterministic: true,
    implementedBy:
      "src/shared/maze.ts (carve + braid + BFS route) via the Generate rules statement",
  },
  {
    moduleId: "run_shuffle",
    version: "1",
    source: "builtin",
    provides: ["content:run_shuffle"],
    requires: [],
    deterministic: true,
    implementedBy: "src/shared/runShuffle.ts, applied at scene load from the run seed",
  },
  {
    moduleId: "platform_content",
    version: "1",
    source: "builtin",
    provides: ["content:platform_layout"],
    requires: ["grounded_physics@1"],
    deterministic: true,
    implementedBy: "Platform/Patch in the Scene DSL + engine/Platforms.tsx bounce pads",
  },
];

// ── Availability ─────────────────────────────────────────────────────────────────────────────
//
// The matrix uses this to grey out a mode rather than let someone pick it and hit a wall two
// screens later. A mode is selectable when every capability it asks for is either implemented or
// has a stated substitution the player can accept.

const PROVIDED: ReadonlySet<CapabilitySpec> = new Set(
  BUILTIN_MODULES.flatMap((module) => module.provides),
);

/** Capabilities this mode needs that nothing implements and nothing can honestly stand in for. */
export function unmetFor(mode: ModeDescriptor): CapabilitySpec[] {
  return mode.requires.filter(
    (spec) => !PROVIDED.has(spec) && SUBSTITUTIONS.every((one) => one.missing !== spec),
  );
}

export function isSelectable(mode: ModeDescriptor): boolean {
  return unmetFor(mode).length === 0;
}
