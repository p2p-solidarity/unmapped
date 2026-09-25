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

export async function readKeyRecord(provider: KeyProvider): Promise<KeyRecord | null> {
  const path = keyPath(provider);
  if (path === null || !safeStorage.isEncryptionAvailable()) return null;
  try {
    const record = parseKeyRecord(safeStorage.decryptString(await readFile(path)));
    return record?.provider === provider ? record : null;
  } catch {
    return null;
  }
}

export async function writeKeyRecord(record: KeyRecord): Promise<Result<void>> {
  const path = keyPath(record.provider);
  if (path === null || root === null) {
    return err("key-store-unready", "The key store is not open yet.", "Restart Unwritten Land.");
  }
  if (!safeStorage.isEncryptionAvailable()) {
    return err(
      "key-storage-unavailable",
      "This computer's keychain encryption is not available, so the key cannot be saved.",
      "Unlock the OS keychain and restart Unwritten Land, or put the key in the .env file.",
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
    KEY_PROVIDERS.map(
      async (provider) =>
        [provider, describeKey(provider, await readKeyRecord(provider), env)] as const,
    ),
  );
  return Object.fromEntries(entries) as KeyStatusMap;
}

/** The key a request to this endpoint may carry (saved first, then .env), or null for none. */
export async function resolveApiKey(
  config: InferenceConfig,
  env: EnvLike = process.env,
): Promise<{ key: string; source: "saved" | "env" } | null> {
  const saved =
    config.kind === "openai" || config.kind === "openui-gateway" || config.kind === "custom"
      ? await readKeyRecord(config.kind)
      : null;
  return pickApiKey(config, saved, env);
}
