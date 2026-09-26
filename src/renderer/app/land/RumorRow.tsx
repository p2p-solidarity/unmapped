// "They say…" (rev 6 phase 3, D14): under a resident's stored words, the rumors a beat gave them
// to pass on — each a line the world's history keeps, in the world's language. Read from the land
// store and the fold; talking never asks the model anything.

import { useT } from "@renderer/i18n";
import { useHistoryStore, useLandStore } from "@renderer/state";
import { space, Text } from "@renderer/ui";
import type { JSX } from "react";
import { rumorsHeardBy } from "./talk";

export function RumorRow({ npcId }: { npcId: string }): JSX.Element | null {
  const t = useT();
  const rumors = useLandStore((state) => state.rumors);
  const world = useHistoryStore((state) => state.world);
  const now = world.status === "ready" ? world.value.now : null;
  const heard = rumorsHeardBy(npcId, rumors, now);
  if (heard.length === 0) return null;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: space.xs }}>
      <Text variant="caption" tone="muted">
        {t("rumors.theySay")}
      </Text>
      {heard.map((rumor) => (
        <Text key={rumor.key} variant="body">
          {rumor.text}
          {rumor.pending ? (
            <Text variant="caption" tone="dim">
              {` · ${t("rumors.notShared")}`}
            </Text>
          ) : null}
        </Text>
      ))}
    </div>
  );
}
