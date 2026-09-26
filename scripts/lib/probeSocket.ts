// scripts/world-probe.ts's connection to a running world service (rev 6 phase 3, D9, D10): one
// WebSocket per key, the challenge-and-auth handshake, and every frame the service sends read with
// `readFromService` — the service is untrusted here too, so a frame that does not read is kept and
// reported, never acted on. Each world the socket opens is folded as main folds it (entries in
// order, verdicts from `entryVerdict`), so a scenario can read slots, heads and the service clock
// from what the service actually served.
//
// Every wait turns the service's answer to one frame into the text a step compares: "accepted"
// (the event came back in an `entries` frame), "opened:<role>", "claimed:<status>", or the code of
// the `rejected` / `refused` frame. Silence is "timeout"; a socket the service closed without a
// word is "close:<code>".

import { entryVerdict } from "@dsl/history/verdict";
import { applyEntry, emptyNow, openGenesis } from "@shared/history/fold";
import { signWsAuth } from "@shared/history/sign";
import type { GenesisEvent, Invite, LogEntry, StoredEvent, WorldNow } from "@shared/history/types";
import { PHYSICS_SUPPORTED } from "@shared/physics";
import {
  type ClaimTarget,
  type FromService,
  type OpenedRole,
  readFromService,
  type ToService,
  WORLD_PROTOCOL,
} from "@shared/worldProtocol";
import { attachFrames, type LocalWorld, type ProbeKey } from "./probeWorld";

export const WAIT_MS = 5_000;

export interface Endpoint {
  /** ws(s)://host:port/v1/ws */
  socket: string;
  /** http(s)://host:port */
  http: string;
  /** ws(s)://host:port — what sequencer events and invites name. */
  url: string;
}

export function endpointOf(service: string): Endpoint {
  let url: URL;
  try {
    url = new URL(service);
  } catch {
    throw new Error(`--service ${service} is not a URL (use ws://127.0.0.1:8787).`);
  }
  if (url.protocol !== "ws:" && url.protocol !== "wss:") {
    throw new Error(`--service must be ws:// or wss://, not ${service}.`);
  }
  const http = url.protocol === "wss:" ? "https:" : "http:";
  return {
    socket: `${url.protocol}//${url.host}/v1/ws`,
    http: `${http}//${url.host}`,
    url: `${url.protocol}//${url.host}`,
  };
}

/** A world as this socket was served it. */
export interface Mirror {
  genesis: GenesisEvent;
  now: WorldNow;
  entries: LogEntry[];
  role: OpenedRole;
  /** An entries frame skipped an n: the mirror stopped folding there. */
  gap: boolean;
}

export interface OpenOptions {
  have?: number;
  chain?: string | null;
  protocol?: number;
  physics?: number[];
  join?: { invite: Invite; proof: string };
}

type Picker<T> = (frame: FromService) => T | undefined;

/** Every socket a scenario opened, so it can report unreadable frames and close them all. */
export const opened: ProbeSocket[] = [];

export class ProbeSocket {
  readonly frames: FromService[] = [];
  /** Frames the service sent that `readFromService` refused (should stay empty). */
  readonly unreadable: string[] = [];
  readonly mirrors = new Map<string, Mirror>();
  closed: { code: number; reason: string } | null = null;
  private readonly wakers = new Set<() => void>();

  private constructor(
    private readonly ws: WebSocket,
    readonly endpoint: Endpoint,
    readonly me: ProbeKey,
  ) {
    ws.onmessage = (message: MessageEvent) => this.receive(message.data);
    ws.onclose = (event: { code: number; reason: string }) => {
      this.closed = { code: event.code, reason: event.reason };
      this.wake();
    };
    ws.onerror = () => undefined;
    opened.push(this);
  }

  /** Connects as `me` and answers the challenge (unless `auth` is false). */
  static async connect(endpoint: Endpoint, me: ProbeKey, auth = true): Promise<ProbeSocket> {
    const socket = new ProbeSocket(new WebSocket(endpoint.socket), endpoint, me);
    const challenge = await socket.until(
      (frame) => (frame.t === "challenge" ? frame : undefined),
      0,
    );
    if (challenge === null) {
      throw new Error(`${endpoint.socket} sent no challenge (${socket.silence()}).`);
    }
    if (auth) socket.auth();
    return socket;
  }

  get key(): string {
    return this.me.key;
  }

  get challenge(): Extract<FromService, { t: "challenge" }> {
    const first = this.frames.find((frame) => frame.t === "challenge");
    if (first?.t !== "challenge") throw new Error("no challenge yet");
    return first;
  }

  /** The service's receipt key, from its challenge. */
  get serviceKey(): string {
    return this.challenge.key;
  }

  auth(secret: Uint8Array = this.me.secret, nonce: string = this.challenge.nonce): void {
    const sig = signWsAuth(secret, nonce, this.serviceKey);
    this.send({ t: "auth", key: this.me.key, sig });
  }

  send(message: ToService): void {
    this.sendRaw(JSON.stringify(message));
  }

