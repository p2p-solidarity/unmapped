// When the player first sets foot on an unwritten chunk, it is witnessed: the model writes it once
// (narrative/witness.ts), main stores it, and from then on it is read, never generated. Walking
// never waits for this — it runs in the background and the HUD says what state the chunk is in.

import { serializeDialogue, serializeErrands, serializeScene } from "@dsl";
import { generateChunk } from "@renderer/narrative";
import {
  foreignAt,
  useEngineStore,
  useInferenceStore,
  useLandStore,
  useSessionStore,
  useWorldStore,
} from "@renderer/state";
import { type ChunkCoord, chunkKey, chunksAround, chunkTerrain } from "@shared/chunks";
import { landSeedOf } from "@shared/land";
import { type AppError, toError } from "@shared/result";
import { useEffect } from "react";
import { makeKarmaEntry } from "../karmaFile";

/** Why nothing can be witnessed right now, or null when it can. Shown by the HUD verbatim. */
export function witnessBlocker(): AppError | null {
  const active = useSessionStore.getState().activeInstance;
  if (active === null || useWorldStore.getState().origin?.kind !== "instance") {
    return {
      code: "witness-no-cartridge",
      message: "Only a cartridge world can be witnessed.",
      hint: "Open a world from the cartridge library.",
    };
  }
  if (active.cartridge.bible === null) {
    return {
      code: "witness-no-bible",
      message: "This cartridge has no world bible, so its land stays unwritten.",
      hint: "Make a new world; cartridges published before witnessing have no bible.",
    };
  }
  if (useSessionStore.getState().networkRole === "peer") {
    return {
      code: "witness-peer",
      message: "You are visiting; the host's world is witnessed by the host.",
      hint: "Walk there together.",
    };
  }
  const land = useLandStore.getState().load;
  if (land.status === "error") return land.error;
  if (land.status !== "ready") {
    return { code: "witness-loading", message: "Reading the land…", hint: "One moment." };
  }
  const { config, probe } = useInferenceStore.getState();
  if (config === null) {
    return {
      code: "witness-no-model",
      message: "No model is configured, so new land stays unwritten.",
      hint: "Configure a provider in Console → Inference. Walking still works.",
    };
  }
  if (probe.status !== "ready" || !probe.value.reachable) {
    return {
      code: "witness-model-offline",
      message: "The model is not reachable, so new land stays unwritten.",
      hint: "Start the model or check the provider in Console → Inference. Walking still works.",
    };
  }
  return null;
}

function neighbours(coord: ChunkCoord) {
  const { chunks, lore } = useLandStore.getState();
  return chunksAround(coord, 1).flatMap((near) => {
    if (near.cx === coord.cx && near.cz === coord.cz) return [];
    const chunk = chunks[chunkKey(near)];
    if (chunk?.status !== "written") return [];
    const customs = lore
      .filter(
        (node) => node.kind === "custom" && node.coord.cx === near.cx && node.coord.cz === near.cz,
      )
      .map((node) => `${node.id} "${node.label}": ${node.text}`);
    return [{ coord: near, name: chunk.scene.name, customs }];
  });
}

interface Inflight {
  key: string;
  instanceId: string;
  controller: AbortController;
  /** Why it was stopped: Cancel waits for Retry; leaving Play leaves the chunk unwritten. */
  reason: "cancel" | "leave" | null;
}

/** The one witnessing in flight: Cancel and leaving Play abort its model call itself. */
let inflight: Inflight | null = null;

export const WITNESS_CANCELLED = "cancelled";

function stop(reason: "cancel" | "leave"): void {
  if (inflight === null || inflight.reason !== null) return;
  inflight.reason = reason;
  inflight.controller.abort();
}

/** Stops the witnessing in flight; the chunk stays unwritten and waits for Retry. */
export function cancelWitness(): void {
  stop("cancel");
}

