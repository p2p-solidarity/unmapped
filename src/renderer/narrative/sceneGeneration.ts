// Renderer client for the main-owned scene artifact pipeline. It subscribes before invoking so a
// fast local model cannot emit progress into the void, and abort always crosses the IPC boundary.

import { fail, type Result } from "@shared/result";
import type {
  GenerationEvent,
  SceneArtifact,
  SceneGenerationRequest,
} from "@shared/scene-generation";

export function generateSceneArtifact(
  request: SceneGenerationRequest,
  onEvent?: (event: GenerationEvent) => void,
  signal?: AbortSignal,
): Promise<Result<SceneArtifact>> {
  const { requestId } = request.intent;
  return new Promise((resolve) => {
    let settled = false;
    const finish = (result: Result<SceneArtifact>): void => {
      if (settled) return;
      settled = true;
      unsubscribe();
      signal?.removeEventListener("abort", abort);
      resolve(result);
    };
    const unsubscribe = window.seed.inference.onSceneEvent((event) => {
      if (event.requestId === requestId) onEvent?.(event);
    });
    const abort = (): void => {
      void window.seed.inference.cancelScene(requestId);
    };
    signal?.addEventListener("abort", abort, { once: true });
    if (signal?.aborted) {
      finish(fail({ code: "request-aborted", message: "Scene generation was cancelled." }));
      return;
    }
    void window.seed.inference
      .generateScene(request)
      .then(finish)
      .catch((cause: unknown) => {
        finish(
          fail({
            code: "ipc-failed",
            message: cause instanceof Error ? cause.message : String(cause),
            hint: "The main process did not accept the scene generation request.",
          }),
        );
      });
  });
}

export function generationEventLabel(event: GenerationEvent): string | null {
  switch (event.type) {
    case "started":
    case "provider-selected":
      return "Choosing the local scene model…";
    case "progress":
      if (event.phase === "events") return "Planning what happens here…";
      if (event.phase === "layout") return "Laying out the room…";
      return event.message ?? `Generating scene · ${event.phase}`;
    case "partial":
      return "Checking the generated scene…";
    case "provider-fallback":
      return `Trying ${event.to}…`;
    case "completed":
      return "Scene ready.";
    case "cancelled":
      return "Generation cancelled.";
    case "error":
      return null;
  }
}
