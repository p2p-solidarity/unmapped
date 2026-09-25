import type { ModProposalPreview, SeedModProposal } from "./mods";
import type { PlayerProfile, PlayerProfileInput } from "./player";
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
import type {
  LedgerConfig,
  LedgerRevision,
  PublishOnChainInput,
  WitnessOnChainInput,
} from "./chain";
import type { CreateDraft, CreateDraftEntry, DraftIdea, LookPicture } from "./createDraft";
import type { ClaimNameResult, EnsNamesConfig } from "./ensNames";
import type { DataKeyWrappingRecord } from "./identity";
import type {
  AppendNoteInput,
  LandNote,
  LandRecord,
  WitnessChunkInput,
  WitnessedChunk,
} from "./land";
import type {
  ChatEvent,
  ChatRequest,
  InferenceConfig,
  KeyProvider,
  KeyStatusMap,
  LocalDetection,
  ProbeResult,
  SetApiKeyInput,
  SidecarStatus,
} from "./llm";
import type { ModBundle, ModSummary } from "./mods";
import type { Result } from "./result";
import type {
  GenerationEvent,
  ProviderCapabilities,
  SceneArtifact,
  SceneGenerationRequest,
} from "./scene-generation";
import type { UsageRecord, UsageScope, UsageSummary } from "./usage";
import type {
  CandidateMetrics,
  DraftCandidate,
  Json,
  PlayChange,
  WorkCodeFile,
  WorkDraft,
  WorkLookSource,
  WorkManifest,
  WorkPlay,
  WorkRef,
  WorkSession,
  WorkSessionSource,
  WorkText,
} from "./works";
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
  game: {
    base: "game:base",
  },
  instances: {
    list: "instances:list",
    listLegacy: "instances:list-legacy",
    create: "instances:create",
    resolve: "instances:resolve",
    transition: "instances:transition",
    complete: "instances:complete",
    descend: "instances:descend",
    checkpoint: "instances:checkpoint",
    upgrade: "instances:upgrade",
    exportBackup: "instances:export-backup",
    importBackup: "instances:import-backup",
    readLand: "instances:read-land",
    witness: "instances:witness",
    appendNote: "instances:append-note",
  },
  profiles: {
    list: "profiles:list",
    read: "profiles:read",
    upsert: "profiles:upsert",
    remove: "profiles:remove",
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
    appleLocalCapabilities: "inference:apple-local-capabilities",
    getConfig: "inference:get-config",
    setConfig: "inference:set-config",
    probe: "inference:probe",
    chat: "inference:chat",
    abort: "inference:abort",
    event: "inference:event",
    sceneGenerate: "inference:scene-generate",
    sceneCancel: "inference:scene-cancel",
    sceneEvent: "inference:scene-event",
    sidecarStart: "inference:sidecar-start",
    sidecarStop: "inference:sidecar-stop",
    sidecarStatus: "inference:sidecar-status",
    sidecarEvent: "inference:sidecar-event",
    // Settings → Model: write-only keys and what runs on this computer.
    keyStatus: "inference:key-status",
    setApiKey: "inference:set-api-key",
    clearApiKey: "inference:clear-api-key",
    detectLocal: "inference:detect-local",
    pickModelFile: "inference:pick-model-file",
  },
  vault: {
    getKey: "vault:get-key",
    getWrappingRecords: "vault:get-wrapping-records",
    putWrappingRecord: "vault:put-wrapping-record",
  },
  mods: {
    previewProposal: "mods:preview-proposal",
    publishProposal: "mods:publish-proposal",
    list: "mods:list",
    read: "mods:read",
    install: "mods:install",
    remove: "mods:remove",
    changed: "mods:changed",
  },
  works: {
    list: "works:list",
    plays: "works:plays",
    drafts: "works:drafts",
    createDraft: "works:create-draft",
    readDraft: "works:read-draft",
    readCandidate: "works:read-candidate",
    writeCandidate: "works:write-candidate",
    settleCandidate: "works:settle-candidate",
    revertDraft: "works:revert-draft",
    publishDraft: "works:publish-draft",
    replaceAsset: "works:replace-asset",
    generateAsset: "works:generate-asset",
    cancelAsset: "works:cancel-asset",
    createPlay: "works:create-play",
    readPlay: "works:read-play",
    changePlay: "works:change-play",
    openSession: "works:open-session",
    closeSession: "works:close-session",
  },
  chain: {
    config: "chain:config",
    lookup: "chain:lookup",
    publish: "chain:publish",
    witness: "chain:witness",
    ensConfig: "chain:ens-config",
    claimName: "chain:claim-name",
  },
  app: {
    info: "app:info",
    openExternal: "app:open-external",
    pickFile: "app:pick-file",
    saveFile: "app:save-file",
  },
  /** The usage ledger (<userData>/usage.jsonl): one line per model call, written by main. */
  usage: {
    summary: "usage:summary",
    link: "usage:link",
    changed: "usage:changed",
  },
  /** Create a game drafts (<userData>/workspaces/create.<id>/draft.json). */
  createDrafts: {
    list: "create-drafts:list",
    create: "create-drafts:create",
    read: "create-drafts:read",
    save: "create-drafts:save",
    remove: "create-drafts:remove",
    looks: "create-drafts:looks",
    drawLook: "create-drafts:draw-look",
    cancelLook: "create-drafts:cancel-look",
    discardLooks: "create-drafts:discard-looks",
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
  /** World seed of an open-land game; omitted for cartridges that have none. */
  seed?: string;
  /** Language the land is written in (BCP-47); omitted to follow the bible or the UI language. */
  language?: string;
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

export interface WriteWorkCandidateInput {
  draftId: string;
  parent: string | null;
  kind: "generate" | "edit" | "repair";
  request: string;
  summary: string;
  text: WorkText;
  changed: WorkCodeFile[];
  metrics: CandidateMetrics | null;
}

export interface SettleWorkCandidateInput {
  draftId: string;
  candidateId: string;
  outcome: "playable" | "failed" | "cancelled";
  error: string | null;
  expectedHead: string | null;
}

export interface CreateWorkPlayInput {
  title: string;
  worlds: WorkRef[];
  /** What the player brings into the first world (a story's carried state); null by default. */
  carry?: Json | null;
}

export interface WrittenCandidate {
  draft: WorkDraft;
  candidate: DraftCandidate;
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
  game: {
    /** Installs (once) and returns the one game every world seed is a land of. */
    base(): Promise<Result<CartridgeManifest>>;
  };
  instances: {
    /** Saves this build can open. Saves from an older build are skipped here… */
    list(): Promise<Result<InstanceMeta[]>>;
    /** …and named here, so the library can say they exist and were left untouched. */
    listLegacy(): Promise<Result<string[]>>;
    create(input: CreateInstanceInput): Promise<Result<ResolvedInstance>>;
    resolve(instanceId: string): Promise<Result<ResolvedInstance>>;
    transition(instanceId: string, targetSceneId: string): Promise<Result<ResolvedInstance>>;
    /** Ends the cartridge from its terminal scene; the checkpoint stays in that scene. */
    complete(instanceId: string): Promise<Result<ResolvedInstance>>;
    /** After the ending: one generated floor deeper. Only the depth is saved, never the floor. */
    descend(instanceId: string): Promise<Result<ResolvedInstance>>;
    checkpoint(input: CheckpointInstanceInput): Promise<Result<InstanceMeta>>;
    /** Re-pins to another installed version of the same cartridge after snapshotting the save. */
    upgrade(input: UpgradeInstanceInput): Promise<Result<ResolvedInstance>>;
    /** Writes a `.spire-backup` (instance + active save, never cartridge content). */
    exportBackup(instanceId: string): Promise<Result<SeedExport>>;
    /** Restores a `.spire-backup`; fails with `cartridge-missing` unless the exact revision is installed. */
    importBackup(): Promise<Result<ResolvedInstance>>;
    /** Every witnessed chunk and the lore graph of the active save. */
    readLand(instanceId: string): Promise<Result<LandRecord>>;
    /** Writes one chunk once; `chunk-already-witnessed` if somebody got there first. */
    witness(input: WitnessChunkInput): Promise<Result<WitnessedChunk>>;
    /** Appends one player-written note to the active save's notes.jsonl. */
    appendNote(input: AppendNoteInput): Promise<Result<LandNote>>;
  };
  profiles: {
    list(): Promise<Result<PlayerProfile[]>>;
    read(profileId: string): Promise<Result<PlayerProfile>>;
    upsert(input: PlayerProfileInput): Promise<Result<PlayerProfile>>;
    remove(profileId: string): Promise<Result<void>>;
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
    appleLocalCapabilities(): Promise<Result<ProviderCapabilities>>;
    getConfig(): Promise<InferenceConfig>;
    setConfig(config: InferenceConfig): Promise<Result<InferenceConfig>>;
    probe(): Promise<Result<ProbeResult>>;
    /** Starts a stream; events arrive via onEvent with the same request id. */
    chat(request: ChatRequest): Promise<Result<void>>;
    abort(requestId: string): Promise<void>;
    onEvent(listener: (event: ChatEvent) => void): () => void;
    /** Runs the provider-neutral main-process scene artifact pipeline. */
    generateScene(request: SceneGenerationRequest): Promise<Result<SceneArtifact>>;
    cancelScene(requestId: string): Promise<Result<void>>;
    onSceneEvent(listener: (event: GenerationEvent) => void): () => void;
    sidecarStart(): Promise<Result<SidecarStatus>>;
    sidecarStop(): Promise<Result<void>>;
    sidecarStatus(): Promise<SidecarStatus>;
    onSidecar(listener: (status: SidecarStatus) => void): () => void;
    /** Whether each cloud provider has a key and where it comes from — never the key itself. */
    keyStatus(): Promise<Result<KeyStatusMap>>;
    /** Write-only: main encrypts the key; nothing ever reads it back to a renderer. */
    setApiKey(input: SetApiKeyInput): Promise<Result<KeyStatusMap>>;
    clearApiKey(provider: KeyProvider): Promise<Result<KeyStatusMap>>;
    detectLocal(): Promise<Result<LocalDetection>>;
    /** A main-side open dialog for a .gguf file; null when the player cancels. */
    pickModelFile(): Promise<Result<string | null>>;
  };
  vault: {
    /** 32 random bytes (base64) persisted with Electron safeStorage. Fallback when PRF is unavailable. */
    getKey(): Promise<Result<string>>;
    getWrappingRecords(): Promise<Result<DataKeyWrappingRecord[]>>;
    /** Adds or replaces one credential's wrapping record; other records are never touched. */
    putWrappingRecord(record: DataKeyWrappingRecord): Promise<Result<void>>;
  };
  mods: {
    previewProposal(proposal: SeedModProposal): Promise<Result<ModProposalPreview>>;
    publishProposal(proposal: SeedModProposal): Promise<Result<CartridgeManifest>>;
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
  /** AI-written HTML/CSS/JS worlds (`interactive-web@1`) and the sandboxed player around them. */
  works: {
    /** Published immutable revisions, newest version first per world. */
    list(): Promise<Result<WorkManifest[]>>;
    plays(): Promise<Result<WorkPlay[]>>;
    drafts(): Promise<Result<WorkDraft[]>>;
    createDraft(title: string): Promise<Result<WorkDraft>>;
    readDraft(draftId: string): Promise<Result<WorkDraft>>;
    readCandidate(draftId: string, candidateId: string): Promise<Result<WorkText>>;
    /** Stores an attempt as `pending`; it only becomes current through `settleCandidate`. */
    writeCandidate(input: WriteWorkCandidateInput): Promise<Result<WrittenCandidate>>;
    /** Compare-and-set: a playable result lands only if head still equals `expectedHead`. */
    settleCandidate(input: SettleWorkCandidateInput): Promise<Result<WorkDraft>>;
    revertDraft(draftId: string, candidateId: string): Promise<Result<WorkDraft>>;
    publishDraft(draftId: string): Promise<Result<{ draft: WorkDraft; manifest: WorkManifest }>>;
    /** Picks an image file for one asset id of head; null when the picker was cancelled. */
    replaceAsset(draftId: string, assetId: string): Promise<Result<WrittenCandidate | null>>;
    /**
     * Asks the image model for one asset of head (main-side key); the result is a pending
     * candidate. `requestId` names the call so `cancelAsset` can abort it in flight. `from` names
     * the world an otherworld is being written in: main reads that world's look picture and draws
     * with it as the reference (only ids cross; never picture bytes or paths).
     */
    generateAsset(
      draftId: string,
      assetId: string,
      requestId: string,
      from?: WorkLookSource | null,
    ): Promise<Result<WrittenCandidate>>;
    /** Aborts an image request; its picture, if any arrives, is never stored. */
    cancelAsset(requestId: string): Promise<Result<void>>;
    createPlay(input: CreateWorkPlayInput): Promise<Result<WorkPlay>>;
    readPlay(playId: string): Promise<Result<WorkPlay>>;
    changePlay(playId: string, change: PlayChange): Promise<Result<WorkPlay>>;
    /** Builds the sandboxed page for a journey's current world or a draft candidate. */
    openSession(source: WorkSessionSource): Promise<Result<WorkSession>>;
    /** Forgets a session; `kill` also stops its frame process (a hung world). */
    closeSession(token: string, kill: boolean): Promise<Result<void>>;
  };
  /** Optional on-chain provenance (contracts/src/UnwrittenLedger.sol); absent config is not an error. */
  chain: {
    config(): Promise<LedgerConfig>;
    lookup(contentHash: string): Promise<Result<LedgerRevision | null>>;
    publish(input: PublishOnChainInput): Promise<Result<{ txHash: string }>>;
    witness(input: WitnessOnChainInput): Promise<Result<{ txHash: string }>>;
    /** Cartridge ENS names (Sepolia ENSv2): the parent, and whether this machine can write. */
    ensConfig(): Promise<EnsNamesConfig>;
    /** Names a local revision `<cartridgeId>.<parent>` and points its records at it; waits for receipts. */
    claimName(cartridgeId: string, version: string): Promise<Result<ClaimNameResult>>;
  };
  app: {
    info(): Promise<AppInfo>;
    openExternal(url: string): Promise<Result<void>>;
    pickFile(options: PickFileOptions): Promise<Result<{ path: string; base64: string } | null>>;
    saveFile(input: SaveFileInput): Promise<Result<{ path: string } | null>>;
  };
  /** What model calls cost, per world. Recording happens in main as each call settles. */
  usage: {
    summary(scope: UsageScope): Promise<Result<UsageSummary>>;
    /** Counts `from`'s calls toward `to` (the Create draft a world was built from). */
    link(from: UsageScope, to: UsageScope): Promise<Result<void>>;
    onChanged(listener: (record: UsageRecord) => void): () => void;
  };
  /** Create a game drafts: nothing here is published; Build does that. */
  createDrafts: {
    list(): Promise<Result<CreateDraftEntry[]>>;
    create(idea: DraftIdea): Promise<Result<CreateDraft>>;
    read(draftId: string): Promise<Result<CreateDraft>>;
    /** Replaces the draft whole (autosave); main stamps `updatedAt`. */
    save(draft: CreateDraft): Promise<Result<CreateDraft>>;
    remove(draftId: string): Promise<Result<void>>;
    /** The draft's concept pictures, as data URLs (never paths). */
    looks(draftId: string): Promise<Result<LookPicture[]>>;
    /**
     * Draws one concept picture from the draft's saved Look card (view 0–2 picks what it shows) and
     * keeps it with the draft. `requestId` names the call so `cancelLook` can abort it in flight.
     */
    drawLook(draftId: string, view: number, requestId: string): Promise<Result<LookPicture>>;
    cancelLook(requestId: string): Promise<Result<void>>;
    /** Deletes every picture of the draft but `keep`. */
    discardLooks(draftId: string, keep: string[]): Promise<Result<void>>;
  };
}
