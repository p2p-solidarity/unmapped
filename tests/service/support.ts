// Test-only support for the world-service tests (tests/service/*.test.ts): a Hub over a throwaway
// data directory with a hand-driven clock, in-memory peers that insist every frame the service
// sends parses with `readFromService`, and a tiny local world (owner device, null receipts) to
// attach. Dates are from 2026-10-01 on. Not a test file itself.

import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { applyEntry, emptyNow } from "@shared/history/fold";
import { base32, DAY_MS, sha256Bytes } from "@shared/history/ids";
import { type LogCursor, logStart, sequenceEvent } from "@shared/history/log";
import {
  authorKeyFor,
  signatureVerdict,
  signEvent,
  signInvite,
  signJoinProof,
  signWsAuth,
} from "@shared/history/sign";
import type {
  EventBodies,
  EventKind,
  GenesisBody,
  GenesisEvent,
  HistoryEventOf,
  Invite,
  LogEntry,
  StoredEvent,
  UnsignedEventOf,
  WitnessBody,
  WorldNow,
} from "@shared/history/types";
import {
  type FromService,
  readFromService,
  type ToService,
  WORLD_PROTOCOL,
} from "@shared/worldProtocol";
import type { Clock } from "../../src/service/clock";
import { DEFAULT_LIMITS, type ServiceLimits } from "../../src/service/config";
import { Hub, type Peer, type Session } from "../../src/service/hub";
import { loadServiceKey } from "../../src/service/keyFile";
import { FileStore } from "../../src/service/store";

export const T0 = Date.parse("2026-10-01T00:00:00.000Z");
export const iso = (ms: number) => new Date(ms).toISOString();
export const at = (days: number, minutes = 0) => iso(T0 + days * DAY_MS + minutes * 60_000);

export const secretOf = (name: string) => sha256Bytes(`world-service-test:${name}`);
export const OWNER = secretOf("owner");
export const ANN = secretOf("ann");
export const BEN = secretOf("ben");
export const VIC = secretOf("vic");
export const keyOf = authorKeyFor;

export class FakeClock implements Clock {
  ms = T0 + 10 * DAY_MS;
  realMs = 1_000_000;
  now(): number {
    return this.ms;
  }
  real(): number {
    return this.realMs;
  }
  tick(realMs: number): void {
    this.realMs += realMs;
  }
}

export interface TestService {
  hub: Hub;
  clock: FakeClock;
  dir: string;
  store: FileStore;
}

export function tempDir(): string {
  return mkdtempSync(join(tmpdir(), "unmapped-service-"));
}

/** A hub over `dir` (fresh by default), loaded as main.ts loads it; verdicts are signature-only. */
export function makeService(
  options: { dir?: string; limits?: Partial<ServiceLimits>; clock?: FakeClock } = {},
): TestService {
  const dir = options.dir ?? tempDir();
  const store = new FileStore(dir);
  store.ensure();
  const loaded = loadServiceKey(dir);
  if (!loaded.ok) throw new Error(loaded.error.message);
  const clock = options.clock ?? new FakeClock();
  const hub = new Hub({
    store,
    key: loaded.value.key,
    limits: { ...DEFAULT_LIMITS, ...options.limits },
    clock,
    verdict: signatureVerdict,
    beatEveryMs: 6 * 60 * 60 * 1000,
    log: () => {},
  });
  hub.load();
  return { hub, clock, dir, store };
}

/** A socket that records what the service sends, refusing any frame a client could not read. */
export class TestPeer implements Peer {
  readonly frames: FromService[] = [];
  closed: { code: number; reason: string } | null = null;
  constructor(readonly ip: string) {}
  send(text: string): void {
    const read = readFromService(text);
    if (!read.ok) throw new Error(`unreadable service frame: ${read.error.message}`);
    this.frames.push(read.value);
  }
  close(code: number, reason: string): void {
    this.closed = { code, reason };
  }
}

type Of<T extends FromService["t"]> = Extract<FromService, { t: T }>;

export class Client {
  readonly peer: TestPeer;
  readonly session: Session;
  readonly key: string;

  constructor(
    readonly hub: Hub,
    readonly secret: Uint8Array,
    ip = "10.0.0.1",
    auth = true,
  ) {
    this.peer = new TestPeer(ip);
    const session = hub.connect(this.peer);
    if (!("peer" in session)) throw new Error(session.message);
    this.session = session;
    this.key = keyOf(secret);
    if (auth) this.auth();
  }

  get challenge(): Of<"challenge"> {
    const first = this.peer.frames[0];
    if (first?.t !== "challenge") throw new Error("no challenge");
    return first;
  }

  auth(secret = this.secret, nonce = this.challenge.nonce, service = this.challenge.key): void {
    this.send({ t: "auth", key: keyOf(secret), sig: signWsAuth(secret, nonce, service) });
  }

  send(message: ToService | string | Uint8Array): void {
    const data =
      typeof message === "object" && !(message instanceof Uint8Array)
        ? JSON.stringify(message)
        : message;
    this.hub.message(this.session, data);
  }

  open(world: string, have = 0, chain: string | null = null, extra: Partial<ToService> = {}): void {
    this.send({
      t: "open",
      world,
      have,
      chain,
      protocol: WORLD_PROTOCOL,
      physics: [1],
      ...extra,
    } as ToService);
  }

  submit(world: string, ...events: StoredEvent[]): void {
    this.send({ t: "submit", world, events });
  }

  /** Frames of type `t` received so far. */
  all<T extends FromService["t"]>(t: T): Of<T>[] {
    return this.peer.frames.filter((frame): frame is Of<T> => frame.t === t);
  }

