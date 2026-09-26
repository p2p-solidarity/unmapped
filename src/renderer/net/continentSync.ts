// Keeps this world and the continent in step (plan.md §8). This world writes its own entry, the
// chunks it witnessed and the notes left on its land; it reads everyone else's, shifted into its
// own coordinates (continentView.ts), into `useContinentStore`. Positions go through awareness in
// continent tiles.
//
// Rev 6 phase 3 (D12): this world's land comes from its history's fold (`useLandStore`). A note
// someone else left on this land waits for the owner to keep it (continentActions'
// `offerVisitorNotes`); it is never kept by itself. A world that turns out to be attached to a
// world service leaves the continent (`continent-world-attached`).
//
// Chat (simplify-together): lines verified friends say are filed into the memory-only chat store
// (continentChat.ts) while this continent is open, and the store is emptied when it closes.

import { serializeScene } from "@dsl";
import { setNotePublisher } from "@renderer/app/land/notes";
import { subscribeOpenWorld } from "@renderer/app/land/together";
import { type Facing4, isVisiting, samplePlayer, samplePose } from "@renderer/engine/playerProbe";
import { type RemotePlayer, setRemotePlayers } from "@renderer/engine/remoteRoster";
import { errorLine, translate } from "@renderer/i18n";
import {
  useChatStore,
  useContinentStore,
  useLandStore,
  useSessionStore,
  useWorldStore,
} from "@renderer/state";
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
import { type Continent, getActiveContinent } from "./continent";
import {
  clearVisitorNotes,
  leaveContinent,
  offerVisitorNotes,
  refreshWorldBadges,
  sendPlayerHome,
  WORLD_ATTACHED,
  worldAttached,
} from "./continentActions";
import { listenToChat } from "./continentChat";
import {
  continentMaps,
  publishChunks,
  publishNotes,
  publishWorld,
  readContinent,
} from "./continentDoc";
import { buildContinentView } from "./continentView";
import { hasRelay } from "./iceServers";
import { playerName } from "./room";
import { SIGNALING_WAIT_MS } from "./signaling";

const POSITION_MS = 250;
const FACINGS: readonly Facing4[] = ["north", "south", "east", "west"];

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

/**
 * Notes someone else left on this world's land wait for the owner to keep them (D12): offered at
 * the door, never written by themselves. A visitor's note never becomes a line of the owner's karma.
 */
