// Throwaway keys and worlds for scripts/world-probe.ts (rev 6 phase 3, D1–D3, D7, D8). Every key
// is a fresh Ed25519 key made in memory, as the app's device key is; the only keys read from disk
// are the probe's own key files (tagged, 0600), never the app's `identity/device.key` or `.env`.
//
// A LocalWorld is a world as its owner's device holds it before any service: entries with null
// receipts, folded here with `entryVerdict` exactly as main folds them, so a setup mistake (a
// witness the DSL refuses, an entry admit skips) stops the probe here instead of turning into a
// puzzling refusal later.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { witnessIndexOf } from "@dsl/history/validate";
import { entryVerdict } from "@dsl/history/verdict";
import type { ContentHash } from "@shared/cartridge";
import { applyEntry, emptyNow } from "@shared/history/fold";
import { base32, base64Url, contentHash, fromBase64Url } from "@shared/history/ids";
import { type LogCursor, logStart, sequenceEvent } from "@shared/history/log";
import {
  authorKeyFor,
  newSecretKey,
  signEvent,
  signInvite,
  signJoinProof,
} from "@shared/history/sign";
import type {
  EventBodies,
  EventKind,
  GenesisBody,
  GenesisEvent,
  HistoryEventOf,
  Invite,
  LogEntry,
  NoteBody,
  SignpostBody,
  StoredEvent,
  TileCoord,
  UnsignedEventOf,
  WitnessBody,
  WorldNow,
} from "@shared/history/types";
import { PHYSICS_VERSION } from "@shared/physics";
import type { NpcRole } from "@shared/world";
import { FRAME_LIMITS, type ToService } from "@shared/worldProtocol";

export interface ProbeKey {
  secret: Uint8Array;
  /** "k" + base32(public key). */
  key: string;
}

export function freshKey(): ProbeKey {
  const secret = newSecretKey();
  return { secret, key: authorKeyFor(secret) };
}

export const iso = (ms: number = Date.now()): string => new Date(ms).toISOString();

function randomTag(bytes = 8): string {
  return base32(crypto.getRandomValues(new Uint8Array(bytes)));
}

/** An event signed by `who`, having seen `seen` entries. `at` is display only (D2). */
export function sign<K extends EventKind>(
  world: string,
  kind: K,
  body: EventBodies[K],
  who: ProbeKey,
  seen: number,
): HistoryEventOf<K> {
  const unsigned = { v: 1, world, kind, author: who.key, at: iso(), seen, body };
  return signEvent(unsigned as UnsignedEventOf<K>, who.secret);
}

/** A genesis for a world that exists only for this run (its own cartridge hash and instance). */
export function genesisBody(name: string, overrides: Partial<GenesisBody> = {}): GenesisBody {
  const tag = randomTag();
  return {
    name,
    cartridge: {
      cartridgeId: "world-probe",
      version: "1.0.0",
      contentHash: contentHash(`world-probe:${tag}`) as ContentHash,
    },
    seed: `PROBE-${tag.toUpperCase()}`,
    language: "en",
    physicsVersion: PHYSICS_VERSION,
    createdAt: iso(),
    access: "friends",
    gates: [],
    from: { instanceId: `probe-${tag}` },
    ...overrides,
  };
}

export class LocalWorld {
  readonly genesis: GenesisEvent;
  readonly entries: LogEntry[] = [];
  now: WorldNow;
  private cursor: LogCursor;
  /** Local receipt times never go backwards, even if the wall clock does. */
  private lastRtMs: number;

  /** `rtFromMs`: receipt times start there (a clock ahead of the service's, for a refusal). */
  constructor(
    readonly owner: ProbeKey,
    body: GenesisBody,
    options: { rtFromMs?: number } = {},
  ) {
    this.lastRtMs = options.rtFromMs ?? 0;
    const unsigned = { v: 1, world: "", kind: "genesis", author: owner.key, at: body.createdAt };
    this.genesis = signEvent(
      { ...unsigned, seen: 0, body } as UnsignedEventOf<"genesis">,
      owner.secret,
    );
    this.cursor = logStart(this.genesis.id);
    this.now = emptyNow(this.genesis);
    this.append(this.genesis);
  }

  get id(): string {
    return this.genesis.id;
  }

  /** Sequences `event` on this device (receipt null), refusing any entry the fold would skip. */
  append(event: StoredEvent): LogEntry {
    this.lastRtMs = Math.max(this.lastRtMs, Date.now());
    const entry = sequenceEvent(this.cursor, event, iso(this.lastRtMs), null);
    const before = this.now.ignored.length;
    const next = applyEntry(this.now, entry, entryVerdict(event));
    const skipped = next.ignored[before];
    if (skipped !== undefined) {
      throw new Error(
        `probe setup: local entry ${entry.n} (${skipped.kind}) skipped: ${skipped.code}`,
      );
    }
    this.now = next;
    this.cursor = { n: entry.n, chain: entry.chain, rt: entry.rt };
    this.entries.push(entry);
    return entry;
  }

  write<K extends EventKind>(
    kind: K,
    body: EventBodies[K],
    who: ProbeKey = this.owner,
  ): HistoryEventOf<K> {
    const event = sign(this.id, kind, body, who, this.now.head.n);
    this.append(event);
    return event;
  }

  /** The owner's `sequencer` event naming `serviceKey`, as the last attach frame carries it. */
  sequencer(serviceKey: string, url: string): HistoryEventOf<"sequencer"> {
    return sign(this.id, "sequencer", { url, key: serviceKey }, this.owner, this.now.head.n);
  }
}

