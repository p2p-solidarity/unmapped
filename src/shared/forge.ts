// Profile → cartridge. The deterministic half of Forge: given a resolved capability profile and a
// Scene Base, this works out the rules and the scene that express them. No model involved, so a
// player can build and play a cartridge with nothing running locally.
//
// Rule 7 all the way down: the output is a GameplayRules value and a SceneGraph, both of which are
// serialised through the DSL before anything is published. Nothing here writes `.oui` text.

import type { CapabilityProfile } from "./capabilities";
import type { GameplayKitId, GameplayRules } from "./gameplay";
import type { ProgressionKind, ProgressionRule } from "./progression";
import { exitTile, type SceneBase } from "./scene-bases";
import { TIMING_SYSTEMS, type TimingSystemId } from "./timing";
import type { PropKind, SceneGraph } from "./world";

/** Value of one capability key in the profile, or null when the profile never decided it. */
function pickValue(profile: CapabilityProfile, key: string): string | null {
  return profile.entries.find((entry) => entry.key === key)?.value ?? null;
}

function pickValues(profile: CapabilityProfile, key: string): string[] {
  return profile.entries.filter((entry) => entry.key === key).map((entry) => entry.value);
}

/**
 * The engine kit that plays a camera + physics pair. This is the seam the capability layer was
 * built to replace, and it still narrows to a kit id because scene contracts are versioned on one.
 */
export function kitFor(profile: CapabilityProfile): GameplayKitId {
  const camera = pickValue(profile, "camera") ?? "third_person";
  const physics = pickValue(profile, "physics") ?? "grounded";
  if (physics === "grid_step") return "dungeon_grid@1";
  if (camera === "fixed") return "vn_fixed@1";
  if (camera === "first_person") return "fps_puzzle@1";
  if (camera === "side") return "platformer_2_5d@1";
  if (camera === "top_down") return "topdown_puzzle@1";
  return "tps_exploration@1";
}

/** Stock tuning per kit, the same numbers the engine's own default rules use. */
const KIT_TUNING: Record<GameplayKitId, Omit<GameplayRules["kits"][number], "id">> = {
  "tps_exploration@1": {
    moveSpeed: 4,
    sprintSpeed: 7,
    jumpSpeed: 6.4,
    gravity: 15,
    interactDistance: 2,
    cameraFov: 55,
    lookSensitivity: 0.0022,
    cameraDistance: 9,
  },
  "fps_puzzle@1": {
    moveSpeed: 3.5,
    sprintSpeed: 5,
    jumpSpeed: 0,
    gravity: 15,
    interactDistance: 3,
    cameraFov: 70,
    lookSensitivity: 0.0022,
    cameraDistance: 0,
  },
  "platformer_2_5d@1": {
    moveSpeed: 4.5,
    sprintSpeed: 7,
    jumpSpeed: 7,
    gravity: 17,
    interactDistance: 2,
    cameraFov: 50,
    lookSensitivity: 0.0022,
    cameraDistance: 12,
  },
  "topdown_puzzle@1": {
    moveSpeed: 4,
    sprintSpeed: 5,
    jumpSpeed: 0,
    gravity: 15,
    interactDistance: 2.5,
    cameraFov: 48,
    lookSensitivity: 0.0022,
    cameraDistance: 14,
  },
  "vn_fixed@1": {
    moveSpeed: 0,
    sprintSpeed: 0,
    jumpSpeed: 0,
    gravity: 15,
    interactDistance: 4,
    cameraFov: 50,
    lookSensitivity: 0.0022,
    cameraDistance: 10,
  },
  "dungeon_grid@1": {
    moveSpeed: 4,
    sprintSpeed: 4,
    jumpSpeed: 0,
    gravity: 15,
    interactDistance: 2,
    cameraFov: 70,
    lookSensitivity: 0.0022,
    cameraDistance: 0,
  },
};

const DEFAULT_BINDINGS: GameplayRules["bindings"] = {
  move_forward: ["KeyW", "ArrowUp"],
  move_backward: ["KeyS", "ArrowDown"],
  move_left: ["KeyA", "ArrowLeft"],
  move_right: ["KeyD", "ArrowRight"],
  sprint: ["ShiftLeft", "ShiftRight"],
  jump: ["Space"],
  interact: ["KeyE"],
  grab: ["KeyG"],
  flashlight: ["KeyF"],
  fire: ["MouseLeft"],
  end_turn: ["KeyR"],
  pause: ["KeyP"],
};

/** Tuning numbers a progression kind carries; 0 where the kind needs none. */
const PROGRESSION_VALUE: Partial<Record<ProgressionKind, number>> = {
  score_run: 10,
  stat_growth: 3,
};

