// Another world's door on the continent (plan.md §8): whose it is, where it stands, what is on its
// shelf, and its dials. Turned from here, a place dial walks to that place on the shared land (its
// coordinates shifted into this world's) and a door number brings this world onto that continent.

import { type Translate, translate, useT } from "@renderer/i18n";
import { joinContinentByCode } from "@renderer/net/continentActions";
import {
  type ForeignWorld,
  useContinentStore,
  useEngineStore,
  useSessionStore,
} from "@renderer/state";
import { Button, Surface, space, Text, zIndex } from "@renderer/ui";
import type { ChunkCoord } from "@shared/chunks";
import type { DoorSlot } from "@shared/land";
import type { JSX } from "react";
import { continentOk } from "./ContinentSection";
import { currentDoorArrival } from "./doorArrival";

/** One of their place dials, in this world's chunk coordinates. */
function localChunk(slot: { cx: number; cz: number }, world: ForeignWorld): ChunkCoord {
  return { cx: slot.cx + world.shift.cx, cz: slot.cz + world.shift.cz };
}

function travel(slot: DoorSlot, world: ForeignWorld): void {
  const continent = useContinentStore.getState();
  if (slot.kind === "room") {
    if (continentOk(joinContinentByCode(slot.code))) continent.openDoorCard(null);
    return;
  }
  const point = currentDoorArrival(localChunk(slot, world), undefined, world.worldId);
  if (point === null) {
    useSessionStore.getState().toast("danger", translate("land.doorNoLanding"));
    return;
  }
  continent.openDoorCard(null);
  useEngineStore.getState().requestTeleport(...point);
}

function dialLabel(slot: DoorSlot, world: ForeignWorld, t: Translate): string {
  if (slot.kind === "room") return t("land.doorOf", { code: slot.code });
  const here = localChunk(slot, world);
  return `${slot.label} (${here.cx} · ${here.cz})`;
}

function Dials({ world }: { world: ForeignWorld }): JSX.Element {
  const t = useT();
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: space.xs }}>
      {world.slots.map((slot, index) => (
        <div
          // biome-ignore lint/suspicious/noArrayIndexKey: the dials are positions
          key={index}
          style={{ display: "flex", alignItems: "center", gap: space.sm }}
        >
          <Text variant="label" tone="muted">
            {t("land.dial", { n: index + 1 })}
          </Text>
          <Text variant="body" style={{ flex: 1 }}>
            {slot === null ? t("land.dialEmpty") : dialLabel(slot, world, t)}
          </Text>
          {slot === null ? null : (
            <Button variant="secondary" onClick={() => travel(slot, world)}>
              {t("land.go")}
            </Button>
          )}
        </div>
      ))}
    </div>
  );
}

export function ForeignDoorCard(): JSX.Element | null {
  const t = useT();
  const worldId = useContinentStore((state) => state.doorCard);
  const world = useContinentStore(
    (state) => state.worlds.find((one) => one.worldId === state.doorCard) ?? null,
  );
  if (worldId === null) return null;
  const close = (): void => useContinentStore.getState().openDoorCard(null);

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: zIndex.overlay,
        pointerEvents: "none",
      }}
    >
      <Surface
        variant="card"
        padding="lg"
        style={{
          width: "min(560px, 92%)",
          maxHeight: "86%",
          overflowY: "auto",
          pointerEvents: "auto",
        }}
      >
        {world === null ? (
          <Text variant="body" tone="dim">
            {t("continent.gone")}
          </Text>
        ) : (
          <>
            <Text variant="title" as="h2">
              {t("continent.doorOf", { owner: world.owner })}
            </Text>
            <Text variant="body">
              {world.title.trim().length > 0 ? world.title : t("continent.untitled")}
            </Text>
            <Text variant="caption" tone="muted">
              {t("continent.offset", { cx: world.anchor.cx, cz: world.anchor.cz })}
            </Text>
            <Text variant="caption" tone={world.online ? "success" : "dim"}>
              {world.online ? t("continent.online") : t("continent.offline")}
            </Text>

            <Text variant="label" tone="muted">
              {t("continent.shelf")}
            </Text>
            {world.keepsakes.length === 0 ? (
              <Text variant="caption" tone="dim">
                {t("continent.shelfEmpty")}
              </Text>
            ) : (
              <Text variant="body">{world.keepsakes.join(" · ")}</Text>
            )}

            <Text variant="label" tone="muted">
              {t("continent.dials")}
            </Text>
            <Dials world={world} />
          </>
        )}
        <Button variant="ghost" onClick={close}>
          {t("common.close")}
        </Button>
      </Surface>
    </div>
  );
}
