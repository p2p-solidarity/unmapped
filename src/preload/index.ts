import type { ModProposalPreview } from "@shared/mods";
import type { PlayerProfile } from "@shared/player";
import type { AuthoringSnapshot } from "@shared/scene-gallery";
// The only bridge between the renderer and main (Rule 6). `window.seed` is typed as `SeedApi`, so
// a missing or mistyped method is a compile error here rather than a runtime surprise in the UI.

import type {
  CartridgeManifest,
  CartridgeRevision,
  InstanceMeta,
  LegacyMigrationReceipt,
  PublishCartridgeInput,
  ResolvedInstance,
  UpgradeInstanceInput,
  WorkspaceMeta,
  WorkspacePreview,
  WorkspaceRecord,
} from "@shared/cartridge";
import type { DataKeyWrappingRecord } from "@shared/identity";
import type {
  AppInfo,
  CheckpointInstanceInput,
  CreateInstanceInput,
  CreateWorkspaceInput,
  CreateWorldInput,
  PickFileOptions,
  PublishWorkspaceInput,
  SaveFileInput,
  SeedApi,
  SeedExport,
  WorldChangedEvent,
  WriteWorkspaceRulesInput,
  WriteWorkspaceSceneInput,
} from "@shared/ipc";
import { IPC } from "@shared/ipc";
import type {
  AppendNoteInput,
  LandNote,
  LandRecord,
  WitnessChunkInput,
  WitnessedChunk,
} from "@shared/land";
import type {
  ChatEvent,
  ChatRequest,
  InferenceConfig,
  ProbeResult,
  SidecarStatus,
} from "@shared/llm";
import type { ModBundle, ModSummary } from "@shared/mods";
import type { Result } from "@shared/result";
import type { WorldFile, WorldMeta } from "@shared/world";
import { contextBridge, type IpcRendererEvent, ipcRenderer } from "electron";

function invoke<T>(channel: string, ...args: unknown[]): Promise<T> {
  return ipcRenderer.invoke(channel, ...args) as Promise<T>;
}

/** Returns an unsubscribe that removes exactly this listener — never `removeAllListeners`. */
function subscribe<T>(channel: string, listener: (payload: T) => void): () => void {
  const handler = (_event: IpcRendererEvent, payload: T): void => {
    listener(payload);
  };
  ipcRenderer.on(channel, handler);
  return () => {
    ipcRenderer.removeListener(channel, handler);
  };
}

