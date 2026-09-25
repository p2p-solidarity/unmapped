import type { CameraMode } from "@shared/events";
import type { GameplayKitRules, GameplayRules } from "@shared/gameplay";
import { err, ok, type Result } from "@shared/result";
import type { SceneGraph } from "@shared/world";

export const LEGACY_TPS_KIT: GameplayKitRules = {
  id: "tps_exploration@1",
  moveSpeed: 4,
  sprintSpeed: 7,
  jumpSpeed: 6.4,
  gravity: 15,
  interactDistance: 2,
  cameraFov: 55,
  lookSensitivity: 0.0022,
  cameraDistance: 9,
};

export interface GameplayKitBehavior {
  camera: CameraMode;
  movement: "camera" | "side" | "topdown" | "grid" | "none";
  jump: boolean;
  sprint: boolean;
  flashlight: boolean;
  reticle: boolean;
  /** The scene is the middle of open land: no edge clamp, and chunks stream in around the player. */
  open: boolean;
}

const BEHAVIORS: Record<GameplayKitRules["id"], GameplayKitBehavior> = {
  "tps_exploration@1": {
    camera: "orbit",
    movement: "camera",
    jump: true,
    sprint: true,
    flashlight: false,
    reticle: false,
    open: true,
  },
  "fps_puzzle@1": {
    camera: "fps",
    movement: "camera",
    jump: false,
    sprint: false,
    flashlight: true,
    reticle: true,
    open: false,
  },
  "platformer_2_5d@1": {
    camera: "side",
    movement: "side",
    jump: true,
    sprint: true,
    flashlight: false,
    reticle: false,
    open: false,
  },
  "topdown_puzzle@1": {
    camera: "topdown",
    movement: "topdown",
    jump: false,
    sprint: false,
    flashlight: false,
    reticle: false,
    open: false,
  },
  // Visual novel / hidden object: the camera holds one framing and the player never walks.
  "vn_fixed@1": {
    camera: "fixed",
    movement: "none",
    jump: false,
    sprint: false,
    flashlight: false,
    reticle: false,
    open: false,
  },
  // Wizardry / Persona-dungeon maze: one tile per step, ninety degrees per turn.
  "dungeon_grid@1": {
    camera: "fps",
    movement: "grid",
    jump: false,
    sprint: false,
    flashlight: true,
    reticle: true,
    open: false,
  },
};

export function behaviorForKit(id: GameplayKitRules["id"]): GameplayKitBehavior {
  return BEHAVIORS[id];
}

/** Resolves the exact versioned kit selected by a scene contract. */
export function resolveSceneKit(rules: GameplayRules, scene: SceneGraph): Result<GameplayKitRules> {
  const kitId = scene.contract?.kit ?? rules.defaultKit;
  const kit = rules.kits.find((candidate) => candidate.id === kitId);
  return kit === undefined
    ? err(
        "gameplay-kit-missing",
        `Scene requires gameplay kit ${kitId}, but rules.oui does not configure it.`,
        "Repair or reinstall this cartridge revision.",
      )
    : ok(kit);
}
