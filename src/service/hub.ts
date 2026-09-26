// The world service's core (rev 6 phase 3, D9): every socket is a Session, every frame goes through
// `message`, and every world the service holds is a ServiceWorld. Transport-free — main.ts feeds it
// Bun WebSocket frames, the tests feed it strings — so what E2E cannot reach can be tested alone.
//
// A connection: the service sends `challenge`; the client answers `auth` (its key signs the nonce and
// the service key) within the auth timeout; then `open` / `attach` / `submit` / `claim` / `release`
// / `stream` / `presence` / `close`. Only protocol violations close a socket (a frame that is too
// large, not JSON, not a known message, binary, a forged or missing auth); everything else is
// answered with `rejected` (one event) or `refused` (one frame), with a code and a hint.
//
// Reads follow the world's door (D8): the owners; members unless private; an invitee holding a valid
// invite and proof (to fetch the pack and submit its `member.join`); anyone in a public world. The
// door is re-checked for every reader whenever the log grows, so a removal or a door change
// unsubscribes at once. So is the protocol (phase 4, D5): a protocol-1 client never reads a world
// with co-owners or a chain opt-in (`protocolRefusal`).

import { roleOf } from "@shared/history/access";
import { verifyInvite } from "@shared/history/admit";
import { base32 } from "@shared/history/ids";
import { verifyWsAuth } from "@shared/history/sign";
import type { Invite } from "@shared/history/types";
import { type AppError, fail } from "@shared/result";
import {
  type FromService,
  frameText,
  type OpenedRole,
  type Presence,
  protocolRefusal,
  readToService,
  type ToService,
  WORLD_PROTOCOL,
} from "@shared/worldProtocol";
import type { Upload } from "./attach";
import { handleAttach } from "./attach";
import { handleChat, handleHear, stopHearing } from "./chat";
import {
  dropSessionLeases,
  expireLeases,
  handleClaim,
  handleRelease,
  handleStream,
  Leases,
  releaseWritten,
} from "./claims";
import { type Clock, isoAt, RateWindow } from "./clock";
import type { ServiceLimits } from "./config";
import { openQuota, readAccess } from "./door";
import type { ServiceKey } from "./keyFile";
import { isImported, refuseMirrorClaim } from "./mirror";
import type { FileStore } from "./store";
import { handleSubmit } from "./submit";
import { serviceVerdict, type VerdictFn } from "./verdict";
import { wireError } from "./wire";
import { type Draft, loadWorld, type ServiceWorld, SNAPSHOT_EVERY } from "./world";

export const SERVICE_VERSION = "unmapped-service/2";

/** One socket, as the transport sees it. */
export interface Peer {
  readonly ip: string;
  send(text: string): void;
  close(code: number, reason: string): void;
}

export interface Join {
  invite: Invite;
  proof: string;
}

export interface Subscription {
  role: OpenedRole;
  join: Join | null;
  /** The world protocol the client opened with (an attach: this service's own). */
  protocol: number;
}

export interface Session {
  readonly id: number;
  readonly peer: Peer;
  readonly nonce: string;
  readonly connectedAt: number;
  key: string | null;
  readonly worlds: Map<string, Subscription>;
  upload: Upload | null;
  readonly frames: RateWindow;
  readonly presence: RateWindow;
}

export interface HubOptions {
  store: FileStore;
  key: ServiceKey;
  limits: ServiceLimits;
  clock: Clock;
  verdict?: VerdictFn;
  beatEveryMs: number;
  log?: (line: string) => void;
}

export interface LoadReport {
  loaded: string[];
  broken: { world: string; error: AppError }[];
  strays: string[];
}

type Frame<T extends ToService["t"]> = Extract<ToService, { t: T }>;

const CLOSE_POLICY = 1008;
const CLOSE_TOO_BIG = 1009;

function randomText(bytes: number): string {
  return base32(crypto.getRandomValues(new Uint8Array(bytes)));
}

