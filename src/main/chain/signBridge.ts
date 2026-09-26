// "Sign in your browser": Electron in development cannot reach Touch ID for WebAuthn (that needs
// `app.configureWebAuthn` and a keychain-access-groups entitlement in a signed build), so a market
// action's one signature can be made in the system browser instead. Main serves a page on
// http://localhost:<port> (127.0.0.1 only; rp id `localhost`), opens it, and waits: the page links a
// passkey (its public key) or signs the digest main already holds for a prepared batch, then posts
// the raw assertion back. The challenge always comes from main's own pending batch, never from the
// page or the renderer; requests are keyed by 128-bit random ids and must come from this origin.
// UNWRITTEN_SIGN_BROWSER=none skips opening a browser and only logs the URL (for E2E runs).

import { randomBytes } from "node:crypto";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { MarketKey, MarketReceipt, WireAuth } from "@shared/market";
import { type PasskeyAssertion, recoverPasskeyKey, toWebAuthnAuth } from "@shared/passkeyAuth";
import { err, ok, type Result } from "@shared/result";
import { shell } from "electron";
import { hexToBytes } from "viem";
import { pendingChallenge, submitAction } from "./marketRelay";
import { SIGN_PAGE } from "./signBridgePage";

const WAIT_MS = 5 * 60_000;
const PREFERRED_PORT = Number(process.env.UNWRITTEN_SIGN_PORT ?? 47821);

export interface LinkedPasskey {
  credentialId: string;
  key: MarketKey;
}

interface LinkSession {
  kind: "link";
  resolve(result: Result<LinkedPasskey>): void;
}
interface SignSession {
  kind: "sign";
  preparedId: string;
  credentialId: string;
  summary: string;
  state: "waiting" | "sending" | "done" | "failed";
  txHash?: string;
  error?: string;
  resolve(result: Result<WireAuth>): void;
}
type Session = (LinkSession | SignSession) & { created: number };

const sessions = new Map<string, Session>();
let server: Server | null = null;
let origin = "";

function start(): Promise<string> {
  if (server !== null) return Promise.resolve(origin);
  return new Promise((resolve, reject) => {
    const s = createServer((req, res) => void route(req, res));
    const listen = (port: number) =>
      s.listen(port, "127.0.0.1", () => {
        const address = s.address();
        const actual = typeof address === "object" && address !== null ? address.port : port;
        origin = `http://localhost:${actual}`;
        server = s;
        s.unref();
        resolve(origin);
      });
    s.once("error", (error: NodeJS.ErrnoException) => {
      if (error.code === "EADDRINUSE" && s.listening === false) {
        s.removeAllListeners("error");
        s.once("error", reject);
        listen(0);
      } else reject(error);
    });
    listen(PREFERRED_PORT);
  });
}

function send(res: ServerResponse, status: number, body: unknown, type = "application/json"): void {
  res.writeHead(status, {
    "content-type": type,
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
  });
  res.end(typeof body === "string" ? body : JSON.stringify(body));
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  let raw = "";
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 64_000) throw new Error("request too large");
  }
  return JSON.parse(raw);
}

const b64u = (value: unknown): Uint8Array => {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]{1,8000}$/.test(value)) {
    throw new Error("not base64url");
  }
  return new Uint8Array(Buffer.from(value, "base64url"));
};
const assertionFrom = (body: Record<string, unknown>): PasskeyAssertion => ({
  authenticatorData: b64u(body.authenticatorData),
  clientDataJSON: b64u(body.clientDataJSON),
  signature: b64u(body.signature),
});

function live(id: string | undefined): Session | null {
  const session = id === undefined ? undefined : sessions.get(id);
  if (session === undefined || Date.now() - session.created > WAIT_MS) return null;
  return session;
}

