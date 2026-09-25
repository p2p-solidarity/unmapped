// World vocabulary shared by the DSL (zod schemas), the 3D engine (renderers), the narrative
// layer (prompts) and the main process (dotfiles). Enums are `as const` tuples so the DSL can
// build z.enum() from them and prompts can list the legal values verbatim.

import type { SceneContract } from "./gameplay";

export const BIOMES = [
  "meadow",
  "onsen_town",
  "ruined_castle",
  "cyber_workshop",
  "abyss",
  "sky_isle",
  "snowfield",
  "lava_forge",
  "countryside",
] as const;
export type Biome = (typeof BIOMES)[number];

export const TILES = ["grass", "stone", "sand", "snow", "wood", "lava", "water", "void"] as const;
export type Tile = (typeof TILES)[number];

export const PROP_KINDS = [
  "tree",
  "rock",
  "torch",
  "crate",
  "altar",
  "well",
  "statue",
  "pillar",
  "fence",
  "flower",
  "mushroom",
  "signpost",
  "machine_gear",
  "conveyor",
  "boiler",
  "pipe_stack",
  "crane",
  "reactor",
  // The countryside of open land (plan.md §2).
  "utility_pole",
  "vending_machine",
  "bus_stop",
  "rail_track",
  "chimney",
  "steel_tower",
  "windmill",
  "breakwater",
  "house",
] as const;
export type PropKind = (typeof PROP_KINDS)[number];

export const NPC_ROLES = [
  "merchant",
  "monk",
  "smith",
  "farmer",
  "guard",
  "child",
  "elder",
  "bard",
  "stranger",
] as const;
export type NpcRole = (typeof NPC_ROLES)[number];

export const MOODS = ["calm", "joyful", "wary", "mournful", "manic", "cryptic"] as const;
export type Mood = (typeof MOODS)[number];

export const MONSTER_KINDS = [
  "slime",
  "skeleton",
  "drone",
  "golem",
  "wisp",
  "serpent",
  "fox_spirit",
  "shade",
] as const;
export type MonsterKind = (typeof MONSTER_KINDS)[number];

export const LIGHT_KINDS = ["ambient", "sun", "point"] as const;
export type LightKind = (typeof LIGHT_KINDS)[number];

// Character bodies ("角色本體"): every NPC is assembled from a build + headwear + held item, so the
// model can describe a cast of distinct villagers without any 3D asset pipeline.
export const BODY_KINDS = ["slim", "stout", "tall", "child", "elder"] as const;
export type BodyKind = (typeof BODY_KINDS)[number];

export const HAT_KINDS = [
  "none",
  "straw",
  "hood",
  "crown",
  "helm",
  "horns",
  "ribbon",
  "halo",
  "headband",
] as const;
export type HatKind = (typeof HAT_KINDS)[number];

export const HELD_KINDS = [
  "none",
  "staff",
  "sword",
  "lantern",
  "basket",
  "scroll",
  "hammer",
  "bow",
  "fan",
  "lute",
  "spear",
] as const;
export type HeldKind = (typeof HELD_KINDS)[number];

export const CHOICE_ACTIONS = ["talk", "fight", "trade", "open_exit", "craft", "leave"] as const;
export type ChoiceAction = (typeof CHOICE_ACTIONS)[number];

export const ITEM_KINDS = [
  "sword",
  "rapier",
  "bow",
  "staff",
  "gun",
  "tool",
  "charm",
  "armor",
  "consumable",
] as const;
export type ItemKind = (typeof ITEM_KINDS)[number];

// ── Scene graph: the typed output of parsing a `world.oui` program ───────────────────────────

export interface FloorSpec {
  width: number;
  depth: number;
  tile: Tile;
}
export interface WallSpec {
  x: number;
  z: number;
  width: number;
  height: number;
  material: Tile;
}
export interface PropSpec {
  /** Optional declared asset; legacy props retain their kind-only representation. */
  assetId?: string;
  kind: PropKind;
  x: number;
  z: number;
  scale: number;
  /** Hex colour override or null for the biome default. */
  tint: string | null;
  /**
   * A free rigid body rather than scenery: it falls, collides, and can be grabbed and thrown
   * (`rigid_body@1`). False props are baked into the instanced batch with a fixed collider.
   */
  dynamic: boolean;
}
export interface NpcSpec {
  id: string;
  name: string;
  x: number;
  z: number;
  role: NpcRole;
  mood: Mood;
  /** Hex body colour. */
  color: string;
  /** Build of the humanoid; the DSL defaults it from `role` when omitted. */
  body: BodyKind;
  hat: HatKind;
  held: HeldKind;
  /** Hex accent colour (scarf, trim, held-item glow); defaults from `color`. */
  accent: string;
}
export interface MonsterSpec {
  id: string;
  kind: MonsterKind;
  x: number;
  z: number;
  level: number;
  /** Free-text weakness the model invents ("hates bad puns"). */
  weakness: string;
  /** Relative scale 0.5..3; 1 = the kind's default silhouette. */
  size: number;
  /** Hex tint override or null for the kind's default palette. */
  color: string | null;
}
/** A raised (possibly floating) block the player can jump onto. */
export interface PlatformSpec {
  x: number;
  z: number;
  width: number;
  depth: number;
  /** Elevation of the platform's underside above the floor top, in tiles. */
  y: number;
  /** Thickness in tiles. */
  height: number;
  tile: Tile;
  /** Bounce pad: landing on it launches the player upward. */
  bounce: boolean;
}
/** A rectangular tile override painted onto the floor: paths, ponds, lava pools, snow drifts. */
export interface PatchSpec {
  x: number;
  z: number;
  width: number;
  depth: number;
  tile: Tile;
}
export interface TreasureSpec {
  id: string;
  x: number;
  z: number;
  loot: string[];
}
export interface ExitSpec {
  x: number;
  z: number;
  /** Label of the next floor, fed back into the next generation prompt. */
  to: string;
  /** Stable destination identity. Null only for legacy/generated scenes not yet in a cartridge. */
  targetSceneId: string | null;
}
export interface LightSpec {
  kind: LightKind;
  color: string;
  intensity: number;
  /** Tile position for point lights; null = scene centre. Ignored for ambient/sun. */
  x: number | null;
  z: number | null;
}
export interface SkySpec {
  color: string;
  fog: string;
  fogDensity: number;
}
export interface TriggerSpec {
  id: string;
  x: number;
  z: number;
  radius: number;
  event: string;
}
export interface QuestSpec {
  id: string;
  text: string;
}