export class Hub {
  readonly store: FileStore;
  readonly key: ServiceKey;
  readonly limits: ServiceLimits;
  readonly clock: Clock;
  readonly verdict: VerdictFn;
  readonly beatEveryMs: number;
  readonly log: (line: string) => void;
  readonly worlds = new Map<string, ServiceWorld>();
  readonly broken = new Map<string, AppError>();
  readonly sessions = new Set<Session>();
  readonly leases = new Leases();
  /** Keys that have had an event sequenced on this service (a visitor key is new until then). */
  readonly knownWriters = new Set<string>();
  /** When each world's beat was last computed and found to change nothing. */
  readonly beatChecked = new Map<string, number>();
  private readonly subscribers = new Map<string, Set<Session>>();
  private readonly presences = new Map<string, Map<string, Presence>>();
  private readonly ipSockets = new Map<string, number>();
  private readonly ipNewKeys = new Map<string, { day: number; count: number }>();
  private nextId = 1;

  constructor(options: HubOptions) {
    this.store = options.store;
    this.key = options.key;
    this.limits = options.limits;
    this.clock = options.clock;
    this.verdict = options.verdict ?? serviceVerdict;
    this.beatEveryMs = options.beatEveryMs;
    this.log = options.log ?? ((line) => console.error(line));
  }

  // ── Worlds ────────────────────────────────────────────────────────────────────────────────

  /** Loads, re-verifies and folds every stored world. A world that fails is kept unserved. */
  load(): LoadReport {
    const report: LoadReport = { loaded: [], broken: [], strays: [] };
    const { ids, strays } = this.store.worldIds();
    report.strays = strays;
    for (const id of ids) {
      // A world imported from a `.world` may be a mirror: receipts under another service's key.
      const mirror = isImported(this.store, id);
      const outcome = loadWorld(this.store, id, this.key, this.verdict, { mirror });
      if (!outcome.ok) {
        this.broken.set(id, outcome.error);
        report.broken.push({ world: id, error: outcome.error });
        continue;
      }
      const { world, torn, badBlobLines } = outcome.value;
      if (torn > 0) this.log(`world ${id}: set aside ${torn} torn bytes at the end of its log`);
      if (badBlobLines > 0)
        this.log(`world ${id}: ignored ${badBlobLines} malformed blobs.txt lines`);
      this.addWorld(world);
      report.loaded.push(id);
    }
    return report;
  }

  addWorld(world: ServiceWorld): void {
    this.worlds.set(world.id, world);
    for (const ref of Object.values(world.now.events)) {
      if (ref.author !== this.key.key) this.knownWriters.add(ref.author);
    }
  }

  ownedWorlds(key: string): number {
    let count = 0;
    for (const world of this.worlds.values()) if (world.owner === key) count += 1;
    return count;
  }

  snapshot(world: ServiceWorld): void {
    const written = this.store.writeSnapshot(world.id, world.snapshot());
    if (written.ok) world.snapshotN = world.head.n;
    else this.log(`world ${world.id}: ${written.error.message}`);
  }

  /** Snapshots every world whose head moved since its last snapshot (on shutdown). */
  shutdown(): void {
    for (const world of this.worlds.values()) {
      if (world.head.n > world.snapshotN) this.snapshot(world);
    }
  }

  // ── Sockets ───────────────────────────────────────────────────────────────────────────────

  /** Whether one more socket from `ip` fits (checked before the upgrade, and again on connect). */
  admitSocket(ip: string): AppError | null {
    return (this.ipSockets.get(ip) ?? 0) >= this.limits.socketsPerIp
      ? {
          code: "quota-sockets",
          message: `At most ${this.limits.socketsPerIp} connections per address.`,
          hint: "Close another window or device on this network and retry.",
        }
      : null;
  }

