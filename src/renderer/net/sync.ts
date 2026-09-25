// Mirrors the world into the shared Y.Doc: `world.oui` as a Y.Text, karma as a Y.Array of JSON
// lines. Positions and camera are per-frame data and deliberately stay out of the doc.
//
// Direction: the host owns world.oui (it is the machine running generation); every peer parses
// what arrives and feeds worldStore. Karma flows both ways, deduped by `at + choice`.

import { parseScene } from "@dsl/index";
import { useWorldStore } from "@renderer/state";
import { errored, ready } from "@shared/result";
import { BIOMES, CHOICE_ACTIONS, type KarmaEntry, type WorldMutation } from "@shared/world";
import { useEffect } from "react";
import type * as Y from "yjs";
import { z } from "zod";
import type { Room } from "./room";

/** Transaction origin for our own writes, so observers can ignore the echo. */
const LOCAL_ORIGIN = "local";
export const SCENE_KEY = "world.oui";
export const KARMA_KEY = "karma";
export const MUTATION_KEY = "world.mutation";

const KARMA_ACTIONS = [...CHOICE_ACTIONS, "wish", "genesis", "floor"] as const;

const karmaSchema = z.object({
  at: z.string().min(1),
  floor: z.number().int(),
  npcId: z.string().nullable(),
  choice: z.string(),
  action: z.enum(KARMA_ACTIONS),
  effect: z.string(),
});
const mutationSchema = z.object({
  skyColor: z.string().nullable(),
  fogDensity: z.number().nullable(),
  biome: z.enum(BIOMES).nullable(),
});

/** Identity of a karma entry on the wire: the same choice at the same instant is the same event. */
export function karmaKey(entry: Pick<KarmaEntry, "at" | "choice">): string {
  return `${entry.at}|${entry.choice}`;
}

function decodeKarma(line: string): KarmaEntry | null {
  try {
    const parsed = karmaSchema.safeParse(JSON.parse(line));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

function encodeMutation(mutation: WorldMutation | null): string {
  return JSON.stringify(mutation);
}

function decodeMutation(source: string): WorldMutation | null | undefined {
  try {
    const raw: unknown = JSON.parse(source);
    if (raw === null) return null;
    const parsed = mutationSchema.safeParse(raw);
    return parsed.success ? parsed.data : undefined;
  } catch {
    return undefined;
  }
}

export function useRoomSync(room: Room | null): void {
  useEffect(() => {
    if (room === null) return;

    const text = room.doc.getText(SCENE_KEY);
    const karma = room.doc.getArray<string>(KARMA_KEY);
    const mutation = room.doc.getText(MUTATION_KEY);

    const pushScene = (source: string) => {
      if (source.length === 0 || text.toString() === source) return;
      room.doc.transact(() => {
        text.delete(0, text.length);
        text.insert(0, source);
      }, LOCAL_ORIGIN);
    };

    const applyRemoteScene = () => {
      const source = text.toString();
      if (source.length === 0) return;
      const store = useWorldStore.getState();
      if (store.sceneSource === source) return;
      const parsed = parseScene(source);
      store.setScene(source, parsed.ok ? ready(parsed.value) : errored(parsed.error));
    };

    const pushMutation = (value: WorldMutation | null) => {
      const encoded = encodeMutation(value);
      if (mutation.toString() === encoded) return;
      room.doc.transact(() => {
        mutation.delete(0, mutation.length);
        mutation.insert(0, encoded);
      }, LOCAL_ORIGIN);
    };

    const applyRemoteMutation = () => {
      const remote = decodeMutation(mutation.toString());
      if (remote === undefined) return;
      const local = useWorldStore.getState().meta?.mutation ?? null;
      if (encodeMutation(local) === encodeMutation(remote)) return;
      useWorldStore.getState().setMutationOverlay(remote);
    };

    const pushKarma = (entries: readonly KarmaEntry[]) => {
      const known = new Set<string>();
      for (const line of karma.toArray()) {
        const entry = decodeKarma(line);
        if (entry !== null) known.add(karmaKey(entry));
      }
      const additions = entries
        .filter((entry) => !known.has(karmaKey(entry)))
        .map((entry) => JSON.stringify(entry));
      if (additions.length === 0) return;
      room.doc.transact(() => {
        karma.push(additions);
      }, LOCAL_ORIGIN);
    };

    const applyRemoteKarma = () => {
      const store = useWorldStore.getState();
      const seen = new Set(store.karma.map(karmaKey));
      for (const line of karma.toArray()) {
        const entry = decodeKarma(line);
        if (entry === null) continue;
        const key = karmaKey(entry);
        if (seen.has(key)) continue;
        seen.add(key);
        useWorldStore.getState().appendKarma(entry);
      }
    };

    const onText = (_event: Y.YTextEvent, transaction: Y.Transaction) => {
      if (transaction.origin === LOCAL_ORIGIN) return;
      applyRemoteScene();
    };
    const onKarma = (_event: Y.YArrayEvent<string>, transaction: Y.Transaction) => {
      if (transaction.origin === LOCAL_ORIGIN) return;
      applyRemoteKarma();
    };
    const onMutation = (_event: Y.YTextEvent, transaction: Y.Transaction) => {
      if (transaction.origin === LOCAL_ORIGIN) return;
      applyRemoteMutation();
    };
    text.observe(onText);
    karma.observe(onKarma);
    mutation.observe(onMutation);

    const initial = useWorldStore.getState();
    if (room.host) pushScene(initial.sceneSource);
    else applyRemoteScene();
    if (room.host) pushMutation(initial.meta?.mutation ?? null);
    else applyRemoteMutation();
    pushKarma(initial.karma);
    applyRemoteKarma();
    room.provider.awareness.setLocalStateField("floor", initial.floor);

    const unsubscribe = useWorldStore.subscribe((state, previous) => {
      if (room.host && state.sceneSource !== previous.sceneSource) pushScene(state.sceneSource);
      if (room.host && state.meta?.mutation !== previous.meta?.mutation) {
        pushMutation(state.meta?.mutation ?? null);
      }
      if (state.karma !== previous.karma) pushKarma(state.karma);
      if (state.floor !== previous.floor) {
        room.provider.awareness.setLocalStateField("floor", state.floor);
      }
    });

    return () => {
      unsubscribe();
      text.unobserve(onText);
      karma.unobserve(onKarma);
      mutation.unobserve(onMutation);
    };
  }, [room]);
}
