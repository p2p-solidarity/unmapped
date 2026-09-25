// Every `inference:*` channel. Payloads from the renderer are untrusted and zod-validated here
// (Rule 6). A chat invoke resolves as soon as the stream is registered; the tokens themselves
// arrive as `inference:event` broadcasts, and a terminal done/error is ALWAYS emitted — even when
// the request dies before the first token — so the renderer can never hang waiting.

import type { MainContext } from "@main/context";
import { IPC } from "@shared/ipc";
import type {
  ChatEvent,
  ChatRequest,
  ContextWindow,
  InferenceConfig,
  ProbeResult,
  SidecarStatus,
} from "@shared/llm";
import { fail, ok, type Result, toError } from "@shared/result";
import type { GenerationEvent, SceneArtifact } from "@shared/scene-generation";
import { ipcMain } from "electron";
import { z } from "zod";
import { streamChat } from "./client";
import { loadConfig, parseConfig, saveConfig } from "./config";
import { readContextWindow } from "./context";
import { initKeyStore, resolveApiKey } from "./keyStore";
import { registerModelIpc } from "./modelIpc";
import { probe } from "./probe";
import { SceneArtifactService } from "./sceneArtifactService";
import { parseSceneGenerationRequest } from "./sceneGenerationIpc";
import { createSidecar } from "./sidecar";

/** A context window read from a server is trusted this long before it is asked again. */
const CONTEXT_TTL_MS = 60_000;

const MAX_CONTENT = 200_000;

const toolCallSchema = z.object({
  id: z.string().min(1).max(256),
  name: z.string().min(1).max(128),
  arguments: z.string().max(100_000),
});

/** Discriminated on `role` so a tool result cannot arrive without the call id it answers. */
const chatMessageSchema = z.discriminatedUnion("role", [
  z.object({ role: z.literal("system"), content: z.string().max(MAX_CONTENT) }),
  z.object({ role: z.literal("user"), content: z.string().max(MAX_CONTENT) }),
  z.object({
    role: z.literal("assistant"),
    content: z.string().max(MAX_CONTENT),
    toolCalls: z.array(toolCallSchema).max(32).optional(),
  }),
  z.object({
    role: z.literal("tool"),
    content: z.string().max(MAX_CONTENT),
    toolCallId: z.string().min(1).max(256),
    name: z.string().min(1).max(128),
  }),
]);

const toolSchemaSchema = z.object({
  name: z.string().min(1).max(64),
  description: z.string().max(4_000),
  parameters: z.record(z.string(), z.unknown()),
});

const chatRequestSchema = z.object({
  id: z.string().min(1).max(128),
  // A tool turn appends an assistant + tool message per step, so the budget is larger than the
  // single-shot DSL turns needed.
  messages: z.array(chatMessageSchema).min(1).max(128),
  maxTokens: z.number().int().min(1).max(32_768),
  temperature: z.number().min(0).max(2),
  grammar: z.string().max(100_000).nullable(),
  stop: z.array(z.string()).max(8),
  tools: z.array(toolSchemaSchema).max(64),
  minTokens: z.number().int().min(1).max(32_768).optional(),
});

function invalid(what: string): Result<never> {
  return fail({
    code: "invalid-payload",
    message: `Rejected a malformed ${what} from the renderer.`,
    hint: "this is a bug in the calling code, not something the player can fix",
  });
}