async function witness(coord: ChunkCoord): Promise<void> {
  const key = chunkKey(coord);
  const land = useLandStore.getState();
  if (witnessBlocker() !== null || land.chunks[key] !== undefined) return;
  // On a continent, another world's territory is witnessed by its own owner, never from here.
  if (foreignAt(coord) !== null) return;
  if (Object.values(land.chunks).some((chunk) => chunk.status === "writing")) return;
  const world = useWorldStore.getState();
  const active = useSessionStore.getState().activeInstance;
  const instanceId = land.instanceId;
  if (world.scene.status !== "ready" || world.genesis === null || active === null) return;
  const bible = active.cartridge.bible;
  if (bible === null || instanceId === null) return;

  const origin = world.scene.value;
  const isOrigin = coord.cx === 0 && coord.cz === 0;
  const terrain = chunkTerrain({
    seed: landSeedOf(active.instance.save),
    coord,
    origin: { floor: origin.floor },
  });
  land.setChunk(key, { status: "writing" });
  const controller = new AbortController();
  const mine: Inflight = { key, instanceId, controller, reason: null };
  inflight = mine;

  const program = await generateChunk(
    {
      bible,
      coord,
      biome: origin.biome,
      ground: origin.floor.tile,
      hole: terrain.hole,
      lore: land.lore,
      language: world.genesis.language,
      terrain,
      neighbours: neighbours(coord),
      ...(isOrigin ? { authored: origin.npcs } : {}),
    },
    { signal: controller.signal },
  );
  if (inflight === mine) inflight = null;
  if (useLandStore.getState().instanceId !== instanceId) return;
  // A cancelled witnessing writes nothing: not the chunk, not its lore, not a karma line.
  if (controller.signal.aborted) {
    if (mine.reason === "leave") {
      useLandStore.getState().forget(key);
      return;
    }
    useLandStore.getState().setChunk(key, {
      status: "failed",
      error: {
        code: WITNESS_CANCELLED,
        message: "Witnessing was cancelled; nothing was written.",
        hint: "Retry when you want this place witnessed.",
      },
    });
    return;
  }
  if (!program.ok) {
    useLandStore.getState().setChunk(key, { status: "failed", error: program.error });
    return;
  }
  const draft = program.value.graph;
  const dialogues = Object.fromEntries(
    draft.dialogues.map((dialogue) => [dialogue.npcId, serializeDialogue(dialogue)]),
  );
  const errands =
    draft.errands.length === 0 ? null : { errands: draft.errands, keepsakes: draft.keepsakes };
  const stored = await window.seed.instances.witness({
    instanceId,
    cx: coord.cx,
    cz: coord.cz,
    scene: serializeScene(draft.scene),
    dialogues,
    ...(errands === null ? {} : { errands: serializeErrands(errands) }),
    lore: draft.lore,
  });
  if (useLandStore.getState().instanceId !== instanceId) return;
  if (!stored.ok) {
    useLandStore.getState().setChunk(key, { status: "failed", error: stored.error });
    return;
  }
  useLandStore
    .getState()
    .setChunk(key, { status: "written", scene: draft.scene, dialogues, errands });
  useLandStore.getState().addLore(draft.lore);
  const customs = draft.lore.filter((node) => node.kind === "custom").map((node) => node.label);
  useWorldStore.getState().appendKarma(
    makeKarmaEntry({
      floor: useWorldStore.getState().floor,
      action: "witness",
      choice: draft.scene.name,
      effect: customs.join(" / "),
      chunk: coord,
    }),
  );
}

/** Witness wherever the player is standing, if it is unwritten and nothing else is being written. */
export function witnessHere(): void {
  const chunk = useEngineStore.getState().chunk;
  if (chunk === null) return;
  void witness(chunk)
    .catch((thrown: unknown) => {
      // Never leave a chunk "witnessing" forever: whatever broke is shown, with Retry.
      if (useLandStore.getState().chunks[chunkKey(chunk)]?.status !== "writing") return;
      useLandStore
        .getState()
        .setChunk(chunkKey(chunk), { status: "failed", error: toError(thrown, "witness-failed") });
    })
    .then(() => {
      const now = useEngineStore.getState().chunk;
      if (now !== null && (now.cx !== chunk.cx || now.cz !== chunk.cz)) witnessHere();
    });
}

/** Clears a failed chunk and tries again while the player stands on it. */
export function retryWitness(coord: ChunkCoord): void {
  useLandStore.getState().forget(chunkKey(coord));
  witnessHere();
}

/** Mounted by Play: witnessing follows the player, the land loading and the model coming online. */
export function useWitness(): void {
  useEffect(() => {
    const unsubscribe = [
      useEngineStore.subscribe((state, previous) => {
        if (state.chunk !== previous.chunk) witnessHere();
      }),
      useLandStore.subscribe((state, previous) => {
        if (state.load !== previous.load) witnessHere();
      }),
      useInferenceStore.subscribe((state, previous) => {
        if (state.probe !== previous.probe) witnessHere();
      }),
    ];
    witnessHere();
    return () => {
      for (const stop of unsubscribe) stop();
      // Leaving Play stops the model call; the chunk is unwritten again, not failed.
      stop("leave");
    };
  }, []);
}