export function rulesFor(profile: CapabilityProfile): GameplayRules {
  const kit = kitFor(profile);
  const timing = pickValue(profile, "timing") ?? "realtime";
  const system = (TIMING_SYSTEMS as readonly string[]).includes(timing)
    ? (timing as TimingSystemId)
    : "realtime";
  const combatKinds = pickValues(profile, "combat");
  const armed = combatKinds.length > 0;
  const melee = combatKinds.includes("melee") && !combatKinds.includes("shooter");
  const squad = pickValues(profile, "party").includes("squad");
  const generated = pickValues(profile, "content").some(
    (value) => value === "procedural_runs" || value === "maze",
  );

  const progression: ProgressionRule[] = pickValues(profile, "progression")
    // flag/ability gating lives on the scene contract, not as a tracked counter.
    .filter((value) => value !== "flag_gate" && value !== "ability_gate")
    .map((value) => ({
      kind: value as ProgressionKind,
      value: PROGRESSION_VALUE[value as ProgressionKind] ?? 0,
    }));

  return {
    defaultKit: kit,
    physics: "grounded",
    kits: [{ id: kit, ...KIT_TUNING[kit] }],
    bindings: DEFAULT_BINDINGS,
    timing:
      system === "realtime"
        ? null
        : {
            system,
            resolution: squad ? "shared_team" : "per_player",
            // A tick round is driven by the clock, so it needs a length; the others wait for input.
            turnSeconds: system === "tick" ? 2 : 0,
          },
    combat: armed ? { playerHp: 100, monsterHpBase: 30, monsterHpPerLevel: 10 } : null,
    party: squad ? { size: 2, memberHp: 60, memberSpeed: 8 } : null,
    generation: generated ? { kind: "maze", width: 0, depth: 0, braid: 18 } : null,
    progression,
    weapons: armed
      ? [
          melee
            ? {
                id: "sidearm",
                name: "近身武器",
                kind: "melee" as const,
                damage: 32,
                range: 1.8,
                cooldownMs: 600,
                magazine: null,
              }
            : {
                id: "sidearm",
                name: "制式槍械",
                kind: "gun" as const,
                damage: 22,
                range: 22,
                cooldownMs: 320,
                magazine: 12,
              },
        ]
      : [],
  };
}

/** Deterministic scatter so the same base always composes the same way before generation runs. */
function scatter(base: SceneBase, count: number): { kind: PropKind; x: number; z: number }[] {
  const placed: { kind: PropKind; x: number; z: number }[] = [];
  const centreX = Math.floor(base.width / 2);
  const centreZ = Math.floor(base.depth / 2);
  for (let index = 0; index < count; index += 1) {
    const kind = base.props[index % base.props.length];
    if (kind === undefined) continue;
    // A deterministic spiral keeps props spread out without needing a random source here.
    const angle = index * 2.39996;
    const radius = 2 + (index / count) * (Math.min(base.width, base.depth) / 2 - 3);
    const x = Math.round(centreX + Math.cos(angle) * radius);
    const z = Math.round(centreZ + Math.sin(angle) * radius);
    if (x < 1 || z < 1 || x >= base.width - 1 || z >= base.depth - 1) continue;
    if (Math.abs(x - centreX) + Math.abs(z - centreZ) < 3) continue;
    placed.push({ kind, x, z });
  }
  return placed;
}

export interface SceneForgeInput {
  base: SceneBase;
  profile: CapabilityProfile;
  sceneId: string;
  title: string;
  /** Monsters to place; 0 for a cartridge with no combat. */
  monsters: number;
}

export function sceneFor(input: SceneForgeInput): SceneGraph {
  const { base } = input;
  const sandbox = pickValues(input.profile, "physics").includes("rigid_body");
  const exit = exitTile(base);
  const centreX = Math.floor(base.width / 2);
  const centreZ = Math.floor(base.depth / 2);

  return {
    name: input.title,
    biome: base.biome,
    contract: {
      sceneId: input.sceneId,
      kit: kitFor(input.profile),
      requiresFlags: [],
      requiresItems: [],
      inventoryPolicy: "carry",
      grantsFlags: [`${input.sceneId}_done`],
      terminal: true,
    },
    floor: { width: base.width, depth: base.depth, tile: base.tile },
    patches: [],
    platforms: [],
    walls: [],
    // In a sandbox the base's own scatter is what you get to throw around; nothing extra is
    // invented for it, the same props are simply simulated instead of nailed down.
    props: scatter(base, 14).map((prop) => ({
      ...prop,
      scale: 1.2,
      tint: null,
      dynamic: sandbox,
    })),
    npcs: [],
    monsters: Array.from({ length: input.monsters }, (_, index) => {
      const angle = index * 1.7 + 0.6;
      const radius = Math.min(base.width, base.depth) / 2 - 3;
      return {
        id: `foe_${index + 1}`,
        kind: index % 2 === 0 ? ("drone" as const) : ("golem" as const),
        x: Math.max(1, Math.min(base.width - 2, Math.round(centreX + Math.cos(angle) * radius))),
        z: Math.max(1, Math.min(base.depth - 2, Math.round(centreZ + Math.sin(angle) * radius))),
        level: 1 + (index % 3),
        weakness: "",
        size: index % 2 === 0 ? 1 : 1.3,
        color: null,
      };
    }),
    treasures: [],
    exits: [{ x: exit.x, z: exit.z, to: "Exit", targetSceneId: null }],
    lights: base.lights.map((light) => ({
      kind: light.kind,
      color: light.color,
      intensity: light.intensity,
      x: light.kind === "point" ? centreX : null,
      z: light.kind === "point" ? centreZ : null,
    })),
    sky: base.sky,
    triggers: [],
    quests: [],
  };
}
