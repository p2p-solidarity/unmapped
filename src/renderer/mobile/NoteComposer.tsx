// Leaving a note from a phone (rev 6 phase 4, D7). The words are exactly what the player typed, and
// the note is left on the tile the player stands on, as the desktop leaves one (app/land/notes.ts):
// the chunk and the tile within it from the land's position probe, anchored to the live witness
// standing on that chunk. It goes through `world.append`, which checks, signs and queues it; offline
// it waits in the outbox. With no land drawn there is no tile, so nothing is sent (Rule 2).

import { samplePlayer } from "@renderer/engine/playerProbe";
import { useT } from "@renderer/i18n";
import { useLandStore } from "@renderer/state";
import { Button, ErrorBlock, Surface, Text, TextField } from "@renderer/ui";
import { CHUNK_SIZE, type ChunkCoord, chunkOf } from "@shared/chunks";
import type { WorldNow } from "@shared/history/types";
import { NOTE_MAX_CHARS } from "@shared/land";
import { errored, idle, type Loadable, loading, ready } from "@shared/result";
import type { WorldStatus } from "@shared/worldApi";
import { type JSX, useState } from "react";

interface Tile extends ChunkCoord {
  x: number;
  z: number;
}

function local(value: number, chunk: number): number {
  return Math.min(CHUNK_SIZE - 1, Math.max(0, Math.floor(value) - chunk * CHUNK_SIZE));
}

/** The tile underfoot, or null while no land is drawn. */
function tileUnderfoot(): Tile | null {
  const where = samplePlayer();
  if (where === null) return null;
  const chunk = chunkOf(where.x, where.z);
  return { ...chunk, x: local(where.x, chunk.cx), z: local(where.z, chunk.cz) };
}

export function NoteComposer({
  worldId,
  now,
  status,
}: {
  worldId: string;
  now: WorldNow;
  status: WorldStatus;
}): JSX.Element {
  const t = useT();
  const [text, setText] = useState("");
  const [state, setState] = useState<Loadable<null>>(idle());
  // Read when the panel opens: the land does not move while it is open.
  const [tile, setTile] = useState<Tile | null>(tileUnderfoot);
  const witnessOf = useLandStore((land) => land.world?.witnessOf);
  const name = status.me === null ? undefined : now.names[status.me];

  if (!status.writable || name === undefined) {
    return (
      <Surface variant="overlay" padding="md">
        <Text variant="body" tone="muted">
          {t("mobile.readOnly")}
        </Text>
      </Surface>
    );
  }

  const words = text.trim();

  const leave = async (): Promise<void> => {
    const here = tileUnderfoot();
    setTile(here);
    if (here === null) return;
    setState(loading());
    const witness = witnessOf?.[`${here.cx},${here.cz}`];
    const appended = await window.seed.world.append(worldId, {
      kind: "note",
      seen: status.head.n,
      body: {
        coord: { cx: here.cx, cz: here.cz, x: here.x, z: here.z },
        anchors: witness === undefined ? [] : [witness],
        text: words,
        contests: null,
        name,
      },
    });
    if (!appended.ok) {
      setState(errored(appended.error));
      return;
    }
    setText("");
    setState(ready(null));
  };

  return (
    <Surface variant="card" padding="md">
      <Text variant="label" tone="accent" as="h3">
        {t("mobile.noteTitle")}
      </Text>
      <TextField
        label={t("mobile.noteLabel")}
        rows={3}
        value={text}
        maxLength={NOTE_MAX_CHARS}
        onChange={(event) => {
          setText(event.target.value);
          if (state.status !== "loading") setState(idle());
        }}
      />
      <Text variant="caption" tone="dim">
        {t("mobile.noteCount", { n: words.length, max: NOTE_MAX_CHARS })}
      </Text>
      <Text variant="caption" tone={tile === null ? "muted" : "dim"}>
        {tile === null
          ? t("mobile.noteNoLand")
          : t("mobile.noteHere", { cx: tile.cx, cz: tile.cz, x: tile.x, z: tile.z })}
      </Text>
      <Button
        variant="primary"
        fullWidth
        disabled={state.status === "loading" || words.length === 0 || tile === null}
        onClick={() => void leave()}
      >
        {t("mobile.noteSend")}
      </Button>
      {state.status === "error" ? <ErrorBlock error={state.error} /> : null}
      {state.status === "ready" ? (
        <Text variant="caption" tone="success">
          {t("mobile.noteSent")}
        </Text>
      ) : null}
    </Surface>
  );
}
