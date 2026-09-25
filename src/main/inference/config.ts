// InferenceConfig persistence: `<userData>/inference.json`, zod-validated on every read and write.
// A missing or corrupt file is not an error — it falls back to the default provider so the app
// still boots (Rule 5: errors are values, and this one has an obvious recovery).

import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
  APPLE_FM_BINARY,
  APPLE_FM_SIDECAR,
  type InferenceConfig,
  LLAMA_SERVER_PATHS,
  PROVIDER_KINDS,
  PROVIDER_PRESETS,
  type SidecarConfig,
} from "@shared/llm";
import { fail, ok, type Result, toError } from "@shared/result";
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
} as const;

/** Main-owned Homebrew locations; a same-named executable elsewhere is not trusted. */
const TRUSTED_SIDECAR_PATHS = new Set<string>([...LLAMA_SERVER_PATHS, APPLE_FM_BINARY]);

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
 * The renderer may choose a provider preset or a custom no-auth endpoint, but it must not choose
 * where a main-process environment secret is sent. Cloud keys are paired with their exact known
 * endpoint; local providers stay on loopback; custom endpoints are intentionally keyless.
 */
export function isTrustedInferenceConfig(config: InferenceConfig): boolean {
  if (config.kind === "openai") {
    if (config.apiKeyEnv !== TRUSTED_API_KEY_ENVS.openai) return false;
    if (!sameEndpoint(config.baseUrl, PROVIDER_PRESETS.openai.baseUrl)) return false;
  } else if (config.kind === "openui-gateway") {
    if (config.apiKeyEnv !== TRUSTED_API_KEY_ENVS["openui-gateway"]) return false;
    if (!sameEndpoint(config.baseUrl, PROVIDER_PRESETS["openui-gateway"].baseUrl)) return false;
  } else if (
    config.kind === "llamacpp" ||
    config.kind === "ollama" ||
    config.kind === "vllm" ||
    config.kind === "apple-fm"
  ) {
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
 * Cloud when a key is already in the environment, otherwise the local llama.cpp sidecar.
 * An env var that exists but is empty counts as absent — an empty key cannot authenticate.
 */
export function defaultConfig(
  env: EnvLike = process.env,
  hasAppleFm: boolean = existsSync(APPLE_FM_BINARY),
): InferenceConfig {
  const key = env.OPENAI_API_KEY;
  if (typeof key === "string" && key.length > 0) {
    return { ...PROVIDER_PRESETS.openai, sidecar: null };
  }
  // No cloud key: the on-device Apple model when this Mac has it, else a local llama.cpp.
  if (hasAppleFm) return { ...PROVIDER_PRESETS["apple-fm"], sidecar: { ...APPLE_FM_SIDECAR } };
  return { ...PROVIDER_PRESETS.llamacpp, sidecar: { ...DEFAULT_SIDECAR } };
}

/** Validates an untrusted payload (disk contents or an IPC message from the renderer). */
export function parseConfig(raw: unknown): Result<InferenceConfig> {
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
  if (!isTrustedInferenceConfig(parsed.data)) {
    return fail({
      code: "untrusted-config",
      message: "This inference endpoint or credential source is not trusted.",
      hint: "Use the OpenAI or OpenUI preset, a loopback local server, or a custom endpoint whose key is entered in Settings → Model; sidecars must be llama-server or Apple's fm.",
    });
  }
  return ok(parsed.data);
}

/** Never rejects: an unreadable or invalid file yields the default so the app can still boot. */
export async function loadConfig(
  userData: string,
  env: EnvLike = process.env,
): Promise<InferenceConfig> {
  try {
    const text = await readFile(configPath(userData), "utf8");
    const parsed = parseConfig(JSON.parse(text) as unknown);
    return parsed.ok ? parsed.value : defaultConfig(env);
  } catch {
    return defaultConfig(env);
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
