// The single IPC contract. Preload exposes `window.seed` implementing SeedApi; main registers
// handlers for every channel in IPC. Never invent a channel outside this file.

import type {
  CartridgeManifest,
  CartridgeRevision,
  InstanceMeta,
  InstanceProgressInput,
  LegacyMigrationReceipt,
  PublishCartridgeInput,
  ResolvedInstance,
  UpgradeInstanceInput,
  WorkspaceMeta,
  WorkspacePreview,
  WorkspaceRecord,
} from "./cartridge";
import type { DataKeyWrappingRecord } from "./identity";
import type { ChatEvent, ChatRequest, InferenceConfig, ProbeResult, SidecarStatus } from "./llm";
import type { ModBundle, ModSummary } from "./mods";
import type { Result } from "./result";
import type { Genesis, WorldFile, WorldMeta } from "./world";

export const IPC = {
  worlds: {
    list: "worlds:list",
    create: "worlds:create",
    read: "worlds:read",
    write: "worlds:write",
    remove: "worlds:remove",
    exportSeed: "worlds:export-seed",
    importSeed: "worlds:import-seed",
    migrate: "worlds:migrate",
    changed: "worlds:changed",
  },
  cartridges: {
    list: "cartridges:list",
    read: "cartridges:read",
    publish: "cartridges:publish",
    exportPack: "cartridges:export-pack",
    importPack: "cartridges:import-pack",
  },
  instances: {
    list: "instances:list",
    create: "instances:create",
    resolve: "instances:resolve",
    transition: "instances:transition",
    complete: "instances:complete",
    checkpoint: "instances:checkpoint",
    upgrade: "instances:upgrade",
    exportBackup: "instances:export-backup",
    importBackup: "instances:import-backup",
  },
  workspaces: {
    list: "workspaces:list",
    create: "workspaces:create",
    read: "workspaces:read",
    writeScene: "workspaces:write-scene",
    writeRules: "workspaces:write-rules",
    preview: "workspaces:preview",
    publish: "workspaces:publish",
  },
  inference: {
    getConfig: "inference:get-config",
    setConfig: "inference:set-config",
    probe: "inference:probe",
    chat: "inference:chat",
    abort: "inference:abort",
    event: "inference:event",
    sidecarStart: "inference:sidecar-start",
    sidecarStop: "inference:sidecar-stop",
    sidecarStatus: "inference:sidecar-status",
    sidecarEvent: "inference:sidecar-event",
  },
  vault: {
    getKey: "vault:get-key",
    getWrappingRecords: "vault:get-wrapping-records",
    putWrappingRecord: "vault:put-wrapping-record",
  },
  mods: {
    list: "mods:list",
    read: "mods:read",
    install: "mods:install",
    remove: "mods:remove",
    changed: "mods:changed",
  },
  app: {
    info: "app:info",
    openExternal: "app:open-external",
    pickFile: "app:pick-file",
    saveFile: "app:save-file",
  },
} as const;

export interface CreateWorldInput {
  name: string;
  genesis: Genesis;
  /** Initial `world.oui` program (already validated by the DSL parser). */
  scene: string;
}

export interface CreateInstanceInput {
  cartridgeId: string;
  version: string;
  name: string;
}

export type CheckpointInstanceInput = InstanceProgressInput;

export interface CreateWorkspaceInput {
  sourceCartridgeId: string;
  sourceVersion: string;
  mode: WorkspaceMeta["mode"];
  targetCartridgeId: string;
  name: string;
  author: string;
}

export interface WriteWorkspaceSceneInput {
  workspaceId: string;
  sceneId: string;
  source: string;
}

export interface WriteWorkspaceRulesInput {
  workspaceId: string;
  source: string;
}

export interface PublishWorkspaceInput {
  workspaceId: string;
  version: string;
}

export interface WorldChangedEvent {
  worldId: string;
  file: WorldFile;
  kind: "add" | "change" | "unlink";
}

export interface SeedExport {
  path: string;
  bytes: number;
}

export interface AppInfo {
  version: string;
  platform: "darwin" | "win32" | "linux";
  electron: string;
  userData: string;
  worldsDir: string;
  cartridgesDir: string;
  instancesDir: string;
  workspacesDir: string;
}

export interface PickFileOptions {
  title: string;
  extensions: string[];
}

export interface SaveFileInput {
  title: string;
  defaultName: string;
  /** Base64 payload; kept as string so it crosses the bridge without structured-clone surprises. */
  base64: string;
}