function offerNotes(doc: Y.Doc, worldId: string): void {
  if (useLandStore.getState().instanceId !== worldId) return;
  for (const visitor of offerVisitorNotes(readContinent(doc).notes.get(worldId) ?? [])) {
    useSessionStore.getState().toast("info", translate("together.noteArrived", { name: visitor }));
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

    // Only worlds whose hello passed count as here: an unverified peer is neither drawn nor listed.
    const online = (): Set<string> => {
      const verified = continent.gate.verifiedWorlds();
      const ids = new Set<string>();
      for (const [clientId, state] of awareness.getStates()) {
        if (clientId === awareness.clientID || typeof state.worldId !== "string") continue;
        if (verified.has(state.worldId)) ids.add(state.worldId);
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
      if (view !== null) {
        const before = samplePlayer();
        useContinentStore.getState().setView(view);
        // The world this player stood on left (or moved): the spot is now this world's own land,
        // never walked. Home first, before a checkpoint can store it (as leaving does).
        const after = samplePlayer();
        if (before !== null && isVisiting(before) && after !== null && !isVisiting(after)) {
          sendPlayerHome();
        }
      }
      offerNotes(doc, worldId);
    };

    const players = (): void => {
      const anchor = useContinentStore.getState().anchor;
      if (anchor === null) return;
      const others: RemotePlayer[] = [];
      const verified = continent.gate.verifiedWorlds();
      for (const [clientId, state] of awareness.getStates()) {
        if (clientId === awareness.clientID) continue;
        if (typeof state.worldId !== "string" || !verified.has(state.worldId)) continue;
        const pos = state.pos as
          | { x?: unknown; z?: unknown; facing?: unknown; moving?: unknown }
          | undefined;
        if (typeof state.name !== "string" || pos === undefined) continue;
        if (typeof pos.x !== "number" || typeof pos.z !== "number") continue;
        if (!Number.isFinite(pos.x) || !Number.isFinite(pos.z)) continue;
        const x = pos.x - anchor.cx * CHUNK_SIZE;
        const z = pos.z - anchor.cz * CHUNK_SIZE;
        // Presence is untrusted peer data: an unknown facing stands facing the viewer.
        const facing = FACINGS.find((one) => one === pos.facing) ?? "south";
        others.push({
          clientId,
          name: state.name.slice(0, 40),
          x,
          y: 0,
          z,
          facing,
          moving: pos.moving === true,
        });
      }
      setRemotePlayers(others);
    };

    // "Connecting" lasts only SIGNALING_WAIT_MS without any signaling server or peer; then the
    // continent says so with a way out, and turns live again the moment a server answers.
    let lostSince: number | null = null;
    // A friend found through signaling whose connection never opens (a VPN, a strict NAT or
    // firewall with no relay) is said out loud after the same wait, instead of "waiting" forever.
    let stuckSince: number | null = null;
    const status = (): void => {
      const connected = continent.signalingStatus().some((entry) => entry.connected);
      const peers = continent.gate.verifiedWorlds().size;
      const store = useContinentStore.getState();
      const previous = store.status;
      // y-webrtc drops a failed attempt and starts another, so "found" blinks: once a friend has
      // been found, the wait runs until one connects (or signaling is lost), not per attempt.
      if (peers > 0 || !connected) stuckSince = null;
      else if (continent.pendingPeers() > 0) stuckSince ??= Date.now();
      if (stuckSince !== null) {
        if (Date.now() - stuckSince >= SIGNALING_WAIT_MS) {
          if (previous.kind !== "error" || previous.error.code !== "continent-peer-unreachable") {
            store.setStatus({
              kind: "error",
              code: continent.code,
              error: {
                code: "continent-peer-unreachable",
                message: `A friend was found, but no connection opened within ${SIGNALING_WAIT_MS / 1000} s.`,
                hint: `A VPN or firewall may be blocking it${hasRelay() ? "" : ", and no relay service is set up (UNMAPPED_TURN_URL)"}. Try turning the VPN off or another network; it keeps trying and connects by itself.`,
              },
            });
          }
          return;
        }
      }
      if (connected || peers > 0) {
        lostSince = null;
        if (previous.kind !== "live" || previous.peers !== peers) {
          store.setStatus({ kind: "live", code: continent.code, peers });
        }
        return;
      }
      lostSince ??= Date.now();
      if (Date.now() - lostSince < SIGNALING_WAIT_MS) {
        if (previous.kind !== "connecting") {
          store.setStatus({ kind: "connecting", code: continent.code });
        }
        return;
      }
      if (previous.kind === "error") return;
      // No server address here: the player sees this in the door and F12 (simplify-together).
      store.setStatus({
        kind: "error",
        code: continent.code,
        error: {
          code: "continent-signaling-unreachable",
          message: `Friends cannot find this world: no connection server answered within ${SIGNALING_WAIT_MS / 1000} s.`,
          hint: "Check the internet connection. If it keeps failing, open Settings → Advanced settings → Signaling servers on the title screen and test them. It connects by itself as soon as a server answers.",
        },
      });
    };
    // A peer's data channel opening fires no provider event, so the count is also re-read slowly.
    const statusTimer = setInterval(status, 2000);

    setNotePublisher((owner, note) => publishNotes(doc, owner, [note]));
    const offChat = listenToChat(continent);
    const maps = continentMaps(doc);
    const onDoc = (): void => refresh();
    for (const map of [maps.worlds, maps.chunks, maps.notes]) map.observe(onDoc);
    const onAwareness = (): void => {
      refresh();
      players();
    };
    awareness.on("change", onAwareness);
    const offChange = continent.onChange(status);
    // A peer that passes (or fails) the hello changes who is drawn and what land is shown.
    let turnedAway = 0;
    const offGate = continent.gate.onChange(() => {
      refresh();
      players();
      const rejected = continent.gate.rejected();
      for (const error of rejected.slice(turnedAway)) {
        useSessionStore
          .getState()
          .toast("danger", translate("continent.peerRejected", { reason: errorLine(error) }));
      }
      turnedAway = rejected.length;
    });
    const offLand = useLandStore.subscribe(publish);
    const offWorld = useWorldStore.subscribe((state, previous) => {
      if (state.scene !== previous.scene) publish();
    });
    const timer = setInterval(() => {
      const where = samplePlayer();
      const anchor = useContinentStore.getState().anchor;
      if (where === null || anchor === null) return;
      const pose = samplePose();
      awareness.setLocalStateField("pos", {
        x: where.x + anchor.cx * CHUNK_SIZE,
        z: where.z + anchor.cz * CHUNK_SIZE,
        facing: pose?.facing ?? "south",
        moving: pose?.moving ?? false,
      });
    }, POSITION_MS);

    // An attached world stays off continents: one that turns out to be (its history opened, or
    // main's badge arrived after the door opened) leaves at once and says why.
    const attached = (): void => {
      if (getActiveContinent() !== continent || !worldAttached(worldId)) return;
      leaveContinent();
      useSessionStore.getState().toast("danger", errorLine(WORLD_ATTACHED));
    };
    const offOpen = subscribeOpenWorld(attached);
    void refreshWorldBadges().then(attached);

    publish();
    refresh();
    status();

    return () => {
      offOpen();
      offChat();
      // What friends said stays with the continent: leaving (or switching) forgets it.
      useChatStore.getState().clear();
      clearVisitorNotes();
      clearInterval(timer);
      clearInterval(statusTimer);
      for (const map of [maps.worlds, maps.chunks, maps.notes]) map.unobserve(onDoc);
      awareness.off("change", onAwareness);
      offChange();
      offGate();
      offLand();
      offWorld();
      setNotePublisher(null);
      setRemotePlayers([]);
      useContinentStore.getState().reset();
    };
  }, [continent]);
}
