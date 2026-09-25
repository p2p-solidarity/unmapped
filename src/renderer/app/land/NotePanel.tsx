// The notes left where the player stands, side by side, contradictions included — and a field to
// leave one more. Opened with N on open land.

import { useEngineStore, useLandStore, useSessionStore } from "@renderer/state";
import { Button, ErrorBlock, Surface, space, Text, TextField, zIndex } from "@renderer/ui";
import { chunkKey } from "@shared/chunks";
import { NOTE_MAX_CHARS } from "@shared/land";
import type { AppError } from "@shared/result";
import { type JSX, useEffect, useState } from "react";
import { writeNote } from "./notes";

export function NotePanel(): JSX.Element | null {
  const open = useSessionStore((state) => state.notesOpen);
  const chunk = useEngineStore((state) => state.chunk);
  const notes = useLandStore((state) => state.notes);
  const place = useLandStore((state) => {
    const here = chunk === null ? undefined : state.chunks[chunkKey(chunk)];
    return here?.status === "written" ? here.scene.name : null;
  });
  const [text, setText] = useState("");
  const [contests, setContests] = useState<string | null>(null);
  const [error, setError] = useState<AppError | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) {
      setContests(null);
      setError(null);
    }
  }, [open]);

  if (!open || chunk === null) return null;
  const here = notes.filter((note) => note.coord.cx === chunk.cx && note.coord.cz === chunk.cz);
  const answering = contests === null ? null : (here.find((note) => note.id === contests) ?? null);

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
          width: "min(640px, 92%)",
          maxHeight: "86%",
          overflowY: "auto",
          pointerEvents: "auto",
        }}
      >
        <Text variant="title" as="h2">
          {`Notes · ${place ?? "unwritten land"} (${chunk.cx} · ${chunk.cz})`}
        </Text>
        {here.length === 0 ? (
          <Text variant="body" tone="dim">
            Nobody has left a note here yet.
          </Text>
        ) : (
          here.map((note) => {
            const disputed =
              note.contests === null ? null : here.find((one) => one.id === note.contests);
            return (
              <div key={note.id} style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                <Text variant="caption" tone="muted">
                  {`${note.author} · tile ${note.coord.x},${note.coord.z} · ${new Date(note.at).toLocaleString()}`}
                </Text>
                {disputed ? (
                  <Text variant="caption" tone="dim">
                    {`another version of ${disputed.author}'s note`}
                  </Text>
                ) : null}
                <Text variant="body">{note.text}</Text>
                <Button variant="ghost" onClick={() => setContests(note.id)}>
                  Write a different version
                </Button>
              </div>
            );
          })
        )}
        {answering === null ? null : (
          <Text variant="caption" tone="accent">
            {`Writing another version of ${answering.author}'s note`}
          </Text>
        )}
        <TextField
          label="your note"
          value={text}
          maxLength={NOTE_MAX_CHARS}
          onChange={(event) => setText(event.target.value)}
        />
        {error === null ? null : <ErrorBlock error={error} />}
        <div style={{ display: "flex", gap: space.sm }}>
          <Button
            variant="primary"
            disabled={saving || text.trim().length === 0}
            onClick={() => {
              setSaving(true);
              void writeNote(text, contests).then((result) => {
                setSaving(false);
                if (!result.ok) {
                  setError(result.error);
                  return;
                }
                setText("");
                setContests(null);
                setError(null);
              });
            }}
          >
            Leave the note
          </Button>
          <Button variant="ghost" onClick={() => useSessionStore.getState().toggleNotes(false)}>
            Close
          </Button>
        </div>
      </Surface>
    </div>
  );
}
