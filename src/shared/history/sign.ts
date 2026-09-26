// Ed25519 over a world's history (rev 6 phase 3, D2, D5 step 2, D7–D9), with @noble/curves:
// the same bytes synchronously in V8 and JavaScriptCore, and deterministic signatures (no RNG), so
// signing a migration twice gives byte-identical events. Every signed text starts with its own
// "unmapped-…:v1" line, so a signature made for one purpose never verifies for another.
//
// Verification uses strict RFC 8032 decoding (`zip215: false`): one signature per message and key.

import { ed25519 } from "@noble/curves/ed25519.js";
import { canonicalJson } from "../canonical";
import { err, ok, type Result } from "../result";
import {
  authorKeyOf,
  base64Url,
  fromBase64Url,
  hashId,
  publicKeyOf,
  SIGNATURE,
  sha256Hex,
  utf8,
} from "./ids";
import type {
  EntryVerdict,
  EventKind,
  HistoryEventOf,
  Invite,
  StoredEvent,
  UnsignedEventOf,
  UnsignedInvite,
} from "./types";

const EVENT_PREFIX = "unmapped-event:v1\n";
const RECEIPT_PREFIX = "unmapped-receipt:v1\n";
const INVITE_PREFIX = "unmapped-invite:v1\n";
const JOIN_PREFIX = "unmapped-join:v1\n";
const WS_PREFIX = "unmapped-ws:v1\n";
const BLOB_PREFIX = "unmapped-blob:v1\n";

/** What an event's author signs: the purpose line and the event id. */
export function eventSignedText(id: string): string {
  return `${EVENT_PREFIX}${id}`;
}

/** What a device signs to authenticate a WebSocket (D9 `auth`). */
export function wsAuthText(nonce: string, serviceKey: string): string {
  return `${WS_PREFIX}${nonce}\n${serviceKey}`;
}

/** What a device signs for a blob request (D9): method, path, time and the body's sha256. */
export function blobAuthText(method: string, path: string, ts: number, body: Uint8Array): string {
  return `${BLOB_PREFIX}${method.toUpperCase()}\n${path}\n${ts}\n${sha256Hex(body)}`;
}

/** How far a blob request's timestamp may be from the service clock (D9). */
export const BLOB_AUTH_SKEW_S = 300;

/** A fresh device key (32 random bytes). Main keeps it with safeStorage; it never leaves main. */
export function newSecretKey(): Uint8Array {
  return ed25519.utils.randomSecretKey();
}

/** "k" + base32(public key) of a secret key. */
export function authorKeyFor(secretKey: Uint8Array): string {
  return authorKeyOf(ed25519.getPublicKey(secretKey));
}

export function signText(secretKey: Uint8Array, text: string): string {
  return base64Url(ed25519.sign(utf8(text), secretKey));
}

/** Whether `sig` is `key`'s signature over `text`. Malformed keys or signatures are just false. */
export function verifyText(key: string, text: string, sig: string): boolean {
  if (!SIGNATURE.test(sig)) return false;
  const publicKey = publicKeyOf(key);
  const signature = fromBase64Url(sig);
  if (publicKey === null || signature === null || signature.length !== 64) return false;
  try {
    return ed25519.verify(signature, utf8(text), publicKey, { zip215: false });
  } catch {
    return false;
  }
}

/** "h" + base32(sha256(canonicalJson(event without id and sig))). */
export function eventIdOf(event: StoredEvent | Readonly<Record<string, unknown>>): string {
  const { id: _id, sig: _sig, ...rest } = event as Record<string, unknown>;
  return hashId(rest);
}

export function signEvent<K extends EventKind>(
  unsigned: UnsignedEventOf<K>,
  secretKey: Uint8Array,
): HistoryEventOf<K> {
  const id = eventIdOf(unsigned);
  return { ...unsigned, id, sig: signText(secretKey, eventSignedText(id)) } as HistoryEventOf<K>;
}

