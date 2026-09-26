// The door at home (plan.md §7): four dials, each pinned to a place the player has witnessed or to a
// friend's door number. Turning to a place walks through to it; turning to a number brings this world
// onto the continent behind that friend's door (plan.md §8). Keepsakes carried home are set on the
// shelf here. The world's own door (sharing, who may come in, invites, people) is ./WorldDoorSection.

import { translate, useT } from "@renderer/i18n";
import { normalizeRoomCode, ROOM_CODE_LENGTH } from "@renderer/net/codes";
import { joinContinentByCode } from "@renderer/net/continentActions";
import { useEngineStore, useLandStore, useSessionStore, useWorldStore } from "@renderer/state";
import { Button, Surface, space, Text, TextField, zIndex } from "@renderer/ui";
import type { DoorSlot } from "@shared/land";
import { type JSX, useState } from "react";
import { ContinentSection, continentOk } from "./ContinentSection";
import { currentDoorArrival } from "./doorArrival";
import { WorldDoorSection } from "./WorldDoorSection";

function travel(slot: DoorSlot): void {
  if (slot.kind === "room") {
    if (continentOk(joinContinentByCode(slot.code))) useSessionStore.getState().closeDoor();
    return;
  }
  const point = currentDoorArrival(slot, undefined, null);
  if (point === null) {
    useSessionStore.getState().toast("danger", translate("land.doorNoLanding"));
    return;
  }
  useSessionStore.getState().closeDoor();
  useEngineStore.getState().requestTeleport(...point);
}

export function DoorPanel(): JSX.Element | null {
  const t = useT();
  const open = useSessionStore((state) => state.doorOpen);
  const progress = useLandStore((state) => state.progress);
  const chunks = useLandStore((state) => state.chunks);
  const items = useWorldStore((state) => state.inventory.items);
  const [dial, setDial] = useState(0);
  const [code, setCode] = useState("");
  if (!open || progress === null) return null;

  const places = Object.entries(chunks).flatMap(([key, chunk]) => {
    if (chunk.status !== "written") return [];
    const [cx = 0, cz = 0] = key.split(",").map(Number);
    if (cx === progress.home.cx && cz === progress.home.cz) return [];
    return [{ kind: "place" as const, cx, cz, label: chunk.scene.name }];
  });
  const keepsakeIds = new Set(
    Object.values(chunks).flatMap((chunk) =>
      chunk.status === "written" ? (chunk.errands?.keepsakes.map((item) => item.id) ?? []) : [],
    ),
  );
  const carried = items.filter((item) => keepsakeIds.has(item.id));

  return (
    <div
      data-layer="door"
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
          width: "min(640px, 92%)",
          maxHeight: "86%",
          overflowY: "auto",
          pointerEvents: "auto",
        }}
      >
        <Text variant="title" as="h2">
          {t("land.door")}
        </Text>
        <div style={{ display: "flex", flexDirection: "column", gap: space.xs }}>
          {progress.door.map((slot, index) => (
            <div
              // biome-ignore lint/suspicious/noArrayIndexKey: the four dials are positions
              key={index}
              style={{ display: "flex", alignItems: "center", gap: space.sm }}
            >
              <Button variant={dial === index ? "primary" : "ghost"} onClick={() => setDial(index)}>
                {t("land.dial", { n: index + 1 })}
              </Button>
              <Text variant="body" style={{ flex: 1 }}>
                {slot === null
                  ? t("land.dialEmpty")
                  : slot.kind === "place"
                    ? `${slot.label} (${slot.cx} · ${slot.cz})`
                    : `${t("land.doorOf", { code: slot.code })} (${slot.code})`}
              </Text>
              {slot !== null ? (
                <>
                  <Button variant="secondary" onClick={() => travel(slot)}>
                    {t("land.go")}
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() => useLandStore.getState().setDoorSlot(index, null)}
                  >
                    {t("land.clear")}
                  </Button>
                </>
              ) : null}
            </div>
          ))}
        </div>

        <Text variant="label" tone="muted">
          {t("land.pinPlace", { n: dial + 1 })}
        </Text>
        {places.length === 0 ? (
          <Text variant="caption" tone="dim">
            {t("land.noPlacesWitnessed")}
          </Text>
        ) : (
          <div style={{ display: "flex", flexWrap: "wrap", gap: space.xs }}>
            {places.map((place) => (
              <Button
                key={`${place.cx},${place.cz}`}
                variant="secondary"
                onClick={() => useLandStore.getState().setDoorSlot(dial, place)}
              >
                {`${place.label} (${place.cx} · ${place.cz})`}
              </Button>
            ))}
          </div>
        )}

        <WorldDoorSection />
        <ContinentSection />
        <div style={{ display: "flex", flexWrap: "wrap", gap: space.sm, alignItems: "flex-end" }}>
          <TextField
            label={t("land.friendDoorCode")}
            value={code}
            maxLength={ROOM_CODE_LENGTH}
            mono
            onChange={(event) => setCode(normalizeRoomCode(event.target.value))}
          />
          <Button
            variant="secondary"
            disabled={code.length !== ROOM_CODE_LENGTH}
            onClick={() =>
              useLandStore
                .getState()
                .setDoorSlot(dial, { kind: "room", code, label: `Door ${code}` })
            }
          >
            {t("land.pinToDial", { n: dial + 1 })}
          </Button>
          <Button
            variant="primary"
            disabled={code.length !== ROOM_CODE_LENGTH}
            onClick={() => {
              if (continentOk(joinContinentByCode(code))) setCode("");
            }}
          >
            {t("continent.walkThrough")}
          </Button>
        </div>

        <Text variant="label" tone="muted">
          {t("land.keepsakes")}
        </Text>
        {carried.length === 0 ? (
          <Text variant="caption" tone="dim">
            {t("land.noKeepsakes")}
          </Text>
        ) : (
          carried.map((item, index) => (
            <Button
              // biome-ignore lint/suspicious/noArrayIndexKey: the same keepsake can be carried twice
              key={`${item.id}-${index}`}
              variant="secondary"
              fullWidth
              onClick={() => {
                const world = useWorldStore.getState();
                const remaining = [...world.inventory.items];
                remaining.splice(remaining.indexOf(item), 1);
                world.setInventory({ ...world.inventory, items: remaining });
                useLandStore.getState().placeKeepsake(item);
              }}
            >
              {t("land.setOnShelf", { name: item.name })}
            </Button>
          ))
        )}
        <Button variant="ghost" onClick={() => useSessionStore.getState().closeDoor()}>
          {t("common.close")}
        </Button>
      </Surface>
    </div>
  );
}
