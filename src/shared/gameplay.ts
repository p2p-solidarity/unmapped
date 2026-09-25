export const GAMEPLAY_KIT_IDS = [
  "tps_exploration@1",
  "fps_puzzle@1",
  "platformer_2_5d@1",
  "topdown_puzzle@1",
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
  "flashlight",
  "inspect",
] as const;
export type InputAction = (typeof INPUT_ACTIONS)[number];

export const INPUT_CODES = [
  "KeyW",
  "KeyA",
  "KeyS",
  "KeyD",
  "KeyE",
  "KeyF",
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

export interface GameplayRules {
  defaultKit: GameplayKitId;
  physics: GameplayPhysicsMode;
  kits: GameplayKitRules[];
  bindings: Partial<Record<InputAction, InputCode[]>>;
}

export const INVENTORY_POLICIES = ["carry", "reset"] as const;
export type InventoryPolicy = (typeof INVENTORY_POLICIES)[number];

export interface SceneContract {
  sceneId: string;
  kit: GameplayKitId;
  requiresFlags: string[];
  requiresItems: string[];
  inventoryPolicy: InventoryPolicy;
  /** Flags set to true after the scene completes. */
  grantsFlags: string[];
  terminal: boolean;
}