  connect(peer: Peer): Session | AppError {
    const refused = this.admitSocket(peer.ip);
    if (refused !== null) return refused;
    this.ipSockets.set(peer.ip, (this.ipSockets.get(peer.ip) ?? 0) + 1);
    const session: Session = {
      id: this.nextId,
      peer,
      nonce: randomText(20),
      connectedAt: this.clock.real(),
      key: null,
      worlds: new Map(),
      upload: null,
      frames: new RateWindow(),
      presence: new RateWindow(),
    };
    this.nextId += 1;
    this.sessions.add(session);
    this.send(session, {
      t: "challenge",
      nonce: session.nonce,
      key: this.key.key,
      version: SERVICE_VERSION,
    });
    return session;
  }

  disconnect(session: Session): void {
    if (!this.sessions.delete(session)) return;
    for (const world of [...session.worlds.keys()]) this.closeWorld(session, world);
    session.upload = null;
    const left = (this.ipSockets.get(session.peer.ip) ?? 1) - 1;
    if (left > 0) this.ipSockets.set(session.peer.ip, left);
    else this.ipSockets.delete(session.peer.ip);
  }

  /** Auth deadlines and lease expiry; main.ts runs it every second. */
  sweep(): void {
    const real = this.clock.real();
    for (const session of [...this.sessions]) {
      if (session.key === null && real - session.connectedAt > this.limits.authTimeoutMs) {
        this.violation(session, {
          code: "auth-timeout",
          message: "The connection did not authenticate in time.",
        });
      }
    }
    expireLeases(this);
  }

  message(session: Session, data: unknown): void {
    if (!this.sessions.has(session)) return;
    try {
      this.dispatch(session, data);
    } catch (error) {
      this.log(`session ${session.id}: ${error instanceof Error ? error.stack : String(error)}`);
      this.refuse(session, "", {
        code: "service-internal",
        message: "The service failed on that frame.",
        hint: "Retry; if it keeps failing, tell the service operator.",
      });
    }
  }

  private dispatch(session: Session, data: unknown): void {
    if (typeof data !== "string") {
      this.violation(session, { code: "frame-binary", message: "Frames are JSON text." });
      return;
    }
    if (!session.frames.hit(this.clock.real(), this.limits.framesPerSecond)) {
      if (session.frames.warnOnce()) {
        this.refuse(session, "", {
          code: "quota-frames",
          message: `At most ${this.limits.framesPerSecond} frames a second.`,
          hint: "Slow down; frames over the limit are dropped.",
        });
      }
      return;
    }
    const read = readToService(data);
    if (!read.ok) {
      const code = read.error.code === "frame-too-large" ? CLOSE_TOO_BIG : CLOSE_POLICY;
      this.violation(session, read.error, code);
      return;
    }
    const frame = read.value;
    if (session.key === null) {
      if (frame.t === "auth") this.auth(session, frame);
      else this.violation(session, { code: "auth-required", message: "Authenticate first." });
      return;
    }
    switch (frame.t) {
      case "auth":
        this.violation(session, { code: "auth-repeated", message: "Already authenticated." });
        return;
      case "open":
        this.open(session, frame);
        return;
      case "attach":
        handleAttach(this, session, frame);
        return;
      case "submit":
        handleSubmit(this, session, frame);
        return;
      case "claim":
        // A mirror writes nothing (phase 4, D5): no lease, so no model call is spent on it.
        if (!refuseMirrorClaim(this, session, frame)) handleClaim(this, session, frame);
        return;
      case "release":
        handleRelease(this, session, frame);
        return;
      case "stream":
        handleStream(this, session, frame);
        return;
      case "presence":
        this.presence(session, frame);
        return;
      case "hear":
        handleHear(this, session, frame);
        return;
      case "chat":
        handleChat(this, session, frame);
        return;
      case "close":
        this.closeWorld(session, frame.world);
        return;
    }
  }

  private auth(session: Session, frame: Frame<"auth">): void {
    if (!verifyWsAuth(frame.key, frame.sig, session.nonce, this.key.key)) {
      this.violation(session, {
        code: "auth-invalid",
        message: "The auth signature does not verify for this challenge.",
      });
      return;
    }
    session.key = frame.key;
  }

  // ── Frames out ────────────────────────────────────────────────────────────────────────────

