import type { ModuleLock } from "./capabilities";
import type { EndlessState } from "./endless";
import type { GameDefinition } from "./game-definition";
import type { GameplayKitId } from "./gameplay";
import type { LandProgress } from "./land";
import type { ModLock } from "./mods";
import type { PartyState, PlayerState } from "./player";
import type { StoryPlan } from "./story";
import type { Genesis, Inventory, KarmaEntry, WorldMutation } from "./world";

export * from "./gameplay";

export const LEGACY_CARTRIDGE_FORMAT_VERSION = 1 as const;
export const CARTRIDGE_FORMAT_VERSION = 2 as const;
export const LEGACY_INSTANCE_FORMAT_VERSION = 1 as const;
export const INSTANCE_FORMAT_VERSION = 2 as const;
export const LEGACY_SAVE_FORMAT_VERSION = 1 as const;
export const SAVE_FORMAT_VERSION = 2 as const;
export const WORKSPACE_FORMAT_VERSION = 1 as const;
/** Runtime contract this build implements; a cartridge asking for more cannot be played here. */
export const ENGINE_API_VERSION = 1 as const;
/** Durable save shape this build writes; Phase A refuses to upgrade across a different one. */
export const SAVE_SCHEMA_VERSION = 1 as const;
export const NETWORK_PROTOCOL_VERSION = 1 as const;
export const LEGACY_MIGRATION_FORMAT_VERSION = 1 as const;

const SEMVER =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;

/** Compare two validated SemVer strings using precedence rules (build metadata is ignored). */
export function compareCartridgeVersions(left: string, right: string): number {
  const a = SEMVER.exec(left);
  const b = SEMVER.exec(right);
  if (a === null || b === null) return left.localeCompare(right);
  for (let index = 1; index <= 3; index += 1) {
    const aNumber = BigInt(a[index] ?? 0);
    const bNumber = BigInt(b[index] ?? 0);
    if (aNumber !== bNumber) return aNumber < bNumber ? -1 : 1;
  }
  const aPre = a[4]?.split(".");
  const bPre = b[4]?.split(".");
  if (aPre === undefined || bPre === undefined) {
    return aPre === bPre ? 0 : aPre === undefined ? 1 : -1;
  }
  for (let index = 0; index < Math.max(aPre.length, bPre.length); index += 1) {
    const aPart = aPre[index];
    const bPart = bPre[index];
    if (aPart === undefined || bPart === undefined) return aPart === undefined ? -1 : 1;
    if (aPart === bPart) continue;
    const aNumeric = /^\d+$/.test(aPart);
    const bNumeric = /^\d+$/.test(bPart);
    if (aNumeric && bNumeric) return BigInt(aPart) < BigInt(bPart) ? -1 : 1;
    if (aNumeric !== bNumeric) return aNumeric ? -1 : 1;
    return aPart < bPart ? -1 : 1;
  }
  return 0;
}

/** Algorithm-tagged immutable identity, for example `sha256:abc123...`. */
export type ContentHash = `sha256:${string}`;

export interface CartridgeRef {
  cartridgeId: string;
  version: string;
  contentHash: ContentHash;
}

export interface CartridgeLineage {
  kind: "revision" | "remix" | "legacy-import";
  parent: CartridgeRef | null;
}

export interface CartridgeSceneEntry {
  /** Stable save/transition identity. Display text belongs in `title`. */
  id: string;
  title: string;
}

export interface StorySceneOutline extends CartridgeSceneEntry {
  summary: string;
  objective: string;
  kit: GameplayKitId;
}

export interface StoryOutline {
  premise: string;
  finale: string;
  scenes: StorySceneOutline[];
}

export interface CartridgeFileIntegrity {
  path: string;
  bytes: number;
  contentHash: ContentHash;
}

export interface LegacyCartridgeManifestCore {
  formatVersion: typeof LEGACY_CARTRIDGE_FORMAT_VERSION;
  cartridgeId: string;
  version: string;
  name: string;
  description: string;
  author: string;
  createdAt: string;
  engineApiVersion: number;
  saveSchemaVersion: number;
  entrySceneId: string;
  story: StoryOutline;
  scenes: CartridgeSceneEntry[];
  requiredKits: GameplayKitId[];
  genesis: Genesis;
  lineage: CartridgeLineage | null;
}

export interface CartridgeManifestV2Core {
  formatVersion: typeof CARTRIDGE_FORMAT_VERSION;
  cartridgeId: string;
  version: string;
  name: string;
  description: string;
  author: string;
  createdAt: string;
  engineApiVersion: number;
  saveSchemaVersion: number;
  networkProtocolVersion: number;
  definition: GameDefinition;
  lineage: CartridgeLineage;
}