const api: SeedApi = {
  worlds: {
    list: () => invoke<Result<WorldMeta[]>>(IPC.worlds.list),
    create: (input: CreateWorldInput) => invoke<Result<WorldMeta>>(IPC.worlds.create, input),
    read: (worldId: string, file: WorldFile) =>
      invoke<Result<string>>(IPC.worlds.read, worldId, file),
    write: (worldId: string, file: WorldFile, content: string) =>
      invoke<Result<WorldMeta>>(IPC.worlds.write, worldId, file, content),
    remove: (worldId: string) => invoke<Result<void>>(IPC.worlds.remove, worldId),
    exportSeed: (worldId: string) => invoke<Result<SeedExport>>(IPC.worlds.exportSeed, worldId),
    importSeed: () => invoke<Result<WorldMeta>>(IPC.worlds.importSeed),
    migrate: (worldId: string) =>
      invoke<Result<LegacyMigrationReceipt>>(IPC.worlds.migrate, worldId),
    onChanged: (listener: (event: WorldChangedEvent) => void) =>
      subscribe<WorldChangedEvent>(IPC.worlds.changed, listener),
  },
  cartridges: {
    list: () => invoke<Result<CartridgeManifest[]>>(IPC.cartridges.list),
    read: (cartridgeId: string, version: string) =>
      invoke<Result<CartridgeRevision>>(IPC.cartridges.read, cartridgeId, version),
    publish: (input: PublishCartridgeInput) =>
      invoke<Result<CartridgeManifest>>(IPC.cartridges.publish, input),
    exportPack: (cartridgeId: string, version: string) =>
      invoke<Result<SeedExport>>(IPC.cartridges.exportPack, cartridgeId, version),
    importPack: () => invoke<Result<CartridgeManifest>>(IPC.cartridges.importPack),
  },
  game: {
    base: () => invoke<Result<CartridgeManifest>>(IPC.game.base),
  },
  instances: {
    list: () => invoke<Result<InstanceMeta[]>>(IPC.instances.list),
    listLegacy: () => invoke<Result<string[]>>(IPC.instances.listLegacy),
    create: (input: CreateInstanceInput) =>
      invoke<Result<ResolvedInstance>>(IPC.instances.create, input),
    resolve: (instanceId: string) =>
      invoke<Result<ResolvedInstance>>(IPC.instances.resolve, instanceId),
    transition: (instanceId: string, targetSceneId: string) =>
      invoke<Result<ResolvedInstance>>(IPC.instances.transition, instanceId, targetSceneId),
    complete: (instanceId: string) =>
      invoke<Result<ResolvedInstance>>(IPC.instances.complete, instanceId),
    descend: (instanceId: string) =>
      invoke<Result<ResolvedInstance>>(IPC.instances.descend, instanceId),
    checkpoint: (input: CheckpointInstanceInput) =>
      invoke<Result<InstanceMeta>>(IPC.instances.checkpoint, input),
    upgrade: (input: UpgradeInstanceInput) =>
      invoke<Result<ResolvedInstance>>(IPC.instances.upgrade, input),
    exportBackup: (instanceId: string) =>
      invoke<Result<SeedExport>>(IPC.instances.exportBackup, instanceId),
    importBackup: () => invoke<Result<ResolvedInstance>>(IPC.instances.importBackup),
    readLand: (instanceId: string) =>
      invoke<Result<LandRecord>>(IPC.instances.readLand, instanceId),
    witness: (input: WitnessChunkInput) =>
      invoke<Result<WitnessedChunk>>(IPC.instances.witness, input),
    appendNote: (input: AppendNoteInput) =>
      invoke<Result<LandNote>>(IPC.instances.appendNote, input),
  },
  profiles: {
    list: () => invoke<Result<PlayerProfile[]>>(IPC.profiles.list),
    read: (id) => invoke<Result<PlayerProfile>>(IPC.profiles.read, id),
    upsert: (input) => invoke<Result<PlayerProfile>>(IPC.profiles.upsert, input),
    remove: (id) => invoke<Result<void>>(IPC.profiles.remove, id),
  },
  workspaces: {
    createAuthoring: (input) =>
      invoke<Result<AuthoringSnapshot>>(IPC.workspaces.createAuthoring, input),
    readAuthoring: (id) => invoke<Result<AuthoringSnapshot>>(IPC.workspaces.readAuthoring, id),
    writeAuthoring: (snapshot) =>
      invoke<Result<AuthoringSnapshot>>(IPC.workspaces.writeAuthoring, snapshot),
    list: () => invoke<Result<WorkspaceMeta[]>>(IPC.workspaces.list),
    create: (input: CreateWorkspaceInput) =>
      invoke<Result<WorkspaceRecord>>(IPC.workspaces.create, input),
    read: (workspaceId: string) =>
      invoke<Result<WorkspaceRecord>>(IPC.workspaces.read, workspaceId),
    writeScene: (input: WriteWorkspaceSceneInput) =>
      invoke<Result<WorkspaceMeta>>(IPC.workspaces.writeScene, input),
    writeRules: (input: WriteWorkspaceRulesInput) =>
      invoke<Result<WorkspaceMeta>>(IPC.workspaces.writeRules, input),
    preview: (workspaceId: string) =>
      invoke<Result<WorkspacePreview>>(IPC.workspaces.preview, workspaceId),
    publish: (input: PublishWorkspaceInput) =>
      invoke<Result<CartridgeManifest>>(IPC.workspaces.publish, input),
  },
  inference: {
    getConfig: () => invoke<InferenceConfig>(IPC.inference.getConfig),
    setConfig: (config: InferenceConfig) =>
      invoke<Result<InferenceConfig>>(IPC.inference.setConfig, config),
    probe: () => invoke<Result<ProbeResult>>(IPC.inference.probe),
    chat: (request: ChatRequest) => invoke<Result<void>>(IPC.inference.chat, request),
    abort: (requestId: string) => invoke<void>(IPC.inference.abort, requestId),
    onEvent: (listener: (event: ChatEvent) => void) =>
      subscribe<ChatEvent>(IPC.inference.event, listener),
    sidecarStart: () => invoke<Result<SidecarStatus>>(IPC.inference.sidecarStart),
    sidecarStop: () => invoke<Result<void>>(IPC.inference.sidecarStop),
    sidecarStatus: () => invoke<SidecarStatus>(IPC.inference.sidecarStatus),
    onSidecar: (listener: (status: SidecarStatus) => void) =>
      subscribe<SidecarStatus>(IPC.inference.sidecarEvent, listener),
  },
  vault: {
    getKey: () => invoke<Result<string>>(IPC.vault.getKey),
    getWrappingRecords: () => invoke<Result<DataKeyWrappingRecord[]>>(IPC.vault.getWrappingRecords),
    putWrappingRecord: (record: DataKeyWrappingRecord) =>
      invoke<Result<void>>(IPC.vault.putWrappingRecord, record),
  },
  mods: {
    previewProposal: (proposal) =>
      invoke<Result<ModProposalPreview>>(IPC.mods.previewProposal, proposal),
    publishProposal: (proposal) =>
      invoke<Result<CartridgeManifest>>(IPC.mods.publishProposal, proposal),
    list: () => invoke<Result<ModSummary[]>>(IPC.mods.list),
    read: (name: string) => invoke<Result<ModBundle>>(IPC.mods.read, name),
    install: () => invoke<Result<ModSummary>>(IPC.mods.install),
    remove: (name: string) => invoke<Result<void>>(IPC.mods.remove, name),
    onChanged: (listener: (event: { name: string; kind: "add" | "change" | "unlink" }) => void) =>
      subscribe<{ name: string; kind: "add" | "change" | "unlink" }>(IPC.mods.changed, listener),
  },
  app: {
    info: () => invoke<AppInfo>(IPC.app.info),
    openExternal: (url: string) => invoke<Result<void>>(IPC.app.openExternal, url),
    pickFile: (options: PickFileOptions) =>
      invoke<Result<{ path: string; base64: string } | null>>(IPC.app.pickFile, options),
    saveFile: (input: SaveFileInput) =>
      invoke<Result<{ path: string } | null>>(IPC.app.saveFile, input),
  },
};

contextBridge.exposeInMainWorld("seed", api);
