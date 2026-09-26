// Main's sockets to world services (rev 6 phase 3, D9, D11): one WebSocket per service URL (Node's
// built-in `WebSocket`), shared by every world attached there. A socket is open while something
// wants it (an attached world open in Play, an attach, a join, a library refresh) and reconnects
// with backoff from 1 to 30 s while it is wanted.
//
// Auth: the service speaks first (`challenge`: nonce, its key, version). A URL whose key was pinned
// at attach or join must answer with that key, or the socket is dropped (`service-key-changed`)
// and not retried: a different key is a different service, whatever its URL says. Otherwise the
// device signs the nonce for that key and sends `auth`.
//
// Every frame from the service is read with `readFromService` (the service is untrusted, like any
// peer); a frame that does not read is dropped and reported, never acted on. Waiters (a claim's
// answer, a join's entries) see frames first; every frame then goes to the host.

import { type AppError, err, ok, type Result } from "@shared/result";
import {
  FRAME_LIMITS,
  type FromService,
  frameText,
  readFromService,
  serviceSpeaksChat,
  type ToService,
} from "@shared/worldProtocol";
import type { DeviceKey } from "../identity/deviceKey";

export const BACKOFF_MIN_MS = 1_000;
export const BACKOFF_MAX_MS = 30_000;
/** How long a socket waits for the challenge and to send its auth (the service allows 10 s). */
const AUTH_TIMEOUT_MS = 10_000;

export type SocketState = "idle" | "connecting" | "ready" | "stopped";

export interface SocketEvents {
  /** Authenticated: frames may be sent. `serviceKey` is the key the service proved. */
  ready(url: string, serviceKey: string): void;
  frame(url: string, frame: FromService): void;
  /** Closed, failed or refused; it reconnects by itself unless `fatal`. */
  down(url: string, error: AppError, fatal: boolean): void;
}

export interface SocketDeps {
  key(): Promise<Result<DeviceKey>>;
  /** The key this URL must answer with (pinned at attach or join); null: any, learned now. */
  pinnedKey(url: string): string | null;
  WebSocketImpl?: typeof WebSocket;
}

/** `<service url>/v1/ws`. */
export function socketUrl(serviceUrl: string): string {
  return `${serviceUrl.replace(/\/+$/, "")}/v1/ws`;
}

interface Waiter {
  match: (frame: FromService) => boolean;
  resolve: (frame: FromService | null) => void;
  timer: ReturnType<typeof setTimeout>;
}

class ServiceSocket {
  state: SocketState = "idle";
  serviceKey: string | null = null;
  /** The service's own `version` from its challenge (`unmapped-service/<n>`). */
  serviceVersion: string | null = null;
  private ws: WebSocket | null = null;
  private attempts = 0;
  private retry: ReturnType<typeof setTimeout> | null = null;
  private authTimer: ReturnType<typeof setTimeout> | null = null;
  private wanted = false;

  constructor(
    readonly url: string,
    private readonly deps: SocketDeps,
    private readonly events: SocketEvents,
    private readonly onFrame: (frame: FromService) => void,
  ) {}

  start(): void {
    this.wanted = true;
    if (this.state === "idle" || this.state === "stopped") this.connect();
  }

  stop(): void {
    this.wanted = false;
    this.clearTimers();
    this.state = "idle";
    const ws = this.ws;
    this.ws = null;
    ws?.close();
  }

  send(message: ToService): Result<void> {
    if (this.state !== "ready" || this.ws === null) {
      return err(
        "claim-offline",
        "The world's service is not connected.",
        "It reconnects by itself.",
      );
    }
    const text = frameText(message);
    if (!text.ok) return text;
    try {
      this.ws.send(text.value);
      return ok(undefined);
    } catch (error) {
      return err("claim-offline", (error as Error).message);
    }
  }

  private clearTimers(): void {
    if (this.retry !== null) clearTimeout(this.retry);
    if (this.authTimer !== null) clearTimeout(this.authTimer);
    this.retry = null;
    this.authTimer = null;
  }

  private connect(): void {
    this.clearTimers();
    this.state = "connecting";
    const Impl = this.deps.WebSocketImpl ?? globalThis.WebSocket;
    let ws: WebSocket;
    try {
      ws = new Impl(socketUrl(this.url));
    } catch (error) {
      this.fail({ code: "service-unreachable", message: (error as Error).message }, false);
      return;
    }
    this.ws = ws;
    this.authTimer = setTimeout(() => {
      this.fail(
        { code: "service-auth-timeout", message: "The service did not greet in time." },
        false,
      );
    }, AUTH_TIMEOUT_MS);
    ws.onmessage = (message) => {
      if (this.ws !== ws || typeof message.data !== "string") return;
      const frame = readFromService(message.data);
      if (!frame.ok) {
        this.events.down(this.url, frame.error, false);
        return;
      }
      if (frame.value.t === "challenge") void this.answer(ws, frame.value);
      else this.onFrame(frame.value);
    };
    ws.onclose = () => {
      if (this.ws === ws)
        this.fail({ code: "service-closed", message: "The service closed the connection." }, false);
    };
    ws.onerror = () => {
      if (this.ws === ws)
        this.fail({ code: "service-unreachable", message: `Cannot reach ${this.url}.` }, false);
    };
  }