  sendRaw(data: string | Uint8Array): void {
    if (this.closed === null) this.ws.send(data);
  }

  mark(): number {
    return this.frames.length;
  }

  // ── Frames in ─────────────────────────────────────────────────────────────────────────────

  private receive(data: unknown): void {
    if (typeof data !== "string") {
      this.unreadable.push("a binary frame");
    } else {
      const read = readFromService(data);
      if (read.ok) {
        this.fold(read.value);
        this.frames.push(read.value);
      } else {
        this.unreadable.push(`${read.error.code}: ${read.error.message}`.slice(0, 300));
      }
    }
    this.wake();
  }

  private fold(frame: FromService): void {
    if (frame.t === "opened") {
      const genesis = openGenesis(frame.genesis);
      if (!genesis.ok) {
        this.unreadable.push(`opened ${frame.world}: genesis ${genesis.error.code}`);
        return;
      }
      const now = emptyNow(genesis.value);
      this.mirrors.set(frame.world, {
        genesis: genesis.value,
        now,
        entries: [],
        role: frame.role,
        gap: false,
      });
      return;
    }
    if (frame.t !== "entries") return;
    const mirror = this.mirrors.get(frame.world);
    if (mirror === undefined || mirror.gap) return;
    for (const entry of frame.entries) {
      if (entry.n <= mirror.now.head.n) continue;
      if (entry.n !== mirror.now.head.n + 1) {
        mirror.gap = true;
        return;
      }
      mirror.now = applyEntry(mirror.now, entry, entryVerdict(entry.event));
      mirror.entries.push(entry);
    }
  }

  private wake(): void {
    for (const waker of [...this.wakers]) waker();
  }

  /**
   * The first frame from index `from` on that `pick` answers for, or null on timeout or when the
   * socket closes first.
   */
  until<T>(pick: Picker<T>, from: number, ms: number = WAIT_MS): Promise<T | null> {
    return new Promise((resolve) => {
      let index = from;
      let timer: ReturnType<typeof setTimeout> | null = null;
      const done = (value: T | null): void => {
        if (timer !== null) clearTimeout(timer);
        this.wakers.delete(check);
        resolve(value);
      };
      const check = (): void => {
        while (index < this.frames.length) {
          const frame = this.frames[index];
          index += 1;
          const got = frame === undefined ? undefined : pick(frame);
          if (got !== undefined) {
            done(got);
            return;
          }
        }
        if (this.closed !== null) done(null);
      };
      timer = setTimeout(() => done(null), ms);
      this.wakers.add(check);
      check();
    });
  }

  /** What silence means now: the socket was closed, or nothing came. */
  silence(): string {
    return this.closed === null ? "timeout" : `close:${this.closed.code}`;
  }

  async untilClosed(ms: number = WAIT_MS): Promise<{ code: number; reason: string } | null> {
    await this.until(() => undefined, this.frames.length, ms);
    return this.closed;
  }

  async close(): Promise<void> {
    if (this.closed !== null) return;
    this.ws.close();
    await this.untilClosed();
  }

  // ── Worlds ────────────────────────────────────────────────────────────────────────────────

  mirror(world: string): Mirror {
    const mirror = this.mirrors.get(world);
    if (mirror === undefined) throw new Error(`world ${world} is not open on this socket`);
    return mirror;
  }

  head(world: string): number {
    return this.mirrors.get(world)?.now.head.n ?? 0;
  }

  /** The service's receipt clock as of the last entry it served for `world` (ms). */
  lastRt(world: string): number {
    const last = this.mirror(world).entries.at(-1);
    if (last === undefined) throw new Error(`world ${world} has no entries yet`);
    return Date.parse(last.rt);
  }

  /** Waits until the mirror of `world` holds entry `n`. */
  async reach(world: string, n: number, ms: number = WAIT_MS): Promise<boolean> {
    if (this.head(world) >= n) return true;
    const got = await this.until(
      () => (this.head(world) >= n ? true : undefined),
      this.frames.length,
      ms,
    );
    return got === true;
  }

  /** `refused` for this world (or the connection) → its code; `opened` → "opened:<role>". */
  private answerTo(world: string): Picker<string> {
    return (frame) => {
      if (frame.t === "opened" && frame.world === world) return `opened:${frame.role}`;
      if (frame.t === "refused" && (frame.world === world || frame.world === "")) {
        return frame.error.code;
      }
      return undefined;
    };
  }

  async open(world: string, options: OpenOptions = {}): Promise<string> {
    const from = this.mark();
    this.send({
      t: "open",
      world,
      have: options.have ?? 0,
      chain: options.chain ?? null,
      protocol: options.protocol ?? WORLD_PROTOCOL,
      physics: options.physics ?? [...PHYSICS_SUPPORTED],
      ...(options.join === undefined ? {} : { join: options.join }),
    });
    return (await this.until(this.answerTo(world), from)) ?? this.silence();
  }

  /** Uploads a local world with its sequencer naming this service; "opened:owner" on success. */
  async attach(local: LocalWorld, sequencer?: StoredEvent): Promise<string> {
    const seq = sequencer ?? local.sequencer(this.serviceKey, this.endpoint.url);
    return this.upload(local.id, local.entries, seq);
  }

