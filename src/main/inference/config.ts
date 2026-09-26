// InferenceConfig persistence: `<userData>/inference.json`, zod-validated on every read and write.
// A missing or corrupt file is not an error — it falls back to the default provider so the app
// still boots (Rule 5: errors are values, and this one has an obvious recovery).

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
  type InferenceConfig,
  LLAMA_SERVER_PATHS,
  PROVIDER_KINDS,
  PROVIDER_PRESETS,
  type SidecarConfig,
} from "@shared/llm";
import { type AppError, fail, ok, type Result, toError } from "@shared/result";
import { z } from "zod";

export const CONFIG_FILE = "inference.json";

/** Sidecar defaults for a brew-installed llama.cpp; `modelPath` is the one thing the user sets. */
export const DEFAULT_SIDECAR: SidecarConfig = {
  binaryPath: "/opt/homebrew/bin/llama-server",
  modelPath: "",
  port: 8080,
  ctxSize: 16384,
};

export const sidecarConfigSchema = z.object({
  binaryPath: z.string(),
  // llama-server reads GGUF only; anything else is a mistyped path (empty = not chosen yet).
  modelPath: z
    .string()
    .max(4096)
    .refine((value) => value === "" || value.toLowerCase().endsWith(".gguf"), {
      message: "must be a .gguf file",
    }),
  port: z.number().int().min(1).max(65535),
  ctxSize: z.number().int().min(512).max(1_048_576),
});

const TRUSTED_API_KEY_ENVS = {
  openai: "OPENAI_API_KEY",
  "openui-gateway": "THESYS_API_KEY",
  hosted: "UNMAPPED_GATEWAY_KEY",
} as const;

/** The chat kinds that carry a key (the player's own, or the gateway's account token). */
export type KeyedChatKind = keyof typeof TRUSTED_API_KEY_ENVS;

/**
 * The generation gateway a release build talks to when UNMAPPED_GATEWAY_URL is not set. A person
 * bakes it in when the gateway goes live (rev 6 phase 4, "What a person must do"); development
 * builds have none, so without the env variable nothing is hosted.
 */
export const GATEWAY_URL: string | null = null;

/** Main-owned Homebrew locations; a same-named executable elsewhere is not trusted. */
const TRUSTED_SIDECAR_PATHS = new Set<string>(LLAMA_SERVER_PATHS);

/**
 * `z.url()` happily accepts "localhost:8080" (it reads "localhost:" as the protocol), which then
 * fails deep inside the OpenAI SDK. Require a real http(s) origin up front.
 */
const baseUrlSchema = z.string().refine(
  (value) => {
    try {
      const url = new URL(value);
      return url.protocol === "http:" || url.protocol === "https:";
    } catch {
      return false;
    }
  },
  { message: "must be an absolute http(s) URL" },
);

export const inferenceConfigSchema = z.object({
  kind: z.enum(PROVIDER_KINDS),
  baseUrl: baseUrlSchema,
  model: z.string(),
  apiKeyEnv: z.string().min(1).nullable(),
  sidecar: sidecarConfigSchema.nullable(),
});

export type EnvLike = Record<string, string | undefined>;

function endpoint(value: string): URL | null {
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    return parsed;
  } catch {
    return null;
  }
}

/** Same scheme, host, port and path (a trailing slash does not count). */
export function sameEndpoint(left: string, right: string): boolean {
  const a = endpoint(left);
  const b = endpoint(right);
  if (a === null || b === null) return false;
  const normalizePath = (value: string) => value.replace(/\/+$/, "");
  return (
    a.protocol === b.protocol &&
    a.host === b.host &&
    normalizePath(a.pathname) === normalizePath(b.pathname)
  );
}

export function isLoopbackEndpoint(value: string): boolean {
  const parsed = endpoint(value);
  if (parsed === null) return false;
  return (
    parsed.hostname === "localhost" ||
    parsed.hostname === "127.0.0.1" ||
    parsed.hostname === "[::1]"
  );
}

/**
 * UNMAPPED_GATEWAY_URL (main env), else the baked-in GATEWAY_URL, as the gateway's `/v1` base:
 * ok(null) when this build has no gateway. Its account token travels only over https, or to a
 * gateway on this computer (the E2E one), so any other address is refused, never used.
 */
