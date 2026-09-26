// The door's continent section (plan.md §8). Not merged: this world's door number and a button that
// opens the door to friends. Merged: the continent's code (the number to share), how the connection
// stands, this world's offset, every other world on it with a way to its door, and a way back off.
//
// Rev 6 phase 3 (D12): a world attached to a world service shows why it cannot open a continent
// (`continent-world-attached`) instead of the button, and notes visitors left on this land wait
// here, "left by <name>, not kept yet", until the owner keeps them into the world's history.

import { errorLine, formatDateTime, translate, useT } from "@renderer/i18n";
import {
  keepVisitorNote,
  leaveContinent,
  myPlate,
  openMyDoor,
  refreshWorldBadges,
  setAsideVisitorNote,
  useVisitorNotes,
  type VisitorNote,
  WORLD_ATTACHED,
  worldAttached,
} from "@renderer/net/continentActions";
import {
  type ForeignWorld,
  useContinentStore,
  useEngineStore,
  useLandStore,
  useSessionStore,
} from "@renderer/state";
import { Button, ErrorBlock, Surface, space, Text } from "@renderer/ui";
import { chunkOf } from "@shared/chunks";
import type { Result } from "@shared/result";
import { type JSX, useEffect, useState } from "react";
import { currentDoorArrival } from "./doorArrival";
import { useOpenWorld } from "./together";

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

function VisitorNoteRow({ note }: { note: VisitorNote }): JSX.Element {
  const t = useT();
  const [busy, setBusy] = useState(false);
  const { coord } = note.note;
  return (
    <Surface variant="outlined" padding="sm" style={{ gap: 2 }}>
      <Text variant="caption" tone="muted">
        {`${t("together.visitorNote", { name: note.visitor })} · ${coord.cx} · ${coord.cz} · ${formatDateTime(note.note.at)}`}
      </Text>
      <Text variant="body">{note.note.text}</Text>
      <div style={{ display: "flex", gap: space.sm }}>
        <Button
          variant="secondary"
          disabled={busy}
          onClick={() => {
            setBusy(true);
            void keepVisitorNote(note).then((kept) => {
              setBusy(false);
              if (!kept.ok) {
                useSessionStore.getState().toast("danger", errorLine(kept.error));
                return;
              }
              useSessionStore
                .getState()
                .toast("success", translate("together.noteKept", { name: note.visitor }));
            });
          }}
        >
          {t("together.keepNote")}
        </Button>
        <Button variant="ghost" disabled={busy} onClick={() => setAsideVisitorNote(note)}>
          {t("together.notNow")}
        </Button>
      </div>
    </Surface>
  );
}

function VisitorNotes(): JSX.Element | null {
  const t = useT();
  const { offered, waiting } = useVisitorNotes();
  if (offered.length === 0 && waiting === 0) return null;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: space.xs }}>
      <Text variant="label" tone="muted">
        {t("together.visitorNotes")}
      </Text>
      {offered.map((note) => (
        <VisitorNoteRow key={note.note.id} note={note} />
      ))}
      {waiting === 0 ? null : (
        <Text variant="caption" tone="dim">
          {t("together.moreTomorrow", { n: waiting })}
        </Text>
      )}
    </div>
  );
}

/** Whether this save's world is attached (its history says so first, else main's badge). */
function useAttached(): boolean {
  const instanceId = useLandStore((state) => state.instanceId);
  // Read so the answer is re-derived whenever the land's history reports the world.
  useOpenWorld();
  const [, reread] = useState(0);
  // biome-ignore lint/correctness/useExhaustiveDependencies: another save opening re-reads the badges
  useEffect(() => {
    let live = true;
    void refreshWorldBadges().then(() => {
      if (live) reread((n) => n + 1);
    });
    return () => {
      live = false;
    };
  }, [instanceId]);
  return instanceId !== null && worldAttached(instanceId);
}

export function ContinentSection(): JSX.Element {
  const t = useT();
  const status = useContinentStore((state) => state.status);
  const anchor = useContinentStore((state) => state.anchor);
  const worlds = useContinentStore((state) => state.worlds);
  const attached = useAttached();

  if (status.kind === "off" && attached) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: space.xs }}>
        <Text variant="label" tone="muted">
          {t("continent.section")}
        </Text>
        <ErrorBlock error={WORLD_ATTACHED} />
      </div>
    );
  }

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
      <VisitorNotes />
      <Button variant="ghost" onClick={() => leaveContinent()}>
        {t("continent.leave")}
      </Button>
    </div>
  );
}
