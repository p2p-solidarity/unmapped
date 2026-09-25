// The ledger, newest first. This is exactly what karma.jsonl holds — the same lines the model is
// given as memory on the next generation.

import { useWorldStore } from "@renderer/state";
import { colors, Surface, space, Text } from "@renderer/ui";
import type { KarmaEntry } from "@shared/world";

function shortTime(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleTimeString();
}

function Entry({ entry }: { entry: KarmaEntry }) {
  return (
    <Surface variant="inset" padding="md" style={{ gap: space.xs }}>
      <Text variant="caption" mono tone="dim">
        {`${shortTime(entry.at)} · floor ${entry.floor} · ${entry.action}${
          entry.npcId === null ? "" : ` · ${entry.npcId}`
        }`}
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

  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <Text variant="label" tone="muted">
          karma.jsonl
        </Text>
        <Text variant="caption" tone="dim">
          {`${karma.length} entr${karma.length === 1 ? "y" : "ies"}`}
        </Text>
      </div>
      {karma.length === 0 ? (
        <Text variant="body" tone="dim">
          Nothing recorded yet.
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
