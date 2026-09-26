// The door's list of friends' worlds on this shared land (plan.md §8; in code a continent), shown
// only while this world plays with friends: each friend's world with whether they are here now and a
// way to their door, and the notes visiting friends left on this land, waiting until the owner keeps
// them into the world's history (rev 6 phase 3, D12). Inviting, the join code, how many friends are
// here and leaving are ../friends/InviteFriends, above it in the door.

import { errorLine, formatDateTime, translate, useT } from "@renderer/i18n";
import {
  keepVisitorNote,
  setAsideVisitorNote,
  useVisitorNotes,
  type VisitorNote,
} from "@renderer/net/continentActions";
import {
  type ForeignWorld,
  useContinentStore,
  useEngineStore,
  useSessionStore,
} from "@renderer/state";
import { Button, Surface, space, Text } from "@renderer/ui";
import { chunkOf } from "@shared/chunks";
import type { Result } from "@shared/result";
import { type JSX, useState } from "react";
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

export function ContinentSection(): JSX.Element | null {
  const t = useT();
  const on = useContinentStore((state) => state.status.kind !== "off");
  const worlds = useContinentStore((state) => state.worlds);
  if (!on) return null;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: space.xs }}>
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
    </div>
  );
}
