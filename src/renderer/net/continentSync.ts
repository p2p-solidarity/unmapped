// Keeps this world and the continent in step (plan.md §8). This world writes its own entry, the
// chunks it witnessed and the notes left on its land; it reads everyone else's, shifted into its
// own coordinates (continentView.ts), into `useContinentStore`. A note someone left on this world's
// land is kept in this save's notes.jsonl. Positions go through awareness in continent tiles.

import { serializeScene } from "@dsl";
import { recordNote, setNotePublisher } from "@renderer/app/land/notes";
import { samplePlayer } from "@renderer/engine/playerProbe";
import { type RemotePlayer, setRemotePlayers } from "@renderer/engine/remoteRoster";
import { errorLine, translate } from "@renderer/i18n";
import { useContinentStore, useLandStore, useSessionStore, useWorldStore } from "@renderer/state";
import { dialogueKey } from "@shared/cartridge";
import { CHUNK_SIZE, type ChunkCoord } from "@shared/chunks";
import {
  CONTINENT_PROTOCOL,
  type ContinentWorldEntry,
  pickAnchor,
  resolveAnchors,
} from "@shared/continent";
import { landSeedOf, type WitnessedChunk } from "@shared/land";
import { useEffect } from "react";
import type * as Y from "yjs";
import type { Continent } from "./continent";
import {
  continentMaps,
  publishChunks,
  publishNotes,
  publishWorld,
  readContinent,
} from "./continentDoc";
import { buildContinentView } from "./continentView";
import { playerName } from "./room";

const POSITION_MS = 250;

interface Claim {
  anchor: ChunkCoord;
  joinedAt: number;
}

/** This world's entry, or null while it is not standing on open land. */
function ownEntry(worldId: string, claim: Claim): ContinentWorldEntry | null {
  const land = useLandStore.getState();
  const session = useSessionStore.getState();
  const active = session.activeInstance;
  const scene = useWorldStore.getState().scene;
  if (land.instanceId !== worldId || land.progress === null || active === null) return null;
  if (scene.status !== "ready") return null;
  const sceneId = active.instance.save.currentSceneId;
  const originDialogues: Record<string, string> = {};
  for (const npc of scene.value.npcs) {
    const words = active.cartridge.dialogues[dialogueKey(sceneId, npc.id)];
    if (words !== undefined) originDialogues[npc.id] = words;
  }
  return {
    protocol: CONTINENT_PROTOCOL,
    worldId,
    owner: session.playerProfile?.displayName ?? playerName(),
    title: active.cartridge.manifest.name,
    anchor: claim.anchor,
    joinedAt: claim.joinedAt,
    seed: landSeedOf(active.instance.save),
    origin: serializeScene(scene.value),
    originDialogues,
    home: {
      cx: land.progress.home.cx,
      cz: land.progress.home.cz,
      keepsakes: land.progress.home.keepsakes.map((item) => ({ id: item.id, name: item.name })),
    },
    door: land.progress.door,
  };
}

function ownChunks(): WitnessedChunk[] {
  const out: WitnessedChunk[] = [];
  for (const [key, chunk] of Object.entries(useLandStore.getState().chunks)) {
    if (chunk.status !== "written") continue;
    const [cx = 0, cz = 0] = key.split(",").map(Number);
    // Errands stay home: visitors are told residents' words, never handed their errands.
    out.push({ cx, cz, scene: serializeScene(chunk.scene), dialogues: chunk.dialogues });
  }
  return out;
}

/** A note left on this world's land by someone else: keep it in this save's para-ledger. */
function keepVisitorNotes(doc: Y.Doc, worldId: string): void {
  const land = useLandStore.getState();
  if (land.instanceId !== worldId) return;
  const theirs = readContinent(doc).notes.get(worldId) ?? [];
  for (const note of theirs) {
    if (land.notes.some((one) => one.id === note.id)) continue;
    useLandStore.getState().addNote(note);
    void window.seed.instances.appendNote({ instanceId: worldId, note }).then((stored) => {
      if (stored.ok) {
        recordNote(note);
        return;
      }
      useSessionStore
        .getState()
        .toast("danger", translate("identity.noteNotKept", { reason: errorLine(stored.error) }));
    });
  }
}

