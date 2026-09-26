// The page's sockets to world services (rev 6 phase 4, D7, over P3 D9): the browser's own
// WebSocket, one per service URL, shared by every world synced there, open while something wants
// it and reconnecting with backoff from 1 to 30 s (at once when the browser says it is online
// again; dropped when it says it is offline, since a phone's socket can linger half-open). The same protocol as main's hub (main/histories/sync.ts): the service greets with a
// challenge; a URL pinned at join must answer with that key (`service-key-changed`, not retried);
// the WebCrypto device key signs the nonce. Every frame is read with `readFromService` — the
// service is untrusted — and one that does not read is dropped and reported.

import { type AppError, err, ok, type Result } from "@shared/result";
import {
  type FromService,
  frameText,
  readFromService,
  type ToService,
} from "@shared/worldProtocol";
import { type BrowserSigner, wsAuthWith } from "./signer";

const BACKOFF_MIN_MS = 1_000;
const BACKOFF_MAX_MS = 30_000;
const AUTH_TIMEOUT_MS = 10_000;

export type SocketState = "idle" | "connecting" | "ready" | "stopped";

export interface SocketEvents {
  ready(url: string, serviceKey: string): void;
  frame(url: string, frame: FromService): void;
  down(url: string, error: AppError, fatal: boolean): void;
}

export interface SocketDeps {
  signer(): Promise<Result<BrowserSigner>>;
  pinnedKey(url: string): string | null;
}

export function socketUrl(serviceUrl: string): string {
  return `${serviceUrl.replace(/\/+$/, "")}/v1/ws`;
}

const OFFLINE_HINT = "It reconnects by itself; what you write waits on this device.";
const OFFLINE = err("world-offline", "The world's service is not connected.", OFFLINE_HINT);

class Socket {
  state: SocketState = "idle";
  serviceKey: string | null = null;
  private ws: WebSocket | null = null;
  private attempts = 0;
  private retry: ReturnType<typeof setTimeout> | null = null;
  private authTimer: ReturnType<typeof setTimeout> | null = null;
  wanted = false;

  constructor(
    readonly url: string,
    private readonly deps: SocketDeps,
    private readonly events: SocketEvents,
    private readonly onFrame: (frame: FromService) => void,
  ) {}

  start(): void {
    this.wanted = true;
    if (this.state === "idle") this.connect();
  }

  /** Connect again now (the browser came back online), skipping the backoff wait. */
  kick(): void {
    if (this.wanted && this.state === "idle") this.connect();
  }

  /** The browser went offline: a socket may linger half-open, so drop it and wait for online. */
  drop(): void {
    if (this.ws === null) return;
    this.fail({ code: "world-offline", message: "This browser is offline.", hint: OFFLINE_HINT });
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
    if (this.state !== "ready" || this.ws === null) return OFFLINE;
    const text = frameText(message);
    if (!text.ok) return text;
    try {
      this.ws.send(text.value);
      return ok(undefined);
    } catch (error) {
      return err("world-offline", (error as Error).message, OFFLINE_HINT);
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
    let ws: WebSocket;
    try {
      ws = new WebSocket(socketUrl(this.url));
    } catch (error) {
      this.fail({ code: "service-unreachable", message: (error as Error).message }, false);
      return;
    }
    this.ws = ws;
    this.authTimer = setTimeout(() => {
      this.fail({ code: "service-auth-timeout", message: "The service did not greet in time." });
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
      if (this.ws === ws) {
        this.fail({ code: "service-closed", message: "The service closed the connection." });
      }
    };
    ws.onerror = () => {
      if (this.ws === ws) {
        this.fail({ code: "service-unreachable", message: `Cannot reach ${this.url}.` });
      }
    };
  }

  private async answer(ws: WebSocket, challenge: Extract<FromService, { t: "challenge" }>) {
    const pinned = this.deps.pinnedKey(this.url);
    if (pinned !== null && pinned !== challenge.key) {
      this.fail(
        {
          code: "service-key-changed",
          message: "The world's service answered with a different key than when this joined.",
          hint: "It may be another server at the same address. Ask the world's owner where it moved.",
        },
        true,
      );
      return;
    }
    const signer = await this.deps.signer();
    if (!signer.ok) {
      this.fail(signer.error, true);
      return;
    }
    const sig = await wsAuthWith(signer.value, challenge.nonce, challenge.key);
    if (this.ws !== ws) return;
    const sent = frameText({ t: "auth", key: signer.value.author, sig });
    if (!sent.ok) return;
    ws.send(sent.value);
    this.serviceKey = challenge.key;
    this.clearTimers();
    this.state = "ready";
    this.attempts = 0;
    this.events.ready(this.url, challenge.key);
  }

  private fail(error: AppError, fatal = false): void {
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
      if (this.wanted && this.state === "idle") this.connect();
    }, delay);
  }
}

interface Waiter {
  match: (frame: FromService) => boolean;
  resolve: (frame: FromService | null) => void;
  timer: ReturnType<typeof setTimeout>;
}

/** Every service socket by URL, with reference-counted wants and frame waiters. */
export class SocketHub {
  private readonly sockets = new Map<string, Socket>();
  private readonly wants = new Map<string, Set<string>>();
  private readonly waiters = new Map<string, Waiter[]>();

  constructor(
    private readonly deps: SocketDeps,
    private readonly events: SocketEvents,
  ) {
    globalThis.addEventListener?.("online", () => {
      for (const socket of this.sockets.values()) socket.kick();
    });
    globalThis.addEventListener?.("offline", () => {
      for (const socket of this.sockets.values()) socket.drop();
    });
  }

  private socket(url: string): Socket {
    let socket = this.sockets.get(url);
    if (socket === undefined) {
      socket = new Socket(url, this.deps, this.events, (frame) => this.dispatch(url, frame));
      this.sockets.set(url, socket);
    }
    return socket;
  }

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

  send(url: string, message: ToService): Result<void> {
    return this.sockets.get(url)?.send(message) ?? OFFLINE;
  }

  waitFor(url: string, match: (frame: FromService) => boolean, ms: number) {
    return new Promise<FromService | null>((resolve) => {
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
      this.waiters.set(url, [...(this.waiters.get(url) ?? []), waiter]);
    });
  }

  /** Resolves once `url` is authenticated (true), stopped, or `ms` pass (false). */
  async ready(url: string, ms: number): Promise<boolean> {
    const deadline = Date.now() + ms;
    while (Date.now() < deadline) {
      const state = this.state(url);
      if (state === "ready") return true;
      if (state === "stopped") return false;
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
}
