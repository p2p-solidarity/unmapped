// The land in a room (plan.md §8). The room is the host's world: the host's witnessed chunks, lore,
// notes and home go into the room document; visitors render exactly that and never read their own
// disk for it. A chunk key is written only if it is absent, so whoever witnessed a place first is
// what that place is. A visitor's note enters the document and the host keeps it in notes.jsonl.
// Positions travel through awareness, never the document.

import { parseErrands, parseScene, serializeErrands, serializeScene } from "@dsl";
import { recordNote, setNotePublisher } from "@renderer/app/land/notes";
import { openInstance } from "@renderer/app/useInstanceLoader";
import { samplePlayer } from "@renderer/engine/playerProbe";
import { setRemotePlayers } from "@renderer/engine/remoteRoster";
import { type ChunkStatus, useLandStore, useSessionStore } from "@renderer/state";
import { emptyProgress } from "@renderer/state/landStore";
import { chunkKey } from "@shared/chunks";
import type { HomeState, LandNote, WitnessedChunk } from "@shared/land";
import type { LoreNode } from "@shared/lore";
import { useEffect } from "react";
import type * as Y from "yjs";
import type { Room } from "./room";

const POSITION_MS = 250;

function maps(doc: Y.Doc) {
  return {
    overlays: doc.getMap<WitnessedChunk>("overlays"),
    lore: doc.getMap<LoreNode>("lore"),
    notes: doc.getMap<LandNote>("notes"),
    home: doc.getMap<HomeState>("home"),
  };
}

function setIfAbsent<T>(map: Y.Map<T>, key: string, value: T): void {
  if (!map.has(key)) map.set(key, value);
}

/** Host → document: everything this world has witnessed, written once per key. */
function publishHostLand(doc: Y.Doc): void {
  const land = useLandStore.getState();
  if (land.load.status !== "ready") return;
  const { overlays, lore, notes, home } = maps(doc);
  doc.transact(() => {
    for (const [key, chunk] of Object.entries(land.chunks)) {
      if (chunk.status !== "written" || overlays.has(key)) continue;
      const [cx = 0, cz = 0] = key.split(",").map(Number);
      overlays.set(key, {
        cx,
        cz,
        scene: serializeScene(chunk.scene),
        dialogues: chunk.dialogues,
        ...(chunk.errands === null ? {} : { errands: serializeErrands(chunk.errands) }),
      });
    }
    for (const node of land.lore) setIfAbsent(lore, node.id, node);
    for (const note of land.notes) setIfAbsent(notes, note.id, note);
    if (land.progress !== null) home.set("home", land.progress.home);
  });
}

/** Document → visitor: the host's land, replacing whatever was mirrored before. */
function mirrorHostLand(doc: Y.Doc, instanceId: string): void {
  const { overlays, lore, notes, home } = maps(doc);
  const chunks: Record<string, ChunkStatus> = {};
  for (const chunk of overlays.values()) {
    const scene = parseScene(chunk.scene);
    if (!scene.ok) {
      chunks[chunkKey(chunk)] = {
        status: "failed",
        error: {
          code: "room-chunk-invalid",
          message: scene.error.message,
          hint: "Ask the host to rejoin.",
        },
      };
      continue;
    }
    const errands = chunk.errands === undefined ? null : parseErrands(chunk.errands);
    chunks[chunkKey(chunk)] = {
      status: "written",
      scene: scene.value,
      dialogues: chunk.dialogues,
      errands: errands?.ok ? errands.value : null,
    };
  }
  const sorted = [...notes.values()].sort((a, b) => a.at.localeCompare(b.at));
  useLandStore.getState().mirror(instanceId, chunks, [...lore.values()], sorted);
  const hostHome = home.get("home");
  useLandStore
    .getState()
    .setProgress({ ...emptyProgress(), ...(hostHome ? { home: hostHome } : {}) });
}

export function useLandSync(room: Room | null): void {
  useEffect(() => {
    if (room === null) return;
    const doc = room.provider.doc;
    const { overlays, lore, notes, home } = maps(doc);
    const teardown: (() => void)[] = [];

    if (room.host) {
      publishHostLand(doc);
      teardown.push(useLandStore.subscribe(() => publishHostLand(doc)));
      // A visitor's note: keep it in this world's para-ledger.
      const onNotes = (event: Y.YMapEvent<LandNote>) => {
        if (event.transaction.local) return;
        for (const key of event.keysChanged) {
          const note = notes.get(key);
          const land = useLandStore.getState();
          if (note === undefined || land.instanceId === null) continue;
          if (land.notes.some((one) => one.id === note.id)) continue;
          void window.seed.instances
            .appendNote({ instanceId: land.instanceId, note })
            .then((stored) => {
              if (!stored.ok) {
                useSessionStore
                  .getState()
                  .toast("danger", `A visitor's note was not kept: ${stored.error.message}`);
                return;
              }
              useLandStore.getState().addNote(note);
              recordNote(note);
            });
        }
      };
      notes.observe(onNotes);
      teardown.push(() => notes.unobserve(onNotes));
    } else {
      const instanceId = room.instance.instance.meta.instanceId;
      const apply = () => mirrorHostLand(doc, instanceId);
      for (const map of [overlays, lore, notes, home] as Y.Map<unknown>[]) {
        map.observe(apply);
        teardown.push(() => map.unobserve(apply));
      }
      apply();
      setNotePublisher((note) => {
        if (!notes.has(note.id)) notes.set(note.id, note);
      });
      teardown.push(() => {
        setNotePublisher(null);
        // Leaving a friend's world: walk back into this save's own land, read from this disk.
        useLandStore.getState().reset();
        void openInstance(instanceId);
      });
    }

    const awareness = room.provider.awareness;
    const timer = setInterval(() => {
      const where = samplePlayer();
      if (where !== null)
        awareness.setLocalStateField("pos", { x: where.x, y: where.y, z: where.z });
    }, POSITION_MS);
    const onAwareness = () => {
      const others = [];
      for (const [clientId, state] of awareness.getStates()) {
        if (clientId === awareness.clientID) continue;
        const pos = state.pos as { x?: unknown; y?: unknown; z?: unknown } | undefined;
        const name = state.name;
        if (typeof name !== "string" || pos === undefined) continue;
        if (typeof pos.x !== "number" || typeof pos.y !== "number" || typeof pos.z !== "number")
          continue;
        others.push({ clientId, name, x: pos.x, y: pos.y, z: pos.z });
      }
      setRemotePlayers(others);
    };
    awareness.on("change", onAwareness);
    teardown.push(() => {
      clearInterval(timer);
      awareness.off("change", onAwareness);
      setRemotePlayers([]);
    });

    return () => {
      for (const stop of teardown) stop();
    };
  }, [room]);
}
