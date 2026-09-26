// The gateway's credentials resolve the app's way (rev 6 phase 4, hard constraint "keys resolve one
// way, everywhere"): the key saved on this host, else that provider's own .env variable, and .env is
// never removed. Saved keys live in `<data>/keys.json` (0600), written only by
// `bun run gateway -- set-key <name>` from stdin (never argv, which other users can read). Names are
// upstream ids plus `stripe` and `stripe-webhook`. A saved file that cannot be read falls back to
// .env (as main does since 1a10a9d) and says so. Values are never logged.

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { err, ok, type Result } from "@shared/result";
import { z } from "zod";
import { storageError, writeDurably } from "./jsonl";

export const KEYS_FILE = "keys.json";
export const KEY_NAME = /^[a-z0-9][a-z0-9-]{0,39}$/;

/** Printable ASCII without spaces: every real provider key fits, a header injection does not. */
const keyValue = z
  .string()
  .min(8)
  .max(512)
  .regex(/^[\x21-\x7e]+$/);
const keysSchema = z.strictObject({ v: z.literal(1), keys: z.record(z.string(), keyValue) });

export type EnvLike = Readonly<Record<string, string | undefined>>;
export type SavedKeys = Result<Readonly<Record<string, string>>>;

export function readSavedKeys(dataDir: string): SavedKeys {
  const path = join(dataDir, KEYS_FILE);
  if (!existsSync(path)) return ok({});
  try {
    const parsed = keysSchema.safeParse(JSON.parse(readFileSync(path, "utf8")));
    if (parsed.success) return ok(parsed.data.keys);
  } catch {}
  return err(
    "gateway-keys-unreadable",
    `${path} cannot be read; the .env keys are used instead.`,
    "Save the keys again with `bun run gateway -- set-key <name> --data <dir>`.",
  );
}

export function writeSavedKey(dataDir: string, name: string, value: string | null): Result<void> {
  if (!KEY_NAME.test(name)) return err("gateway-arg", `"${name}" is not a key name.`);
  if (value !== null && !keyValue.safeParse(value).success) {
    return err("gateway-arg", "That does not look like a key (8–512 printable characters).");
  }
  const current = readSavedKeys(dataDir);
  const keys: Record<string, string> = { ...(current.ok ? current.value : {}) };
  if (value === null) delete keys[name];
  else keys[name] = value;
  try {
    writeDurably(join(dataDir, KEYS_FILE), `${JSON.stringify({ v: 1, keys })}\n`, 0o600);
    return ok(undefined);
  } catch (error) {
    return storageError(`write ${KEYS_FILE}`, error);
  }
}

export interface ResolvedKey {
  key: string;
  source: "saved" | "env";
}

/** Saved, else `env[envName]`, else null. An unreadable saved file never hides the .env key. */
export function resolveKey(
  name: string,
  envName: string | null,
  saved: SavedKeys,
  env: EnvLike,
): ResolvedKey | null {
  const stored = saved.ok ? saved.value[name] : undefined;
  if (stored !== undefined) return { key: stored, source: "saved" };
  const fromEnv = envName === null ? undefined : env[envName];
  return typeof fromEnv === "string" && fromEnv.length > 0 ? { key: fromEnv, source: "env" } : null;
}

/** A key may only travel over TLS, or stay on this machine. */
export function keyEndpointAllowed(baseUrl: string): boolean {
  try {
    const url = new URL(baseUrl);
    if (url.protocol === "https:") return true;
    return url.protocol === "http:" && isLoopbackHost(url.hostname);
  } catch {
    return false;
  }
}

export function isLoopbackHost(host: string): boolean {
  const bare = host.replace(/^\[|\]$/g, "");
  return bare === "localhost" || bare === "::1" || /^127(?:\.\d{1,3}){3}$/.test(bare);
}
