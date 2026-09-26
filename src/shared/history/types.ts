// A world's shared history (rev 6 phase 3, D1–D4, D8, D13–D14; phase 4 D5–D6: co-owners and the
// chain opt-in): the event envelope, one body per event kind, the sequenced log entry, the verdicts
// the fold receives, and `WorldNow` — what the pure fold (./fold) derives from a genesis plus its
// log. The zod schemas for every body are in
// ./bodies; they are typed against these interfaces, so a change here that the schemas do not
// follow fails the typecheck. `WorldNow` is plain JSON (snapshots, D4).

import type { CartridgeRef, ContentHash } from "../cartridge";
import type { ChapterKind } from "../chapter";
import type { ChunkCoord } from "../chunks";
import type { LandNote } from "../land";
import type { LoreNode } from "../lore";
import type { PlaceKind } from "../places";
import type { StoryEpisode } from "../story";
import type { WorkRef } from "../works";
import type { ItemSpec, NpcRole } from "../world";

export const EVENT_KINDS = [
  "genesis",
  "access",
  "sequencer",
  "pack",
  "hide",
  "invite.revoke",
  "member.remove",
  "member.join",
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
  "beat",
  "rumor",
  // Phase 4 (D5, D6; world protocol 2): co-owners and the chain opt-in, all owner kinds.
  "owner.add",
  "owner.remove",
  "chain",
] as const;
export type EventKind = (typeof EVENT_KINDS)[number];

export const ACCESS_POLICIES = ["private", "friends", "public"] as const;
export type AccessPolicy = (typeof ACCESS_POLICIES)[number];

export const DEED_WHATS = ["chapter.cleared", "place.crossed", "errand.done"] as const;
export type DeedWhat = (typeof DEED_WHATS)[number];

/** An authored story episode's id and the chunk its gate stands in (the cartridge's story). */
export interface StoryGate {
  id: string;
  cx: number;
  cz: number;
}

/**
 * D1, exactly. Every field is read from disk (instance meta, save, pinned cartridge, runtime pin),
 * so one instance on one device always yields the same genesis. The owner is the genesis author;
 * their display name is a `profile` event, and the cartridge pack is a `pack` event.
 */
export interface GenesisBody {
  /** The world's name: `instance.meta.name`. */
  name: string;
  /** The exact revision; its content hash is its identity. */
  cartridge: CartridgeRef;
  /** `save.seed ?? cartridge.cartridgeId`: `landSeedOf` hashes it. */
  seed: string;
  /** `save.language ?? bibleLanguage(pinned bible) ?? "und"`. */
  language: string;
  physicsVersion: number;
  /** `instance.meta.createdAt` (also the envelope `at`). */
  createdAt: string;
  /** The door the world starts with: "friends". */
  access: AccessPolicy;
  /**
   * The pinned story's episodes (≤ 8) as id + gate chunk, so the fold resolves chapters, keeps
   * places off gates and knows the next free `story.more` id without opening the pack.
   */
  gates: StoryGate[];
  /** The instance it came from; `world` + `head` only when adopted from another device (D7). */
  from: { instanceId: string; world?: string; head?: Head };
}

export interface AccessBody {
  policy: AccessPolicy;
}

export interface SequencerBody {
  /** `wss://…`, or `ws://` on loopback. */
  url: string;
  /** The service's receipt key: every later `rsig` verifies with it. */
  key: string;
}

/** D10: announces the cartridge pack friends fetch; `cartridge` equals the genesis's hash. */
export interface PackBody {
  cartridge: ContentHash;
  pack: ContentHash;
  bytes: number;
}

/** D8: the owner's moderation tool. Views skip hidden events; nothing leaves the log. */
export interface HideBody {
  id: string;
  hidden: boolean;
}

export interface InviteRevokeBody {
  nonce: string;
}

export interface MemberRemoveBody {
  key: string;
}

/** D5: makes `key` a co-owner. Any owner writes it; a key that already owns the world is refused. */
export interface OwnerAddBody {
  key: string;
}

/** D5: `key` stops being an owner from this n on. Any owner writes it; never the last owner. */
export interface OwnerRemoveBody {
  key: string;
}

/** D6's opt-in: whether the world service records this world's beats on chain (latest wins). */
export interface ChainBody {
  record: boolean;
}

/**
 * A capability signed by the owner (D8), shared as
 * `unmapped://join?i=<base64url(canonical invite)>&k=<base64url(invite secret)>`.
 */
export interface Invite {
  v: 1;
  world: string;
  /** The service URL the invitee connects to. */
  svc: string;
  /** The owner's key; must equal the genesis author. */
  by: string;
  /** "k" + base32 of the one-time invite public key; its secret travels only in the link. */
  key: string;
  nonce: string;
  /** Expiry (strict ISO), compared with the receipt time of the `member.join`. */
  exp: string;
  /** 1–20. */
  uses: number;
  sig: string;
}
export type UnsignedInvite = Omit<Invite, "sig">;

