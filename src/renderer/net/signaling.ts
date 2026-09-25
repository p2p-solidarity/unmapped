// Signaling servers: where two machines find each other before their worlds connect directly.
// The list is a per-device preference (localStorage, Rule 2); the default is used when it is unset.
// `probeSignaling` is the System panel's "test connection": two WebSockets to one server, one
// passing a message to the other the way y-webrtc does, so "reachable" means it can really be used.

import { err, ok, type Result } from "@shared/result";
import { randomFromAlphabet } from "./codes";

/**
 * Both are public servers, and both were intermittent from this machine on 2026-09-26 (two clients
 * relaying a publish, and Electron's own WebSocket): each answered in 0.2–0.6 s at times, took
 * 5–16 s at others, and at times gave no handshake within 20–40 s — not always at the same time.
 * y-webrtc connects to every server listed and two machines meet through any one they share, so
 * two lower the odds that nobody can meet; a build that only knows y-webrtc-eu (y-webrtc's own
 * default) still meets this one there. For a dependable meeting place, run y-webrtc's signaling
 * server yourself and enter it in Settings → Signaling servers.
 */
export const DEFAULT_SIGNALING: readonly string[] = [
  "wss://y-webrtc-eu.fly.dev",
  "wss://y-webrtc.fly.dev",
];

/**
 * A per-device list of signaling servers (comma separated ws:/wss: URLs) that replaces the default:
 * a self-hosted one, or y-webrtc's bundled server on this machine for a two-process test.
 */
export const SIGNALING_KEY = "unwritten.signaling";

/** How long a continent waits for any signaling server before it says none answered. */
export const SIGNALING_WAIT_MS = 20_000;

/** A signaling handshake still pending after this is closed so y-webrtc tries again at once. */
export const SIGNALING_RETRY_MS = 12_000;

/** How long one "test connection" waits for the server to open, and then to relay. */
export const PROBE_TIMEOUT_MS = 15_000;

/** A ws:// or wss:// address with a host — the only thing a signaling server can be. */
export function isSignalingUrl(text: string): boolean {
  if (!/^wss?:\/\/\S+$/i.test(text)) return false;
  try {
    const url = new URL(text);
    return (url.protocol === "ws:" || url.protocol === "wss:") && url.hostname.length > 0;
  } catch {
    return false;
  }
}

/** Splits what the player typed (commas, spaces or lines) into servers and entries that are not. */
export function parseSignalingList(text: string): { urls: string[]; invalid: string[] } {
  const urls: string[] = [];
  const invalid: string[] = [];
  for (const entry of text.split(/[\s,]+/)) {
    if (entry.length === 0) continue;
    if (!isSignalingUrl(entry)) invalid.push(entry);
    else if (!urls.includes(entry)) urls.push(entry);
  }
  return { urls, invalid };
}

/** This device's own list, or null when it uses the default. */
export function ownSignaling(): string[] | null {
  try {
    const { urls } = parseSignalingList(localStorage.getItem(SIGNALING_KEY) ?? "");
    return urls.length > 0 ? urls : null;
  } catch {
    // Storage can be disabled; the default servers still work.
    return null;
  }
}

/** The signaling servers this device uses: its own list when set, else the default. */
export function signalingServers(): string[] {
  return ownSignaling() ?? [...DEFAULT_SIGNALING];
}

export function isDefaultSignaling(urls: readonly string[]): boolean {
  return (
    urls.length === DEFAULT_SIGNALING.length &&
    urls.every((url, index) => url === DEFAULT_SIGNALING[index])
  );
}

/** Keeps `urls` as this device's list; null (or the default itself) goes back to the default. */
export function setOwnSignaling(urls: readonly string[] | null): Result<void> {
  try {
    if (urls === null || urls.length === 0 || isDefaultSignaling(urls)) {
      localStorage.removeItem(SIGNALING_KEY);
    } else {
      localStorage.setItem(SIGNALING_KEY, urls.join(","));
    }
    return ok(undefined);
  } catch (cause) {
    const reason = cause instanceof Error ? cause.message : String(cause);
    return err(
      "signaling-not-saved",
      `This device's signaling servers could not be saved: ${reason}`,
      "Storage may be disabled for this app; the servers in use did not change.",
    );
  }
}

export interface SignalingProbe {
  url: string;
  /** From opening the WebSocket until the server accepted it. */
  handshakeMs: number;
  /** From one client publishing until the server delivered it to the other. */
  relayMs: number;
}