export function gatewaySetting(env: EnvLike = process.env): Result<string | null> {
  const raw = env.UNMAPPED_GATEWAY_URL?.trim() || GATEWAY_URL;
  if (raw === null || raw === "") return ok(null);
  const url = endpoint(raw);
  const allowed =
    url !== null &&
    url.username === "" &&
    url.password === "" &&
    url.search === "" &&
    url.hash === "" &&
    (url.protocol === "https:" || isLoopbackEndpoint(raw));
  if (url === null || !allowed) {
    return fail({
      code: "gateway-url-not-allowed",
      message: `UNMAPPED_GATEWAY_URL (${raw}) is not an https:// address or one on this computer.`,
      hint: "Set UNMAPPED_GATEWAY_URL in .env to the gateway's https:// address (or http://127.0.0.1:<port> for one on this computer), then restart.",
    });
  }
  const path = url.pathname.replace(/\/+$/, "");
  return ok(`${url.origin}${path.endsWith("/v1") ? path : `${path}/v1`}`);
}

/** The gateway's `/v1` base, or null when none is configured (or its address is refused). */
export function gatewayEndpoint(env: EnvLike = process.env): string | null {
  const setting = gatewaySetting(env);
  return setting.ok ? setting.value : null;
}

/** The only endpoint a keyed chat kind may use: its preset's, or the configured gateway's. */
export function chatEndpointFor(kind: KeyedChatKind, env: EnvLike = process.env): string | null {
  return kind === "hosted" ? gatewayEndpoint(env) : PROVIDER_PRESETS[kind].baseUrl;
}

/**
 * The renderer may choose a provider preset or a custom no-auth endpoint, but it must not choose
 * where a main-process environment secret is sent. Cloud keys are paired with their exact known
 * endpoint; local providers stay on loopback; custom endpoints are intentionally keyless.
 */
export function isTrustedInferenceConfig(
  config: InferenceConfig,
  env: EnvLike = process.env,
): boolean {
  if (config.kind === "openai" || config.kind === "openui-gateway" || config.kind === "hosted") {
    if (config.apiKeyEnv !== TRUSTED_API_KEY_ENVS[config.kind]) return false;
    const expected = chatEndpointFor(config.kind, env);
    if (expected === null || !sameEndpoint(config.baseUrl, expected)) return false;
    if (config.kind === "hosted" && config.sidecar !== null) return false;
  } else if (config.kind === "apple-fm") {
    // Answered inside the app: nothing to reach, spawn or authenticate.
    const preset = PROVIDER_PRESETS["apple-fm"];
    if (config.baseUrl !== preset.baseUrl || config.apiKeyEnv !== null) return false;
    if (config.sidecar !== null) return false;
  } else if (config.kind === "llamacpp" || config.kind === "ollama" || config.kind === "vllm") {
    if (config.apiKeyEnv !== null || !isLoopbackEndpoint(config.baseUrl)) return false;
  } else if (config.kind === "custom") {
    if (config.apiKeyEnv !== null) return false;
  }

  if (config.sidecar !== null && !isTrustedSidecarBinaryPath(config.sidecar.binaryPath)) {
    return false;
  }
  return true;
}

/** An explicit path allowlist keeps the sidecar seam from becoming arbitrary spawn. */
export function isTrustedSidecarBinaryPath(value: string): boolean {
  return TRUSTED_SIDECAR_PATHS.has(value);
}

export function configPath(userData: string): string {
  return join(userData, CONFIG_FILE);
}

/**
 * OpenAI when its key is already in the environment; else the free allowance when a gateway is
 * configured (direction item 9: it comes first); else the on-device Apple model when the app's
 * bridge answers chat on this Mac (`hasAppleFm`, asked by the caller); else the local llama.cpp
 * sidecar. An env var that exists but is empty counts as absent — an empty key cannot
 * authenticate. Development builds have no gateway, so their default is unchanged.
 */
