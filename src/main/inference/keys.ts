// API keys a player types in Settings → Model, and the gateway's account token main's sign-in saves
// (provider `hosted`, rev 6 phase 4 D1–D2). Pure rules only — validation, the record format and
// which key a request may use; `keyStore.ts` encrypts records with safeStorage. A key is bound to
// the one base URL `endpointFor` gives its provider and is never sent anywhere else, and nothing in
// here ever hands a key to the renderer: the renderer only sees a KeyStatus.

import {
  type InferenceConfig,
  KEY_PROVIDERS,
  type KeyProvider,
  type KeyStatus,
  PROVIDER_PRESETS,
  TYPED_KEY_PROVIDERS,
} from "@shared/llm";
import { fail, ok, type Result } from "@shared/result";
import { z } from "zod";
import { gatewayNotConfigured, gatewaySetting, isLoopbackEndpoint, sameEndpoint } from "./config";

/** Printable ASCII without spaces: every real provider key fits, a header injection does not. */
const KEY_CHARS = /^[\x21-\x7e]+$/;

export const apiKeySchema = z.string().trim().min(8).max(512).regex(KEY_CHARS);

const baseUrlSchema = z.string().max(2048);

// The account token is never typed: only main's sign-in writes a `hosted` record.
const setApiKeySchema = z
  .object({
    provider: z.enum(TYPED_KEY_PROVIDERS),
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
  "qwen-image": "QWEN_IMAGE_API_KEY",
  // A token for .env comes only from `bun run gateway -- token <account>`, never from the app.
  hosted: "UNMAPPED_GATEWAY_KEY",
};

export type EnvLike = Record<string, string | undefined>;

/** Where vLLM-Omni serves Qwen-Image when nothing else is configured (rev 6 phase 4, D4). */
export const QWEN_IMAGE_DEFAULT_URL = "http://127.0.0.1:8091/v1";

/**
 * The Qwen-Image server: main-only QWEN_IMAGE_BASE_URL, else this machine. The renderer never
 * names it; whether a key (or any request) may go there is `keyEndpointAllowed`.
 */
export function qwenImageEndpoint(env: EnvLike = process.env): string {
  const value = env.QWEN_IMAGE_BASE_URL?.trim() ?? "";
  return value.length > 0 ? value : QWEN_IMAGE_DEFAULT_URL;
}

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

/**
 * The only source of a provider's endpoint, and so of where its key may go: the preset's own
 * endpoint, the configured gateway (main's UNMAPPED_GATEWAY_URL; `gateway-not-configured` without
 * one), Qwen-Image's configured server (https, or this machine), or the custom URL the key was typed
 * for (`typedFor`).
 */
export function endpointFor(
  provider: KeyProvider,
  typedFor: string | undefined,
  env: EnvLike = process.env,
): Result<string> {
  if (provider === "qwen-image") {
    const endpoint = qwenImageEndpoint(env);
    if (keyEndpointAllowed(endpoint)) return ok(endpoint);
    return fail({
      code: "key-endpoint-not-allowed",
      message: `QWEN_IMAGE_BASE_URL (${endpoint}) is neither https:// nor on this computer.`,
      hint: "Serve Qwen-Image over https://, or on http://127.0.0.1, and set QWEN_IMAGE_BASE_URL in .env.",
    });
  }
  if (provider === "hosted") {
    const gateway = gatewaySetting(env);
    if (!gateway.ok) return gateway;
    return gateway.value === null ? fail(gatewayNotConfigured()) : ok(gateway.value);
  }
  if (provider !== "custom") return ok(PROVIDER_PRESETS[provider].baseUrl);
  if (typedFor === undefined || !keyEndpointAllowed(typedFor)) {
    return fail({
      code: "key-endpoint-not-allowed",
      message: "A key for a custom endpoint needs an https:// address, or one on this computer.",
      hint: "Use an https:// base URL (or http://127.0.0.1 for a server on this machine), then save the key again.",
    });
  }
  return ok(typedFor);
}

/** Validates an untrusted setApiKey payload into the record that will be encrypted. */
export function parseSetApiKey(raw: unknown, env: EnvLike = process.env): Result<KeyRecord> {
  const parsed = setApiKeySchema.safeParse(raw);
  if (!parsed.success) {
    return fail({
      code: "invalid-api-key",
      message: "That does not look like an API key.",
      hint: "Paste the whole key: 8 to 512 characters, no spaces or line breaks.",
    });
  }
  const endpoint = endpointFor(parsed.data.provider, parsed.data.baseUrl, env);
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
export function parseKeyRecord(text: string, env: EnvLike = process.env): KeyRecord | null {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return null;
  }
  const parsed = keyRecordSchema.safeParse(raw);
  if (!parsed.success) return null;
  const expected = endpointFor(parsed.data.provider, parsed.data.baseUrl, env);
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
 * The key a request to `config` may carry: the player's saved key (or main's saved account token)
 * when it was saved for exactly this provider and `endpointFor`'s base URL, else the provider's .env
 * variable. A config pointed anywhere else gets nothing. Custom endpoints never get an .env key: a
 * deliberate Rule 6 exception, so an env secret never goes to a URL the renderer picked.
 */
export function pickApiKey(
  config: InferenceConfig,
  saved: KeyRecord | null,
  env: EnvLike,
): { key: string; source: "saved" | "env" } | null {
  if (!isKeyProvider(config.kind)) return null;
  const provider = config.kind;
  if (provider === "custom") {
    const bound =
      saved !== null &&
      saved.provider === "custom" &&
      sameEndpoint(saved.baseUrl, config.baseUrl) &&
      keyEndpointAllowed(config.baseUrl);
    return bound ? { key: saved.key, source: "saved" } : null;
  }
  const endpoint = endpointFor(provider, undefined, env);
  if (!endpoint.ok || !sameEndpoint(config.baseUrl, endpoint.value)) return null;
  if (
    saved !== null &&
    saved.provider === provider &&
    sameEndpoint(saved.baseUrl, endpoint.value)
  ) {
    return { key: saved.key, source: "saved" };
  }
  if (config.apiKeyEnv !== ENV_NAME[provider]) return null;
  const fromEnv = envKey(provider, env);
  return fromEnv === null ? null : { key: fromEnv, source: "env" };
}

/**
 * `pickApiKey` over the result of reading the saved record. .env is always the fallback: a saved
 * key that no longer reads still lets the .env key through (Settings → Model keeps showing it as
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

/**
 * The key a request to a provider's own endpoint may carry, for callers that have no chat config
 * (the Qwen-Image server): the saved key when it was bound to that endpoint, else the provider's
 * .env variable. Null when the endpoint may not carry a key at all (plain http off this machine).
 */
export function pickProviderKey(
  provider: KeyProvider,
  saved: KeyRecord | null,
  env: EnvLike,
): { key: string; source: "saved" | "env" } | null {
  const endpoint = endpointFor(provider, undefined, env);
  if (!endpoint.ok) return null;
  if (
    saved !== null &&
    saved.provider === provider &&
    sameEndpoint(saved.baseUrl, endpoint.value)
  ) {
    return { key: saved.key, source: "saved" };
  }
  const fromEnv = envKey(provider, env);
  return fromEnv === null ? null : { key: fromEnv, source: "env" };
}

/** What the renderer may know about a provider's key. */
export function describeKey(
  provider: KeyProvider,
  saved: KeyRecord | null,
  env: EnvLike,
): KeyStatus {
  if (saved !== null) return { set: true, source: "saved", boundTo: saved.baseUrl };
  if (envKey(provider, env) !== null) {
    const endpoint = endpointFor(provider, undefined, env);
    return { set: true, source: "env", boundTo: endpoint.ok ? endpoint.value : null };
  }
  return { set: false, source: null, boundTo: null };
}