export interface MemberJoinBody {
  invite: Invite;
  name: string;
  /** base64url Ed25519(invite secret, "unmapped-join:v1\n" + world + "\n" + nonce + "\n" + joiner). */
  proof: string;
}

export interface ProfileBody {
  name: string;
}

/**
 * What a witnessed chunk holds, so nobody needs to parse DSL to know it. `validateEventBody`
 * (src/dsl) requires it to equal the parsed programs.
 */
export interface WitnessIndex {
  name: string;
  npcs: { id: string; name: string; role: NpcRole }[];
  /** `place`: a lore id (live lore, or this witness's own) or null. */
  errands: { id: string; giver: string; place: string | null; reward: string }[];
  keepsakes: { id: string; name: string }[];
}

/** `WitnessChunkInput` minus `instanceId`, plus its index and what it grows out of. */
export interface WitnessBody {
  cx: number;
  cz: number;
  scene: string;
  dialogues: Record<string, string>;
  errands?: string;
  lore: LoreNode[];
  index: WitnessIndex;
  /** Id of a witness of the same chunk this one grows out of (a legend, usually). */
  supersedes?: string;
}

/** D3, exactly. */
export interface PlaceBody {
  kind: PlaceKind;
  title: string;
  /** The entrance chunk, decided by the writer (`placeSpot`); admit only checks it is free. */
  at: ChunkCoord;
  seed: number;
  /** side / dungeon only: the Scene program and each resident's words. */
  source?: string;
  dialogues?: Record<string, string>;
  /** otherworld only: the exact work revision and the pack friends fetch. */
  work?: WorkRef & { pack: ContentHash };
  /** Migrated only: the old "p1"…"p999" id. */
  legacyId?: string;
}

/**
 * D3: a chapter as played in the game, a Rule 13 chapter played as an AI work, or one whose draft
 * was never published (`closed`: its gate reads as told). `more` is the `story.more` event of a
 * continued chapter's episode, null for an authored episode.
 */
export type ChapterBody = { episodeId: string; title: string; more: string | null } & (
  | { kind: ChapterKind; source: string; dialogues?: Record<string, string>; seed: number }
  | { kind: "work"; work: WorkRef & { pack: ContentHash } }
  | { kind: "closed" }
);

export interface StoryMoreBody {
  episode: StoryEpisode;
}

/** `anchors`: witness event ids (≤ 8); `contests`: a note's event id or null. */
export type NoteBody = Omit<LandNote, "id" | "author" | "at"> & {
  /** The writer's display name (a continent visitor's, for a note kept by the owner). */
  name: string;
  via?: "continent";
};

/** A chunk plus a local tile. */
export interface TileCoord {
  cx: number;
  cz: number;
  x: number;
  z: number;
}

export interface SignpostBody {
  coord: TileCoord;
  text: string;
  toward: ChunkCoord | null;
}

export interface GiftBody {
  coord: TileCoord;
  item: ItemSpec;
  /** Only this key may take it; null = anyone. */
  for: string | null;
  words: string;
}

export interface GiftTakeBody {
  gift: string;
}

export interface VisitBody {
  chunks: ChunkCoord[];
}

/**
 * `ref`: chapter.cleared → a `chapter` event id; place.crossed → a `place` event id;
 * errand.done → `<witness event id>:<errand id>` naming an errand of that witness's index.
 */
export interface DeedBody {
  what: DeedWhat;
  ref: string;
}

export interface RumorSlot {
  slot: number;
  /** The event the rumor retells. */
  cite: string;
  /** The live witness of the chunk where it happened, or null. */
  place: string | null;
  /** The resident who tells it. */
  listener: { cx: number; cz: number; npc: string };
}

export interface BeatBody {
  /** Last n folded; the beat itself is upTo + 1. */
  upTo: number;
  /** Beat time T (the sequencer's clock). */
  at: string;
  season: 0 | 1 | 2 | 3;
  /** Chunk keys ("cx,cz", ascending cx then cz) this beat returns to fog. */
  fog: string[];
  slots: RumorSlot[];
  fingerprint: string;
}

export interface RumorBody {
  /** The beat's event id. */
  beat: string;
  slot: number;
  text: string;
}