export function defaultConfig(env: EnvLike = process.env, hasAppleFm = false): InferenceConfig {
  const key = env.OPENAI_API_KEY;
  if (typeof key === "string" && key.length > 0) {
    return { ...PROVIDER_PRESETS.openai, sidecar: null };
  }
  const gateway = gatewayEndpoint(env);
  if (gateway !== null) return { ...PROVIDER_PRESETS.hosted, baseUrl: gateway, sidecar: null };
  // No cloud key: the on-device Apple model when this Mac has it, else a local llama.cpp.
  if (hasAppleFm) return { ...PROVIDER_PRESETS["apple-fm"], sidecar: null };
  return { ...PROVIDER_PRESETS.llamacpp, sidecar: { ...DEFAULT_SIDECAR } };
}

/**
 * Validates an untrusted payload (disk contents or an IPC message from the renderer). A `hosted`
 * config's address and key variable are main's, never the payload's: they are rewritten from the
 * configured gateway, and the config is refused when there is none.
 */
export function parseConfig(raw: unknown, env: EnvLike = process.env): Result<InferenceConfig> {
  const parsed = inferenceConfigSchema.safeParse(raw);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    const where = first === undefined ? "config" : first.path.join(".") || "config";
    const why = first === undefined ? "did not match the schema" : first.message;
    return fail({
      code: "invalid-config",
      message: `Invalid inference config: ${where} ${why}`,
      hint: "baseUrl must be an absolute URL ending in /v1 and kind must be a known provider",
    });
  }
  const config = hostedRewrite(appleRewrite(parsed.data), env);
  if (!config.ok) return config;
  if (!isTrustedInferenceConfig(config.value, env)) {
    return fail({
      code: "untrusted-config",
      message: "This inference endpoint or credential source is not trusted.",
      hint: "Use the OpenAI or OpenUI preset, a loopback local server, or a custom endpoint whose key is entered in Settings → Model; sidecars must be llama-server.",
    });
  }
  return config;
}

/**
 * Apple's model has one shape: the app's bridge, never a server. A config saved when it ran as
 * `fm serve` (loopback :11535 plus an `/usr/bin/fm` sidecar) becomes that shape instead of being
 * refused, so the player's choice survives the move.
 */
function appleRewrite(config: InferenceConfig): InferenceConfig {
  return config.kind === "apple-fm" ? { ...PROVIDER_PRESETS["apple-fm"], sidecar: null } : config;
}

function hostedRewrite(config: InferenceConfig, env: EnvLike): Result<InferenceConfig> {
  if (config.kind !== "hosted") return ok(config);
  const gateway = gatewaySetting(env);
  if (!gateway.ok) return gateway;
  if (gateway.value === null) return fail(gatewayNotConfigured());
  return ok({
    ...config,
    baseUrl: gateway.value,
    apiKeyEnv: TRUSTED_API_KEY_ENVS.hosted,
    sidecar: null,
  });
}

export function gatewayNotConfigured(): AppError {
  return {
    code: "gateway-not-configured",
    message: "This build has no generation gateway configured.",
    hint: "Set UNMAPPED_GATEWAY_URL in .env to the gateway's address and restart, or use your own key or a local model in Settings → Model.",
  };
}

/** Never rejects: an unreadable or invalid file yields the default so the app can still boot. */
export async function loadConfig(
  userData: string,
  env: EnvLike = process.env,
  hasAppleFm = false,
): Promise<InferenceConfig> {
  try {
    const text = await readFile(configPath(userData), "utf8");
    const parsed = parseConfig(JSON.parse(text) as unknown, env);
    return parsed.ok ? parsed.value : defaultConfig(env, hasAppleFm);
  } catch {
    return defaultConfig(env, hasAppleFm);
  }
}

export async function saveConfig(
  userData: string,
  config: InferenceConfig,
): Promise<Result<InferenceConfig>> {
  const validated = parseConfig(config);
  if (!validated.ok) return validated;
  const path = configPath(userData);
  try {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, `${JSON.stringify(validated.value, null, 2)}\n`, "utf8");
    return ok(validated.value);
  } catch (e) {
    const error = toError(e, "config-write-failed");
    return fail({ ...error, hint: `could not write ${path} — check the userData directory` });
  }
}
