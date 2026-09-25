// Renderer client for the main-owned scene artifact pipeline. It subscribes before invoking so a
// fast local model cannot emit progress into the void, and abort always crosses the IPC boundary.

import { translate } from "@renderer/i18n";
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
      return translate("create.genChoosingModel");
    case "progress":
      if (event.phase === "events") return translate("create.genPlanning");
      if (event.phase === "layout") return translate("create.genLayout");
      return event.message ?? translate("create.genPhase", { phase: event.phase });
    case "partial":
      return translate("create.genChecking");
    case "provider-fallback":
      return translate("create.genTrying", { name: event.to });
    case "completed":
      return translate("create.genReady");
    case "cancelled":
      return translate("create.genCancelled");
    case "error":
      return null;
  }
}