export type CartridgeManifestCore = LegacyCartridgeManifestCore | CartridgeManifestV2Core;

export type CartridgeManifest = CartridgeManifestCore & {
  /** Root hash over the canonical manifest core and sorted file integrity table. */
  contentHash: ContentHash;
  files: CartridgeFileIntegrity[];
};

/**
 * The world's fixed anchors (plan.md §5): `core` is the premise, rules, tone and taboos; `style` is
 * naming, language, sentence length and voice. Written once when the world is made and injected
 * verbatim into every witnessing prompt. Part of the immutable, hashed cartridge content.
 */
export interface WorldBible {
  core: string;
  style: string;
}

export const BIBLE_FILES = { core: "bible/core.md", style: "bible/style.md" } as const;

/** A world made by the minimal Create names its language on the first line of style.md. */
export function bibleLanguage(bible: WorldBible | null): string | null {
  const match =
    bible === null
      ? null
      : /^Language: ([A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*)\s*$/m.exec(bible.style);
  return match?.[1] ?? null;
}
/** Characters per bible file — it is read on every witnessing turn, so it stays a page, not a book. */
export const BIBLE_MAX_CHARS = 6000;

/** Key of one baked NPC conversation inside a cartridge: `<sceneId>/<npcId>`. */
export function dialogueKey(sceneId: string, npcId: string): string {
  return `${sceneId}/${npcId}`;
}

/** Path of one baked NPC conversation inside a revision directory or a `.cartridge`. */
export function dialogueFile(key: string): string {
  return `dialogue/${key}.oui`;
}

/** Splits a `dialogue/<sceneId>/<npcId>.oui` path back into its key, or null when it is not one. */
export function dialogueKeyOfFile(path: string): string | null {
  const match = /^dialogue\/([a-z0-9][a-z0-9_-]{0,79}\/[a-z0-9][a-z0-9_-]{0,79})\.oui$/.exec(path);
  return match?.[1] ?? null;
}

export interface PublishCartridgeInput {
  manifest: CartridgeManifestCore;
  rules: string;
  /** Scene source keyed by the stable ids declared in `manifest.scenes`. */
  scenes: Record<string, string>;
  /**
   * Baked NPC conversations keyed by `dialogueKey(sceneId, npcId)`. Written when the cartridge was
   * forged so it can be played with no model; absent for cartridges whose NPCs speak at runtime.
   */
  dialogues?: Record<string, string>;
  /** Packed asset bytes keyed by the safe path declared in the v2 definition. */
  assets?: Record<string, Uint8Array>;
  /** Present for worlds made to be witnessed; older cartridges have none. */
  bible?: WorldBible;
  /** Episodes a story was turned into (`bible/story.json`); absent for worlds made without one. */
  story?: StoryPlan;
}

export interface CartridgeRevision {
  manifest: CartridgeManifest;
  rules: string;
  scenes: Record<string, string>;
  /** Baked NPC conversations keyed by `dialogueKey(sceneId, npcId)`; empty when none were baked. */
  dialogues: Record<string, string>;
  assets: Record<string, Uint8Array>;
  bible: WorldBible | null;
  /** Optional so revisions built before stories existed still type-check; null or absent = none. */
  story?: StoryPlan | null;
}

export interface RuntimePin {
  cartridge: CartridgeRef;
  moduleLock: ModuleLock;
  modLock: ModLock;
  profileHash: ContentHash;
  effectiveHash: ContentHash;
  /**
   * The physics the world was made with (@shared/physics): terrain, combat and lore code, which no
   * cartridge hash covers. Absent in a pin written before it was versioned, which means 1.
   */
  physicsVersion?: number;
}

export interface LegacyInstanceMeta {
  formatVersion: typeof LEGACY_INSTANCE_FORMAT_VERSION;
  instanceId: string;
  name: string;
  cartridge: CartridgeRef;
  activeSaveId: string;
  saveSchemaVersion: number;
  createdAt: string;
  updatedAt: string;
}

export interface InstanceMeta {
  formatVersion: typeof INSTANCE_FORMAT_VERSION;
  instanceId: string;
  name: string;
  /** Compatibility index. Must equal runtimePin.cartridge when read. */
  cartridge: CartridgeRef;
  runtimePin: RuntimePin;
  activeSaveId: string;
  saveSchemaVersion: number;
  createdAt: string;
  updatedAt: string;
}

export interface LegacySaveState {
  formatVersion: typeof LEGACY_SAVE_FORMAT_VERSION;
  instanceId: string;
  cartridge: CartridgeRef;
  saveSchemaVersion: number;
  currentSceneId: string;
  flags: Record<string, string | number | boolean>;
  inventory: Inventory;
  mutation: WorldMutation | null;
  completedSceneIds: string[];
  updatedAt: string;
}

/** Where the player stood on open land. Only honoured while the save is still in `sceneId`. */
export interface SavedPosition {
  sceneId: string;
  x: number;
  y: number;
  z: number;
  /** Camera yaw, so the view comes back facing the way the player left it. */
  yaw: number;
}

export interface SaveState {
  formatVersion: typeof SAVE_FORMAT_VERSION;
  instanceId: string;
  /** Compatibility index. Must equal runtimePin.cartridge when read. */
  cartridge: CartridgeRef;
  runtimePin: RuntimePin;
  saveSchemaVersion: number;
  currentSceneId: string;
  flags: Record<string, string | number | boolean>;
  inventory: Inventory;
  player: PlayerState | null;
  party: PartyState | null;
  mutation: WorldMutation | null;
  completedSceneIds: string[];
  /** Present once the player has gone below the ending into generated floors. */
  endless?: EndlessState;
  /** Last place the player stood on open land; absent until they have walked somewhere. */
  position?: SavedPosition;
  /** Errands, home and door on open land; absent until the player has done any of it. */
  land?: LandProgress;
  /**
   * The world seed (`seedCode.ts`): which land of the one game this save walks. Absent on saves
   * made before seeds, whose land still comes from their cartridge id.
   */
  seed?: string;
  /**
   * Language the land is written in (BCP-47), chosen at New Game. Absent on older saves and on
   * worlds made from a story, whose bible names the language instead.
   */
  language?: string;
  updatedAt: string;
}

export interface InstanceRecord {
  meta: InstanceMeta;
  save: SaveState;
  karma: KarmaEntry[];
}

export interface InstanceProgressInput {
  instanceId: string;
  expectedUpdatedAt: string;
  flags: Record<string, string | number | boolean>;
  inventory: Inventory;
  mutation: WorldMutation | null;
  karma: KarmaEntry[];
  /** Omitted when the renderer has no open-land position to report; the saved one is kept. */
  position?: SavedPosition;
  /** Omitted when nothing on open land changed; the saved progress is kept. */
  land?: LandProgress;
}

export interface ResolvedInstance {
  instance: InstanceRecord;
  cartridge: CartridgeRevision;
}

export interface WorkspaceMeta {
  formatVersion: typeof WORKSPACE_FORMAT_VERSION;
  workspaceId: string;
  mode: "revision" | "remix";
  targetCartridgeId: string;
  base: CartridgeRef;
  name: string;
  description: string;
  author: string;
  engineApiVersion: number;
  saveSchemaVersion: number;
  /** Frozen source core. New workspaces use this to preserve v2 definitions during remixing. */
  sourceManifest?: CartridgeManifestCore;
  entrySceneId: string;
  story?: StoryOutline;
  scenes: CartridgeSceneEntry[];
  requiredKits?: GameplayKitId[];
  genesis?: Genesis;
  createdAt: string;
  updatedAt: string;
}

export interface WorkspaceRecord {
  meta: WorkspaceMeta;
  rules: string;
  scenes: Record<string, string>;
  assets: Record<string, Uint8Array>;
}

export interface WorkspaceValidationCheck {
  id:
    | "engine"
    | "save"
    | "rules"
    | "catalog"
    | "contracts"
    | "kits"
    | "prerequisites"
    | "routes"
    | "ending";
  label: string;
  ok: boolean;
  messages: string[];
}

export interface WorkspacePreview {
  workspace: WorkspaceRecord;
  checks: WorkspaceValidationCheck[];
  valid: boolean;
}

export interface CreateWorkspaceOptions {
  mode: WorkspaceMeta["mode"];
  targetCartridgeId: string;
  name: string;
  author: string;
  now?: Date;
}

export interface UpgradeInstanceInput {
  instanceId: string;
  /** Target version of the instance's own cartridgeId; the hash is verified before re-pinning. */
  version: string;
}

/** Written into a legacy `worlds/<id>/` directory once it has been preserved as a cartridge. */
export interface LegacyMigrationReceipt {
  formatVersion: typeof LEGACY_MIGRATION_FORMAT_VERSION;
  worldId: string;
  cartridge: CartridgeRef;
  instanceId: string;
  migratedAt: string;
}