export interface EventBodies {
  genesis: GenesisBody;
  access: AccessBody;
  sequencer: SequencerBody;
  pack: PackBody;
  hide: HideBody;
  "invite.revoke": InviteRevokeBody;
  "member.remove": MemberRemoveBody;
  "member.join": MemberJoinBody;
  profile: ProfileBody;
  witness: WitnessBody;
  place: PlaceBody;
  chapter: ChapterBody;
  "story.more": StoryMoreBody;
  note: NoteBody;
  signpost: SignpostBody;
  gift: GiftBody;
  "gift.take": GiftTakeBody;
  visit: VisitBody;
  deed: DeedBody;
  beat: BeatBody;
  rumor: RumorBody;
  "owner.add": OwnerAddBody;
  "owner.remove": OwnerRemoveBody;
  chain: ChainBody;
}

/** The envelope around every body (D2). A type alias, so an event is also a `StoredEvent`. */
export type EventEnvelope = {
  v: 1;
  /** The world id; "" only in the genesis event. */
  world: string;
  author: string;
  /** The author's clock: shown to players, never used for ordering or decay. */
  at: string;
  /** Highest sequenced n the author had folded when writing (0 = none). */
  seen: number;
  id: string;
  sig: string;
};

export type HistoryEventOf<K extends EventKind> = EventEnvelope & { kind: K; body: EventBodies[K] };
export type HistoryEvent = { [K in EventKind]: HistoryEventOf<K> }[EventKind];
export type GenesisEvent = HistoryEventOf<"genesis">;

export type UnsignedEventOf<K extends EventKind> = Omit<HistoryEventOf<K>, "id" | "sig">;
export type UnsignedEvent = { [K in EventKind]: UnsignedEventOf<K> }[EventKind];

/**
 * What the renderer asks main to sign (D2, D11): main fills world, author and at. `seen` is the
 * head n the renderer's fold had when the generation started; main refuses one above its head.
 */
export type EventDraft = {
  [K in EventKind]: { kind: K; body: EventBodies[K]; seen: number };
}[EventKind];

/**
 * An event as it sits in a log line or a frame: any JSON object with an id. The fold reads it
 * (./event `readEvent`); an unknown kind or version stays in the log and is skipped (D18).
 */
export type StoredEvent = Readonly<Record<string, unknown>> & { readonly id: string };

export interface LogEntry {
  n: number;
  /** Receipt time: the only clock the fold uses. Non-decreasing along the log. */
  rt: string;
  chain: string;
  event: StoredEvent;
  /** The sequencer's receipt signature; null in a local-only world. */
  rsig: string | null;
}

export interface Head {
  n: number;
  chain: string;
}

/**
 * D4: what the checks the fold cannot run found for one event — its id and signature
 * (`verifyEvent`, shared) and its DSL body (`validateEventBody`, src/dsl). Main and the service
 * compute it (`entryVerdict`, src/dsl/history/verdict.ts); the renderer receives it per entry.
 */
export type EntryVerdict = { ok: true } | { ok: false; code: string };

export interface VerdictEntry {
  entry: LogEntry;
  verdict: EntryVerdict;
}

/** An own outbox event with its verdict, folded provisionally by `withPending`. */
export interface PendingEvent {
  event: StoredEvent;
  verdict: EntryVerdict;
}

// ── WorldNow ─────────────────────────────────────────────────────────────────────────────────

/** An admitted event as the fold keeps it. `pending`: from the outbox, not yet shared. */
export interface Folded<B> {
  id: string;
  n: number;
  rt: string;
  at: string;
  author: string;
  body: B;
  pending: boolean;
}

/**
 * The first writer and the race losers (異聞) of one target. `live` is null only for a chapter
 * whose every writer so far wrote for a variant `story.more` (a child of a variant is a variant).
 */
export interface Contest<B> {
  live: Folded<B> | null;
  variants: Folded<B>[];
}

export interface ChunkNow {
  cx: number;
  cz: number;
  /** The witness that is this place; while fogged (or hidden), what the legend marker names. */
  live: Folded<WitnessBody>;
  /**
   * Returned to fog by a beat. A fogged chunk, or one whose live witness is hidden, does not
   * stand (`chunkStands`): a re-witness makes a new live one and this one a legend.
   */
  fogged: boolean;
  variants: Folded<WitnessBody>[];
  legends: Folded<WitnessBody>[];
  index: WitnessIndex;
}

export interface PlaceNow extends Folded<PlaceBody> {
  /** The place id saves and targets use: `legacyId ?? "p" + eventId.slice(1, 9)`. */
  place: string;
  /** The entrance chunk (`body.at`). */
  cx: number;
  cz: number;
}

export interface GiftNow extends Folded<GiftBody> {
  taken: { by: string; id: string; pending: boolean } | null;
}

/**
 * D5: a key that owns, or owned, the world. The genesis author starts as the only one; an owner's
 * `owner.add` makes another; `owner.remove` ends that (it may be added again later).
 */
