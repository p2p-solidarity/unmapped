// Reachability probe: GET <baseUrl>/models with a short timeout. A server that is down is data,
// not an exception — the UI needs `reachable: false` plus a latency to show, never a throw.

import type { InferenceConfig, ProbeResult } from "@shared/llm";
import { ok, type Result } from "@shared/result";

/** The first request out of a cold main process pays DNS and TLS; 3 s was not always enough. */
export const PROBE_TIMEOUT_MS = 8000;

interface ModelsBody {
  data?: { id?: unknown; owned_by?: unknown }[];
}

export interface ServerHints {
  baseUrl: string;
  /** Value of the `server` response header (llama.cpp and vLLM both set it). */
  serverHeader: string | null;
  /** `owned_by` of the first model entry — the most reliable discriminator. */
  ownedBy: string | null;
  models: string[];
}

/** A model id that can only come from a local file-backed server. */
function looksLocal(id: string): boolean {
  const lower = id.toLowerCase();
  return lower.endsWith(".gguf") || lower.startsWith("/") || lower === "local";
}

export function guessServerName(hints: ServerHints): string | null {
  // "ollama" contains "llama", so it has to be tested first or every ollama box reads as llama.cpp.
  const header = (hints.serverHeader ?? "").toLowerCase();
  if (header.includes("ollama")) return "ollama";
  if (header.includes("vllm")) return "vllm";
  if (header.includes("llama")) return "llama.cpp";

  const owner = (hints.ownedBy ?? "").toLowerCase();
  if (owner.includes("ollama")) return "ollama";
  if (owner.includes("vllm")) return "vllm";
  if (owner.includes("llama")) return "llama.cpp";

  let host = "";
  let port = "";
  try {
    const url = new URL(hints.baseUrl);
    host = url.hostname.toLowerCase();
    port = url.port;
  } catch {
    host = "";
  }
  if (port === "11434") return "ollama";
  if (host.endsWith("openai.com")) return "openai";
  if (hints.models.some(looksLocal)) return "llama.cpp";
  if (owner.includes("openai") || owner === "system") return "openai";
  return null;
}

function modelsUrl(baseUrl: string): string {
  return `${baseUrl.replace(/\/+$/, "")}/models`;
}

function readBody(body: unknown): { models: string[]; ownedBy: string | null } {
  if (typeof body !== "object" || body === null) return { models: [], ownedBy: null };
  const data = (body as ModelsBody).data;
  if (!Array.isArray(data)) return { models: [], ownedBy: null };
  const models: string[] = [];
  let ownedBy: string | null = null;
  for (const entry of data) {
    if (typeof entry?.id === "string") models.push(entry.id);
    if (ownedBy === null && typeof entry?.owned_by === "string") ownedBy = entry.owned_by;
  }
  return { models, ownedBy };
}

export async function probe(
  config: InferenceConfig,
  timeoutMs: number = PROBE_TIMEOUT_MS,
): Promise<Result<ProbeResult>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const startedAt = Date.now();
  const headers: Record<string, string> = { accept: "application/json" };
  const key = config.apiKeyEnv === null ? undefined : process.env[config.apiKeyEnv];
  if (key) headers.authorization = `Bearer ${key}`;

  try {
    const response = await fetch(modelsUrl(config.baseUrl), {
      method: "GET",
      headers,
      signal: controller.signal,
    });
    const serverHeader = response.headers.get("server");
    if (!response.ok) {
      // The socket answered, so the host exists — but we cannot list models, which is what
      // "reachable" means for the UI. Keep whatever the headers told us about the server.
      return ok({
        reachable: false,
        models: [],
        latencyMs: Date.now() - startedAt,
        serverName: guessServerName({
          baseUrl: config.baseUrl,
          serverHeader,
          ownedBy: null,
          models: [],
        }),
      });
    }
    const body = (await response.json()) as unknown;
    const { models, ownedBy } = readBody(body);
    return ok({
      reachable: true,
      models,
      latencyMs: Date.now() - startedAt,
      serverName: guessServerName({ baseUrl: config.baseUrl, serverHeader, ownedBy, models }),
    });
  } catch {
    return ok({
      reachable: false,
      models: [],
      latencyMs: Date.now() - startedAt,
      serverName: null,
    });
  } finally {
    clearTimeout(timer);
  }
}