export interface SeedApi {
  worlds: {
    list(): Promise<Result<WorldMeta[]>>;
    create(input: CreateWorldInput): Promise<Result<WorldMeta>>;
    read(worldId: string, file: WorldFile): Promise<Result<string>>;
    write(worldId: string, file: WorldFile, content: string): Promise<Result<WorldMeta>>;
    remove(worldId: string): Promise<Result<void>>;
    /** Zips the world dir to a user-chosen `.seed` path. */
    exportSeed(worldId: string): Promise<Result<SeedExport>>;
    /** Opens a file picker for a `.seed` and imports it as a new world. */
    importSeed(): Promise<Result<WorldMeta>>;
    /**
     * Preserves a legacy world as an immutable cartridge (its floor becomes one terminal scene)
     * plus a pinned instance carrying its progress. The source directory is never deleted; a
     * `migrated.json` receipt makes the call idempotent.
     */
    migrate(worldId: string): Promise<Result<LegacyMigrationReceipt>>;
    onChanged(listener: (event: WorldChangedEvent) => void): () => void;
  };
  cartridges: {
    list(): Promise<Result<CartridgeManifest[]>>;
    read(cartridgeId: string, version: string): Promise<Result<CartridgeRevision>>;
    publish(input: PublishCartridgeInput): Promise<Result<CartridgeManifest>>;
    /** Writes a content-only `.cartridge` (manifest, rules, scenes) to a user-chosen path. */
    exportPack(cartridgeId: string, version: string): Promise<Result<SeedExport>>;
    /** Picks a `.cartridge`, verifies its hash and installs it; same bytes twice is a no-op. */
    importPack(): Promise<Result<CartridgeManifest>>;
  };
  instances: {
    list(): Promise<Result<InstanceMeta[]>>;
    create(input: CreateInstanceInput): Promise<Result<ResolvedInstance>>;
    resolve(instanceId: string): Promise<Result<ResolvedInstance>>;
    transition(instanceId: string, targetSceneId: string): Promise<Result<ResolvedInstance>>;
    /** Ends the cartridge from its terminal scene; the checkpoint stays in that scene. */
    complete(instanceId: string): Promise<Result<ResolvedInstance>>;
    checkpoint(input: CheckpointInstanceInput): Promise<Result<InstanceMeta>>;
    /** Re-pins to another installed version of the same cartridge after snapshotting the save. */
    upgrade(input: UpgradeInstanceInput): Promise<Result<ResolvedInstance>>;
    /** Writes a `.spire-backup` (instance + active save, never cartridge content). */
    exportBackup(instanceId: string): Promise<Result<SeedExport>>;
    /** Restores a `.spire-backup`; fails with `cartridge-missing` unless the exact revision is installed. */
    importBackup(): Promise<Result<ResolvedInstance>>;
  };
  workspaces: {
    list(): Promise<Result<WorkspaceMeta[]>>;
    create(input: CreateWorkspaceInput): Promise<Result<WorkspaceRecord>>;
    read(workspaceId: string): Promise<Result<WorkspaceRecord>>;
    writeScene(input: WriteWorkspaceSceneInput): Promise<Result<WorkspaceMeta>>;
    writeRules(input: WriteWorkspaceRulesInput): Promise<Result<WorkspaceMeta>>;
    preview(workspaceId: string): Promise<Result<WorkspacePreview>>;
    publish(input: PublishWorkspaceInput): Promise<Result<CartridgeManifest>>;
  };
  inference: {
    getConfig(): Promise<InferenceConfig>;
    setConfig(config: InferenceConfig): Promise<Result<InferenceConfig>>;
    probe(): Promise<Result<ProbeResult>>;
    /** Starts a stream; events arrive via onEvent with the same request id. */
    chat(request: ChatRequest): Promise<Result<void>>;
    abort(requestId: string): Promise<void>;
    onEvent(listener: (event: ChatEvent) => void): () => void;
    sidecarStart(): Promise<Result<SidecarStatus>>;
    sidecarStop(): Promise<Result<void>>;
    sidecarStatus(): Promise<SidecarStatus>;
    onSidecar(listener: (status: SidecarStatus) => void): () => void;
  };
  vault: {
    /** 32 random bytes (base64) persisted with Electron safeStorage. Fallback when PRF is unavailable. */
    getKey(): Promise<Result<string>>;
    getWrappingRecords(): Promise<Result<DataKeyWrappingRecord[]>>;
    /** Adds or replaces one credential's wrapping record; other records are never touched. */
    putWrappingRecord(record: DataKeyWrappingRecord): Promise<Result<void>>;
  };
  mods: {
    /** Installed mods under `<userData>/mods/<name>/mod.yml`, manifest-validated. */
    list(): Promise<Result<ModSummary[]>>;
    /** Full bundle (manifest + referenced prompt/skill files) for mounting in the renderer. */
    read(name: string): Promise<Result<ModBundle>>;
    /** Opens a picker for a `.mod` zip (or a folder) and installs it; returns its summary. */
    install(): Promise<Result<ModSummary>>;
    remove(name: string): Promise<Result<void>>;
    onChanged(
      listener: (event: { name: string; kind: "add" | "change" | "unlink" }) => void,
    ): () => void;
  };
  app: {
    info(): Promise<AppInfo>;
    openExternal(url: string): Promise<Result<void>>;
    pickFile(options: PickFileOptions): Promise<Result<{ path: string; base64: string } | null>>;
    saveFile(input: SaveFileInput): Promise<Result<{ path: string } | null>>;
  };
}