  send(session: Session, message: FromService): void {
    const text = frameText(message);
    if (text.ok) this.sendText(session, text.value);
    else this.log(`session ${session.id}: dropped an oversized ${message.t} frame`);
  }

  sendText(session: Session, text: string): void {
    if (this.sessions.has(session)) session.peer.send(text);
  }

  refuse(session: Session, world: string, error: AppError): void {
    this.send(session, { t: "refused", world, error: wireError(error) });
  }

  /** A protocol violation: say why, close the socket, forget the session. */
  violation(session: Session, error: AppError, code = CLOSE_POLICY): void {
    this.refuse(session, "", error);
    session.peer.close(code, error.code);
    this.disconnect(session);
  }

  /** Sessions reading `world`. */
  readers(world: string): Session[] {
    return [...(this.subscribers.get(world) ?? [])];
  }

  relay(world: string, message: FromService, except: Session | null): void {
    const text = frameText(message);
    if (!text.ok) return;
    for (const session of this.readers(world)) {
      if (session !== except) this.sendText(session, text.value);
    }
  }

  /** The world `session` has open, or null after refusing `world-not-open`. */
  openedWorld(session: Session, id: string): ServiceWorld | null {
    const world = this.worlds.get(id);
    if (world !== undefined && session.worlds.has(id)) return world;
    this.refuse(session, id, {
      code: "world-not-open",
      message: "That world is not open on this connection.",
      hint: "Send open first.",
    });
    return null;
  }

  // ── The door ──────────────────────────────────────────────────────────────────────────────

  // The door itself (`readAccess`, `mayReadBlob`) and the open-worlds limit live in ./door.

  private open(session: Session, frame: Frame<"open">): void {
    const key = session.key ?? "";
    const world = this.worlds.get(frame.world);
    if (world === undefined) {
      this.refuse(
        session,
        frame.world,
        this.broken.get(frame.world) ?? {
          code: "world-unknown",
          message: "This service does not hold that world.",
          hint: "Attach it from the owner's device first, or check the invite's service.",
        },
      );
      return;
    }
    const protocol = protocolRefusal(world.now, frame.protocol);
    if (protocol !== null) {
      this.refuse(session, world.id, protocol);
      return;
    }
    const physics = world.genesis.body.physicsVersion;
    if (!frame.physics.includes(physics)) {
      this.refuse(session, world.id, {
        code: "physics-newer",
        message: `This world was made with physics ${physics}, which this build does not have.`,
        hint: "Update UNMAPPED to open it.",
      });
      return;
    }
    const quota = openQuota(this, session, world.id);
    if (quota !== null) {
      this.refuse(session, world.id, quota);
      return;
    }
    const join = frame.join ?? null;
    if (join !== null && roleOf(world.now, key) === "visitor") {
      const valid = verifyInvite(world.now, join.invite, join.proof, key, isoAt(this.clock.now()));
      if (!valid.ok) {
        this.refuse(session, world.id, valid.error);
        return;
      }
    }
    const access = readAccess(this, world, key, join);
    if (!access.ok) {
      this.refuse(session, world.id, access.error);
      return;
    }
    const expected = world.chainAt(frame.have);
    if (
      expected === null ||
      (frame.chain ?? world.id) !== expected ||
      (frame.have > 0 && frame.chain === null)
    ) {
      this.refuse(session, world.id, {
        code: "history-diverged",
        message: `Your copy of this world differs from the service's at entry ${frame.have}.`,
        hint: "Stop syncing this world and keep your copy; ask the owner which history is right.",
      });
      return;
    }
    const sub: Subscription = { role: access.value, join, protocol: frame.protocol };
    this.subscribe(session, world, sub, frame.have);
  }

  /** After an attach: the owner's connection reads the world from entry 1, receipts and all. */
  admitOwner(session: Session, world: ServiceWorld): void {
    const quota = openQuota(this, session, world.id);
    if (quota !== null) {
      this.refuse(session, world.id, quota);
      return;
    }
    this.subscribe(session, world, { role: "owner", join: null, protocol: WORLD_PROTOCOL }, 0);
  }

