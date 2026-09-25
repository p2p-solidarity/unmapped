import type { GameplayKitId } from "./gameplay";
import type { Genesis, Inventory, KarmaEntry, WorldMutation } from "./world";

export * from "./gameplay";

export const CARTRIDGE_FORMAT_VERSION = 1 as const;
export const INSTANCE_FORMAT_VERSION = 1 as const;
export const SAVE_FORMAT_VERSION = 1 as const;
export const WORKSPACE_FORMAT_VERSION = 1 as const;

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

export interface CreateWorkspaceOptions {
  mode: WorkspaceMeta["mode"];
  targetCartridgeId: string;
  name: string;
  author: string;
  now?: Date;
}