export function registerInferenceIpc(ctx: MainContext): void {
  const sidecar = createSidecar(ctx);
  const inflight = new Map<string, AbortController>();
  const sceneInflight = new Map<string, AbortController>();
  const sceneService = new SceneArtifactService(
    ctx.appleLocalProvider === null ? [] : [ctx.appleLocalProvider],
  );
  let cached: InferenceConfig | null = null;
  let contextCache: { key: string; at: number; value: ContextWindow | null } | null = null;
  initKeyStore(ctx.userData);

  async function currentConfig(): Promise<InferenceConfig> {
    if (cached === null) cached = await loadConfig(ctx.userData);
    return cached;
  }

  /** Apple's model reports its own window through the bridge; nothing else needs it. */
  async function bridgeTokens(config: InferenceConfig): Promise<number | null> {
    if (config.kind !== "apple-fm" || ctx.appleLocalProvider === null) return null;
    const capabilities = await ctx.appleLocalProvider.capabilities();
    return capabilities.ok ? capabilities.value.contextTokens : null;
  }

  async function contextFor(
    config: InferenceConfig,
    fresh: boolean,
  ): Promise<ContextWindow | null> {
    const key = JSON.stringify([config.kind, config.baseUrl, config.model, config.sidecar]);
    const hit = contextCache !== null && contextCache.key === key;
    if (!fresh && hit && contextCache !== null && Date.now() - contextCache.at < CONTEXT_TTL_MS) {
      return contextCache.value;
    }
    const value = await readContextWindow(config, await bridgeTokens(config));
    contextCache = { key, at: Date.now(), value };
    return value;
  }

  function emit(event: ChatEvent): void {
    ctx.broadcast(IPC.inference.event, event);
  }

  async function runChat(request: ChatRequest, controller: AbortController): Promise<void> {
    const started = Date.now();
    try {
      const config = await currentConfig();
      const [key, context] = await Promise.all([resolveApiKey(config), contextFor(config, false)]);
      const result = await streamChat(
        config,
        request,
        (text) => emit({ id: request.id, type: "delta", text }),
        controller.signal,
        { apiKey: key?.key ?? null, context },
      );
      // Provider, time and budget only — never a prompt, an answer or a key.
      const head = `[inference] ${result.ok ? "done" : "fail"} ${request.id} · ${config.kind} ${config.model} · ${Date.now() - started} ms`;
      if (result.ok) {
        const { usage, maxTokens } = result.value;
        process.stdout.write(
          `${head} · max ${maxTokens}${usage === null ? "" : ` · ${usage.prompt}+${usage.completion} tokens`}${context === null ? "" : ` · ctx ${context.tokens}`}\n`,
        );
        emit({
          id: request.id,
          type: "done",
          text: result.value.text,
          toolCalls: result.value.toolCalls,
          usage: result.value.usage,
        });
      } else {
        process.stdout.write(`${head} · ${result.error.code}\n`);
        emit({ id: request.id, type: "error", error: result.error });
      }
    } catch (e) {
      emit({ id: request.id, type: "error", error: toError(e, "provider") });
    } finally {
      inflight.delete(request.id);
    }
  }

  ipcMain.handle(IPC.inference.getConfig, async (): Promise<InferenceConfig> => currentConfig());

  ipcMain.handle(IPC.inference.appleLocalCapabilities, async () => {
    if (ctx.appleLocalProvider !== null) return ctx.appleLocalProvider.capabilities();
    return ok({
      providerId: "apple-local" as const,
      available: false,
      locality: "device" as const,
      constraintModes: ["swift-generable" as const],
      contextTokens: null,
      supportsStreaming: false,
      supportsReasoning: false,
      supportedPurposes: ["new-room" as const, "repair-room" as const, "expand-room" as const],
      unavailableReason: "macos_required",
    });
  });

  ipcMain.handle(
    IPC.inference.setConfig,
    async (_event, raw: unknown): Promise<Result<InferenceConfig>> => {
      const validated = parseConfig(raw);
      if (!validated.ok) return validated;
      const saved = await saveConfig(ctx.userData, validated.value);
      if (saved.ok) {
        cached = saved.value;
        contextCache = null;
      }
      return saved;
    },
  );

  // Apple's model has no daemon of its own: a probe starts `fm serve` whenever it is not running.
  // Unaccepted terms make fm exit at once, so the renderer's offline re-probe notices
  // `sudo fm license` within one retry; the reason stays visible as the sidecar's error.
  ipcMain.handle(IPC.inference.probe, async (): Promise<Result<ProbeResult>> => {
    const config = await currentConfig();
    const idle = sidecar.status().state === "stopped" || sidecar.status().state === "error";
    if (config.kind === "apple-fm" && config.sidecar !== null && idle) {
      await sidecar.start(config.sidecar);
    }
    const key = await resolveApiKey(config);
    const reached = await probe(config, key?.key ?? null);
    if (!reached.ok) return reached;
    const context = reached.value.reachable ? await contextFor(config, true) : null;
    return ok({ ...reached.value, context });
  });

  registerModelIpc(ctx);

  ipcMain.handle(IPC.inference.chat, async (_event, raw: unknown): Promise<Result<void>> => {
    const parsed = chatRequestSchema.safeParse(raw);
    if (!parsed.success) return invalid("chat request");
    const request: ChatRequest = parsed.data;
    if (inflight.has(request.id)) {
      return fail({
        code: "duplicate-request",
        message: `A chat with id ${request.id} is already streaming.`,
      });
    }
    const controller = new AbortController();
    inflight.set(request.id, controller);
    // One line per model request, so "talking never calls the model" can be checked from the log.
    process.stdout.write(
      `[inference] chat ${request.id} · ${request.messages.length} messages · ${request.tools.length} tools\n`,
    );
    // Deliberately not awaited: the invoke resolves as soon as the stream is registered so the
    // renderer can start listening; every outcome reaches it as a ChatEvent.
    void runChat(request, controller);
    return ok(undefined);
  });

  ipcMain.handle(IPC.inference.abort, async (_event, raw: unknown): Promise<void> => {
    if (typeof raw !== "string") return;
    inflight.get(raw)?.abort();
  });

  ipcMain.handle(
    IPC.inference.sceneGenerate,
    async (event, raw: unknown): Promise<Result<SceneArtifact>> => {
      const parsed = parseSceneGenerationRequest(raw);
      if (!parsed.ok) return parsed;
      const { intent, state, maxRepairAttempts } = parsed.value;
      if (sceneInflight.has(intent.requestId)) {
        return fail({
          code: "duplicate-request",
          message: `Scene generation ${intent.requestId} is already running.`,
          hint: "Wait for it to finish or cancel it before retrying.",
        });
      }
      const controller = new AbortController();
      sceneInflight.set(intent.requestId, controller);
      const send = (payload: GenerationEvent): void => {
        if (!event.sender.isDestroyed()) event.sender.send(IPC.inference.sceneEvent, payload);
      };
      try {
        const result = await sceneService.generateScene(intent, state, {
          signal: controller.signal,
          maxRepairAttempts,
          // The provider reports its own terminal state before artifact validation. Main owns the
          // public terminal event so the UI only sees completed after every gate passed.
          onEvent: (payload) => {
            if (
              payload.type === "completed" ||
              payload.type === "error" ||
              payload.type === "cancelled"
            ) {
              return;
            }
            send(payload);
          },
        });
        if (result.ok) {
          send({
            type: "completed",
            requestId: intent.requestId,
            providerId: result.value.providerId,
          });
        } else if (controller.signal.aborted || result.error.code === "request-aborted") {
          send({ type: "cancelled", requestId: intent.requestId });
        } else {
          send({ type: "error", requestId: intent.requestId, error: result.error });
        }
        return result;
      } catch (cause) {
        const error = toError(cause, "scene-generation-failed");
        send({ type: "error", requestId: intent.requestId, error });
        return fail(error);
      } finally {
        sceneInflight.delete(intent.requestId);
      }
    },
  );

  ipcMain.handle(IPC.inference.sceneCancel, async (_event, raw: unknown): Promise<Result<void>> => {
    if (typeof raw !== "string" || raw.length === 0 || raw.length > 128) {
      return invalid("scene cancellation request");
    }
    const controller = sceneInflight.get(raw);
    if (controller === undefined) {
      return fail({
        code: "scene-generation-not-found",
        message: "That scene generation request is no longer running.",
      });
    }
    controller.abort();
    return ok(undefined);
  });

  ipcMain.handle(IPC.inference.sidecarStart, async (): Promise<Result<SidecarStatus>> => {
    const config = await currentConfig();
    return sidecar.start(config.sidecar);
  });

  ipcMain.handle(IPC.inference.sidecarStop, async (): Promise<Result<void>> => sidecar.stop());

  ipcMain.handle(IPC.inference.sidecarStatus, async (): Promise<SidecarStatus> => sidecar.status());

  ctx.onBeforeQuit(() => {
    for (const controller of inflight.values()) controller.abort();
    inflight.clear();
    for (const controller of sceneInflight.values()) controller.abort();
    sceneInflight.clear();
  });
}