export interface SceneGraph {
  name: string;
  biome: Biome;
  /** Required for published cartridges; null keeps legacy generated scenes loadable for migration. */
  contract: SceneContract | null;
  floor: FloorSpec;
  patches: PatchSpec[];
  platforms: PlatformSpec[];
  walls: WallSpec[];
  props: PropSpec[];
  npcs: NpcSpec[];
  monsters: MonsterSpec[];
  treasures: TreasureSpec[];
  exits: ExitSpec[];
  lights: LightSpec[];
  sky: SkySpec | null;
  triggers: TriggerSpec[];
  quests: QuestSpec[];
}

// ── Dialogue: typed output of a `Dialogue` program ───────────────────────────────────────────

/** Actions the v0.1 engine can honour. "fight" stays in CHOICE_ACTIONS for future combat. */
export const DIALOGUE_ACTIONS = ["talk", "trade", "open_exit", "craft", "leave"] as const;
export type DialogueAction = (typeof DIALOGUE_ACTIONS)[number];

export interface DialogueChoice {
  label: string;
  action: DialogueAction;
  /** What happens in the world if chosen; appended to karma.jsonl. */
  effect: string;
  /** Material names granted to the player when this choice is taken (may be empty). */
  gives: string[];
}
export interface WorldMutation {
  skyColor: string | null;
  fogDensity: number | null;
  biome: Biome | null;
}
export interface DialogueGraph {
  npcId: string;
  line: string;
  choices: DialogueChoice[];
  mutation: WorldMutation | null;
}

// ── Items: typed output of an `Item` program (wish altar) ────────────────────────────────────

export interface ItemSpec {
  id: string;
  name: string;
  kind: ItemKind;
  /** 0..100 relative to the world's power ceiling. */
  power: number;
  perk: string;
  curse: string | null;
  /** Mesh DNA: primitive part names the engine assembles ("blade_curved", "gear_pommel"). */
  meshDna: string[];
  /** Semantic core used for cross-world re-compilation ("water", "restoration"). */
  archetype: string[];
  flavor: string;
}

// ── World dotfiles ───────────────────────────────────────────────────────────────────────────

export const ARCHETYPES = ["farm", "delve", "quest"] as const;
export type Archetype = (typeof ARCHETYPES)[number];

export const PHYSICS_MODES = ["gentle", "destructible", "elemental"] as const;
export type PhysicsMode = (typeof PHYSICS_MODES)[number];

/** Narrative facts shared by new definitions and legacy covenants. */
export interface NarrativeContext {
  language: string;
  intent: string;
}

export interface Genesis {
  archetype: Archetype;
  physics: PhysicsMode;
  /** BCP-47 tag of the player's language; the model answers in it (Babel). */
  language: string;
  seed: number;
  /** Player's free-text covenant answer, verbatim. */
  intent: string;
  createdAt: string;
}

export interface WorldMeta {
  id: string;
  name: string;
  archetype?: Archetype;
  createdAt: string;
  updatedAt: string;
  floor: number;
  /** The current dialogue atmosphere overlay, persisted with the world metadata. */
  mutation: WorldMutation | null;
  /** Quest switches and counters set by tools (see src/shared/effects.ts). Missing = {}. */
  flags: Record<string, string | number | boolean>;
  /** Names of installed mods enabled for this world, in mount order. Missing = []. */
  mods: string[];
}

/** Ledger actions beyond dialogue choices. `witness`, `request` and `note` belong to open land. */
export const LEDGER_ACTIONS = ["wish", "genesis", "floor", "witness", "request", "note"] as const;

export interface KarmaEntry {
  at: string;
  floor: number;
  npcId: string | null;
  choice: string;
  action: ChoiceAction | (typeof LEDGER_ACTIONS)[number];
  effect: string;
  /** The chunk of open land this happened on; absent in a bounded scene. */
  cx?: number;
  cz?: number;
}

export interface Inventory {
  items: ItemSpec[];
  materials: string[];
}

export const WORLD_FILES = {
  scene: "world.oui",
  genesis: "genesis.json",
  karma: "karma.jsonl",
  inventory: "inventory.json",
  meta: "meta.json",
} as const;
export type WorldFile = (typeof WORLD_FILES)[keyof typeof WORLD_FILES];
export const WORLD_FILE_NAMES: readonly WorldFile[] = Object.values(WORLD_FILES);

export const EMPTY_INVENTORY: Inventory = { items: [], materials: [] };