export function useContinentSync(continent: Continent | null): void {
  useEffect(() => {
    if (continent === null) return;
    const { doc, provider, worldId } = continent;
    const awareness = provider.awareness;
    const store = useContinentStore.getState();
    store.setStatus({ kind: "connecting", code: continent.code });

    // Keep an earlier claim (rejoining the same room); otherwise take the first free slot.
    const existing = readContinent(doc).worlds.find((entry) => entry.worldId === worldId);
    const claim: Claim =
      existing === undefined
        ? {
            anchor: pickAnchor(resolveAnchors(readContinent(doc).worlds).map((one) => one.anchor)),
            joinedAt: Date.now(),
          }
        : { anchor: existing.anchor, joinedAt: existing.joinedAt };
    const publish = (): void => {
      const entry = ownEntry(worldId, claim);
      if (entry === null) return;
      publishWorld(doc, entry);
      publishChunks(doc, worldId, ownChunks());
      // Notes on this world's own land; one on land that is someone else's for now waits.
      const territory = useContinentStore.getState().territory;
      const home = useLandStore
        .getState()
        .notes.filter((note) => (territory?.at(note.coord) ?? null) === null);
      publishNotes(doc, worldId, home);
    };

    const online = (): Set<string> => {
      const ids = new Set<string>();
      for (const [clientId, state] of awareness.getStates()) {
        if (clientId !== awareness.clientID && typeof state.worldId === "string") {
          ids.add(state.worldId);
        }
      }
      return ids;
    };

    const refresh = (): void => {
      const snapshot = readContinent(doc);
      // Two worlds that claimed one slot at once: the later one moves, and says so in its entry.
      const resolved = resolveAnchors(snapshot.worlds).find((one) => one.worldId === worldId);
      if (
        resolved !== undefined &&
        (resolved.anchor.cx !== claim.anchor.cx || resolved.anchor.cz !== claim.anchor.cz)
      ) {
        claim.anchor = resolved.anchor;
        publish();
        return;
      }
      const view = buildContinentView(snapshot, worldId, online());
      if (view !== null) useContinentStore.getState().setView(view);
      keepVisitorNotes(doc, worldId);
    };

    const players = (): void => {
      const anchor = useContinentStore.getState().anchor;
      if (anchor === null) return;
      const others: RemotePlayer[] = [];
      for (const [clientId, state] of awareness.getStates()) {
        if (clientId === awareness.clientID) continue;
        const pos = state.pos as { x?: unknown; z?: unknown } | undefined;
        if (typeof state.name !== "string" || pos === undefined) continue;
        if (typeof pos.x !== "number" || typeof pos.z !== "number") continue;
        if (!Number.isFinite(pos.x) || !Number.isFinite(pos.z)) continue;
        const x = pos.x - anchor.cx * CHUNK_SIZE;
        const z = pos.z - anchor.cz * CHUNK_SIZE;
        others.push({ clientId, name: state.name.slice(0, 40), x, y: 0, z });
      }
      setRemotePlayers(others);
    };

    const status = (): void => {
      const connected = continent.signalingStatus().some((entry) => entry.connected);
      const peers = continent.peerCount();
      useContinentStore
        .getState()
        .setStatus(
          connected || peers > 0
            ? { kind: "live", code: continent.code, peers }
            : { kind: "connecting", code: continent.code },
        );
    };
    // A peer's data channel opening fires no provider event, so the count is also re-read slowly.
    const statusTimer = setInterval(status, 2000);

    setNotePublisher((owner, note) => publishNotes(doc, owner, [note]));
    const maps = continentMaps(doc);
    const onDoc = (): void => refresh();
    for (const map of [maps.worlds, maps.chunks, maps.notes]) map.observe(onDoc);
    const onAwareness = (): void => {
      refresh();
      players();
    };
    awareness.on("change", onAwareness);
    const offChange = continent.onChange(status);
    const offLand = useLandStore.subscribe(publish);
    const offWorld = useWorldStore.subscribe((state, previous) => {
      if (state.scene !== previous.scene) publish();
    });
    const timer = setInterval(() => {
      const where = samplePlayer();
      const anchor = useContinentStore.getState().anchor;
      if (where === null || anchor === null) return;
      awareness.setLocalStateField("pos", {
        x: where.x + anchor.cx * CHUNK_SIZE,
        z: where.z + anchor.cz * CHUNK_SIZE,
      });
    }, POSITION_MS);

    publish();
    refresh();
    status();

    return () => {
      clearInterval(timer);
      clearInterval(statusTimer);
      for (const map of [maps.worlds, maps.chunks, maps.notes]) map.unobserve(onDoc);
      awareness.off("change", onAwareness);
      offChange();
      offLand();
      offWorld();
      setNotePublisher(null);
      setRemotePlayers([]);
      useContinentStore.getState().reset();
    };
  }, [continent]);
}
