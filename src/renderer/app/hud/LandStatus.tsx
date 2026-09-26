// Where the player stands on open land, only when something is happening there right now: the
// land being drawn (with Stop), a drawing that failed (with Try again), a friend drawing it, a reason
// nothing can be drawn (other than the missing or unreachable AI, which the top-right card names
// once, with where to fix it), this device's refused entries, a rumor batch that failed, and — on
// another world's land — whose land it is. A quiet, already drawn place shows nothing: the goal
// above is what the player reads. Legends, mist and other tellings live in the notes panel (N).

import { errorLine, useT } from "@renderer/i18n";
import {
  type ForeignWorld,
  foreignAt,
  useContinentStore,
  useEngineStore,
  useHistoryStore,
  useInferenceStore,
  useLandStore,
  useSessionStore,
} from "@renderer/state";
import { Button, ErrorBlock, space, Text } from "@renderer/ui";
import { type ChunkCoord, chunkKey } from "@shared/chunks";
import type { JSX } from "react";
import { useRumorJobs } from "../land/rumors";
import { cancelWitness, retryWitness, WITNESS_CANCELLED, witnessBlocker } from "../land/witness";

/** Blockers the player needs no line for here: a moment's wait, or the AI the top-right names. */
const QUIET_BLOCKERS: ReadonlySet<string> = new Set([
  "witness-loading",
  "world-loading",
  "witness-no-model",
  "witness-model-offline",
]);

/** This device's entries the world refused, until they are dismissed at the door (Rule 2). */
function RefusedLine(): JSX.Element | null {
  const t = useT();
  const refused = useHistoryStore((state) =>
    state.world.status === "ready" ? state.world.value.refused.length : 0,
  );
  return refused === 0 ? null : (
    <Text variant="caption" tone="danger">
      {t("traces.refusedHud", { n: refused })}
    </Text>
  );
}

/** The last rumor batch's failure for the open world (its progress is background work). */
function RumorFailure(): JSX.Element | null {
  const { failure } = useRumorJobs();
  const worldId = useHistoryStore((state) =>
    state.world.status === "ready" ? state.world.value.worldId : null,
  );
  if (worldId === null || failure === null || failure.worldId !== worldId) return null;
  return <ErrorBlock error={failure.error} />;
}

function OwnLand({ chunk }: { chunk: ChunkCoord }): JSX.Element | null {
  const status = useLandStore((state) => state.chunks[chunkKey(chunk)]);
  const elsewhere = useLandStore((state) => {
    const developing = state.developing[`chunk:${chunk.cx},${chunk.cz}`];
    return developing !== undefined && !developing.mine;
  });
  // Subscribed only so the blocker below is re-read when any of its inputs change.
  useLandStore((state) => state.load);
  useInferenceStore((state) => state.probe);
  useInferenceStore((state) => state.config);
  useSessionStore((state) => state.activeInstance);
  useHistoryStore((state) => state.world);
  const t = useT();

  if (status?.status === "writing") {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: space.sm, flexWrap: "wrap" }}>
        <Text variant="body" tone="muted" style={{ flex: 1 }}>
          {t("hud.landWitnessing")}
        </Text>
        <Button variant="ghost" onClick={cancelWitness}>
          {t("hud.cancelWitness")}
        </Button>
      </div>
    );
  }
  if (status?.status === "failed") {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: space.xs }}>
        {status.error.code === WITNESS_CANCELLED ? (
          <Text variant="caption" tone="muted">
            {t("hud.witnessCancelled")}
          </Text>
        ) : (
          <Text variant="caption" tone="danger">
            {t("hud.landFailed", { reason: errorLine(status.error) })}
          </Text>
        )}
        <Button variant="secondary" onClick={() => retryWitness(chunk)}>
          {t("hud.retryWitness")}
        </Button>
      </div>
    );
  }
  if (elsewhere) {
    return (
      <Text variant="body" tone="muted">
        {t("landHistory.writingElsewhere")}
      </Text>
    );
  }
  if (status?.status === "written") return null;
  const blocker = witnessBlocker();
  if (blocker === null || QUIET_BLOCKERS.has(blocker.code)) return null;
  return (
    <Text variant="caption" tone="dim">
      {errorLine(blocker)}
    </Text>
  );
}

/** Another world's land: whose it is, and what is happening there; never drawn from here. */
function ForeignLand({ chunk, world }: { chunk: ChunkCoord; world: ForeignWorld }): JSX.Element {
  const status = useContinentStore((state) => state.chunks[chunkKey(chunk)]);
  const t = useT();
  const title = world.title.trim().length > 0 ? world.title : t("continent.untitled");
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <Text variant="caption" tone="muted">
        {t("continent.foreignLand", { owner: world.owner, title })}
      </Text>
      {status?.status === "writing" ? (
        <Text variant="caption" tone="muted">
          {t("hud.landWitnessing")}
        </Text>
      ) : status?.status === "failed" ? (
        <Text variant="caption" tone="danger">
          {t("hud.landFailed", { reason: errorLine(status.error) })}
        </Text>
      ) : status?.status === "written" ? null : (
        <Text variant="caption" tone="dim">
          {t("continent.foreignUnwritten", { owner: world.owner })}
        </Text>
      )}
    </div>
  );
}

export function LandStatus(): JSX.Element | null {
  const chunk = useEngineStore((state) => state.chunk);
  // Subscribed so whose land this is is re-read whenever the continent changes.
  useContinentStore((state) => state.territory);
  useContinentStore((state) => state.worlds);
  if (chunk === null) return null;
  const foreign = foreignAt(chunk);
  if (foreign !== null) return <ForeignLand chunk={chunk} world={foreign} />;
  return (
    <>
      <OwnLand chunk={chunk} />
      <RefusedLine />
      <RumorFailure />
    </>
  );
}
