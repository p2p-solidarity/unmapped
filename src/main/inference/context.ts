// How much a local model can hold. Asked of the running server first (llama-server `/props`,
// Ollama `/api/ps`, vLLM's `max_model_len`), then the sidecar's own ctxSize, then the runtime's
// documented default — marked `assumed` so the screen can say so. Cloud APIs return null: their
// windows dwarf every task here, so nothing is clamped for them.

import {
  APPLE_FM_SIDECAR,
  type ContextWindow,
  type InferenceConfig,
  OLLAMA_ORIGIN,
} from "@shared/llm";
import { isLoopbackEndpoint } from "./config";

const ASK_TIMEOUT_MS = 1500;
/** llama-server's and Ollama's default context when nothing says otherwise. */
const RUNTIME_DEFAULT = 4096;

async function getJson(url: string): Promise<unknown> {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(ASK_TIMEOUT_MS) });
    return response.ok ? ((await response.json()) as unknown) : null;
  } catch {
    return null;
  }
}

function positive(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : null;
}

function origin(baseUrl: string): string | null {
  try {
    return new URL(baseUrl).origin;
  } catch {
    return null;
  }
}

/** llama-server: `/props` → default_generation_settings.n_ctx (the per-request slot size). */
async function llamaProps(baseUrl: string): Promise<number | null> {
  const root = origin(baseUrl);
  if (root === null) return null;
  const body = (await getJson(`${root}/props`)) as {
    default_generation_settings?: { n_ctx?: unknown };
    n_ctx?: unknown;
  } | null;
  return positive(body?.default_generation_settings?.n_ctx) ?? positive(body?.n_ctx);
}

/** vLLM (and some gateways) list `max_model_len` next to each model. */
async function modelsMaxLen(baseUrl: string, model: string): Promise<number | null> {
  const body = (await getJson(`${baseUrl.replace(/\/+$/, "")}/models`)) as {
    data?: { id?: unknown; max_model_len?: unknown }[];
  } | null;
  const entries = Array.isArray(body?.data) ? body.data : [];
  const match = entries.find((entry) => entry?.id === model);
  return positive(match?.max_model_len);
}

/** Ollama reports the context of a model it has loaded; an unloaded one gets its default later. */
async function ollamaLoaded(model: string): Promise<number | null> {
  const body = (await getJson(`${OLLAMA_ORIGIN}/api/ps`)) as {
    models?: { name?: unknown; model?: unknown; context_length?: unknown }[];
  } | null;
  const loaded = Array.isArray(body?.models) ? body.models : [];
  const match = loaded.find((entry) => entry?.name === model || entry?.model === model);
  return positive(match?.context_length);
}

export async function readContextWindow(
  config: InferenceConfig,
  bridgeTokens: number | null = null,
): Promise<ContextWindow | null> {
  switch (config.kind) {
    case "openai":
    case "openui-gateway":
      return null;
    case "apple-fm":
      return { tokens: bridgeTokens ?? APPLE_FM_SIDECAR.ctxSize, source: "model" };
    case "llamacpp": {
      const served = await llamaProps(config.baseUrl);
      if (served !== null) return { tokens: served, source: "server" };
      if (config.sidecar !== null) return { tokens: config.sidecar.ctxSize, source: "sidecar" };
      return { tokens: RUNTIME_DEFAULT, source: "assumed" };
    }
    case "ollama": {
      const loaded = await ollamaLoaded(config.model);
      return loaded === null
        ? { tokens: RUNTIME_DEFAULT, source: "assumed" }
        : { tokens: loaded, source: "server" };
    }
    case "vllm": {
      const served = await modelsMaxLen(config.baseUrl, config.model);
      return served === null
        ? { tokens: RUNTIME_DEFAULT, source: "assumed" }
        : { tokens: served, source: "server" };
    }
    case "custom": {
      // A server on this machine is a local model under another name; a remote one is a cloud.
      if (!isLoopbackEndpoint(config.baseUrl)) return null;
      const served =
        (await llamaProps(config.baseUrl)) ?? (await modelsMaxLen(config.baseUrl, config.model));
      return served === null
        ? { tokens: RUNTIME_DEFAULT, source: "assumed" }
        : { tokens: served, source: "server" };
    }
  }
}
