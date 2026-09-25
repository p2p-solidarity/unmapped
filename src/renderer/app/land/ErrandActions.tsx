// The errand part of a witnessed resident's card: accept, progress, report. Everything shown is
// the stored errand and the save's progress; nothing here asks a model.

import { useT } from "@renderer/i18n";
import { useLandStore } from "@renderer/state";
import { Button, space, Text } from "@renderer/ui";
import type { JSX } from "react";
import { acceptErrand, errandOf, reportErrand } from "./errands";

export function ErrandActions({ npcId }: { npcId: string }): JSX.Element | null {
  const t = useT();
  // Re-render when progress or the land changes; the view itself is derived below.
  useLandStore((state) => state.progress);
  useLandStore((state) => state.chunks);
  const view = errandOf(npcId);
  if (view === null) return null;
  const goal =
    view.errand.kind === "find"
      ? t("land.errandSearch", { bearing: view.bearing ?? t("land.errandNearby") })
      : t("land.errandGoTo", { place: view.placeName ?? t("land.errandPlaceNamed") });
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: space.xs }}>
      <Text variant="label" tone="accent">
        {view.stage === "done" ? t("land.errandDone") : t("land.errand")}
      </Text>
      <Text variant="body">{view.errand.ask}</Text>
      {view.stage === null ? (
        <Button variant="secondary" fullWidth onClick={() => acceptErrand(view)}>
          {t("land.errandAccept")}
        </Button>
      ) : null}
      {view.stage === null ? (
        <Text variant="caption" tone="dim">
          {goal}
        </Text>
      ) : null}
      {view.stage === "accepted" ? (
        <Text variant="caption" tone="muted">
          {goal}
        </Text>
      ) : null}
      {view.stage === "reached" ? (
        <Button variant="primary" fullWidth onClick={() => reportErrand(view)}>
          {view.keepsake === null
            ? t("land.errandReport")
            : t("land.errandReportReceive", { name: view.keepsake.name })}
        </Button>
      ) : null}
    </div>
  );
}
