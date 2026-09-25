// Where the player stands on open land, honestly: unwritten (未記), being witnessed (顯影中),
// written (已記) with the name the locals gave it, or failed with the reason and a retry. When
// nothing can be witnessed at all the reason is shown instead of pretending the land is empty.

import { useEngineStore, useInferenceStore, useLandStore, useSessionStore } from "@renderer/state";
import { Button, space, Text } from "@renderer/ui";
import { chunkKey } from "@shared/chunks";
import type { JSX } from "react";
import { retryWitness, witnessBlocker } from "../land/witness";

export function LandStatus(): JSX.Element | null {
  const chunk = useEngineStore((state) => state.chunk);
  const status = useLandStore((state) =>
    chunk === null ? undefined : state.chunks[chunkKey(chunk)],
  );
  // Subscribed only so the blocker below is re-read when any of its inputs change.
  useLandStore((state) => state.load);
  useInferenceStore((state) => state.probe);
  useInferenceStore((state) => state.config);
  useSessionStore((state) => state.activeInstance);
  if (chunk === null) return null;

  if (status?.status === "written") {
    return (
      <Text variant="caption" tone="accent">
        {`已記 WRITTEN · ${status.scene.name}`}
      </Text>
    );
  }
  if (status?.status === "writing") {
    return (
      <Text variant="caption" tone="accent">
        顯影中 WITNESSING…
      </Text>
    );
  }
  if (status?.status === "failed") {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: space.xs }}>
        <Text variant="caption" tone="danger">
          {`失敗 FAILED · ${status.error.message}`}
        </Text>
        <Button variant="secondary" onClick={() => retryWitness(chunk)}>
          Retry witnessing
        </Button>
      </div>
    );
  }
  const blocker = witnessBlocker();
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <Text variant="caption" tone="muted">
        未記 UNWRITTEN
      </Text>
      {blocker === null ? null : (
        <Text variant="caption" tone="dim">
          {`${blocker.message} ${blocker.hint ?? ""}`}
        </Text>
      )}
    </div>
  );
}