export interface OwnerNow {
  key: string;
  /** n of the entry that first made this key an owner (1: the genesis author). Never moves. */
  n: number;
  /** n of the `owner.remove` that ended its last time as an owner; null while it is one. */
  removed: number | null;
  /**
   * The `owner.add` that first made it an owner (null for the genesis author). Each one's author
   * was an owner before it, so following them always leads back to the genesis author: the path
   * an invite by this key carries in `&o=`.
   */
  added: HistoryEventOf<"owner.add"> | null;
  pending: boolean;
}

export interface MemberNow {
  key: string;
  name: string;
  /** n of the `member.join`. */
  n: number;
  nonce: string;
  pending: boolean;
}

/** What any admitted event says about itself, for citations and deed refs. */
export interface EventRef {
  id: string;
  n: number;
  kind: EventKind;
  author: string;
  rt: string;
  /**
   * "variant" for a race loser (witness, chapter, story.more, rumor) and for a child of a variant
   * (a note, deed, chapter or gift.take whose parent is one); else "live".
   */
  status: "live" | "variant";
  pending: boolean;
  /** What a rumor must name: place name, place or chapter title, item name, member name. */
  label: string | null;
  /** The chunk where it happened (care goes there; rumors travel from there). */
  where: ChunkCoord | null;
  /** Someone else it is about (a gift's recipient); the author is always allowed. */
  subject: string | null;
}

export interface IgnoredEntry {
  /** Log position; for a pending event, its provisional position. */
  n: number;
  id: string | null;
  kind: string | null;
  code: string;
  pending: boolean;
}

export interface WorldNow {
  world: string;
  genesis: GenesisEvent;
  /** The genesis author, who sequences a local-only world. Who owns the world now: `owners`. */
  owner: string;
  /** D5: every key that owns or owned the world, by key; `removed === null` owns it now. */
  owners: Record<string, OwnerNow>;
  /** D6: the latest `chain` event's body, or null (no opt-in: nothing is recorded). */
  provenance: ChainBody | null;
  /** The last sequenced entry folded ({ n: 0, chain: world } before any). */
  head: Head;
  /** Receipt time of the head entry; null before any. */
  rt: string | null;
  /** Receipt time of entry 1 (the genesis): seasons count from it. */
  genesisRt: string | null;
  access: AccessPolicy;
  sequencer: SequencerBody | null;
  /** The latest `pack` announcement, or null (a shipped built-in revision needs none). */
  pack: PackBody | null;
  /** Event ids the owner hid (latest `hide` per id wins). Views skip them; indexes keep them. */
  hidden: Record<string, true>;
  members: Record<string, MemberNow>;
  /** Keys the owner removed, with the n it applies from. */
  removed: Record<string, number>;
  /** Display names by key, from joins and profiles (latest wins). */
  names: Record<string, string>;
  /** Invites seen so far by nonce: uses from `member.join`, the n of an `invite.revoke`. */
  invites: Record<string, { uses: number; revoked: number | null }>;
  chunks: Record<string, ChunkNow>;
  notes: Folded<NoteBody>[];
  signposts: Folded<SignpostBody>[];
  gifts: Record<string, GiftNow>;
  places: PlaceNow[];
  chapters: Record<string, Contest<ChapterBody>>;
  more: Record<string, Contest<StoryMoreBody>>;
  /** Care in µpt per chunk as of the last beat; `season` likewise. */
  care: Record<string, number>;
  season: 0 | 1 | 2 | 3;
  beats: Folded<BeatBody>[];
  /** Keyed `<beat id>#<slot>`. */
  rumors: Record<string, Contest<RumorBody>>;
  /**
   * Care points per chunk key and UTC receipt day (`floor(ms / day)`, as a string key). Each beat
   * drops days more than 180 before it (they weigh 0), so this stays chunks × 181.
   */
  touches: Record<string, Record<string, number>>;
  /** The last receipt time (ms) anything added care to each chunk: the 28-day quiet rule. */
  lastTouch: Record<string, number>;
  /** The UTC day of each author's last `visit` (one per day). */
  lastVisit: Record<string, number>;
  /** `author|ref` of deeds already written (one per author and ref). */
  deeds: Record<string, string>;
  events: Record<string, EventRef>;
  ignored: IgnoredEntry[];
  /** How many outbox events are folded on top (0 for the sequenced fold). */
  pending: number;
}

/** A fold cache main and the service keep (D4); loaded only if `foldVersion` and the chain match. */
export interface FoldSnapshot {
  foldVersion: number;
  head: Head;
  now: WorldNow;
}

/** What `admit` decides for an event that may enter the history. */
export interface Admission {
  as: "live" | "variant";
  /** A beat's recomputed care (µpt per chunk), kept by the fold. */
  care?: Record<string, number>;
}