/** An attach upload of `entries` in frames of `per`, the last one carrying `sequencer`. */
export function attachFrames(
  world: string,
  entries: readonly LogEntry[],
  sequencer: StoredEvent,
  per: number = FRAME_LIMITS.attachEntries,
): ToService[] {
  const frames: ToService[] = [];
  for (let start = 0; start < Math.max(1, entries.length); start += per) {
    const last = start + per >= entries.length;
    const part = entries.slice(start, start + per);
    frames.push({ t: "attach", world, entries: part, last, ...(last ? { sequencer } : {}) });
  }
  return frames;
}

// ── Bodies ─────────────────────────────────────────────────────────────────────────────────

export interface Resident {
  id: string;
  name: string;
  role?: NpcRole;
}

/** A witness whose programs pass the DSL (`validateEventBody`) and whose index is theirs. */
export function witnessBody(
  cx: number,
  cz: number,
  name: string,
  residents: readonly Resident[],
): WitnessBody {
  const refs = residents.map((_, index) => `npc${index + 1}`);
  const scene = [
    `root = Scene("${name}", "meadow", [${["ground", ...refs].join(", ")}])`,
    `ground = Floor(12, 12, "grass")`,
    ...residents.map(
      (one, index) =>
        `${refs[index]} = NPC("${one.id}", "${one.name}", ${3 + index * 3}, 5, "${one.role ?? "farmer"}", "calm", "#8fa3b0")`,
    ),
  ].join("\n");
  const dialogues = Object.fromEntries(
    residents.map((one) => [
      one.id,
      `root = Dialogue("${one.id}", "Good day.", [c1])\nc1 = Choice("Nod", "leave", "They nod back.", [])`,
    ]),
  );
  const programs = { cx, cz, scene, dialogues };
  const index = witnessIndexOf(programs);
  if (!index.ok) throw new Error(`probe setup: witness ${name}: ${index.error.message}`);
  return { ...programs, lore: [], index: index.value };
}

const HERE: TileCoord = { cx: 1, cz: 1, x: 3, z: 3 };

export function noteBody(text: string, coord: TileCoord = HERE): NoteBody {
  return { coord, anchors: [], text, contests: null, name: "World probe" };
}

export function signpostBody(text: string, coord: TileCoord = HERE): SignpostBody {
  return { coord, text, toward: null };
}

// ── Invites (D8) ───────────────────────────────────────────────────────────────────────────

export interface Ticket {
  invite: Invite;
  /** The one-time invite secret: in a link it travels as `&k=`. */
  secret: Uint8Array;
}

/**
 * An invite to `world` signed by `signer`. `by` defaults to the signer; passing the owner's key
 * with another signer forges one (its signature cannot verify).
 */
export function makeInvite(
  world: string,
  signer: ProbeKey,
  options: { svc: string; exp: string; uses?: number; by?: string },
): Ticket {
  const secret = newSecretKey();
  const invite = signInvite(
    {
      v: 1,
      world,
      svc: options.svc,
      by: options.by ?? signer.key,
      key: authorKeyFor(secret),
      nonce: randomTag(16),
      exp: options.exp,
      uses: options.uses ?? 1,
    },
    signer.secret,
  );
  return { invite, secret };
}

/** The proof that `joiner` holds the ticket's secret (bound to the joiner's key). */
export function proofOf(ticket: Ticket, joiner: string): string {
  return signJoinProof(ticket.secret, ticket.invite, joiner);
}

export function joinEvent(
  world: string,
  join: { invite: Invite; proof: string },
  who: ProbeKey,
  name: string,
  seen: number,
): HistoryEventOf<"member.join"> {
  return sign(world, "member.join", { invite: join.invite, name, proof: join.proof }, who, seen);
}

// ── The probe's own key files ──────────────────────────────────────────────────────────────

const KEY_FILE_TAG = "unmapped-world-probe-key/1";

/** Writes a probe key file (0600); never overwrites an existing file. */
export function writeKeyFile(path: string, key: ProbeKey): void {
  mkdirSync(dirname(path), { recursive: true });
  const record = { probe: KEY_FILE_TAG, key: key.key, secret: base64Url(key.secret) };
  writeFileSync(path, `${JSON.stringify(record)}\n`, { mode: 0o600, flag: "wx" });
}

/** Reads a key file this probe wrote; anything else (a device key, a wallet) is refused. */
export function readKeyFile(path: string): ProbeKey {
  let record: { probe?: unknown; key?: unknown; secret?: unknown };
  try {
    record = JSON.parse(readFileSync(path, "utf8")) as typeof record;
  } catch {
    throw new Error(`${path} is not a key file this probe wrote.`);
  }
  if (record.probe !== KEY_FILE_TAG || typeof record.secret !== "string") {
    throw new Error(`${path} is not a key file this probe wrote; it reads only its own.`);
  }
  const secret = fromBase64Url(record.secret);
  if (secret === null || secret.length !== 32 || authorKeyFor(secret) !== record.key) {
    throw new Error(`${path} is damaged: its secret does not give its key.`);
  }
  return { secret, key: record.key };
}

/** The probe key in `path`, or a fresh one written there. */
export function keyFileOrFresh(path: string): { key: ProbeKey; created: boolean } {
  if (existsSync(path)) return { key: readKeyFile(path), created: false };
  const key = freshKey();
  writeKeyFile(path, key);
  return { key, created: true };
}
