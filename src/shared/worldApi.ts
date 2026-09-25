// `window.seed.world.*` (rev 6 phase 3, D11): the channels, payloads and answers of a shared world
// between main and the renderer. Kept in its own file until the IPC registry takes it in: the
// wiring adds `world: WORLD_IPC` to `IPC` and `world: WorldApi` to `SeedApi` (src/shared/ipc.ts).
// Every payload is zod-checked in main (`main/histories/ipcSchemas.ts`).

import type {
  AccessPolicy,
  EventDraft,
  FoldSnapshot,
  Head,
  PendingEvent,
  StoredEvent,
  VerdictEntry,
} from "./history/types";
import type { AppError, Result } from "./result";
import type { ClaimStatus, ClaimTarget, Presence, StreamEnd } from "./worldProtocol";

export const WORLD_IPC = {
  ensure: "world:ensure",
  read: "world:read",
  close: "world:close",
  append: "world:append",
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

export interface WorldApi {
  /** Migrates (once) or catches up the save's world, adopts a restored one; lazy and idempotent. */
  ensure(instanceId: string, name: string): Promise<Result<WorldEnsured>>;
  read(worldId: string): Promise<Result<WorldRead>>;
  /** Play left the world: snapshot, stop syncing it. */
  close(worldId: string): Promise<Result<void>>;
  append(worldId: string, draft: WorldDraft): Promise<Result<WorldAppended>>;
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
  onEntries(listener: (event: WorldEntriesEvent) => void): () => void;
  onStatus(listener: (status: WorldStatus) => void): () => void;
  onPresence(listener: (event: WorldPresenceEvent) => void): () => void;
  onStream(listener: (event: WorldStreamEvent) => void): () => void;
}