  private async answer(
    ws: WebSocket,
    challenge: Extract<FromService, { t: "challenge" }>,
  ): Promise<void> {
    const pinned = this.deps.pinnedKey(this.url);
    if (pinned !== null && pinned !== challenge.key) {
      this.fail(
        {
          code: "service-key-changed",
          message:
            "The world's service answered with a different key than the one it was attached with.",
          hint: "It may be another server at the same address. Ask the world's owner which service it moved to.",
        },
        true,
      );
      return;
    }
    const key = await this.deps.key();
    if (!key.ok) {
      this.fail(key.error, true);
      return;
    }
    if (this.ws !== ws) return;
    this.serviceKey = challenge.key;
    this.serviceVersion = challenge.version;
    const sent = frameText({
      t: "auth",
      key: key.value.author,
      sig: key.value.signWsAuth(challenge.nonce, challenge.key),
    });
    if (!sent.ok) return;
    ws.send(sent.value);
    this.clearTimers();
    this.state = "ready";
    this.attempts = 0;
    this.events.ready(this.url, challenge.key);
  }

  private fail(error: AppError, fatal: boolean): void {
    this.clearTimers();
    const ws = this.ws;
    this.ws = null;
    try {
      ws?.close();
    } catch {
      // already closing
    }
    this.state = fatal ? "stopped" : "idle";
    this.events.down(this.url, error, fatal);
    if (fatal || !this.wanted) return;
    const delay = Math.min(BACKOFF_MAX_MS, BACKOFF_MIN_MS * 2 ** this.attempts);
    this.attempts += 1;
    this.retry = setTimeout(() => {
      if (this.wanted) this.connect();
    }, delay);
  }
}

/** Every service socket, by URL, with reference-counted wants and frame waiters. */
export class SyncHub {
  private readonly sockets = new Map<string, ServiceSocket>();
  private readonly wants = new Map<string, Set<string>>();
  private readonly waiters = new Map<string, Waiter[]>();

  constructor(
    private readonly deps: SocketDeps,
    private readonly events: SocketEvents,
  ) {}

  private socket(url: string): ServiceSocket {
    let socket = this.sockets.get(url);
    if (socket === undefined) {
      socket = new ServiceSocket(url, this.deps, this.events, (frame) => this.dispatch(url, frame));
      this.sockets.set(url, socket);
    }
    return socket;
  }

  /** `token` (a world id, or "attach:…" / "join:…") wants `url` open. */
  want(url: string, token: string): void {
    const tokens = this.wants.get(url) ?? new Set<string>();
    tokens.add(token);
    this.wants.set(url, tokens);
    this.socket(url).start();
  }

  unwant(url: string, token: string): void {
    const tokens = this.wants.get(url);
    tokens?.delete(token);
    if (tokens === undefined || tokens.size === 0) {
      this.wants.delete(url);
      this.sockets.get(url)?.stop();
    }
  }

  state(url: string): SocketState {
    return this.sockets.get(url)?.state ?? "idle";
  }

  serviceKey(url: string): string | null {
    return this.sockets.get(url)?.serviceKey ?? null;
  }

  /** Whether the service at `url` relays chat (its challenge said so); an older one never gets a frame. */
  speaksChat(url: string): boolean {
    const version = this.sockets.get(url)?.serviceVersion;
    return version != null && serviceSpeaksChat(version);
  }

  send(url: string, message: ToService): Result<void> {
    const socket = this.sockets.get(url);
    return socket === undefined
      ? err("claim-offline", "The world's service is not connected.")
      : socket.send(message);
  }

  /** The next frame from `url` that `match`es, or null after `ms`. */
  waitFor(
    url: string,
    match: (frame: FromService) => boolean,
    ms: number,
  ): Promise<FromService | null> {
    return new Promise((resolve) => {
      const list = this.waiters.get(url) ?? [];
      const waiter: Waiter = {
        match,
        resolve,
        timer: setTimeout(() => {
          this.waiters.set(
            url,
            (this.waiters.get(url) ?? []).filter((one) => one !== waiter),
          );
          resolve(null);
        }, ms),
      };
      list.push(waiter);
      this.waiters.set(url, list);
    });
  }

  /** Resolves once `url` is authenticated (true) or `ms` pass (false). */
  async ready(url: string, ms: number): Promise<boolean> {
    const deadline = Date.now() + ms;
    while (Date.now() < deadline) {
      if (this.state(url) === "ready") return true;
      if (this.state(url) === "stopped") return false;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    return this.state(url) === "ready";
  }

  private dispatch(url: string, frame: FromService): void {
    const list = this.waiters.get(url) ?? [];
    const hit = list.filter((waiter) => waiter.match(frame));
    if (hit.length > 0) {
      this.waiters.set(
        url,
        list.filter((waiter) => !hit.includes(waiter)),
      );
      for (const waiter of hit) {
        clearTimeout(waiter.timer);
        waiter.resolve(frame);
      }
    }
    this.events.frame(url, frame);
  }

  closeAll(): void {
    for (const socket of this.sockets.values()) socket.stop();
    this.sockets.clear();
    this.wants.clear();
  }
}

/** Splits `items` into frames of at most `max` items whose text stays under the frame cap. */
export function framesOf<T>(
  items: readonly T[],
  max: number,
  build: (chunk: T[]) => ToService,
): Result<ToService[]> {
  const frames: ToService[] = [];
  let chunk: T[] = [];
  for (const item of items) {
    const tryChunk = [...chunk, item];
    if (tryChunk.length <= max && frameText(build(tryChunk)).ok) {
      chunk = tryChunk;
      continue;
    }
    if (chunk.length === 0) return err("frame-too-large", "One entry is larger than a frame.");
    frames.push(build(chunk));
    chunk = [item];
    if (!frameText(build(chunk)).ok)
      return err("frame-too-large", "One entry is larger than a frame.");
  }
  if (chunk.length > 0) frames.push(build(chunk));
  return ok(frames);
}

export const SUBMIT_BATCH = FRAME_LIMITS.submitEvents;
