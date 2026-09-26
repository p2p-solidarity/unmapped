// `window.seed.world.*` (rev 6 phase 3, D11): the channels, payloads and answers of a shared world
// between main and the renderer. Kept in its own file until the IPC registry takes it in: the
// wiring adds `world: WORLD_IPC` to `IPC` and `world: WorldApi` to `SeedApi` (src/shared/ipc.ts).
// Every payload is zod-checked in main (`main/histories/ipcSchemas.ts`).

import type { ContentHash } from "./cartridge";
import type { ChunkCoord } from "./chunks";
import type {
  AccessPolicy,
  EventDraft,
  FoldSnapshot,
  Head,
  PendingEvent,
  StoredEvent,
  VerdictEntry,
} from "./history/types";
import type { ProvenanceReport } from "./provenance";
import type { AppError, Result } from "./result";
import type { WorkRef } from "./works";
import type { WorldProgress } from "./worldProgress";
import type { ClaimStatus, ClaimTarget, Presence, StreamEnd } from "./worldProtocol";

export const WORLD_IPC = {
  ensure: "world:ensure",
  read: "world:read",
  close: "world:close",
  append: "world:append",
  /** The day's walk not yet written as a `visit` (D13): main writes it if the app quits first. */
  walked: "world:walked",
  claim: "world:claim",
  release: "world:release",
  sendStream: "world:send-stream",
  sendPresence: "world:send-presence",
  attach: "world:attach",
  invite: "world:invite",
  setAccess: "world:set-access",
  hide: "world:hide",
  dismissRefused: "world:dismiss-refused",
  join: "world:join",
  /** The door and the library (WP8): owner actions, a look before joining, badges, a probe. */
  revoke: "world:revoke",
  removeMember: "world:remove-member",
  preview: "world:preview",
  badges: "world:badges",
  probe: "world:probe",
  door: "world:door",
  /** The land (WP5): the pack of an AI work an otherworld place announces (D10). */
  packWork: "world:pack-work",
  receivedWorks: "world:received-works",
  /** Co-owners and the chain opt-in (phase 4, D5, D6): owner actions, and the chain's answer. */
  addOwner: "world:add-owner",
  removeOwner: "world:remove-owner",
  setChainRecording: "world:set-chain-recording",
  provenance: "world:provenance",
  /** Events main sends: new sequenced entries (with verdicts) and the current outbox. */
  entries: "world:entries",
  status: "world:status",
  presence: "world:presence",
  stream: "world:stream",
} as const;

/** Kinds the renderer drafts; main writes genesis, sequencer, pack, beat and joins itself. */
export const DRAFT_KINDS = [
  "profile",
  "witness",
  "place",
  "chapter",
  "story.more",
  "note",
  "signpost",
  "gift",
  "gift.take",
  "visit",
  "deed",
  "rumor",
] as const;
export type DraftKind = (typeof DRAFT_KINDS)[number];
export type WorldDraft = Extract<EventDraft, { kind: DraftKind }>;

/** Something the migration kept out of the history, and why; still drawn from its legacy file. */
export interface Skipped {
  /** "chunk" (key "cx,cz"), "note" (its old id), "place" (its old id), or an event kind. */
  what: string;
  key: string;
  code: string;
  message: string;
}

/** Something that entered the history changed on the way (a moved place, a dangling note link). */
export interface Adjusted {
  what: string;
  key: string;
  code: string;
  detail: string;
}

export type WorldRole = "owner" | "member" | "visitor" | "removed";

export type LinkState =
  /** Local-only: this device sequences its own history. */
  | "local"
  | "offline"
  | "connecting"
  | "online"
  /** The service's history is not this device's: sync stopped (`history-diverged`). */
  | "diverged"
  /** The service refused this device (door, removal, quota on open). */
  | "refused";

export interface WorldStatus {
  world: string;
  link: LinkState;
  url: string | null;
  role: WorldRole;
  /** Whether this device can write here now (a key, a role that writes, not diverged). */
  writable: boolean;
  head: Head;
  pending: number;
  /** Own events the service refused, not yet dismissed (Rule 2: never dropped silently). */
  refused: number;
  ignored: number;
  /** Entries from a newer build, kept and skipped (D18). */
  newer: number;
  error: AppError | null;
  /** This device's author key (what "mine" means in the fold); null without a device key. */
  me: string | null;
}

export interface RefusedEvent {
  event: StoredEvent;
  error: AppError;
  at: string;
}

export interface WorldEnsured {
  worldId: string;
  /** A first migration ran in this call. */
  migrated: boolean;
  /** Events a catch-up added ("An older build changed this save: 2 things added"). */
  added: number;
  /** Set when this call adopted a world restored from another device (D7). */
  adoptedFrom: string | null;
  skipped: Skipped[];
  /** What the migration or catch-up in this call changed on the way in. */
  adjusted: Adjusted[];
  /** Progress keys an adoption could not carry over (their events did not survive re-signing). */
  lost: string[];
  status: WorldStatus;
  /** The save's `progress.json` as it stands after this call (merged, never regressed). */
  progress: WorldProgress;
}

