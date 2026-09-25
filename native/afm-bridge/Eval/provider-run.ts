// Live main-process integration smoke: TypeScript provider -> persistent Swift helper -> AFM ->
// SceneArtifactService. This complements run.ts, which probes the raw native protocol corpus.

import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createManagedAppleLocalSceneProvider } from "../../../src/main/inference/appleLocalHelper";
import { SceneArtifactService } from "../../../src/main/inference/sceneArtifactService";
import type { SceneIntent, SceneState } from "../../../src/shared/scene-generation";

const here = fileURLToPath(new URL(".", import.meta.url));
const provider = createManagedAppleLocalSceneProvider({
  helperPath: resolve(here, "../.build/debug/afm-bridge"),
});

try {
  const capabilities = await provider.capabilities();
  if (!capabilities.ok || !capabilities.value.available) {
    throw new Error(
      capabilities.ok
        ? `apple-local unavailable: ${capabilities.value.unavailableReason ?? "unknown"}`
        : `${capabilities.error.code}: ${capabilities.error.message}`,
    );
  }

  const intent: SceneIntent = {
    requestId: "provider-live-smoke",
    purpose: "new-room",
    sceneId: "provider-live-smoke",
    brief: "A quiet roadside shrine. Inspect one altar, then leave through the only exit.",
    language: "en-US",
  };
  const state: SceneState = {
    worldPlan: null,
    currentScene: null,
    flags: {},
    inventory: [],
    assetCatalog: [],
    capabilityProfile: { entries: [] },
  };
  const phases: string[] = [];
  const artifact = await new SceneArtifactService([provider]).generateScene(intent, state, {
    signal: new AbortController().signal,
    maxRepairAttempts: 1,
    onEvent: (event) => phases.push(event.type === "progress" ? `progress:${event.phase}` : event.type),
  });
  if (!artifact.ok) throw new Error(`${artifact.error.code}: ${artifact.error.message}`);

  console.log(
    JSON.stringify(
      {
        provider: capabilities.value,
        phases,
        artifact: {
          sceneId: artifact.value.ast.sceneId,
          eventCount: artifact.value.ast.eventPlan.events.length,
          sourceLines: artifact.value.source.split("\n").length,
          validation: artifact.value.validation,
        },
      },
      null,
      2,
    ),
  );
} finally {
  await provider.close();
}
