// "Add a place" in the tweak panel: a side-scrolling course or a grid dungeon written into this land
// right now — no new version, no new run. The model writes what lives there; the entrance appears a
// short walk away (toward the direction the player named, if any).

import { type StringKey, useT } from "@renderer/i18n";
import { Button, StatePanel, Surface, space, Text, TextField } from "@renderer/ui";
import type { LandPlace, PlaceKind } from "@shared/places";
import { errored, idle, type Loadable, loading } from "@shared/result";
import { type JSX, useState } from "react";
import { createPlace } from "./land/places";

const KINDS: Array<{ kind: PlaceKind; label: StringKey; detail: StringKey }> = [
  { kind: "side", label: "hud.kindSide", detail: "hud.kindSideDetail" },
  { kind: "dungeon", label: "hud.kindDungeon", detail: "hud.kindDungeonDetail" },
];

export function PlaceMaker({ canUse }: { canUse: boolean }): JSX.Element {
  const [kind, setKind] = useState<PlaceKind>("side");
  const [wish, setWish] = useState("");
  const [made, setMade] = useState<Loadable<LandPlace>>(idle());
  const busy = made.status === "loading";
  const t = useT();

  const make = async (): Promise<void> => {
    setMade(loading());
    const result = await createPlace(kind, wish.trim());
    setMade(result.ok ? { status: "ready", value: result.value } : errored(result.error));
  };

  if (!canUse) {
    return <Text variant="body">{t("hud.placeNeedsLand")}</Text>;
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
              <Text variant="title">{t(one.label)}</Text>
              <Text variant="caption" tone="muted">
                {t(one.detail)}
              </Text>
            </span>
          </Button>
        ))}
      </div>
      <TextField
        label={t("hud.placeWishLabel")}
        value={wish}
        maxLength={300}
        placeholder={t("hud.placeWishPlaceholder")}
        onChange={(event) => setWish(event.target.value)}
      />
      <StatePanel state={made} idleText="" loadingText={t("hud.writingPlace")}>
        {(place) => (
          <Surface variant="inset" padding="md" style={{ gap: space.xs }}>
            <Text variant="bodyLarge" tone="accent">
              {place.title}
            </Text>
            <Text variant="caption" tone="muted">
              {t("hud.placeMade", { cx: place.cx, cz: place.cz })}
            </Text>
          </Surface>
        )}
      </StatePanel>
      <Button variant="primary" disabled={busy} onClick={() => void make()}>
        {t("hud.addPlace")}
      </Button>
    </>
  );
}
