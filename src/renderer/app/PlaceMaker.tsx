// "Add a place" in the tweak panel: a side-scrolling course or a grid dungeon written into this land
// right now — no new version, no new run. The model writes what lives there; the entrance appears a
// short walk away (toward the direction the player named, if any).

import { Button, StatePanel, Surface, space, Text, TextField } from "@renderer/ui";
import type { LandPlace, PlaceKind } from "@shared/places";
import { errored, idle, type Loadable, loading } from "@shared/result";
import { type JSX, useState } from "react";
import { createPlace } from "./land/places";

const KINDS: Array<{ kind: PlaceKind; label: string; detail: string }> = [
  {
    kind: "side",
    label: "Side-scroller",
    detail: "Run and jump along one row, platforms to climb, the way out at the far end.",
  },
  {
    kind: "dungeon",
    label: "Dungeon",
    detail: "A first-person grid maze; the far end is somewhere in its corridors.",
  },
];

export function PlaceMaker({ canUse }: { canUse: boolean }): JSX.Element {
  const [kind, setKind] = useState<PlaceKind>("side");
  const [wish, setWish] = useState("");
  const [made, setMade] = useState<Loadable<LandPlace>>(idle());
  const busy = made.status === "loading";

  const make = async (): Promise<void> => {
    setMade(loading());
    const result = await createPlace(kind, wish.trim());
    setMade(result.ok ? { status: "ready", value: result.value } : errored(result.error));
  };

  if (!canUse) {
    return <Text variant="body">Places are added to open land. Open a world with open land.</Text>;
  }
  return (
    <>
      <div style={{ display: "flex", gap: space.sm, flexWrap: "wrap" }}>
        {KINDS.map((one) => (
          <Button
            key={one.kind}
            variant="tile"
            active={kind === one.kind}
            disabled={busy}
            onClick={() => setKind(one.kind)}
            style={{ flex: "1 1 240px" }}
          >
            <span style={{ display: "flex", flexDirection: "column", gap: space.xs }}>
              <Text variant="title">{one.label}</Text>
              <Text variant="caption" tone="muted">
                {one.detail}
              </Text>
            </span>
          </Button>
        ))}
      </div>
      <TextField
        label="What is it? (optional — mention north / south / east / west to choose where)"
        value={wish}
        maxLength={300}
        placeholder="A flooded mine north of here, full of slimes"
        onChange={(event) => setWish(event.target.value)}
      />
      <StatePanel state={made} idleText="" loadingText="Writing the place…">
        {(place) => (
          <Surface variant="inset" padding="md" style={{ gap: space.xs }}>
            <Text variant="bodyLarge" tone="accent">
              {place.title}
            </Text>
            <Text variant="caption" tone="muted">
              Its entrance stands on the land now (chunk {place.cx}, {place.cz}). Walk to its marker
              and press E. It is part of this save: nothing else changed.
            </Text>
          </Surface>
        )}
      </StatePanel>
      <Button variant="primary" disabled={busy} onClick={() => void make()}>
        Add this place
      </Button>
    </>
  );
}
