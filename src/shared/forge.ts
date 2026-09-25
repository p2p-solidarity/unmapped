// Profile → cartridge. The deterministic half of Forge resolves capability profiles to
// versioned kits and gameplay rules. No model involved; rules are serialised through the DSL.

import type { CapabilityProfile } from "./capabilities";
import type { GameplayKitId, GameplayRules } from "./gameplay";
import type { ProgressionKind, ProgressionRule } from "./progression";
import { TIMING_SYSTEMS, type TimingSystemId } from "./timing";

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

/** Stock tuning of one kit, for a scene that plays a kit its cartridge did not start with. */
export function kitTuning(kit: GameplayKitId): GameplayRules["kits"][number] {
  return { id: kit, ...KIT_TUNING[kit] };
}

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