export interface WorldRead {
  world: string;
  genesis: StoredEvent;
  /** A fold of the entries before `entries` (null: fold from the genesis). */
  snapshot: FoldSnapshot | null;
  entries: VerdictEntry[];
  pending: PendingEvent[];
  refused: RefusedEvent[];
  status: WorldStatus;
}

export interface WorldAppended {
  id: string;
  /** The entry's n once sequenced; null while it waits in the outbox. */
  n: number | null;
}

export interface WorldEntriesEvent {
  world: string;
  entries: VerdictEntry[];
  pending: PendingEvent[];
  head: Head;
  /** True when the whole log was replaced (attach re-receipts it): refold from `read`. */
  reset: boolean;
}

export interface ClaimAnswer {
  status: ClaimStatus;
  sid?: string;
  by?: string;
  n?: number;
  text?: string;
}

export interface StreamFrame {
  sid: string;
  k: number;
  text?: string;
  end?: StreamEnd;
}

export interface WorldStreamEvent extends StreamFrame {
  world: string;
  from: string;
}

export interface WorldPresenceEvent {
  world: string;
  from: string;
  p: Presence | null;
}

export interface WorldInvite {
  link: string;
  exp: string;
  uses: number;
}

export interface WorldJoined {
  worldId: string;
  instanceId: string;
  status: WorldStatus;
}

/**
 * What an invite link leads to, read from its service before joining (D8): the world's history is
 * fetched with the invite and verified, the invite checked against it, and nothing is written.
 */
export interface InvitePreview {
  world: string;
  /** The genesis name. */
  name: string;
  /** The genesis author's key, and the name the world knows them by (null: none yet). */
  owner: string;
  ownerName: string | null;
  /** The service the invite names. */
  service: string;
  exp: string;
  uses: number;
  /** Uses left as the world's history counts them. */
  left: number;
  access: AccessPolicy;
  members: number;
  head: number;
  /** This device's key already belongs to the world: joining only makes the save. */
  member: boolean;
  /**
   * A save on this device already pinned to this world (restored from its owner's backup, D7):
   * joining redeems the invite for that save instead of making a new one.
   */
  restored: { instanceId: string; name: string } | null;
}

/**
 * Where a save's world lives, for the library: `local` (only this device sequences it), `shared`
 * (a world this device owns or co-owns, on a service), `joined` (a world this device joined).
 */
export type WorldBadgeKind = "local" | "shared" | "joined";

export interface WorldBadge {
  instanceId: string;
  worldId: string;
  kind: WorldBadgeKind;
  url: string | null;
  owner: string;
  ownerName: string | null;
}

/** A world service that answered on both halves of its address (Settings → Shared worlds). */
export interface ServiceProbe {
  url: string;
  /** The key the service proved; equal on `/v1/health` and in its WebSocket challenge. */
  key: string;
  version: string;
  protocol: number;
  /** Physics versions it reproduces. */
  physics: number[];
  worlds: number;
  test: boolean;
  healthMs: number;
  challengeMs: number;
}

/**
 * One row of the door's people list. Rows are told apart by `kind`, so a later kind is one more
 * member of the union and one more row renderer, not a new list. `owner` is the world's maker
 * while it owns the world; `co-owner` is any other key that owns it now (phase 4, D5); a former
 * owner that is not a member is listed as `removed`.
 */
export type DoorRowKind = "owner" | "co-owner" | "member" | "removed";

export interface DoorPerson {
  kind: DoorRowKind;
  key: string;
  /** The name the world knows the key by (joins and profiles, latest wins); null: none yet. */
  name: string | null;
  /**
   * n of the `member.join` (member), the `owner.add` that made it an owner (co-owner), or the
   * `member.remove` / `owner.remove` that ended it (removed); null for the maker.
   */
  n: number | null;
  /** Still in this device's outbox (a join, an addition or a removal not yet sequenced). */
  pending: boolean;
  /** This device's own key. */
  me: boolean;
}

export type IssuedInviteState = "open" | "used-up" | "expired" | "revoked";

/**
 * An invite this device made for a world, as the owner's device remembers it (never its secret:
 * the link is shown once, when made) and as the world's history counts it.
 */
export interface IssuedInvite {
  nonce: string;
  exp: string;
  uses: number;
  /** Joins the history counts for it. */
  used: number;
  state: IssuedInviteState;
  /** When this device made it. */
  at: string;
}

