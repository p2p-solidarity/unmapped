// "Add a place" in the tweak panel: a side-scrolling course or a grid dungeon written into this land
// right now — no new version, no new run — or an otherworld (異界), the entrance of one of this
// device's AI worlds. The model writes what lives in a course or a dungeon; an otherworld is picked
// (no model call) or written in the workshop over the land. Every entrance appears a short walk
// away (toward the direction the player named, if any).

import { type StringKey, useT } from "@renderer/i18n";
import { Button, StatePanel, Surface, space, Text, TextField } from "@renderer/ui";
import type { PlaceKind, WrittenPlace, WrittenPlaceKind } from "@shared/places";
import { errored, idle, type Loadable, loading } from "@shared/result";
import { type JSX, useState } from "react";
import { OtherworldPicker } from "./land/OtherworldPicker";
import { createPlace } from "./land/places";

const KINDS: Array<{ kind: PlaceKind; label: StringKey; detail: StringKey }> = [
  { kind: "side", label: "hud.kindSide", detail: "hud.kindSideDetail" },
  { kind: "dungeon", label: "hud.kindDungeon", detail: "hud.kindDungeonDetail" },
  { kind: "otherworld", label: "hud.kindOtherworld", detail: "hud.kindOtherworldDetail" },
];

export function PlaceMaker({ canUse }: { canUse: boolean }): JSX.Element {
  const [kind, setKind] = useState<PlaceKind>("side");
  const [wish, setWish] = useState("");
  const [made, setMade] = useState<Loadable<WrittenPlace>>(idle());
  const busy = made.status === "loading";
  const t = useT();

  const make = async (written: WrittenPlaceKind): Promise<void> => {
    setMade(loading());
    const result = await createPlace(written, wish.trim());
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
            style={{ flex: "1 1 200px" }}
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
      {kind === "otherworld" ? (
        <OtherworldPicker wish={wish} />
      ) : (
        <>
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
          <Button variant="primary" disabled={busy} onClick={() => void make(kind)}>
            {t("hud.addPlace")}
          </Button>
        </>
      )}
    </>
  );
}
