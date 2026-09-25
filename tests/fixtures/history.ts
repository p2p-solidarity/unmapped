// Test-only builders for a world's history (rev 6 phase 3): deterministic keys, a genesis, and a
// naive sequencer that sequences everything it is given — as a broken or hostile service would —
// so the fold's own checks are what the tests exercise. Imported only by tests/shared/history-*.

import { computeBeat } from "@shared/history/beat";
import { applyEntry, emptyNow } from "@shared/history/fold";
import { base32, DAY_MS, sha256Bytes } from "@shared/history/ids";
import { type LogCursor, logStart, sequenceEvent } from "@shared/history/log";
import {
  authorKeyFor,
  signatureVerdict,
  signEvent,
  signInvite,
  signJoinProof,
} from "@shared/history/sign";
import type {
  ChapterBody,
  EntryVerdict,
  EventBodies,
  EventKind,
  GenesisBody,
  GenesisEvent,
  HistoryEventOf,
  Invite,
  LogEntry,
  PendingEvent,
  StoredEvent,
  UnsignedEventOf,
  VerdictEntry,
  WitnessBody,
  WitnessIndex,
  WorldNow,
} from "@shared/history/types";
import type { LoreNode } from "@shared/lore";
import type { ItemSpec } from "@shared/world";

export const secret = (name: string) => sha256Bytes(`history-fold:${name}`);
export const OWNER = secret("owner");
export const ANN = secret("ann");
export const BEN = secret("ben");
export const VISITOR = secret("visitor");
export const SERVICE = secret("service");
export const key = authorKeyFor;
export const T0 = Date.parse("2026-09-26T00:00:00.000Z");
export const day = (days: number, minutes = 0) =>
  new Date(T0 + days * DAY_MS + minutes * 60_000).toISOString();
export const HASH = `sha256:${"cd".repeat(32)}` as const;

export const GENESIS: GenesisBody = {
  name: "Glass Harbor",
  cartridge: { cartridgeId: "glass-harbor", version: "1.0.0", contentHash: HASH },
  seed: "K7QM-2PXD",
  language: "en",
  physicsVersion: 1,
  createdAt: day(0),
  access: "friends",
  gates: [
    { id: "e1", cx: 6, cz: 0 },
    { id: "e2", cx: -6, cz: 2 },
  ],
  from: { instanceId: "glass-harbor-1" },
};

/** An invite and the one-time secret its link carries. */
export interface Ticket {
  invite: Invite;
  secret: Uint8Array;
}

export const canon = (now: WorldNow) => JSON.stringify(now);

/**
 * A world plus a naive sequencer: it sequences everything, as a broken service would, and folds
 * each entry with its signature verdict. The owner's profile ("Mira") follows the genesis.
 */
export class World {
  readonly genesis: GenesisEvent;
  readonly entries: LogEntry[] = [];
  private readonly verdicts: EntryVerdict[] = [];
  now: WorldNow;
  private cursor: LogCursor;
  private nonce = 0;

  constructor(body: Partial<GenesisBody> = {}) {
    this.genesis = signEvent(
      {
        v: 1,
        world: "",
        kind: "genesis",
        author: key(OWNER),
        at: day(0),
        seen: 0,
        body: { ...GENESIS, ...body },
      },
      OWNER,
    );
    this.cursor = logStart(this.genesis.id);
    this.now = emptyNow(this.genesis);
    this.append(this.genesis, day(0));
    this.write("profile", { name: "Mira" }, OWNER, day(0));
  }

  get id(): string {
    return this.genesis.id;
  }

  event<K extends EventKind>(
    kind: K,
    body: EventBodies[K],
    who: Uint8Array,
    seen = this.now.head.n,
  ): HistoryEventOf<K> {
    const unsigned = { v: 1, world: this.id, kind, author: key(who), at: "then", seen, body };
    return signEvent(unsigned as UnsignedEventOf<K>, who);
  }

  append(event: StoredEvent, rt: string, verdict = signatureVerdict(event)): LogEntry {
    const entry = sequenceEvent(this.cursor, event, rt, null);
    this.cursor = { n: entry.n, chain: entry.chain, rt: entry.rt };
    this.entries.push(entry);
    this.verdicts.push(verdict);
    this.now = applyEntry(this.now, entry, verdict);
    return entry;
  }

