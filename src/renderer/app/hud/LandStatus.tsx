// Where the player stands on open land, honestly: unwritten (未記), being witnessed (顯影中),
// written (已記) with the name the locals gave it, or failed with the reason and a retry. When
// nothing can be witnessed at all the reason is shown instead of pretending the land is empty.
// On a continent, another world's land says whose it is, and only its owner can witness there.

import { errorLine, useT } from "@renderer/i18n";
import {
  type ContinentStatus,
  type ForeignWorld,
  foreignAt,
  useContinentStore,
  useEngineStore,
  useInferenceStore,
  useLandStore,
  useSessionStore,
} from "@renderer/state";
import { Button, space, Text } from "@renderer/ui";
import { type ChunkCoord, chunkKey } from "@shared/chunks";
import type { JSX } from "react";
import { retryWitness, witnessBlocker } from "../land/witness";

function OwnLand({ chunk }: { chunk: ChunkCoord }): JSX.Element {
  const status = useLandStore((state) => state.chunks[chunkKey(chunk)]);
  // Subscribed only so the blocker below is re-read when any of its inputs change.
  useLandStore((state) => state.load);
  useInferenceStore((state) => state.probe);
  useInferenceStore((state) => state.config);
  useSessionStore((state) => state.activeInstance);
  const t = useT();

  if (status?.status === "written") {
    return (
      <Text variant="caption" tone="accent">
        {t("hud.landWritten", { name: status.scene.name })}
      </Text>
    );
  }
  if (status?.status === "writing") {
    return (
      <Text variant="caption" tone="accent">
        {t("hud.landWitnessing")}
      </Text>
    );
  }
  if (status?.status === "failed") {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: space.xs }}>
        <Text variant="caption" tone="danger">
          {t("hud.landFailed", { reason: errorLine(status.error) })}
        </Text>
        <Button variant="secondary" onClick={() => retryWitness(chunk)}>
          {t("hud.retryWitness")}
        </Button>
      </div>
    );
  }
  const blocker = witnessBlocker();
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <Text variant="caption" tone="muted">
        {t("hud.landUnwritten")}
      </Text>
      {blocker === null ? null : (
        <Text variant="caption" tone="dim">
          {errorLine(blocker)}
        </Text>
      )}
    </div>
  );
}

/** Another world's land: whose it is and what its owner has written; never a witness from here. */
function ForeignLand({ chunk, world }: { chunk: ChunkCoord; world: ForeignWorld }): JSX.Element {
  const status = useContinentStore((state) => state.chunks[chunkKey(chunk)]);
  const t = useT();
  const title = world.title.trim().length > 0 ? world.title : t("continent.untitled");
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <Text variant="caption" tone="muted">
        {t("continent.foreignLand", { owner: world.owner, title })}
      </Text>
      {status?.status === "written" ? (
        <Text variant="caption" tone="accent">
          {t("hud.landWritten", { name: status.scene.name })}
        </Text>
      ) : status?.status === "writing" ? (
        <Text variant="caption" tone="accent">
          {t("hud.landWitnessing")}
        </Text>
      ) : status?.status === "failed" ? (
        <Text variant="caption" tone="danger">
          {t("hud.landFailed", { reason: errorLine(status.error) })}
        </Text>
      ) : (
        <Text variant="caption" tone="dim">
          {t("continent.foreignUnwritten", { owner: world.owner })}
        </Text>
      )}
    </div>
  );
}

function ContinentLine({ status }: { status: ContinentStatus }): JSX.Element | null {
  const t = useT();
  if (status.kind === "off") return null;
  if (status.kind === "error") {
    return (
      <Text variant="caption" tone="danger">
        {t("continent.hudError", { code: status.code, reason: errorLine(status.error) })}
      </Text>
    );
  }
  return (
    <Text variant="caption" tone={status.kind === "live" ? "success" : "muted"}>
      {status.kind === "live"
        ? t("continent.hudLive", { code: status.code, n: status.peers })
        : t("continent.hudConnecting", { code: status.code })}
    </Text>
  );
}

export function LandStatus(): JSX.Element | null {
  const chunk = useEngineStore((state) => state.chunk);
  const continent = useContinentStore((state) => state.status);
  // Subscribed so whose land this is is re-read whenever the continent changes.
  useContinentStore((state) => state.territory);
  useContinentStore((state) => state.worlds);
  if (chunk === null) return null;
  const foreign = foreignAt(chunk);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      {foreign === null ? <OwnLand chunk={chunk} /> : <ForeignLand chunk={chunk} world={foreign} />}
      <ContinentLine status={continent} />
    </div>
  );
}
