// Renderer half of the streaming bridge. It never sees a base URL or an API key — only a request
// id and the ChatEvents that come back on it. The listener is attached BEFORE the invoke so a
// fast local model cannot emit its first delta into the void.

import { useInferenceStore } from "@renderer/state/inferenceStore";
import type { ChatEvent, ChatRequest, ChatUsage, ToolCall } from "@shared/llm";
import { fail, ok, type Result } from "@shared/result";

/** Long enough for a 4B model to write a whole floor on CPU, short enough to not hang forever. */
export const CHAT_TIMEOUT_MS = 120_000;

export interface ChatCompletion {
  text: string;
  /** Tool calls the model emitted this step; empty when it answered in prose. */
  toolCalls: ToolCall[];
  usage: ChatUsage | null;
}

export async function abortChat(id: string): Promise<void> {
  await window.seed.inference.abort(id);
}

export interface ChatOptions {
  /** Aborting stops the provider stream and resolves with a `cancelled` error. */
  signal?: AbortSignal;
  timeoutMs?: number;
}

export function chat(
  request: Omit<ChatRequest, "id">,
  onDelta?: (text: string) => void,
  options: ChatOptions = {},
): Promise<Result<ChatCompletion>> {
  const id = crypto.randomUUID();
  const timeoutMs = options.timeoutMs ?? CHAT_TIMEOUT_MS;
  useInferenceStore.getState().beginRequest();

  return new Promise<Result<ChatCompletion>>((resolve) => {
    let settled = false;
    let streamed = "";
    let unsubscribe: (() => void) | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const onAbort = (): void => {
      void abortChat(id);
      finish(fail({ code: "cancelled", message: "The request was cancelled." }));
    };

    function finish(result: Result<ChatCompletion>): void {
      if (settled) return;
      settled = true;
      if (timer !== null) clearTimeout(timer);
      options.signal?.removeEventListener("abort", onAbort);
      unsubscribe?.();
      useInferenceStore.getState().endRequest();
      resolve(result);
    }

    timer = setTimeout(() => {
      void abortChat(id);
      finish(
        fail({
          code: "timeout",
          message: `The model produced nothing usable within ${timeoutMs / 1000}s.`,
          hint: "try a smaller model, a shorter context, or check the provider in Settings",
        }),
      );
    }, timeoutMs);
    if (options.signal?.aborted === true) {
      onAbort();
      return;
    }
    options.signal?.addEventListener("abort", onAbort, { once: true });

    unsubscribe = window.seed.inference.onEvent((event: ChatEvent) => {
      if (event.id !== id) return;
      switch (event.type) {
        case "delta":
          streamed += event.text;
          onDelta?.(event.text);
          return;
        case "done":
          finish(
            ok({
              text: event.text.length > 0 ? event.text : streamed,
              toolCalls: event.toolCalls,
              usage: event.usage,
            }),
          );
          return;
        case "error":
          finish(fail(event.error));
      }
    });

    void window.seed.inference
      .chat({ id, ...request })
      .then((started) => {
        if (!started.ok) finish(fail(started.error));
      })
      .catch((e: unknown) => {
        finish(
          fail({
            code: "ipc-failed",
            message: e instanceof Error ? e.message : String(e),
            hint: "the main process did not accept the chat request",
          }),
        );
      });
  });
}
