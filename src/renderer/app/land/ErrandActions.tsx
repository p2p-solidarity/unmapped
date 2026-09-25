// The errand part of a witnessed resident's card: accept, progress, report. Everything shown is
// the stored errand and the save's progress; nothing here asks a model.

import { useLandStore } from "@renderer/state";
import { Button, space, Text } from "@renderer/ui";
import type { JSX } from "react";
import { acceptErrand, errandOf, reportErrand } from "./errands";

export function ErrandActions({ npcId }: { npcId: string }): JSX.Element | null {
  // Re-render when progress or the land changes; the view itself is derived below.
  useLandStore((state) => state.progress);
  useLandStore((state) => state.chunks);
  const view = errandOf(npcId);
  if (view === null) return null;
  const goal =
    view.errand.kind === "find"
      ? `Search ${view.bearing ?? "nearby"} of them.`
      : `Go to ${view.placeName ?? "the place they named"}.`;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: space.xs }}>
      <Text variant="label" tone="accent">
        {view.stage === "done" ? "Errand · done" : "Errand"}
      </Text>
      <Text variant="body">{view.errand.ask}</Text>
      {view.stage === null ? (
        <Button variant="secondary" fullWidth onClick={() => acceptErrand(view)}>
          Accept the errand
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
          {view.keepsake === null ? "Report back" : `Report back · receive ${view.keepsake.name}`}
        </Button>
      ) : null}
    </div>
  );
}
