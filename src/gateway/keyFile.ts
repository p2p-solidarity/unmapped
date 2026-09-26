// The gateway's own secrets in its data dir (rev 6 phase 4, D1), both mode 0600 and created once:
//
//   gateway-key.json  Ed25519: its public key is the `gatewayKey` every sign-in signs, so a
//                     signature made for one gateway never signs in at another.
//   admin-secret      what the gateway CLI shows a running gateway on loopback (`grant`, `token`).
//
// A file that exists but cannot be read, parsed or matched is an error the operator must resolve:
// the gateway never writes a new one over it (P3 D7, "key errors never regenerate"). Every device
// that signed in would otherwise have to sign in again, and the CLI would lose its way in.

import { randomBytes } from "node:crypto";
import { closeSync, fsyncSync, lstatSync, openSync, readFileSync, writeSync } from "node:fs";
import { join } from "node:path";
import { base64Url, fromBase64Url } from "@shared/history/ids";
import { authorKeyFor, newSecretKey } from "@shared/history/sign";
import { err, ok, type Result } from "@shared/result";

export const KEY_FILE = "gateway-key.json";
export const ADMIN_FILE = "admin-secret";

export interface GatewayKey {
  secret: Uint8Array;
  /** "k" + base32(public key). */
  key: string;
}

export interface Loaded<T> {
  value: T;
  created: boolean;
  /** Set when the file is readable by group or others. */
  warning: string | null;
}

function errnoOf(error: unknown): string {
  return typeof error === "object" && error !== null && "code" in error
    ? String((error as { code: unknown }).code)
    : "";
}

function unreadable(path: string, why: string): Result<never> {
  return err(
    "gateway-key-unreadable",
    `${path} exists but ${why}.`,
    "Restore it from a backup. The gateway never makes a new one over it; move the file away " +
      "yourself to start fresh (every device then signs in again).",
  );
}

/** The file's mode, null when absent, or why it cannot be inspected. */
function modeOf(path: string): Result<number | null> {
  try {
    return ok(lstatSync(path).mode);
  } catch (error) {
    if (errnoOf(error) === "ENOENT") return ok(null);
    return unreadable(path, `cannot be inspected (${errnoOf(error)})`);
  }
}

function warningFor(path: string, mode: number): string | null {
  return (mode & 0o077) !== 0
    ? `${path} is readable by other users (mode ${(mode & 0o777).toString(8)}); chmod 600 it.`
    : null;
}

function create(path: string, text: string): Result<void> {
  let fd: number | null = null;
  try {
    // "wx": never replace a file that appeared meanwhile.
    fd = openSync(path, "wx", 0o600);
    writeSync(fd, text);
    fsyncSync(fd);
    return ok(undefined);
  } catch (error) {
    return err(
      "gateway-key-create",
      `Could not create ${path} (${errnoOf(error) || String(error)}).`,
      "Check that --data points at a writable directory.",
    );
  } finally {
    if (fd !== null) closeSync(fd);
  }
}

export function loadGatewayKey(dataDir: string): Result<Loaded<GatewayKey>> {
  const path = join(dataDir, KEY_FILE);
  const mode = modeOf(path);
  if (!mode.ok) return mode;
  if (mode.value === null) {
    const secret = newSecretKey();
    const key = authorKeyFor(secret);
    const made = create(path, `${JSON.stringify({ v: 1, key, secret: base64Url(secret) })}\n`);
    if (!made.ok) return made;
    return ok({ value: { secret, key }, created: true, warning: null });
  }
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return unreadable(path, "is not readable JSON");
  }
  const record = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;
  const secret = typeof record.secret === "string" ? fromBase64Url(record.secret) : null;
  if (record.v !== 1 || secret === null || secret.length !== 32) {
    return unreadable(path, "does not hold a 32-byte secret");
  }
  const key = authorKeyFor(secret);
  if (record.key !== key) return unreadable(path, "names a key its secret does not make");
  return ok({ value: { secret, key }, created: false, warning: warningFor(path, mode.value) });
}

const ADMIN_SECRET = /^[A-Za-z0-9_-]{43}$/;

/**
 * The admin secret; created only when `create` (the server starting) and the file is absent. The
 * CLI passes `create: false`: with no file there is no running gateway to talk to.
 */
export function loadAdminSecret(dataDir: string, create_: boolean): Result<Loaded<string> | null> {
  const path = join(dataDir, ADMIN_FILE);
  const mode = modeOf(path);
  if (!mode.ok) return mode;
  if (mode.value === null) {
    if (!create_) return ok(null);
    const secret = base64Url(randomBytes(32));
    const made = create(path, `${secret}\n`);
    if (!made.ok) return made;
    return ok({ value: secret, created: true, warning: null });
  }
  let text: string;
  try {
    text = readFileSync(path, "utf8").trim();
  } catch (error) {
    return unreadable(path, `cannot be read (${errnoOf(error)})`);
  }
  if (!ADMIN_SECRET.test(text)) return unreadable(path, "does not hold an admin secret");
  return ok({ value: text, created: false, warning: warningFor(path, mode.value) });
}