  /** Uploads `entries` as world `world` (a forged upload passes its own); the service's answer. */
  async upload(
    world: string,
    entries: readonly LogEntry[],
    sequencer: StoredEvent,
  ): Promise<string> {
    const from = this.mark();
    for (const frame of attachFrames(world, entries, sequencer)) this.send(frame);
    const answer = (await this.until(this.answerTo(world), from)) ?? this.silence();
    if (answer.startsWith("opened:")) await this.reach(world, entries.length + 1);
    return answer;
  }

  /** Submits `events` in one frame; per event "accepted" or its refusal code. */
  async submit(world: string, events: readonly StoredEvent[]): Promise<string[]> {
    const from = this.mark();
    this.send({ t: "submit", world, events: [...events] });
    const answers = await Promise.all(
      events.map((event) =>
        this.until((frame) => {
          if (frame.t === "rejected" && frame.world === world && frame.id === event.id) {
            return frame.error.code;
          }
          if (frame.t === "entries" && frame.world === world) {
            return frame.entries.some((entry) => entry.event.id === event.id)
              ? "accepted"
              : undefined;
          }
          if (frame.t === "refused" && (frame.world === world || frame.world === "")) {
            return frame.error.code;
          }
          return undefined;
        }, from),
      ),
    );
    return answers.map((answer) => answer ?? this.silence());
  }

  async submitOne(world: string, event: StoredEvent): Promise<string> {
    const [answer] = await this.submit(world, [event]);
    return answer ?? "timeout";
  }

  /** A claim's answer: the refusal code when refused, else "claimed:<status>". */
  async claim(world: string, target: ClaimTarget): Promise<string> {
    const from = this.mark();
    this.send({ t: "claim", world, target });
    const status = await this.until(
      (frame) =>
        frame.t === "claimed" && frame.world === world && frame.target === target
          ? frame.status
          : undefined,
      from,
    );
    if (status === null) return this.silence();
    if (status !== "refused") return `claimed:${status}`;
    const refusal = this.frames
      .slice(from)
      .find((frame) => frame.t === "refused" && frame.world === world);
    return refusal?.t === "refused" ? refusal.error.code : "claimed:refused";
  }

  /**
   * Sends something the service must treat as a protocol violation: the answer is the code of
   * its `refused` frame when the socket is then closed, else what happened instead.
   */
  async violation(send: () => void): Promise<string> {
    const from = this.mark();
    send();
    const code = await this.until(
      (frame) => (frame.t === "refused" && frame.world === "" ? frame.error.code : undefined),
      from,
    );
    const closed = await this.untilClosed();
    if (closed === null) return `${code ?? "nothing"}+left-open`;
    return code ?? `close:${closed.code}`;
  }
}

/** Closes every socket still open; returns how many frames the service sent that did not read. */
export async function closeAll(): Promise<{ unreadable: string[] }> {
  const unreadable = opened.flatMap((socket) => socket.unreadable);
  await Promise.all(opened.map((socket) => socket.close()));
  opened.length = 0;
  return { unreadable };
}

// ── HTTP ─────────────────────────────────────────────────────────────────────────────────────

export async function httpJson(
  endpoint: Endpoint,
  path: string,
  init?: RequestInit,
): Promise<{ status: number; body: unknown }> {
  const response = await fetch(`${endpoint.http}${path}`, init);
  const text = await response.text();
  let body: unknown = text;
  try {
    body = JSON.parse(text);
  } catch {
    // not JSON: keep the text
  }
  return { status: response.status, body };
}

/** GET /v1/health: the service's key, protocol and the physics it reproduces. */
export async function health(
  endpoint: Endpoint,
): Promise<{ key: string; protocol: number; physics: number[]; test: boolean }> {
  const { status, body } = await httpJson(endpoint, "/v1/health");
  const read = body as { key?: unknown; protocol?: unknown; physics?: unknown; test?: unknown };
  if (status !== 200 || typeof read.key !== "string" || !Array.isArray(read.physics)) {
    throw new Error(`${endpoint.http}/v1/health answered ${status}; is it a world service?`);
  }
  return {
    key: read.key,
    protocol: Number(read.protocol),
    physics: read.physics.map(Number),
    test: read.test === true,
  };
}

/** POST /v1/test/advance {days} (UNMAPPED_SERVICE_TEST=1 only): "ok" or the refusal code. */
export async function advance(
  endpoint: Endpoint,
  days: number,
): Promise<{ answer: string; beats: { world: string; n: number | null; skipped?: string }[] }> {
  const { status, body } = await httpJson(endpoint, "/v1/test/advance", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ days }),
  });
  const read = body as { error?: { code?: unknown }; beats?: unknown };
  if (status !== 200) {
    return { answer: String(read.error?.code ?? `http-${status}`), beats: [] };
  }
  const beats = Array.isArray(read.beats)
    ? (read.beats as { world: string; n: number | null }[])
    : [];
  return { answer: "ok", beats };
}
