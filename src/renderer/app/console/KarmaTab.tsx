// The ledger, newest first. This is exactly what karma.jsonl holds — the same lines the model is
// given as memory on the next generation.

import { formatTime, useT } from "@renderer/i18n";
import { useWorldStore } from "@renderer/state";
import { colors, Surface, space, Text } from "@renderer/ui";
import type { KarmaEntry } from "@shared/world";

function Entry({ entry }: { entry: KarmaEntry }) {
  const t = useT();
  const meta = t("console.karmaMeta", {
    time: formatTime(entry.at),
    floor: entry.floor,
    action: entry.action,
  });
  return (
    <Surface variant="inset" padding="md" style={{ gap: space.xs }}>
      <Text variant="caption" mono tone="dim">
        {entry.npcId === null ? meta : `${meta} · ${entry.npcId}`}
      </Text>
      <Text variant="body">{entry.choice}</Text>
      {entry.effect.length > 0 ? (
        <Text variant="caption" tone="muted">
          {entry.effect}
        </Text>
      ) : null}
    </Surface>
  );
}

/** karma.jsonl is append-only, so a line's position from the start is a stable identity. */
function newestFirst(karma: readonly KarmaEntry[]): { key: string; entry: KarmaEntry }[] {
  const rows = karma.map((entry, position) => ({ key: `${position}-${entry.at}`, entry }));
  rows.reverse();
  return rows;
}

export function KarmaTab() {
  const karma = useWorldStore((state) => state.karma);
  const rows = newestFirst(karma);
  const t = useT();

  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <Text variant="label" tone="muted">
          karma.jsonl
        </Text>
        <Text variant="caption" tone="dim">
          {t("console.karmaCount", { n: karma.length })}
        </Text>
      </div>
      {karma.length === 0 ? (
        <Text variant="body" tone="dim">
          {t("console.karmaEmpty")}
        </Text>
      ) : (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: space.sm,
            borderTop: `1px solid ${colors.surfaceBorder}`,
            paddingTop: space.sm,
          }}
        >
          {rows.map((row) => (
            <Entry key={row.key} entry={row.entry} />
          ))}
        </div>
      )}
    </>
  );
}