/** What the world's door shows (D8): who is in, the policy, and the owner's invites. */
export interface WorldDoor {
  world: string;
  /** The genesis name. */
  name: string;
  status: WorldStatus;
  /** The door with this device's own unsent changes on top (`accessPending` while one waits). */
  access: AccessPolicy;
  accessPending: boolean;
  owner: string;
  people: DoorPerson[];
  /** Made on this device, newest first; empty on a device that owns nothing here. */
  invites: IssuedInvite[];
  /**
   * D6's opt-in with this device's unsent change on top: whether the owners asked the world's
   * service to record its beats on chain (`recordingPending` while that change waits).
   */
  recording: boolean;
  recordingPending: boolean;
}

export interface WorldApi {
  /** Migrates (once) or catches up the save's world, adopts a restored one; lazy and idempotent. */
  ensure(instanceId: string, name: string): Promise<Result<WorldEnsured>>;
  read(worldId: string): Promise<Result<WorldRead>>;
  /** Play left the world: snapshot, stop syncing it. */
  close(worldId: string): Promise<Result<void>>;
  append(worldId: string, draft: WorldDraft): Promise<Result<WorldAppended>>;
  /**
   * The chunks walked in this world today that no `visit` holds yet (D13). Main keeps the latest
   * list (it replaces the one before) and writes it as the day's visit when the app quits before the
   * land has; any `visit` appended for the world drops it, so a day never gets two.
   */
  walked(worldId: string, chunks: ChunkCoord[]): Promise<Result<void>>;
  /** 1.5 s at most; `claim-offline` when there is no service to ask. */
  claim(worldId: string, target: ClaimTarget): Promise<Result<ClaimAnswer>>;
  release(worldId: string, target: ClaimTarget): Promise<Result<void>>;
  sendStream(worldId: string, frame: StreamFrame): Promise<Result<void>>;
  sendPresence(worldId: string, presence: Presence | null): Promise<Result<void>>;
  attach(worldId: string, url: string): Promise<Result<WorldStatus>>;
  invite(worldId: string, options: { uses: number; days: number }): Promise<Result<WorldInvite>>;
  setAccess(worldId: string, policy: AccessPolicy): Promise<Result<WorldAppended>>;
  hide(worldId: string, id: string, hidden: boolean): Promise<Result<WorldAppended>>;
  dismissRefused(worldId: string, id: string): Promise<Result<void>>;
  /**
   * Redeems an invite link: `name` is this player's display name in the world (the `member.join`
   * body); `instanceId` reuses a save restored from the world's owner (else a new save is made).
   */
  join(link: string, name: string, instanceId?: string): Promise<Result<WorldJoined>>;
  /** Owner: withdraws an invite by its nonce (an `invite.revoke`); later joins with it fail. */
  revoke(worldId: string, nonce: string): Promise<Result<WorldAppended>>;
  /** Owner: a `member.remove`; from its n the key neither reads nor writes, its past stays. */
  removeMember(worldId: string, key: string): Promise<Result<WorldAppended>>;
  /** Reads the world an invite link leads to without joining it. */
  preview(link: string): Promise<Result<InvitePreview>>;
  /** Every save on this device that has a world, and where that world lives. Never migrates. */
  badges(): Promise<Result<WorldBadge[]>>;
  /** `GET /v1/health` and the WebSocket challenge of a service, from main (no page talks to it). */
  probe(url: string): Promise<Result<ServiceProbe>>;
  /** The door of a world: its people, its policy and the invites this device made for it. */
  door(worldId: string): Promise<Result<WorldDoor>>;
  /**
   * Packs one of this device's published AI works as the blob an otherworld place announces (its
   * hash goes in the place body's `work.pack`); an attached world also gets the blob uploaded.
   */
  packWork(worldId: string, work: WorkRef): Promise<Result<ContentHash>>;
  /** AI works that arrived with any shared world on this device (never this device's to place). */
  receivedWorks(): Promise<Result<WorkRef[]>>;
  /**
   * Owner (phase 4, D5): makes `key` (another device's author key, "k…") a co-owner with an
   * `owner.add`. Refused before anything is signed when this device owns nothing here.
   */
  addOwner(worldId: string, key: string): Promise<Result<WorldAppended>>;
  /** Owner: ends `key`'s ownership (`owner.remove`); the last owner stays (`owner-last`). */
  removeOwner(worldId: string, key: string): Promise<Result<WorldAppended>>;
  /** Owner (D6): whether the world's service records its beats on a public chain (a `chain`). */
  setChainRecording(worldId: string, record: boolean): Promise<Result<WorldAppended>>;
  /**
   * This device's copy of the world against what its services recorded on chain (read-only).
   * `provenance-not-configured` when no chain is set up on this device: nothing is read then.
   */
  provenance(worldId: string): Promise<Result<ProvenanceReport>>;
  onEntries(listener: (event: WorldEntriesEvent) => void): () => void;
  onStatus(listener: (status: WorldStatus) => void): () => void;
  onPresence(listener: (event: WorldPresenceEvent) => void): () => void;
  onStream(listener: (event: WorldStreamEvent) => void): () => void;
}
