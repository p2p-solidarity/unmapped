// The spellings a world's history is written in (rev 6 phase 3, D2): lowercase unpadded RFC 4648
// base32 for event ids ("h…") and author keys ("k…"), unpadded base64url for signatures, sha256
// from @noble/hashes, and strict ISO receipt times. Every decoder is canonical: it refuses any
// text its encoder would not have written, so one key or id has exactly one spelling (two
// spellings of one key would be two members, and two of one id two events).
//
// Pure and synchronous: runs the same in main, the renderer, vitest and Bun (JavaScriptCore).

import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import { canonicalJson } from "../canonical";
import type { ChunkCoord } from "../chunks";

const ALPHABET = "abcdefghijklmnopqrstuvwxyz234567";

/** "h" + base32(sha256(…)): an event id; a world's id is its genesis event's id. */
export const EVENT_ID = /^h[a-z2-7]{52}$/;
/** "k" + base32(Ed25519 public key, 32 bytes). */
export const AUTHOR_KEY = /^k[a-z2-7]{52}$/;
/** base64url(Ed25519 signature, 64 bytes), unpadded. */
export const SIGNATURE = /^[A-Za-z0-9_-]{86}$/;
/** chain(n ≥ 1). chain(0) is the world id itself. */
export const CHAIN = /^sha256:[a-f0-9]{64}$/;
/** A content hash in the repo's tagged form (cartridge and work packs). */
export const CONTENT_HASH = /^sha256:[a-f0-9]{64}$/;
/** Receipt and beat times: `Date#toISOString` output (milliseconds optional), UTC only. */
export const ISO_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
/** A nonce (invites, WebSocket challenges): 16–52 base32 characters. */
export const NONCE = /^[a-z2-7]{16,52}$/;

export const DAY_MS = 86_400_000;

const encoder = new TextEncoder();

export function utf8(text: string): Uint8Array {
  return encoder.encode(text);
}

export function utf8Length(text: string): number {
  return encoder.encode(text).length;
}

export function base32(bytes: Uint8Array): string {
  let out = "";
  let buffer = 0;
  let bits = 0;
  for (const byte of bytes) {
    buffer = (buffer << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(buffer >>> (bits - 5)) & 31];
      bits -= 5;
    }
    buffer &= (1 << bits) - 1;
  }
  if (bits > 0) out += ALPHABET[(buffer << (5 - bits)) & 31];
  return out;
}

/** The bytes of a canonical lowercase base32 text, or null (bad letter, length or tail bits). */
export function fromBase32(text: string): Uint8Array | null {
  const out: number[] = [];
  let buffer = 0;
  let bits = 0;
  for (const char of text) {
    const value = ALPHABET.indexOf(char);
    if (value < 0) return null;
    buffer = (buffer << 5) | value;
    bits += 5;
    if (bits >= 8) {
      out.push((buffer >>> (bits - 8)) & 255);
      bits -= 8;
    }
    buffer &= (1 << bits) - 1;
  }
  const bytes = Uint8Array.from(out);
  return base32(bytes) === text ? bytes : null;
}

export function base64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** The bytes of a canonical unpadded base64url text, or null. */
export function fromBase64Url(text: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]*$/.test(text) || text.length % 4 === 1) return null;
  try {
    const binary = atob(text.replace(/-/g, "+").replace(/_/g, "/"));
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    return base64Url(bytes) === text ? bytes : null;
  } catch {
    return null;
  }
}

export function sha256Bytes(data: Uint8Array | string): Uint8Array {
  return sha256(typeof data === "string" ? utf8(data) : data);
}

export function sha256Hex(data: Uint8Array | string): string {
  return bytesToHex(sha256Bytes(data));
}

/** "sha256:" + hex, the repo's tagged hash form. */
export function contentHash(data: Uint8Array | string): string {
  return `sha256:${sha256Hex(data)}`;
}

/** "h" + base32(sha256(canonicalJson(value))): the id of an event without its `id` and `sig`. */
export function hashId(value: unknown): string {
  return `h${base32(sha256Bytes(canonicalJson(value)))}`;
}

export function authorKeyOf(publicKey: Uint8Array): string {
  return `k${base32(publicKey)}`;
}

/** The 32 public-key bytes an author key spells, or null. */
export function publicKeyOf(key: string): Uint8Array | null {
  if (!AUTHOR_KEY.test(key)) return null;
  const bytes = fromBase32(key.slice(1));
  return bytes !== null && bytes.length === 32 ? bytes : null;
}

/** chain(n) = "sha256:" + hex(sha256(chain(n−1) + "\n" + n + "\n" + rt + "\n" + id)). */
export function chainNext(previous: string, n: number, rt: string, id: string): string {
  return `sha256:${sha256Hex(`${previous}\n${n}\n${rt}\n${id}`)}`;
}

/** Milliseconds of a strict ISO time (the one format every engine parses identically), or NaN. */
export function timeMs(iso: string): number {
  return ISO_TIME.test(iso) ? Date.parse(iso) : Number.NaN;
}

export function isIsoTime(iso: string): boolean {
  return Number.isFinite(timeMs(iso));
}

/** A place's id: "p" + the 8 characters after the "h" of its event id. */
export function placeIdOf(eventId: string): string {
  return `p${eventId.slice(1, 9)}`;
}

/**
 * An index in [0, count) drawn from an event id: its first six base32 characters after the "h"
 * (30 bits, exact integer math) modulo `count`. The same on every engine.
 */
export function hashIndex(eventId: string, count: number): number {
  let value = 0;
  for (const char of eventId.slice(1, 7)) value = value * 32 + Math.max(0, ALPHABET.indexOf(char));
  return count <= 0 ? 0 : value % count;
}

export function sameChunk(a: ChunkCoord, b: ChunkCoord): boolean {
  return a.cx === b.cx && a.cz === b.cz;
}
