// What can run a model on this computer, looked up live every time the player asks (never cached,
// never guessed): Apple's Foundation Models through the app's own bridge, an Ollama server on its
// default port, and a Homebrew llama-server in one of the paths main is allowed to spawn.

import { existsSync } from "node:fs";
import { LLAMA_SERVER_PATHS, type LocalDetection, OLLAMA_ORIGIN } from "@shared/llm";
import type { AppleChat } from "./appleChat";

const OLLAMA_TIMEOUT_MS = 1500;

async function appleStatus(bridge: AppleChat | null): Promise<LocalDetection["apple"]> {
  if (bridge === null) return { available: false, reason: "macos_required", contextTokens: null };
  const status = await bridge.chatStatus();
  if (!status.ok) return { available: false, reason: status.error.code, contextTokens: null };
  return status.value;
}

async function ollamaStatus(): Promise<LocalDetection["ollama"]> {
  const started = Date.now();
  try {
    const response = await fetch(`${OLLAMA_ORIGIN}/api/tags`, {
      signal: AbortSignal.timeout(OLLAMA_TIMEOUT_MS),
    });
    if (!response.ok) return { reachable: false, models: [], latencyMs: Date.now() - started };
    const body = (await response.json()) as { models?: { name?: unknown }[] } | null;
    const models = (Array.isArray(body?.models) ? body.models : [])
      .map((entry) => entry?.name)
      .filter((name): name is string => typeof name === "string" && name.length > 0);
    return { reachable: true, models, latencyMs: Date.now() - started };
  } catch {
    return { reachable: false, models: [], latencyMs: Date.now() - started };
  }
}

export async function detectLocal(bridge: AppleChat | null): Promise<LocalDetection> {
  const [apple, ollama] = await Promise.all([appleStatus(bridge), ollamaStatus()]);
  const binaryPath = LLAMA_SERVER_PATHS.find((path) => existsSync(path)) ?? null;
  return { apple, ollama, llamacpp: { binaryPath } };
}
