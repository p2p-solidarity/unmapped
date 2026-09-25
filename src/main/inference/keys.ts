// API keys a player types in System → Model. Pure rules only — validation, the record format and
// which key a request may use; `keyStore.ts` encrypts records with safeStorage. A key is bound to
// the one base URL it was entered for and is never sent anywhere else, and nothing in here ever
// hands a key to the renderer: the renderer only sees a KeyStatus.

import {
  type InferenceConfig,
  KEY_PROVIDERS,
  type KeyProvider,
  type KeyStatus,
  PROVIDER_PRESETS,
} from "@shared/llm";
import { fail, ok, type Result } from "@shared/result";
import { z } from "zod";
import { isLoopbackEndpoint, sameEndpoint } from "./config";

/** Printable ASCII without spaces: every real provider key fits, a header injection does not. */
const KEY_CHARS = /^[\x21-\x7e]+$/;

export const apiKeySchema = z.string().trim().min(8).max(512).regex(KEY_CHARS);

const baseUrlSchema = z.string().max(2048);

const setApiKeySchema = z
  .object({
    provider: z.enum(KEY_PROVIDERS),
    key: apiKeySchema,
    baseUrl: baseUrlSchema.optional(),
  })
  .strict();

const keyRecordSchema = z
  .object({
    v: z.literal(1),
    provider: z.enum(KEY_PROVIDERS),
    baseUrl: baseUrlSchema,
    key: apiKeySchema,
  })
  .strict();

export type KeyRecord = z.output<typeof keyRecordSchema>;

/** The env var a preset may read; a custom endpoint never reads one (Rule 6). */
const ENV_NAME: Record<KeyProvider, string | null> = {
  openai: "OPENAI_API_KEY",
  "openui-gateway": "THESYS_API_KEY",
  custom: null,
};

export type EnvLike = Record<string, string | undefined>;

export function isKeyProvider(value: string): value is KeyProvider {
  return (KEY_PROVIDERS as readonly string[]).includes(value);
}

/** A key may only travel over TLS, or stay on this machine. */
export function keyEndpointAllowed(baseUrl: string): boolean {
  try {
    const url = new URL(baseUrl);
    if (url.protocol === "https:") return true;
    return url.protocol === "http:" && isLoopbackEndpoint(baseUrl);
  } catch {
    return false;
  }
}

/** Where a provider's key goes: the preset's own endpoint, or the custom URL it was typed for. */
function boundEndpoint(provider: KeyProvider, baseUrl: string | undefined): Result<string> {
  if (provider !== "custom") return ok(PROVIDER_PRESETS[provider].baseUrl);
  if (baseUrl === undefined || !keyEndpointAllowed(baseUrl)) {
    return fail({
      code: "key-endpoint-not-allowed",
      message: "A key for a custom endpoint needs an https:// address, or one on this computer.",
      hint: "Use an https:// base URL (or http://127.0.0.1 for a server on this machine), then save the key again.",
    });
  }
  return ok(baseUrl);
}

/** Validates an untrusted setApiKey payload into the record that will be encrypted. */
export function parseSetApiKey(raw: unknown): Result<KeyRecord> {
  const parsed = setApiKeySchema.safeParse(raw);
  if (!parsed.success) {
    return fail({
      code: "invalid-api-key",
      message: "That does not look like an API key.",
      hint: "Paste the whole key: 8 to 512 characters, no spaces or line breaks.",
    });
  }
  const endpoint = boundEndpoint(parsed.data.provider, parsed.data.baseUrl);
  if (!endpoint.ok) return endpoint;
  return ok({
    v: 1,
    provider: parsed.data.provider,
    baseUrl: endpoint.value,
    key: parsed.data.key,
  });
}

export function serializeKeyRecord(record: KeyRecord): string {
  return JSON.stringify(record);
}

/** A decrypted file that is not exactly a valid record reads as "no key saved". */
export function parseKeyRecord(text: string): KeyRecord | null {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return null;
  }
  const parsed = keyRecordSchema.safeParse(raw);
  if (!parsed.success) return null;
  const expected = boundEndpoint(parsed.data.provider, parsed.data.baseUrl);
  if (!expected.ok || !sameEndpoint(expected.value, parsed.data.baseUrl)) return null;
  return parsed.data;
}

function envKey(provider: KeyProvider, env: EnvLike): string | null {
  const name = ENV_NAME[provider];
  if (name === null) return null;
  const value = env[name];
  return typeof value === "string" && value.length > 0 ? value : null;
}

/**
 * The key a request to `config` may carry: the player's saved key when it was saved for exactly
 * this provider and base URL, else the preset's .env variable. Custom endpoints never get an .env key.
 */
export function pickApiKey(
  config: InferenceConfig,
  saved: KeyRecord | null,
  env: EnvLike,
): { key: string; source: "saved" | "env" } | null {
  if (!isKeyProvider(config.kind)) return null;
  const provider = config.kind;
  if (
    saved !== null &&
    saved.provider === provider &&
    sameEndpoint(saved.baseUrl, config.baseUrl) &&
    (provider !== "custom" || keyEndpointAllowed(config.baseUrl))
  ) {
    return { key: saved.key, source: "saved" };
  }
  if (provider === "custom" || config.apiKeyEnv !== ENV_NAME[provider]) return null;
  if (!sameEndpoint(config.baseUrl, PROVIDER_PRESETS[provider].baseUrl)) return null;
  const fromEnv = envKey(provider, env);
  return fromEnv === null ? null : { key: fromEnv, source: "env" };
}

/**
 * `pickApiKey` over the result of reading the saved record. .env is always the fallback: a saved
 * key that no longer reads still lets the .env key through (System → Model keeps showing it as
 * unreadable), and it is an error only when there is no .env key either.
 */
export function resolveKey(
  config: InferenceConfig,
  saved: Result<KeyRecord | null>,
  env: EnvLike,
): Result<{ key: string; source: "saved" | "env" } | null> {
  if (saved.ok) return ok(pickApiKey(config, saved.value, env));
  const fromEnv = pickApiKey(config, null, env);
  return fromEnv === null ? saved : ok(fromEnv);
}

/** What the renderer may know about a provider's key. */
export function describeKey(
  provider: KeyProvider,
  saved: KeyRecord | null,
  env: EnvLike,
): KeyStatus {
  if (saved !== null) return { set: true, source: "saved", boundTo: saved.baseUrl };
  if (envKey(provider, env) !== null) {
    return { set: true, source: "env", boundTo: PROVIDER_PRESETS[provider].baseUrl };
  }
  return { set: false, source: null, boundTo: null };
}