  last<T extends FromService["t"]>(t: T): Of<T> | undefined {
    return this.all(t).at(-1);
  }

  /** Every entry received for `world`, in arrival order. */
  entries(world: string): LogEntry[] {
    return this.all("entries")
      .filter((frame) => frame.world === world)
      .flatMap((frame) => frame.entries);
  }

  codes(): string[] {
    return this.peer.frames.flatMap((frame) =>
      frame.t === "refused" || frame.t === "rejected" ? [frame.error.code] : [],
    );
  }

  clear(): void {
    this.peer.frames.length = 0;
  }
}

export const GENESIS: GenesisBody = {
  name: "Salt Orchard",
  cartridge: {
    cartridgeId: "salt-orchard",
    version: "1.0.0",
    contentHash: `sha256:${"ab".repeat(32)}`,
  },
  seed: "SALT-0RCH",
  language: "en",
  physicsVersion: 1,
  createdAt: at(0),
  access: "friends",
  gates: [{ id: "e1", cx: 5, cz: 0 }],
  from: { instanceId: "salt-orchard-1" },
};

export function sign<K extends EventKind>(
  world: string,
  kind: K,
  body: EventBodies[K],
  who: Uint8Array,
  seen: number,
): HistoryEventOf<K> {
  const unsigned = { v: 1, world, kind, author: keyOf(who), at: at(0), seen, body };
  return signEvent(unsigned as UnsignedEventOf<K>, who);
}

export function witnessBody(cx: number, cz: number, name: string): WitnessBody {
  return {
    cx,
    cz,
    scene: `Scene("${name}")`,
    dialogues: { ada: `Dialogue("ada")` },
    lore: [],
    index: {
      name,
      npcs: [{ id: "ada", name: `${name} Ada`, role: "farmer" }],
      errands: [],
      keepsakes: [],
    },
  };
}

export const noteBody = (text = "was here") => ({
  coord: { cx: 2, cz: 2, x: 4, z: 5 },
  anchors: [],
  text,
  contests: null,
  name: "Someone",
});

/** A world on its owner's device before any service: entries with null receipts. */
export class LocalWorld {
  readonly genesis: GenesisEvent;
  readonly entries: LogEntry[] = [];
  now: WorldNow;
  private cursor: LogCursor;
  private nonce = 0;

  constructor(body: Partial<GenesisBody> = {}, owner = OWNER) {
    this.genesis = signEvent(
      {
        v: 1,
        world: "",
        kind: "genesis",
        author: keyOf(owner),
        at: at(0),
        seen: 0,
        body: { ...GENESIS, ...body },
      },
      owner,
    );
    this.cursor = logStart(this.genesis.id);
    this.now = emptyNow(this.genesis);
    this.append(this.genesis, at(0));
  }

  get id(): string {
    return this.genesis.id;
  }

  append(event: StoredEvent, rt: string): LogEntry {
    const entry = sequenceEvent(this.cursor, event, rt, null);
    this.cursor = { n: entry.n, chain: entry.chain, rt: entry.rt };
    this.entries.push(entry);
    this.now = applyEntry(this.now, entry, signatureVerdict(event));
    return entry;
  }

  write<K extends EventKind>(kind: K, body: EventBodies[K], who: Uint8Array, rt: string) {
    const event = sign(this.id, kind, body, who, this.now.head.n);
    this.append(event, rt);
    return event;
  }

  /** The owner's sequencer event naming `serviceKey`, as the last attach frame carries it. */
  sequencer(serviceKey: string, owner = OWNER) {
    const body = { url: "ws://127.0.0.1:8787", key: serviceKey };
    return sign(this.id, "sequencer", body, owner, this.now.head.n);
  }

  invite(options: { uses?: number; exp?: string } = {}): { invite: Invite; secret: Uint8Array } {
    this.nonce += 1;
    const secret = secretOf(`invite:${this.id}:${this.nonce}`);
    const invite = signInvite(
      {
        v: 1,
        world: this.id,
        svc: "ws://127.0.0.1:8787",
        by: this.genesis.author,
        key: keyOf(secret),
        nonce: base32(sha256Bytes(`nonce:${this.id}:${this.nonce}`)).slice(0, 20),
        exp: options.exp ?? at(60),
        uses: options.uses ?? 1,
      },
      OWNER,
    );
    return { invite, secret };
  }
}

/** Uploads `world` over `client` in frames of `per` entries; the last carries the sequencer. */
export function attach(client: Client, world: LocalWorld, per = 64, sequencer?: StoredEvent): void {
  const seq = sequencer ?? world.sequencer(client.hub.key.key);
  for (let start = 0; start < world.entries.length; start += per) {
    const entries = world.entries.slice(start, start + per);
    const last = start + per >= world.entries.length;
    client.send({
      t: "attach",
      world: world.id,
      entries,
      last,
      ...(last ? { sequencer: seq } : {}),
    });
  }
}

/** The member.join `who` signs with `ticket`, as an invitee submits it. */
export function joinEvent(
  world: string,
  ticket: { invite: Invite; secret: Uint8Array },
  who: Uint8Array,
  name: string,
  seen: number,
) {
  const proof = signJoinProof(ticket.secret, ticket.invite, keyOf(who));
  return sign(world, "member.join", { invite: ticket.invite, name, proof }, who, seen);
}

/** The service's head n for `world`. */
export function headOf(hub: Hub, world: string): number {
  return hub.worlds.get(world)?.head.n ?? 0;
}