/** D5 step 2: the id is the hash of the content, and the author signed that id. */
export function verifyEvent(event: StoredEvent): Result<void> {
  if (eventIdOf(event) !== event.id) {
    return err("event-id-mismatch", "The event's id does not match its content.");
  }
  const author = typeof event.author === "string" ? event.author : "";
  const sig = typeof event.sig === "string" ? event.sig : "";
  if (!verifyText(author, eventSignedText(event.id), sig)) {
    return err("event-sig-invalid", "The event is not signed by its author.");
  }
  return ok(undefined);
}

/**
 * The shared part of an entry's verdict (D4): its id and signature. Main and the service add the
 * DSL check (`entryVerdict`, src/dsl) before handing verdicts to the fold.
 */
export function signatureVerdict(event: StoredEvent): EntryVerdict {
  const verified = verifyEvent(event);
  return verified.ok ? { ok: true } : { ok: false, code: verified.error.code };
}

/** The sequencer's receipt over chain(n), which already binds n, rt, the id and all history. */
export function signReceipt(secretKey: Uint8Array, chain: string): string {
  return signText(secretKey, `${RECEIPT_PREFIX}${chain}`);
}

export function verifyReceipt(key: string, chain: string, rsig: string): boolean {
  return verifyText(key, `${RECEIPT_PREFIX}${chain}`, rsig);
}

export function signInvite(unsigned: UnsignedInvite, secretKey: Uint8Array): Invite {
  return { ...unsigned, sig: signText(secretKey, `${INVITE_PREFIX}${canonicalJson(unsigned)}`) };
}

/** Whether `invite.by` signed exactly this invite (every other rule is `verifyInvite`). */
export function inviteSigned(invite: Invite): boolean {
  const { sig, ...unsigned } = invite;
  return verifyText(invite.by, `${INVITE_PREFIX}${canonicalJson(unsigned)}`, sig);
}

/**
 * D8: the joiner proves they hold the invite's one-time secret, bound to their own key — a logged
 * `member.join` copied by another key proves nothing.
 */
export function signJoinProof(
  inviteSecret: Uint8Array,
  invite: Pick<Invite, "world" | "nonce">,
  joiner: string,
): string {
  return signText(inviteSecret, `${JOIN_PREFIX}${invite.world}\n${invite.nonce}\n${joiner}`);
}

export function joinProofValid(invite: Invite, proof: string, joiner: string): boolean {
  return verifyText(invite.key, `${JOIN_PREFIX}${invite.world}\n${invite.nonce}\n${joiner}`, proof);
}

/** D9 `auth`: Ed25519 over "unmapped-ws:v1\n" + nonce + "\n" + service key. */
export function signWsAuth(secretKey: Uint8Array, nonce: string, serviceKey: string): string {
  return signText(secretKey, wsAuthText(nonce, serviceKey));
}

export function verifyWsAuth(key: string, sig: string, nonce: string, serviceKey: string): boolean {
  return verifyText(key, wsAuthText(nonce, serviceKey), sig);
}

/** `X-Unmapped-Auth: <key>.<ts>.<sig>` for a blob request; `ts` in whole seconds. */
export function blobAuthHeader(
  secretKey: Uint8Array,
  request: { method: string; path: string; ts: number; body: Uint8Array },
): string {
  const { method, path, ts, body } = request;
  return `${authorKeyFor(secretKey)}.${ts}.${signText(secretKey, blobAuthText(method, path, ts, body))}`;
}

/** The key that signed a blob request, if the header is valid and `nowS` is within ±300 s. */
export function readBlobAuth(
  header: string,
  request: { method: string; path: string; body: Uint8Array; nowS: number },
): Result<string> {
  const match = /^(k[a-z2-7]{52})\.(\d{1,12})\.([A-Za-z0-9_-]{86})$/.exec(header);
  if (match === null) return err("blob-auth-invalid", "The blob request is not signed.");
  const [, key = "", tsText = "", sig = ""] = match;
  const ts = Number(tsText);
  if (Math.abs(request.nowS - ts) > BLOB_AUTH_SKEW_S) {
    return err("blob-auth-stale", "The blob request's time is too far from the service's.");
  }
  if (!verifyText(key, blobAuthText(request.method, request.path, ts, request.body), sig)) {
    return err("blob-auth-invalid", "The blob request's signature does not verify.");
  }
  return ok(key);
}
