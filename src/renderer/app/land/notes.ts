// Writing a note (手記, plan.md §6). The text is exactly what the player typed — no model, no
// translation — anchored to the tile underfoot and the place remembered there. A note left on this
// world's own land is appended to the save's notes.jsonl. On a continent, a note left on another
// world's land belongs to that world: it travels through the room in its owner's coordinates
// (net/continentSync.ts) and its owner keeps it.

import { samplePlayer } from "@renderer/engine/playerProbe";
import { playerName } from "@renderer/net/room";
import {
  foreignAt,
  useEngineStore,
  useLandStore,
  useSessionStore,
  useWorldStore,
} from "@renderer/state";
import { CHUNK_SIZE } from "@shared/chunks";
import { type LandNote, NOTE_MAX_CHARS } from "@shared/land";
import { err, ok, type Result } from "@shared/result";
import { makeKarmaEntry } from "../karmaFile";

type Publisher = (worldId: string, note: LandNote) => void;
let publisher: Publisher | null = null;

/** The continent registers how a note reaches the world it was left on; null when not merged. */
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
  const foreign = foreignAt(chunk);
  if (foreign !== null) {
    if (publisher === null) {
      return err("note-no-room", "That world is not reachable.", "Rejoin the continent.");
    }
    // In its owner's coordinates; what they remember there is theirs, so no anchors are guessed.
    const note: LandNote = {
      id: crypto.randomUUID(),
      author: session.playerProfile?.displayName ?? playerName(),
      at: new Date().toISOString(),
      coord: {
        cx: chunk.cx - foreign.shift.cx,
        cz: chunk.cz - foreign.shift.cz,
        x: local(where.x, chunk.cx),
        z: local(where.z, chunk.cz),
      },
      anchors: [],
      text: words,
      contests,
    };
    publisher(foreign.worldId, note);
    return ok(note);
  }
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
    return err(
      "note-no-room",
      "A visitor's notes are not kept in a shared room.",
      "Open land is shared as a continent: use the door at home.",
    );
  }
  const stored = await window.seed.instances.appendNote({ instanceId: land.instanceId, note });
  if (!stored.ok) return stored;
  useLandStore.getState().addNote(note);
  recordNote(note);
  return ok(note);
}