  /** The log with the verdict each entry was folded with. */
  verdictEntries(from = 0, to = this.entries.length): VerdictEntry[] {
    return this.entries.slice(from, to).map((entry, index) => ({
      entry,
      verdict: this.verdicts[from + index] ?? { ok: true },
    }));
  }

  write<K extends EventKind>(
    kind: K,
    body: EventBodies[K],
    who: Uint8Array,
    rt: string,
    seen?: number,
  ): HistoryEventOf<K> {
    const event = this.event(kind, body, who, seen);
    this.append(event, rt);
    return event;
  }

  invite(options: { uses?: number; exp?: string; by?: Uint8Array; world?: string } = {}): Ticket {
    this.nonce += 1;
    const inviteSecret = secret(`invite:${this.nonce}`);
    const invite = signInvite(
      {
        v: 1,
        world: options.world ?? this.id,
        svc: "wss://worlds.example",
        by: key(options.by ?? OWNER),
        key: key(inviteSecret),
        nonce: base32(sha256Bytes(`nonce:${this.nonce}`)).slice(0, 20),
        exp: options.exp ?? day(30),
        uses: options.uses ?? 1,
      },
      options.by ?? OWNER,
    );
    return { invite, secret: inviteSecret };
  }

  join(who: Uint8Array, name: string, rt: string, ticket = this.invite()) {
    const proof = signJoinProof(ticket.secret, ticket.invite, key(who));
    return this.write("member.join", { invite: ticket.invite, name, proof }, who, rt);
  }

  beat(rt: string, by = OWNER) {
    const beat = computeBeat(this.now, rt);
    if (!beat.ok) throw new Error(beat.error.message);
    return this.write("beat", beat.value.body, by, rt);
  }

  code(id: string): string | undefined {
    return this.now.ignored.find((entry) => entry.id === id)?.code;
  }
}

export function lore(slug: string, cx: number, cz: number, links: string[] = []): LoreNode {
  return {
    id: `${slug}@${cx},${cz}`,
    kind: "place",
    label: slug,
    text: "",
    coord: { cx, cz },
    links,
    tone: 0,
  };
}

export function witness(
  cx: number,
  cz: number,
  name: string,
  npcs = ["ada"],
  nodes: LoreNode[] = [],
  extra: Partial<Pick<WitnessIndex, "errands" | "keepsakes">> = {},
): WitnessBody {
  return {
    cx,
    cz,
    scene: `Scene("${name}")`,
    dialogues: Object.fromEntries(npcs.map((id) => [id, `Dialogue("${id}")`])),
    lore: nodes,
    index: {
      name,
      npcs: npcs.map((id) => ({ id, name: `${id}_kin`, role: "farmer" as const })),
      errands: extra.errands ?? [],
      keepsakes: extra.keepsakes ?? [],
    },
  };
}

export const ITEM: ItemSpec = {
  id: "lamp",
  name: "Tin Lamp",
  kind: "charm",
  power: 3,
  perk: "",
  curse: null,
  meshDna: [],
  archetype: [],
  flavor: "",
};
export const TILE = (cx: number, cz: number) => ({ cx, cz, x: 4, z: 5 });

export function chapter(episodeId: string, title: string, more: string | null = null): ChapterBody {
  return { episodeId, title, more, kind: "land", source: `Chapter("${title}")`, seed: 7 };
}

/** A course place standing at `at` (the writer chose it). */
export function place(title: string, cx: number, cz: number, legacyId?: string) {
  return {
    kind: "side" as const,
    title,
    at: { cx, cz },
    seed: 1,
    source: "Scene()",
    ...(legacyId === undefined ? {} : { legacyId }),
  };
}

export function prng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A note on tile (2, 2) of chunk (2, 2), anchored to witnesses, maybe answering another note. */
export function note(anchors: string[], contests: string | null = null) {
  return { coord: TILE(2, 2), anchors, text: "was here", contests, name: "Ann" };
}

/** An outbox event with its signature verdict. */
export function pending(event: StoredEvent): PendingEvent {
  return { event, verdict: signatureVerdict(event) };
}