const seconds = (ms: number): number => Math.round(ms / 1000);

function parsed(event: MessageEvent): { type?: unknown; topic?: unknown } | null {
  if (typeof event.data !== "string") return null;
  try {
    const message: unknown = JSON.parse(event.data);
    return typeof message === "object" ? (message as { type?: unknown; topic?: unknown }) : null;
  } catch {
    return null;
  }
}

/**
 * The same test as two players meeting: two WebSockets to `url`; one subscribes to a random topic
 * and pings (a y-webrtc server answers `pong` after the subscribe took effect), then the other
 * publishes to that topic, exactly as y-webrtc announces itself. Only a server that delivers the
 * publish to the first one can introduce two players; a plain echo server sends our own subscribe
 * back and fails.
 */
export function probeSignaling(
  url: string,
  timeoutMs: number = PROBE_TIMEOUT_MS,
): Promise<Result<SignalingProbe>> {
  if (!isSignalingUrl(url)) {
    return Promise.resolve(
      err(
        "signaling-bad-url",
        `"${url}" is not a ws:// or wss:// address.`,
        "A signaling server looks like wss://example.com.",
      ),
    );
  }
  return new Promise((resolve) => {
    const started = performance.now();
    const topic = `unwritten-probe:${randomFromAlphabet(12)}`;
    const sockets: WebSocket[] = [];
    let handshakeMs: number | null = null;
    let opened = 0;
    let published: number | null = null;
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const finish = (result: Result<SignalingProbe>): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      for (const socket of sockets) {
        socket.onopen = null;
        socket.onmessage = null;
        socket.onclose = null;
        socket.onerror = null;
        if (socket.readyState === WebSocket.CONNECTING || socket.readyState === WebSocket.OPEN) {
          socket.close();
        }
      }
      resolve(result);
    };
    const noRelay = (why: string): Result<never> =>
      err(
        "signaling-no-relay",
        `${url} accepted the connection but ${why}.`,
        "It may not be a y-webrtc signaling server. Use one that runs y-webrtc's signaling server.",
      );
    timer = setTimeout(() => {
      finish(
        err(
          "signaling-timeout",
          `${url} did not answer within ${seconds(timeoutMs)} s.`,
          "The server may be down, asleep or blocked on this network. Test it again, or use another server.",
        ),
      );
    }, timeoutMs);

    for (let index = 0; index < 2; index += 1) {
      try {
        sockets.push(new WebSocket(url));
      } catch (cause) {
        const reason = cause instanceof Error ? cause.message : String(cause);
        finish(err("signaling-bad-url", `"${url}" could not be opened: ${reason}`));
        return;
      }
    }
    const [listener, sender] = sockets as [WebSocket, WebSocket];

    const onOpen = (): void => {
      opened += 1;
      handshakeMs ??= Math.round(performance.now() - started);
      if (opened < 2) return;
      clearTimeout(timer);
      timer = setTimeout(() => {
        finish(noRelay(`did not pass a test message on within ${seconds(timeoutMs)} s`));
      }, timeoutMs);
      listener.send(JSON.stringify({ type: "subscribe", topics: [topic] }));
      listener.send(JSON.stringify({ type: "ping" }));
    };
    listener.onopen = onOpen;
    sender.onopen = onOpen;
    listener.onmessage = (event: MessageEvent) => {
      const message = parsed(event);
      if (message === null) return;
      if (message.type === "subscribe" || message.type === "ping") {
        finish(noRelay("sent our own message back instead of relaying it"));
      } else if (message.type === "pong" && published === null) {
        published = performance.now();
        sender.send(JSON.stringify({ type: "publish", topic, data: { type: "probe" } }));
      } else if (message.type === "publish" && message.topic === topic && published !== null) {
        const relayMs = Math.round(performance.now() - published);
        finish(ok({ url, handshakeMs: handshakeMs ?? 0, relayMs }));
      }
    };
    // A browser never says why a WebSocket failed; the close code that follows is all there is.
    const onClose = (event: CloseEvent): void => {
      const code = `code ${event.code}${event.reason ? `, ${event.reason}` : ""}`;
      if (handshakeMs !== null) {
        finish(noRelay(`closed it before relaying (${code})`));
        return;
      }
      finish(
        err(
          "signaling-closed",
          `${url} could not be reached (${code}).`,
          "Check the address and this network; the server may be down.",
        ),
      );
    };
    listener.onclose = onClose;
    sender.onclose = onClose;
  });
}
