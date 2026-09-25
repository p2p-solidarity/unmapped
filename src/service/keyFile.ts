// The service's Ed25519 receipt key (rev 6 phase 3, D2, D10): `<data>/service-key.json`, mode
// 0600, created once. Every receipt of every world it sequences verifies only with this key, so a
// file that exists but cannot be read, parsed or matched to its public key is an error the operator
// must resolve — the service never writes a new key over it (unlike `vault/store.ts`, which
// regenerates; D7 "key errors never regenerate").

import { closeSync, fsyncSync, lstatSync, openSync, readFileSync, writeSync } from "node:fs";
import { join } from "node:path";
import { base64Url, fromBase64Url } from "@shared/history/ids";
import { authorKeyFor, newSecretKey } from "@shared/history/sign";
import { err, ok, type Result } from "@shared/result";

export interface ServiceKey {
  secret: Uint8Array;
  /** "k" + base32(public key): the `sequencer` body key and the challenge key. */
  key: string;
}

export interface LoadedKey {
  key: ServiceKey;
  created: boolean;
  /** Set when the file is readable by group or others. */
  warning: string | null;
}

export const KEY_FILE = "service-key.json";

function unreadable(path: string, why: string): Result<never> {
  return err(
    "service-key-unreadable",
    `${path} exists but ${why}.`,
    "Restore it from a backup. The worlds on this service verify only with that key, so the " +
      "service will not make a new one over it; move the file away yourself to start fresh.",
  );
}

function errnoOf(error: unknown): string {
  return typeof error === "object" && error !== null && "code" in error
    ? String((error as { code: unknown }).code)
    : "";
}

/** Reads the key, or creates it when (and only when) the file does not exist. */
export function loadServiceKey(dataDir: string): Result<LoadedKey> {
  const path = join(dataDir, KEY_FILE);
  let mode: number | null = null;
  try {
    mode = lstatSync(path).mode;
  } catch (error) {
    if (errnoOf(error) !== "ENOENT")
      return unreadable(path, `cannot be inspected (${errnoOf(error)})`);
  }
  if (mode === null) return createKey(path);
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
  const warning =
    (mode & 0o077) !== 0
      ? `${path} is readable by other users (mode ${(mode & 0o777).toString(8)}); chmod 600 it.`
      : null;
  return ok({ key: { secret, key }, created: false, warning });
}

function createKey(path: string): Result<LoadedKey> {
  const secret = newSecretKey();
  const key = authorKeyFor(secret);
  const text = `${JSON.stringify({ v: 1, key, secret: base64Url(secret) })}\n`;
  let fd: number | null = null;
  try {
    // "wx": never replace a file that appeared meanwhile.
    fd = openSync(path, "wx", 0o600);
    writeSync(fd, text);
    fsyncSync(fd);
  } catch (error) {
    return err(
      "service-key-create",
      `Could not create ${path} (${errnoOf(error) || String(error)}).`,
      "Check that --data points at a writable directory.",
    );
  } finally {
    if (fd !== null) closeSync(fd);
  }
  return ok({ key: { secret, key }, created: true, warning: null });
}
