// The door's continent section (plan.md §8). Not merged: this world's door number and a button that
// opens the door to friends. Merged: the continent's code (the number to share), how the connection
// stands, this world's offset, every other world on it with a way to its door, and a way back off.

import { errorLine, translate, useT } from "@renderer/i18n";
import { leaveContinent, myPlate, openMyDoor } from "@renderer/net/continentActions";
import {
  type ForeignWorld,
  useContinentStore,
  useEngineStore,
  useSessionStore,
} from "@renderer/state";
import { Button, ErrorBlock, space, Text } from "@renderer/ui";
import { chunkOf } from "@shared/chunks";
import type { Result } from "@shared/result";
import type { JSX } from "react";
import { currentDoorArrival } from "./doorArrival";

/** Toasts a continent action that failed; true when it went through. */
export function continentOk(result: Result<string>): boolean {
  if (result.ok) return true;
  useSessionStore.getState().toast("danger", errorLine(result.error));
  return false;
}

function goToDoor(world: ForeignWorld): void {
  const point = currentDoorArrival(
    chunkOf(world.door.x, world.door.z),
    [world.door.x + 1, world.door.z],
    world.worldId,
  );
  if (point === null) {
    useSessionStore.getState().toast("danger", translate("land.doorNoLanding"));
    return;
  }
  useSessionStore.getState().closeDoor();
  useEngineStore.getState().requestTeleport(...point);
}

function WorldRow({ world }: { world: ForeignWorld }): JSX.Element {
  const t = useT();
  return (
    <div style={{ display: "flex", alignItems: "center", gap: space.sm }}>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 2 }}>
        <Text variant="body">
          {t("continent.worldLine", {
            owner: world.owner,
            title: world.title.trim().length > 0 ? world.title : t("continent.untitled"),
            cx: world.anchor.cx,
            cz: world.anchor.cz,
          })}
        </Text>
        <Text variant="caption" tone={world.online ? "success" : "dim"}>
          {world.online ? t("continent.online") : t("continent.offline")}
        </Text>
      </div>
      <Button variant="secondary" onClick={() => goToDoor(world)}>
        {t("continent.goToDoor")}
      </Button>
    </div>
  );
}

export function ContinentSection(): JSX.Element {
  const t = useT();
  const status = useContinentStore((state) => state.status);
  const anchor = useContinentStore((state) => state.anchor);
  const worlds = useContinentStore((state) => state.worlds);

  if (status.kind === "off") {
    const plate = myPlate();
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: space.xs }}>
        <Text variant="label" tone="muted">
          {t("continent.section")}
        </Text>
        {plate === null ? (
          <Text variant="caption" tone="dim">
            {t("continent.noPlate")}
          </Text>
        ) : (
          <>
            <Text variant="body">{t("continent.yourPlate", { code: plate })}</Text>
            <Text variant="caption" tone="dim">
              {t("continent.openHint")}
            </Text>
            <Button variant="primary" onClick={() => continentOk(openMyDoor())}>
              {t("continent.openDoor")}
            </Button>
          </>
        )}
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: space.xs }}>
      <Text variant="label" tone="muted">
        {t("continent.section")}
      </Text>
      <Text variant="body">{t("continent.code", { code: status.code })}</Text>
      {status.kind === "connecting" ? (
        <Text variant="caption" tone="muted">
          {t("continent.connecting")}
        </Text>
      ) : status.kind === "live" ? (
        <Text variant="caption" tone="success">
          {t("continent.live", { n: status.peers })}
        </Text>
      ) : (
        <ErrorBlock error={status.error} />
      )}
      <Text variant="caption" tone="muted">
        {anchor === null
          ? t("continent.offsetPending")
          : t("continent.yourOffset", { cx: anchor.cx, cz: anchor.cz })}
      </Text>
      <Text variant="label" tone="muted">
        {t("continent.others")}
      </Text>
      {worlds.length === 0 ? (
        <Text variant="caption" tone="dim">
          {t("continent.noOthers")}
        </Text>
      ) : (
        worlds.map((world) => <WorldRow key={world.worldId} world={world} />)
      )}
      <Button variant="ghost" onClick={() => leaveContinent()}>
        {t("continent.leave")}
      </Button>
    </div>
  );
}
