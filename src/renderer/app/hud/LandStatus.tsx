// Where the player stands on open land, honestly: unwritten (未記), being witnessed (顯影中),
// written (已記) with the name the locals gave it, or failed with the reason and a retry. When
// nothing can be witnessed at all the reason is shown instead of pretending the land is empty.
// On a continent, another world's land says whose it is, and only its owner can witness there.
// On a world's history (rev 6 phase 3) a chunk also says when it is not shared yet, when this
// device keeps it only in its own old files, and when someone else is writing it right now; a
// chunk in mist (fogged) or fading says so, a legend (傳說) gives its old name, and 異聞 ×n opens
// its other tellings. Each line shows only when there is something to say, so a local-only world
// and a legacy save look as they always did.

import { errorLine, useT } from "@renderer/i18n";
import {
  type ContinentStatus,
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
import { legendName, openVariants, variantCount } from "../land/traces";
import { cancelWitness, retryWitness, WITNESS_CANCELLED, witnessBlocker } from "../land/witness";

/** The lines about how the chunk stands in the world's history; nothing when there are none. */
function HistoryLines({ chunk }: { chunk: ChunkCoord }): JSX.Element | null {
  const t = useT();
  const marks = useLandStore((state) => state.marks[chunkKey(chunk)]);
  const elsewhere = useLandStore((state) => {
    const developing = state.developing[`chunk:${chunk.cx},${chunk.cz}`];
    return developing !== undefined && !developing.mine;
  });
  const lines: string[] = [];
  if (elsewhere) lines.push(t("landHistory.writingElsewhere"));
  if (marks?.fogged === true) lines.push(t("traces.mist"));
  const legend = legendName(marks);
  if (legend !== null) lines.push(t("traces.legend", { name: legend }));
  if (marks?.legacyOnly === true) lines.push(t("landHistory.legacyOnly"));
  if (marks?.provisional === true && !marks.fogged) lines.push(t("landHistory.provisional"));
  if (marks?.fading === true && !marks.fogged) lines.push(t("traces.fading"));
  const variants = variantCount(marks);
  if (lines.length === 0 && variants === 0) return null;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      {lines.map((line) => (
        <Text key={line} variant="caption" tone="dim">
          {line}
        </Text>
      ))}
      {variants === 0 ? null : (
        <Button variant="chip" onClick={openVariants}>
          {t("traces.variants", { n: variants })}
        </Button>
      )}
    </div>
  );
}

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

/** A rumor batch (WP7) being written for the open world, or the last one's failure. */
function RumorLine(): JSX.Element | null {
  const t = useT();
  const { job, failure } = useRumorJobs();
  const worldId = useHistoryStore((state) =>
    state.world.status === "ready" ? state.world.value.worldId : null,
  );
  if (worldId === null) return null;
  if (job !== null && job.worldId === worldId) {
    const stage = {
      claiming: "traces.rumorClaiming",
      writing: "traces.rumorWriting",
      saving: "traces.rumorSaving",
    } as const;
    return (
      <Text variant="caption" tone="muted">
        {t(stage[job.stage])}
      </Text>
    );
  }
  return failure !== null && failure.worldId === worldId ? (
    <ErrorBlock error={failure.error} />
  ) : null;
}

function OwnLand({ chunk }: { chunk: ChunkCoord }): JSX.Element {
  const status = useLandStore((state) => state.chunks[chunkKey(chunk)]);
  // A chunk in mist says so in its history lines instead of "unwritten".
  const fogged = useLandStore((state) => state.marks[chunkKey(chunk)]?.fogged === true);
  // Subscribed only so the blocker below is re-read when any of its inputs change.
  useLandStore((state) => state.load);
  useInferenceStore((state) => state.probe);
  useInferenceStore((state) => state.config);
  useSessionStore((state) => state.activeInstance);
  useHistoryStore((state) => state.world);
  const t = useT();

  if (status?.status === "written") {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <Text variant="caption" tone="accent">
          {t("hud.landWritten", { name: status.scene.name })}
        </Text>
        <HistoryLines chunk={chunk} />
      </div>
    );
  }
  if (status?.status === "writing") {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: space.xs }}>
        <Text variant="caption" tone="accent">
          {t("hud.landWitnessing")}
        </Text>
        <HistoryLines chunk={chunk} />
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
        <HistoryLines chunk={chunk} />
        <Button variant="secondary" onClick={() => retryWitness(chunk)}>
          {t("hud.retryWitness")}
        </Button>
      </div>
    );
  }
  const blocker = witnessBlocker();
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      {fogged ? null : (
        <Text variant="caption" tone="muted">
          {t("hud.landUnwritten")}
        </Text>
      )}
      <HistoryLines chunk={chunk} />
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
      {foreign === null ? <RefusedLine /> : null}
      {foreign === null ? <RumorLine /> : null}
      <ContinentLine status={continent} />
    </div>
  );
}
