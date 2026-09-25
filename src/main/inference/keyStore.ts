// Saved API keys on disk: `<userData>/provider-keys/<provider>.key`, one safeStorage-encrypted
// record per provider (the OS keychain holds the encryption key). Only main reads these files, and
// every caller that needs a key — chat, probe, image generation — asks `resolveApiKey`, so the
// saved-then-.env order and the endpoint binding live in one place. Values are never logged.

import { chmod, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  type InferenceConfig,
  KEY_PROVIDERS,
  type KeyProvider,
  type KeyStatus,
  type KeyStatusMap,
} from "@shared/llm";
import { err, fail, ok, type Result, toError } from "@shared/result";
import { safeStorage } from "electron";
import {
  describeKey,
  type EnvLike,
  type KeyRecord,
  parseKeyRecord,
  pickApiKey,
  resolveKey,
  serializeKeyRecord,
} from "./keys";

const DIR = "provider-keys";
const FILE_MODE = 0o600;
const DIR_MODE = 0o700;

let root: string | null = null;

/** Called once when the inference IPC is registered; until then only .env keys resolve. */
export function initKeyStore(userData: string): void {
  root = join(userData, DIR);
}

function keyPath(provider: KeyProvider): string | null {
  return root === null ? null : join(root, `${provider}.key`);
}

const UNREADABLE_HINT = "Open Settings → Model, remove the saved key and enter it again.";

/**
 * The saved key for `provider`: ok(null) only when none was saved. A file that exists but cannot
 * be read, decrypted or validated is an error (Rule 5), never "no key".
 */
export async function readKeyRecord(provider: KeyProvider): Promise<Result<KeyRecord | null>> {
  const path = keyPath(provider);
  if (path === null) return ok(null);
  let bytes: Buffer;
  try {
    bytes = await readFile(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return ok(null);
    return fail({ ...toError(error, "key-read-failed"), hint: UNREADABLE_HINT });
  }
  if (!safeStorage.isEncryptionAvailable()) {
    return err(
      "key-storage-unavailable",
      `The saved ${provider} key cannot be decrypted: this computer's keychain encryption is not available.`,
      "Unlock the OS keychain and restart UNMAPPED, or remove the saved key in Settings → Model.",
    );
  }
  let record: KeyRecord | null;
  try {
    record = parseKeyRecord(safeStorage.decryptString(bytes));
  } catch {
    record = null;
  }
  if (record === null || record.provider !== provider) {
    return err("key-unreadable", `The saved ${provider} key could not be read.`, UNREADABLE_HINT);
  }
  return ok(record);
}

export async function writeKeyRecord(record: KeyRecord): Promise<Result<void>> {
  const path = keyPath(record.provider);
  if (path === null || root === null) {
    return err("key-store-unready", "The key store is not open yet.", "Restart UNMAPPED.");
  }
  if (!safeStorage.isEncryptionAvailable()) {
    return err(
      "key-storage-unavailable",
      "This computer's keychain encryption is not available, so the key cannot be saved.",
      "Unlock the OS keychain and restart UNMAPPED, or put the key in the .env file.",
    );
  }
  try {
    await mkdir(root, { recursive: true, mode: DIR_MODE });
    await writeFile(path, safeStorage.encryptString(serializeKeyRecord(record)), {
      mode: FILE_MODE,
    });
    await chmod(path, FILE_MODE);
    return ok(undefined);
  } catch (error) {
    return fail({ ...toError(error, "key-write-failed"), hint: "Check the app's data folder." });
  }
}

export async function clearKeyRecord(provider: KeyProvider): Promise<Result<void>> {
  const path = keyPath(provider);
  if (path === null) return ok(undefined);
  try {
    await rm(path, { force: true });
    return ok(undefined);
  } catch (error) {
    return fail({ ...toError(error, "key-write-failed"), hint: "Check the app's data folder." });
  }
}

export async function keyStatusMap(env: EnvLike = process.env): Promise<KeyStatusMap> {
  const entries = await Promise.all(
    KEY_PROVIDERS.map(async (provider) => {
      const saved = await readKeyRecord(provider);
      const status: KeyStatus = saved.ok
        ? describeKey(provider, saved.value, env)
        : { set: false, source: "unreadable", boundTo: null };
      return [provider, status] as const;
    }),
  );
  return Object.fromEntries(entries) as KeyStatusMap;
}

/**
 * The key a request to this endpoint may carry (saved first, then .env), ok(null) for none. A saved
 * key that cannot be read falls back to .env (`resolveKey`); its error surfaces only without one.
 */
export async function resolveApiKey(
  config: InferenceConfig,
  env: EnvLike = process.env,
): Promise<Result<{ key: string; source: "saved" | "env" } | null>> {
  if (config.kind !== "openai" && config.kind !== "openui-gateway" && config.kind !== "custom") {
    return ok(pickApiKey(config, null, env));
  }
  return resolveKey(config, await readKeyRecord(config.kind), env);
}
