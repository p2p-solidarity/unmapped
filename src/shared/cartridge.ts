import type { GameplayKitId } from "./gameplay";
import type { Genesis, Inventory, KarmaEntry, WorldMutation } from "./world";

export * from "./gameplay";

export const CARTRIDGE_FORMAT_VERSION = 1 as const;
export const INSTANCE_FORMAT_VERSION = 1 as const;
export const SAVE_FORMAT_VERSION = 1 as const;
export const WORKSPACE_FORMAT_VERSION = 1 as const;
/** Runtime contract this build implements; a cartridge asking for more cannot be played here. */
export const ENGINE_API_VERSION = 1 as const;
/** Durable save shape this build writes; Phase A refuses to upgrade across a different one. */
export const SAVE_SCHEMA_VERSION = 1 as const;
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
  kind: "revision" | "remix";
  parent: CartridgeRef;
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

export interface CartridgeManifestCore {
  formatVersion: typeof CARTRIDGE_FORMAT_VERSION;
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

export interface CartridgeManifest extends CartridgeManifestCore {
  /** Root hash over the canonical manifest core and sorted file integrity table. */
  contentHash: ContentHash;
  files: CartridgeFileIntegrity[];
}

export interface PublishCartridgeInput {
  manifest: CartridgeManifestCore;
  rules: string;
  /** Scene source keyed by the stable ids declared in `manifest.scenes`. */
  scenes: Record<string, string>;
}

export interface CartridgeRevision {
  manifest: CartridgeManifest;
  rules: string;
  scenes: Record<string, string>;
}

export interface InstanceMeta {
  formatVersion: typeof INSTANCE_FORMAT_VERSION;
  instanceId: string;
  name: string;
  cartridge: CartridgeRef;
  activeSaveId: string;
  saveSchemaVersion: number;
  createdAt: string;
  updatedAt: string;
}

export interface SaveState {
  formatVersion: typeof SAVE_FORMAT_VERSION;
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
  entrySceneId: string;
  story: StoryOutline;
  scenes: CartridgeSceneEntry[];
  requiredKits: GameplayKitId[];
  genesis: Genesis;
  createdAt: string;
  updatedAt: string;
}

export interface WorkspaceRecord {
  meta: WorkspaceMeta;
  rules: string;
  scenes: Record<string, string>;
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