async function route(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const [, area, kind, id] = (req.url ?? "").split("?")[0]?.split("/") ?? [];
  if (req.method === "GET" && (area === "sign" || area === "link")) {
    return send(res, 200, SIGN_PAGE, "text/html; charset=utf-8");
  }
  if (area !== "api") return send(res, 404, { error: "not found" });
  const session = live(id);
  if (req.method === "GET" && kind === "request") {
    if (session === null) return send(res, 404, { error: "expired" });
    if (session.kind === "link") return send(res, 200, { kind: "link" });
    return send(res, 200, {
      kind: "sign",
      summary: session.summary,
      credentialId: session.credentialId,
      challenge: pendingChallenge(session.preparedId),
    });
  }
  if (req.method === "GET" && kind === "status") {
    if (session === null || session.kind !== "sign") return send(res, 404, { error: "expired" });
    return send(res, 200, { state: session.state, txHash: session.txHash, error: session.error });
  }
  if (req.method !== "POST") return send(res, 405, { error: "method" });
  if (req.headers.origin !== origin) return send(res, 403, { ok: false, error: "Wrong origin." });
  if (session === null || id === undefined) {
    return send(res, 404, { ok: false, error: "This request has expired." });
  }
  try {
    const body = (await readJson(req)) as Record<string, unknown>;
    if (kind === "link" && session.kind === "link") {
      const linked = await link(body);
      if (!linked.ok) return send(res, 400, { ok: false, error: linked.error.message });
      sessions.delete(id);
      session.resolve(linked);
      return send(res, 200, { ok: true });
    }
    if (kind === "sign" && session.kind === "sign") {
      const challenge = pendingChallenge(session.preparedId);
      if (challenge === null)
        return send(res, 410, { ok: false, error: "This request has expired." });
      const auth = toWebAuthnAuth(assertionFrom(body), hexToBytes(challenge));
      if (!auth.ok) return send(res, 400, { ok: false, error: auth.error.message });
      session.state = "sending";
      session.resolve(
        ok({
          ...auth.value,
          challengeIndex: Number(auth.value.challengeIndex),
          typeIndex: Number(auth.value.typeIndex),
        }),
      );
      return send(res, 200, { ok: true });
    }
    return send(res, 400, { ok: false, error: "Unexpected request." });
  } catch (cause) {
    return send(res, 400, {
      ok: false,
      error: cause instanceof Error ? cause.message : "Bad request.",
    });
  }
}

async function link(body: Record<string, unknown>): Promise<Result<LinkedPasskey>> {
  const hex32 = /^0x[0-9a-f]{64}$/;
  if (
    typeof body.credentialId === "string" &&
    hex32.test(String(body.qx)) &&
    hex32.test(String(body.qy))
  ) {
    b64u(body.credentialId);
    return ok({
      credentialId: body.credentialId,
      key: { qx: body.qx as `0x${string}`, qy: body.qy as `0x${string}` },
    });
  }
  const assertions = body.assertions;
  if (!Array.isArray(assertions) || assertions.length !== 2) {
    return err("passkey-link-invalid", "Expected a new passkey's key or two signatures.");
  }
  const [first, second] = assertions as Record<string, unknown>[];
  if (first === undefined || second === undefined || first.credentialId !== second.credentialId) {
    return err("passkey-key-unrecoverable", "Both signatures must come from the same passkey.");
  }
  const key = await recoverPasskeyKey(assertionFrom(first), assertionFrom(second));
  if (!key.ok) return key;
  b64u(first.credentialId);
  return ok({ credentialId: first.credentialId as string, key: key.value });
}

async function open(path: string): Promise<void> {
  const url = `${await start()}${path}`;
  if (process.env.UNWRITTEN_SIGN_BROWSER === "none") {
    console.log(`[market] sign page: ${url}`);
    return;
  }
  await shell.openExternal(url);
}

function wait<T>(id: string, fallback: string): Promise<Result<T>> {
  return new Promise((resolve) => {
    setTimeout(() => {
      if (sessions.has(id)) {
        sessions.delete(id);
        resolve(err("market-sign-timeout", fallback, "Start the action again in the app."));
      }
    }, WAIT_MS).unref();
  });
}

/** Opens the browser to create or choose the passkey that owns the player's market account. */
export async function linkInBrowser(): Promise<Result<LinkedPasskey>> {
  const id = randomBytes(16).toString("hex");
  const result = new Promise<Result<LinkedPasskey>>((resolve) => {
    sessions.set(id, { kind: "link", created: Date.now(), resolve });
  });
  await open(`/link/${id}`);
  return Promise.race([result, wait<LinkedPasskey>(id, "No passkey was linked in the browser.")]);
}

/** Opens the browser to sign a prepared batch, then relays it; resolves with the transaction. */
export async function signInBrowser(input: {
  preparedId: string;
  credentialId: string;
  summary: string;
}): Promise<Result<MarketReceipt>> {
  if (pendingChallenge(input.preparedId) === null) {
    return err("market-expired", "That signature request has expired.", "Start the action again.");
  }
  const id = randomBytes(16).toString("hex");
  const signed = new Promise<Result<WireAuth>>((resolve) => {
    sessions.set(id, { kind: "sign", ...input, state: "waiting", created: Date.now(), resolve });
  });
  await open(`/sign/${id}`);
  const auth = await Promise.race([
    signed,
    wait<WireAuth>(id, "The action was not signed in the browser."),
  ]);
  const tracked = sessions.get(id) as (SignSession & { created: number }) | undefined;
  if (!auth.ok) {
    if (tracked !== undefined)
      Object.assign(tracked, { state: "failed", error: auth.error.message });
    return auth;
  }
  const sent = await submitAction({ id: input.preparedId, auth: auth.value });
  if (tracked !== undefined) {
    Object.assign(
      tracked,
      sent.ok
        ? { state: "done", txHash: sent.value.txHashes.at(-1) }
        : { state: "failed", error: sent.error.message },
    );
    setTimeout(() => sessions.delete(id), 60_000).unref();
  }
  return sent;
}
