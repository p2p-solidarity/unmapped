// When the player first sets foot on an unwritten chunk, it is witnessed: the model writes it once
// (narrative/witness.ts) and the world's history keeps it (rev 6 phase 3: a `witness` event); from
// then on it is read, never generated — by this player and by everyone who joins the world. Walking
// never waits for this — it runs in the background and the HUD says what state the chunk is in.
//
// Before generating, an attached world is asked whether someone has written here (./claims, D15):
// a written chunk is synced and drawn with no call, someone else's stream is followed, and a
// granted claim relays the model's text to every viewer. `seen` is the head when generation began,
// so a chunk someone else wrote meanwhile keeps theirs live and ours as a variant (異聞). A chunk
// that faded into fog is witnessed anew, told its old tale (`witness:legend`), and the old witness
// becomes its legend (傳說). Nothing is witnessed while the world cannot be written here.
//
// The witness is appended from inside the model's repair loop: when main refuses it for what the
// program says (a lore link, a size, words that do not round-trip) the model is told why and
// rewrites it, as one of Rule 7's two repairs (D5); any other refusal shows at once, with Retry.

import {
  serializeDialogue,
  serializeErrands,
  serializeScene,
  type WitnessedDraft,
  witnessIndexOf,
} from "@dsl";
import {
  appendToWorld,
  onHistory,
  seenHead,
  waitForFold,
  waitForHead,
  worldNow,
  writeBlocker,
} from "@renderer/history";
import { generateChunk, type WitnessLegend } from "@renderer/narrative";
import {
  foreignAt,
  useEngineStore,
  useInferenceStore,
  useLandStore,
  useSessionStore,
  useWorldStore,
} from "@renderer/state";
import { type ChunkCoord, chunkKey, chunksAround, chunkTerrain } from "@shared/chunks";
import { chunkStands } from "@shared/history/decay";
import type { WitnessBody } from "@shared/history/types";
import { landSeedOf } from "@shared/land";
import { type AppError, err, fail, ok, type Result, toError } from "@shared/result";
import { claimTarget } from "@shared/worldProtocol";
import { useEffect } from "react";
import { makeKarmaEntry } from "../karmaFile";
import { abandonClaim, claimToWrite } from "./claims";
import { namesNearChunk } from "./names";

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
    // Opening a save migrates or catches up its world first (world.ensure): say that is what waits.
    const world = writeBlocker();
    return world?.code === "world-loading"
      ? world
      : { code: "witness-loading", message: "Reading the land…", hint: "One moment." };
  }
  // The world's history is where a witness goes: no key, read-only or diverged means nothing new.
  const world = writeBlocker();
  if (world !== null) return world;
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

/**
 * A chunk that faded into fog: the witness it grows out of and its old tale. A hidden witness is
 * named nowhere (D8), so a chunk the owner hid is written with no legend.
 */
