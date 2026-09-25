import type { WeaponSpec } from "./combat";
import type { ProgressionRule } from "./progression";
import type { TimingSystemId, TurnResolution } from "./timing";

export const GAMEPLAY_KIT_IDS = [
  "tps_exploration@1",
  "fps_puzzle@1",
  "platformer_2_5d@1",
  "topdown_puzzle@1",
  "vn_fixed@1",
  "dungeon_grid@1",
] as const;
export type GameplayKitId = (typeof GAMEPLAY_KIT_IDS)[number];

export const GAMEPLAY_PHYSICS_MODES = ["grounded"] as const;
export type GameplayPhysicsMode = (typeof GAMEPLAY_PHYSICS_MODES)[number];

export const INPUT_ACTIONS = [
  "move_forward",
  "move_backward",
  "move_left",
  "move_right",
  "sprint",
  "jump",
  "interact",
  "grab",
  "flashlight",
  "inspect",
  "fire",
  "end_turn",
  "pause",
] as const;
export type InputAction = (typeof INPUT_ACTIONS)[number];

export const INPUT_CODES = [
  "KeyW",
  "KeyA",
  "KeyS",
  "KeyD",
  "KeyE",
  "KeyF",
  "KeyG",
  "KeyR",
  "KeyP",
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "ShiftLeft",
  "ShiftRight",
  "Space",
  "MouseLeft",
  "MouseRight",
] as const;
export type InputCode = (typeof INPUT_CODES)[number];

export interface GameplayKitRules {
  id: GameplayKitId;
  moveSpeed: number;
  sprintSpeed: number;
  jumpSpeed: number;
  gravity: number;
  interactDistance: number;
  cameraFov: number;
  lookSensitivity: number;
  cameraDistance: number;
}

/** How the cartridge paces a turn. Null when it never leaves real time. */
export interface TimingRules {
  system: TimingSystemId;
  resolution: TurnResolution;
  /** Seconds a planning phase lasts before it auto-commits; 0 means untimed. */
  turnSeconds: number;
}

export const GENERATOR_KINDS = ["maze"] as const;
export type GeneratorKind = (typeof GENERATOR_KINDS)[number];

/**
 * Layout generation (`maze_generation@1`). The author still decides the head and the tail — the
 * spawn tile and the scene's Exit — and this only fills in what lies between them.
 */
export interface GenerationRules {
  kind: GeneratorKind;
  /** Floor size to generate, in tiles. 0 keeps the authored floor. */
  width: number;
  depth: number;
  /** 0 = one route with dead ends, 100 = mostly open ground. */
  braid: number;
}

/** Local squad slots (`team_party@1`). Null for a solo cartridge. */
export interface PartyRules {
  /** Allies besides the player, 1..5. */
  size: number;
  memberHp: number;
  memberSpeed: number;
}

/** Combat tuning. Null for a cartridge with no combat at all. */
export interface CombatRules {
  playerHp: number;
  monsterHpBase: number;
  monsterHpPerLevel: number;
}

export interface GameplayRules {
  defaultKit: GameplayKitId;
  physics: GameplayPhysicsMode;
  kits: GameplayKitRules[];
  bindings: Partial<Record<InputAction, InputCode[]>>;
  timing: TimingRules | null;
  combat: CombatRules | null;
  party: PartyRules | null;
  generation: GenerationRules | null;
  /** Declared progression systems. Empty for a cartridge that tracks nothing. */
  progression: ProgressionRule[];
  /** Declared weapons. Empty for a cartridge that never arms the player. */
  weapons: WeaponSpec[];
}

export const INVENTORY_POLICIES = ["carry", "reset"] as const;
export type InventoryPolicy = (typeof INVENTORY_POLICIES)[number];

export interface SceneContract {
  requiredProfileId?: string;
  requiredContextId?: string;
  requiredModules?: string[];
  sceneId: string;
  kit: GameplayKitId;
  requiresFlags: string[];
  requiresItems: string[];
  inventoryPolicy: InventoryPolicy;
  /** Flags set to true after the scene completes. */
  grantsFlags: string[];
  terminal: boolean;
}
