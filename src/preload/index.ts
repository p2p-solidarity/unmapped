import type { ModProposalPreview } from "@shared/mods";
import type { PlayerProfile } from "@shared/player";
// The only bridge between the renderer and main (Rule 6). `window.seed` is typed as `SeedApi`, so
// a missing or mistyped method is a compile error here rather than a runtime surprise in the UI.

import type { PlansResponse } from "@shared/billing";
import type {
  CartridgeManifest,
  CartridgeRevision,
  ContentHash,
  InstanceMeta,
  LegacyMigrationReceipt,
  PublishCartridgeInput,
  ResolvedInstance,
  RestoredInstance,
  UpgradeInstanceInput,
  WorkspaceMeta,
  WorkspacePreview,
  WorkspaceRecord,
} from "@shared/cartridge";
import type {
  LedgerConfig,
  LedgerRevision,
  PublishOnChainInput,
  WitnessOnChainInput,
} from "@shared/chain";
import type { CreateDraft, CreateDraftEntry, DraftIdea, LookPicture } from "@shared/createDraft";
import type { ClaimNameResult, EnsNamesConfig } from "@shared/ensNames";
import type { AccountStatus, PairingLookup, QuotaView } from "@shared/gatewayApi";
import type { AccessPolicy } from "@shared/history/types";
import type { DataKeyWrappingRecord } from "@shared/identity";
import type {
  ImageProbe,
  ImageProviderId,
  ImageSettings,
  LicenceAudit,
  LicenceAuditTarget,
} from "@shared/images";
import type {
  AppInfo,
  CheckpointInstanceInput,
  CreateInstanceInput,
  CreateWorkPlayInput,
  CreateWorkspaceInput,
  CreateWorldInput,
  PickFileOptions,
  PublishWorkspaceInput,
  SaveFileInput,
  SeedApi,
  SeedExport,
  SettleWorkCandidateInput,
  WorldChangedEvent,
  WriteWorkCandidateInput,
  WriteWorkspaceRulesInput,
  WriteWorkspaceSceneInput,
  WrittenCandidate,
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
  KeyProvider,
  KeyStatusMap,
  LocalDetection,
  ProbeResult,
  RouteView,
  SetApiKeyInput,
  SidecarStatus,
} from "@shared/llm";
import type {
  EnsNameStatus,
  MarketAction,
  MarketConfig,
  MarketKey,
  MarketReceipt,
  MarketView,
  PreparedAction,
  SaveNameView,
  SubmitActionInput,
} from "@shared/market";
import type { ModBundle, ModSummary } from "@shared/mods";
import type { ProvenanceReport } from "@shared/provenance";
import type { Result } from "@shared/result";
import type {
  GenerationEvent,
  SceneArtifact,
  SceneGenerationRequest,
} from "@shared/scene-generation";
import type { UsageRecord, UsageScope, UsageSummary } from "@shared/usage";
import type {
  PlayChange,
  WorkDraft,
  WorkLookSource,
  WorkManifest,
  WorkPlay,
  WorkRef,
  WorkSession,
  WorkSessionSource,
  WorkText,
} from "@shared/works";
import type { WorldFile, WorldMeta } from "@shared/world";
import type {
  ClaimAnswer,
  InvitePreview,
  ServiceProbe,
  StreamFrame,
  WorldAppended,
  WorldBadge,
  WorldDoor,
  WorldDraft,
  WorldEnsured,
  WorldEntriesEvent,
  WorldInvite,
  WorldJoined,
  WorldPresenceEvent,
  WorldRead,
  WorldStatus,
  WorldStreamEvent,
} from "@shared/worldApi";
import type { ClaimTarget, Presence } from "@shared/worldProtocol";
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
    importBackup: () => invoke<Result<RestoredInstance>>(IPC.instances.importBackup),
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
    appleLocalCapabilities: () =>
      invoke<Result<import("@shared/scene-generation").ProviderCapabilities>>(
        IPC.inference.appleLocalCapabilities,
      ),
    getConfig: () => invoke<InferenceConfig>(IPC.inference.getConfig),
    setConfig: (config: InferenceConfig) =>
      invoke<Result<InferenceConfig>>(IPC.inference.setConfig, config),
    probe: () => invoke<Result<ProbeResult>>(IPC.inference.probe),
    chat: (request: ChatRequest) => invoke<Result<void>>(IPC.inference.chat, request),
    abort: (requestId: string) => invoke<void>(IPC.inference.abort, requestId),
    onEvent: (listener: (event: ChatEvent) => void) =>
      subscribe<ChatEvent>(IPC.inference.event, listener),
    generateScene: (request: SceneGenerationRequest) =>
      invoke<Result<SceneArtifact>>(IPC.inference.sceneGenerate, request),
    cancelScene: (requestId: string) => invoke<Result<void>>(IPC.inference.sceneCancel, requestId),
    onSceneEvent: (listener: (event: GenerationEvent) => void) =>
      subscribe<GenerationEvent>(IPC.inference.sceneEvent, listener),
    sidecarStart: () => invoke<Result<SidecarStatus>>(IPC.inference.sidecarStart),
    sidecarStop: () => invoke<Result<void>>(IPC.inference.sidecarStop),
    sidecarStatus: () => invoke<SidecarStatus>(IPC.inference.sidecarStatus),
    onSidecar: (listener: (status: SidecarStatus) => void) =>
      subscribe<SidecarStatus>(IPC.inference.sidecarEvent, listener),
    keyStatus: () => invoke<Result<KeyStatusMap>>(IPC.inference.keyStatus),
    setApiKey: (input: SetApiKeyInput) =>
      invoke<Result<KeyStatusMap>>(IPC.inference.setApiKey, input),
    clearApiKey: (provider: KeyProvider) =>
      invoke<Result<KeyStatusMap>>(IPC.inference.clearApiKey, provider),
    detectLocal: () => invoke<Result<LocalDetection>>(IPC.inference.detectLocal),
    pickModelFile: () => invoke<Result<string | null>>(IPC.inference.pickModelFile),
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
  works: {
    list: () => invoke<Result<WorkManifest[]>>(IPC.works.list),
    plays: () => invoke<Result<WorkPlay[]>>(IPC.works.plays),
    drafts: () => invoke<Result<WorkDraft[]>>(IPC.works.drafts),
    createDraft: (title: string) => invoke<Result<WorkDraft>>(IPC.works.createDraft, title),
    readDraft: (draftId: string) => invoke<Result<WorkDraft>>(IPC.works.readDraft, draftId),
    readCandidate: (draftId: string, candidateId: string) =>
      invoke<Result<WorkText>>(IPC.works.readCandidate, draftId, candidateId),
    writeCandidate: (input: WriteWorkCandidateInput) =>
      invoke<Result<WrittenCandidate>>(IPC.works.writeCandidate, input),
    settleCandidate: (input: SettleWorkCandidateInput) =>
      invoke<Result<WorkDraft>>(IPC.works.settleCandidate, input),
    revertDraft: (draftId: string, candidateId: string) =>
      invoke<Result<WorkDraft>>(IPC.works.revertDraft, draftId, candidateId),
    publishDraft: (draftId: string) =>
      invoke<Result<{ draft: WorkDraft; manifest: WorkManifest }>>(IPC.works.publishDraft, draftId),
    replaceAsset: (draftId: string, assetId: string) =>
      invoke<Result<WrittenCandidate | null>>(IPC.works.replaceAsset, draftId, assetId),
    generateAsset: (
      draftId: string,
      assetId: string,
      requestId: string,
      from?: WorkLookSource | null,
    ) =>
      invoke<Result<WrittenCandidate>>(
        IPC.works.generateAsset,
        draftId,
        assetId,
        requestId,
        from ?? null,
      ),
    cancelAsset: (requestId: string) => invoke<Result<void>>(IPC.works.cancelAsset, requestId),
    createPlay: (input: CreateWorkPlayInput) =>
      invoke<Result<WorkPlay>>(IPC.works.createPlay, input),
    readPlay: (playId: string) => invoke<Result<WorkPlay>>(IPC.works.readPlay, playId),
    changePlay: (playId: string, change: PlayChange) =>
      invoke<Result<WorkPlay>>(IPC.works.changePlay, playId, change),
    openSession: (source: WorkSessionSource) =>
      invoke<Result<WorkSession>>(IPC.works.openSession, source),
    closeSession: (token: string, kill: boolean) =>
      invoke<Result<void>>(IPC.works.closeSession, token, kill),
  },
  market: {
    config: () => invoke<MarketConfig>(IPC.market.config),
    view: (key: MarketKey | null) => invoke<Result<MarketView>>(IPC.market.view, key),
    prepare: (key: MarketKey, action: MarketAction) =>
      invoke<Result<PreparedAction>>(IPC.market.prepare, key, action),
    submit: (input: SubmitActionInput) => invoke<Result<MarketReceipt>>(IPC.market.submit, input),
    faucet: (key: MarketKey) => invoke<Result<MarketReceipt>>(IPC.market.faucet, key),
    settle: (world: string) => invoke<Result<MarketReceipt>>(IPC.market.settle, world),
    royalties: (world: string) => invoke<Result<MarketReceipt>>(IPC.market.royalties, world),
    link: () => invoke<Result<{ credentialId: string; key: MarketKey }>>(IPC.market.link),
    signInBrowser: (input: { preparedId: string; credentialId: string; summary: string }) =>
      invoke<Result<MarketReceipt>>(IPC.market.signInBrowser, input),
    cartridgeName: (cartridgeId: string, version: string, key: MarketKey | null) =>
      invoke<Result<EnsNameStatus>>(IPC.market.cartridgeName, cartridgeId, version, key),
    saveName: (instanceId: string, label: string | null, key: MarketKey | null) =>
      invoke<Result<SaveNameView>>(IPC.market.saveName, instanceId, label, key),
  },
  chain: {
    config: () => invoke<LedgerConfig>(IPC.chain.config),
    lookup: (contentHash: string) =>
      invoke<Result<LedgerRevision | null>>(IPC.chain.lookup, contentHash),
    publish: (input: PublishOnChainInput) =>
      invoke<Result<{ txHash: string }>>(IPC.chain.publish, input),
    witness: (input: WitnessOnChainInput) =>
      invoke<Result<{ txHash: string }>>(IPC.chain.witness, input),
    ensConfig: () => invoke<EnsNamesConfig>(IPC.chain.ensConfig),
    claimName: (cartridgeId: string, version: string) =>
      invoke<Result<ClaimNameResult>>(IPC.chain.claimName, cartridgeId, version),
  },
  app: {
    info: () => invoke<AppInfo>(IPC.app.info),
    openExternal: (url: string) => invoke<Result<void>>(IPC.app.openExternal, url),
    pickFile: (options: PickFileOptions) =>
      invoke<Result<{ path: string; base64: string } | null>>(IPC.app.pickFile, options),
    saveFile: (input: SaveFileInput) =>
      invoke<Result<{ path: string } | null>>(IPC.app.saveFile, input),
  },
  usage: {
    summary: (scope: UsageScope) => invoke<Result<UsageSummary>>(IPC.usage.summary, scope),
    link: (from: UsageScope, to: UsageScope) => invoke<Result<void>>(IPC.usage.link, from, to),
    onChanged: (listener: (record: UsageRecord) => void) =>
      subscribe<UsageRecord>(IPC.usage.changed, listener),
  },
  createDrafts: {
    list: () => invoke<Result<CreateDraftEntry[]>>(IPC.createDrafts.list),
    create: (idea: DraftIdea) => invoke<Result<CreateDraft>>(IPC.createDrafts.create, idea),
    read: (draftId: string) => invoke<Result<CreateDraft>>(IPC.createDrafts.read, draftId),
    save: (draft: CreateDraft) => invoke<Result<CreateDraft>>(IPC.createDrafts.save, draft),
    remove: (draftId: string) => invoke<Result<void>>(IPC.createDrafts.remove, draftId),
    looks: (draftId: string) => invoke<Result<LookPicture[]>>(IPC.createDrafts.looks, draftId),
    drawLook: (draftId: string, view: number, requestId: string) =>
      invoke<Result<LookPicture>>(IPC.createDrafts.drawLook, draftId, view, requestId),
    cancelLook: (requestId: string) => invoke<Result<void>>(IPC.createDrafts.cancelLook, requestId),
    discardLooks: (draftId: string, keep: string[]) =>
      invoke<Result<void>>(IPC.createDrafts.discardLooks, draftId, keep),
  },
  world: {
    ensure: (instanceId: string, name: string) =>
      invoke<Result<WorldEnsured>>(IPC.world.ensure, instanceId, name),
    read: (worldId: string) => invoke<Result<WorldRead>>(IPC.world.read, worldId),
    close: (worldId: string) => invoke<Result<void>>(IPC.world.close, worldId),
    append: (worldId: string, draft: WorldDraft) =>
      invoke<Result<WorldAppended>>(IPC.world.append, worldId, draft),
    claim: (worldId: string, target: ClaimTarget) =>
      invoke<Result<ClaimAnswer>>(IPC.world.claim, worldId, target),
    release: (worldId: string, target: ClaimTarget) =>
      invoke<Result<void>>(IPC.world.release, worldId, target),
    sendStream: (worldId: string, frame: StreamFrame) =>
      invoke<Result<void>>(IPC.world.sendStream, worldId, frame),
    sendPresence: (worldId: string, presence: Presence | null) =>
      invoke<Result<void>>(IPC.world.sendPresence, worldId, presence),
    attach: (worldId: string, url: string) =>
      invoke<Result<WorldStatus>>(IPC.world.attach, worldId, url),
    invite: (worldId: string, options: { uses: number; days: number }) =>
      invoke<Result<WorldInvite>>(IPC.world.invite, worldId, options),
    setAccess: (worldId: string, policy: AccessPolicy) =>
      invoke<Result<WorldAppended>>(IPC.world.setAccess, worldId, policy),
    hide: (worldId: string, id: string, hidden: boolean) =>
      invoke<Result<WorldAppended>>(IPC.world.hide, worldId, id, hidden),
    dismissRefused: (worldId: string, id: string) =>
      invoke<Result<void>>(IPC.world.dismissRefused, worldId, id),
    // The handler's schema checks arity: a trailing `undefined` would be a third argument.
    join: (link: string, name: string, instanceId?: string) =>
      instanceId === undefined
        ? invoke<Result<WorldJoined>>(IPC.world.join, link, name)
        : invoke<Result<WorldJoined>>(IPC.world.join, link, name, instanceId),
    revoke: (worldId: string, nonce: string) =>
      invoke<Result<WorldAppended>>(IPC.world.revoke, worldId, nonce),
    removeMember: (worldId: string, key: string) =>
      invoke<Result<WorldAppended>>(IPC.world.removeMember, worldId, key),
    preview: (link: string) => invoke<Result<InvitePreview>>(IPC.world.preview, link),
    badges: () => invoke<Result<WorldBadge[]>>(IPC.world.badges),
    probe: (url: string) => invoke<Result<ServiceProbe>>(IPC.world.probe, url),
    door: (worldId: string) => invoke<Result<WorldDoor>>(IPC.world.door, worldId),
    packWork: (worldId: string, work: WorkRef) =>
      invoke<Result<ContentHash>>(IPC.world.packWork, worldId, work),
    receivedWorks: () => invoke<Result<WorkRef[]>>(IPC.world.receivedWorks),
    addOwner: (worldId: string, key: string) =>
      invoke<Result<WorldAppended>>(IPC.world.addOwner, worldId, key),
    removeOwner: (worldId: string, key: string) =>
      invoke<Result<WorldAppended>>(IPC.world.removeOwner, worldId, key),
    setChainRecording: (worldId: string, record: boolean) =>
      invoke<Result<WorldAppended>>(IPC.world.setChainRecording, worldId, record),
    provenance: (worldId: string) =>
      invoke<Result<ProvenanceReport>>(IPC.world.provenance, worldId),
    onEntries: (listener: (event: WorldEntriesEvent) => void) =>
      subscribe<WorldEntriesEvent>(IPC.world.entries, listener),
    onStatus: (listener: (status: WorldStatus) => void) =>
      subscribe<WorldStatus>(IPC.world.status, listener),
    onPresence: (listener: (event: WorldPresenceEvent) => void) =>
      subscribe<WorldPresenceEvent>(IPC.world.presence, listener),
    onStream: (listener: (event: WorldStreamEvent) => void) =>
      subscribe<WorldStreamEvent>(IPC.world.stream, listener),
  },
  images: {
    settings: () => invoke<Result<ImageSettings>>(IPC.images.settings),
    choose: (id: ImageProviderId) => invoke<Result<ImageSettings>>(IPC.images.choose, id),
    probe: (id: ImageProviderId) => invoke<Result<ImageProbe>>(IPC.images.probe, id),
    audit: (target: LicenceAuditTarget) => invoke<Result<LicenceAudit>>(IPC.images.audit, target),
  },
  gateway: {
    route: () => invoke<Result<RouteView>>(IPC.gateway.route),
    account: () => invoke<Result<AccountStatus>>(IPC.gateway.account),
    signIn: () => invoke<Result<AccountStatus>>(IPC.gateway.signIn),
    signOut: () => invoke<Result<AccountStatus>>(IPC.gateway.signOut),
    requestPairing: () => invoke<Result<AccountStatus>>(IPC.gateway.requestPairing),
    cancelPairing: () => invoke<Result<AccountStatus>>(IPC.gateway.cancelPairing),
    lookupPairing: (code: string) => invoke<Result<PairingLookup>>(IPC.gateway.lookupPairing, code),
    approvePairing: (code: string, key: string) =>
      invoke<Result<AccountStatus>>(IPC.gateway.approvePairing, code, key),
    removeDevice: (key: string) => invoke<Result<AccountStatus>>(IPC.gateway.removeDevice, key),
    quota: () => invoke<Result<QuotaView>>(IPC.gateway.quota),
    onChanged: (listener: () => void) => subscribe<null>(IPC.gateway.changed, () => listener()),
    onQuota: (listener: (quota: QuotaView) => void) =>
      subscribe<QuotaView>(IPC.gateway.quotaChanged, listener),
    plans: () => invoke<Result<PlansResponse>>(IPC.gateway.plans),
    checkout: (plan: string) => invoke<Result<void>>(IPC.gateway.checkout, plan),
    portal: () => invoke<Result<void>>(IPC.gateway.portal),
  },
};

contextBridge.exposeInMainWorld("seed", api);