function legendOf(coord: ChunkCoord): { supersedes: string; legend: WitnessLegend } | null {
  const now = worldNow();
  const chunk = now?.chunks[chunkKey(coord)];
  if (now === null || chunk === undefined || chunkStands(now, chunk)) return null;
  if (now.hidden[chunk.live.id] === true) return null;
  const { body } = chunk.live;
  return {
    supersedes: chunk.live.id,
    legend: {
      name: body.index.name,
      residents: body.index.npcs.map((npc) => npc.name),
      tales: body.lore.map((node) => `${node.label}: ${node.text}`),
    },
  };
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
const WITNESS_SAVE_CHANGED = "witness-save-changed";

function stop(reason: "cancel" | "leave"): void {
  if (inflight === null || inflight.reason !== null) return;
  inflight.reason = reason;
  inflight.controller.abort();
}

/** Stops the witnessing in flight; the chunk stays unwritten and waits for Retry. */
export function cancelWitness(): void {
  stop("cancel");
}

function failed(key: string, error: AppError): void {
  useLandStore.getState().setChunk(key, { status: "failed", error });
}

/** Leaves a chunk that turned out to be someone else's: drawn if the history has it, else unwritten. */
function settleElsewhere(key: string): void {
  if (useLandStore.getState().chunks[key]?.status === "writing")
    useLandStore.getState().forget(key);
}

/** The `witness` event a parsed chunk becomes: its programs, lore and index (D3). */
function witnessBody(
  coord: ChunkCoord,
  draft: WitnessedDraft,
  supersedes: string | null,
): Result<WitnessBody> {
  const dialogues = Object.fromEntries(
    draft.dialogues.map((dialogue) => [dialogue.npcId, serializeDialogue(dialogue)]),
  );
  const errands =
    draft.errands.length === 0
      ? undefined
      : serializeErrands({ errands: draft.errands, keepsakes: draft.keepsakes });
  const programs = {
    cx: coord.cx,
    cz: coord.cz,
    scene: serializeScene(draft.scene),
    dialogues,
    ...(errands === undefined ? {} : { errands }),
  };
  const index = witnessIndexOf(programs);
  if (!index.ok) return index;
  return ok({
    ...programs,
    lore: draft.lore,
    index: index.value,
    ...(supersedes === null ? {} : { supersedes }),
  });
}

async function witness(coord: ChunkCoord): Promise<void> {
  const key = chunkKey(coord);
  const land = useLandStore.getState();
  if (witnessBlocker() !== null || land.chunks[key] !== undefined) return;
  // On a continent, another world's territory is witnessed by its own owner, never from here.
  if (foreignAt(coord) !== null) return;
  if (Object.values(land.chunks).some((chunk) => chunk.status === "writing")) return;
  if (!onHistory()) return;
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
  const target = claimTarget({ kind: "chunk", cx: coord.cx, cz: coord.cz });
  const claimed = await claimToWrite(target);
  const same = (): boolean => useLandStore.getState().instanceId === instanceId;
  if (!same()) {
    abandonClaim(target, claimed);
    return;
  }
  if (claimed.kind === "refused") {
    failed(key, claimed.error);
    return;
  }
  if (claimed.kind === "written") {
    // Someone wrote it (or is done writing it): the fold brings it; no model call here.
    if (claimed.n !== null) await waitForHead(claimed.n);
    else await waitForFold((now) => now.chunks[key] !== undefined);
    if (same()) settleElsewhere(key);
    return;
  }

  const controller = new AbortController();
  const mine: Inflight = { key, instanceId, controller, reason: null };
  inflight = mine;
  const grows = legendOf(coord);
  // `seen`: the head when this generation began (D2).
  const seen = seenHead();
  const relay = claimed.relay;
  let program: Awaited<ReturnType<typeof generateChunk>>;
  try {
    program = await generateChunk(
      {
        bible,
        coord,
        biome: origin.biome,
        ground: origin.floor.tile,
        hole: terrain.hole,
        lore: useLandStore.getState().lore,
        language: world.genesis.language,
        terrain,
        neighbours: neighbours(coord),
        names: namesNearChunk(coord),
        ...(isOrigin ? { authored: origin.npcs } : {}),
        legend: grows?.legend ?? null,
      },
      {
        signal: controller.signal,
        // A chapter written meanwhile brings names this prompt never listed; they count too.
        namesNow: () => namesNearChunk(coord),
        ...(relay === null ? {} : { onDelta: (text: string) => relay.delta(text) }),
        // The witness is appended inside the repair loop: a refusal about what the program says
        // (lore links, sizes, words) is one of its two repairs (D5); any other ends it here.
        accept: async ({ graph }) => {
          if (!same()) return err(WITNESS_SAVE_CHANGED, "The save changed while this was written.");
          const body = witnessBody(coord, graph, grows?.supersedes ?? null);
          return body.ok ? appendToWorld({ kind: "witness", body: body.value, seen }) : body;
        },
      },
    );
  } catch (thrown) {
    // Whatever broke is shown, and the relay still ends below like any other failure.
    program = fail(toError(thrown, "witness-failed"));
  }
  if (inflight === mine) inflight = null;
  if (!program.ok) {
    // Every way out but an appended witness ends the relay "abort" and releases the lease.
    abandonClaim(target, claimed);
    if (!same()) return;
    // A cancelled witnessing writes nothing: not the chunk, not its lore, not a karma line.
    if (controller.signal.aborted) {
      if (mine.reason === "leave") {
        useLandStore.getState().forget(key);
        return;
      }
      failed(key, {
        code: WITNESS_CANCELLED,
        message: "Witnessing was cancelled; nothing was written.",
        hint: "Retry when you want this place witnessed.",
      });
      return;
    }
    failed(key, program.error);
    return;
  }
  // Appended (a stop that came after the append changes nothing: the world has it now).
  claimed.relay?.end("done");
  if (!same()) return;
  const draft = program.value.graph;
  // The fold drew it; if it lost a race it is a variant and the other witness stands here.
  settleElsewhere(key);
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
      failed(chunkKey(chunk), toError(thrown, "witness-failed"));
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
