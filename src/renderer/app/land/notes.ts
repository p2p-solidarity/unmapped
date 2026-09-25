// Writing a note (手記, plan.md §6). The text is exactly what the player typed — no model, no
// translation — anchored to the tile underfoot and the place remembered there. Solo and host
// worlds append it to the save's notes.jsonl; a visitor's note travels to the host through the
// room (net/landSync.ts), which is the only place a visitor's words are kept.

import { samplePlayer } from "@renderer/engine/playerProbe";
import { playerName } from "@renderer/net/room";
import { useEngineStore, useLandStore, useSessionStore, useWorldStore } from "@renderer/state";
import { CHUNK_SIZE } from "@shared/chunks";
import { type LandNote, NOTE_MAX_CHARS } from "@shared/land";
import { err, ok, type Result } from "@shared/result";
import { makeKarmaEntry } from "../karmaFile";

type Publisher = (note: LandNote) => void;
let publisher: Publisher | null = null;

/** The room registers how a visitor's note reaches the host; null when not visiting. */
export function setNotePublisher(next: Publisher | null): void {
  publisher = next;
}

function local(value: number, chunk: number): number {
  return Math.min(CHUNK_SIZE - 1, Math.max(0, Math.floor(value) - chunk * CHUNK_SIZE));
}

/** Ledger fact that a note was left here; the words themselves live in notes.jsonl. */
export function recordNote(note: LandNote): void {
  const world = useWorldStore.getState();
  world.appendKarma(
    makeKarmaEntry({
      floor: world.floor,
      action: "note",
      choice: note.author,
      effect: note.contests === null ? "left a note" : "left a different version of a note",
      chunk: { cx: note.coord.cx, cz: note.coord.cz },
    }),
  );
}

export async function writeNote(text: string, contests: string | null): Promise<Result<LandNote>> {
  const words = text.trim();
  if (words.length === 0 || words.length > NOTE_MAX_CHARS) {
    return err("note-length", `A note holds 1 to ${NOTE_MAX_CHARS} characters.`, "Shorten it.");
  }
  const chunk = useEngineStore.getState().chunk;
  const where = samplePlayer();
  const land = useLandStore.getState();
  if (chunk === null || where === null || land.instanceId === null) {
    return err("note-nowhere", "Notes are left on open land.", "Walk out into the land first.");
  }
  const session = useSessionStore.getState();
  const note: LandNote = {
    id: crypto.randomUUID(),
    author: session.playerProfile?.displayName ?? playerName(),
    at: new Date().toISOString(),
    coord: { cx: chunk.cx, cz: chunk.cz, x: local(where.x, chunk.cx), z: local(where.z, chunk.cz) },
    anchors: land.lore
      .filter(
        (node) => node.kind === "place" && node.coord.cx === chunk.cx && node.coord.cz === chunk.cz,
      )
      .map((node) => node.id),
    text: words,
    contests,
  };
  if (session.networkRole === "peer") {
    if (publisher === null) {
      return err("note-no-room", "The host's world is not reachable.", "Rejoin the room.");
    }
    publisher(note);
    useLandStore.getState().addNote(note);
    return ok(note);
  }
  const stored = await window.seed.instances.appendNote({ instanceId: land.instanceId, note });
  if (!stored.ok) return stored;
  useLandStore.getState().addNote(note);
  recordNote(note);
  return ok(note);
}