  /** Subscribes, then sends `opened`, every entry after `have`, and who else is here. */
  private subscribe(session: Session, world: ServiceWorld, sub: Subscription, have: number): void {
    session.worlds.set(world.id, sub);
    const readers = this.subscribers.get(world.id) ?? new Set<Session>();
    readers.add(session);
    this.subscribers.set(world.id, readers);
    const { genesis, head } = world;
    this.send(session, { t: "opened", world: world.id, role: sub.role, genesis, head });
    for (const text of world.entriesFrames(have)) this.sendText(session, text);
    for (const [from, p] of this.presences.get(world.id) ?? []) {
      if (from !== session.key) this.send(session, { t: "presence", world: world.id, from, p });
    }
  }

  closeWorld(session: Session, world: string): void {
    if (!session.worlds.delete(world)) return;
    stopHearing(session, world);
    this.subscribers.get(world)?.delete(session);
    dropSessionLeases(this, session, world);
    const key = session.key ?? "";
    const still = this.readers(world).some((other) => other.key === key);
    if (!still && this.presences.get(world)?.delete(key) === true) {
      this.relay(world, { t: "presence", world, from: key, p: null }, null);
    }
  }

  private presence(session: Session, frame: Frame<"presence">): void {
    if (!session.worlds.has(frame.world)) {
      this.openedWorld(session, frame.world);
      return;
    }
    if (!session.presence.hit(this.clock.real(), this.limits.presencePerSecond)) {
      if (session.presence.warnOnce()) {
        this.refuse(session, frame.world, {
          code: "quota-presence",
          message: `At most ${this.limits.presencePerSecond} presence updates a second.`,
          hint: "Updates over the limit are dropped.",
        });
      }
      return;
    }
    const key = session.key ?? "";
    const here = this.presences.get(frame.world) ?? new Map<string, Presence>();
    if (frame.p === null) here.delete(key);
    else here.set(key, frame.p);
    this.presences.set(frame.world, here);
    this.relay(frame.world, { t: "presence", world: frame.world, from: key, p: frame.p }, session);
  }

  // ── After a batch ─────────────────────────────────────────────────────────────────────────

  /** Pushes entries after `have` to every reader, dropping readers the door no longer lets in. */
  publish(world: ServiceWorld, have: number): void {
    const frames = world.entriesFrames(have);
    for (const session of this.readers(world.id)) {
      const sub = session.worlds.get(world.id);
      if (sub === undefined) continue;
      const newer = protocolRefusal(world.now, sub.protocol);
      const access =
        newer === null ? readAccess(this, world, session.key ?? "", sub.join) : fail(newer);
      if (!access.ok) {
        this.refuse(session, world.id, access.error);
        this.closeWorld(session, world.id);
        continue;
      }
      sub.role = access.value;
      for (const text of frames) this.sendText(session, text);
    }
  }

  /** What follows a committed batch: writers known, readers told, leases settled, snapshot. */
  afterCommit(world: ServiceWorld, draft: Draft): void {
    const first = draft.entries[0];
    if (first === undefined) return;
    for (const entry of draft.entries) {
      const author = entry.event.author;
      if (typeof author === "string" && author !== this.key.key) this.knownWriters.add(author);
    }
    this.publish(world, first.n - 1);
    releaseWritten(this, world);
    if (world.head.n - world.snapshotN >= SNAPSHOT_EVERY) this.snapshot(world);
  }

  // ── Visitor keys per address (D9) ─────────────────────────────────────────────────────────

  /** Whether `ip` may bring one more new visitor key today (receipt-clock day). */
  newVisitorKeyAllowed(ip: string, day: number): boolean {
    const seen = this.ipNewKeys.get(ip);
    return (seen?.day === day ? seen.count : 0) < this.limits.newVisitorKeysPerIp;
  }

  noteNewVisitorKey(ip: string, day: number): void {
    const seen = this.ipNewKeys.get(ip);
    const count = seen?.day === day ? seen.count : 0;
    this.ipNewKeys.set(ip, { day, count: count + 1 });
  }
}
