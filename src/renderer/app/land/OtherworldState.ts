// An otherworld (異界) seen from the land: the one layer over Play that plays its AI world, or the
// workshop writing a new one. The world itself only ever runs in the sandboxed work frame (Rule 12);
// this module decides when that frame opens and what the land remembers afterwards.
//
// It never sets `sessionStore.place` — an otherworld has no Scene to draw. While a layer is open the
// land holds still: the encounter clock is paused, which also locks the land's input through the one
// input-lock rule (`useInputLock`). What the land writes on completion (cleared, the karma line, the
// toast, the `place.crossed` deed) comes from the place as the world's history stores it (rev 6
// phase 3: places are read from the fold), never from anything the frame sent. The journey's id and
// whether it was crossed are the player's own progress (progress.json).

import { errorLine, translate } from "@renderer/i18n";
import { setUsageScope, usageScope } from "@renderer/llm/usage";
import { useEncounterStore, useLandStore, useSessionStore, useWorldStore } from "@renderer/state";
import type { OtherworldPlace } from "@shared/places";
import { err, fromResult, type Loadable, loading, ok, type Result } from "@shared/result";
import type { UsageScope } from "@shared/usage";
import type { WorkLookSource, WorkRef } from "@shared/works";
import { create } from "zustand";
import { makeKarmaEntry } from "../karmaFile";
import { checkpointCurrentInstance } from "../usePersistWorld";
import { recordDeed } from "./deeds";

export type OtherworldLayer =
  | {
      kind: "play";
      placeId: string;
      title: string;
      /** The pinned journey this entrance plays, once found or made. */
      play: Loadable<string>;
      /** Set once the world reported completion in this sitting (it is honoured once). */
      completed: boolean;
    }
  | {
      kind: "workshop";
      draftId: string;
      initialRequest: string;
      /** The player's words in the place maker; also where they asked the entrance to stand. */
      wish: string;
      /** The world it is written in: its look is the reference of every picture drawn. */
      from: WorkLookSource | null;
      /** The scope Play tagged model calls with, restored when the workshop closes. */
      scope: UsageScope | null;
    };

interface OtherworldState {
  layer: OtherworldLayer | null;
  /** Bumped whenever a layer opens, so a late answer for an earlier one is dropped. */
  seq: number;
}

export const useOtherworldStore = create<OtherworldState>()(() => ({ layer: null, seq: 0 }));

let release: (() => void) | null = null;

/**
 * Holds the land still while a layer is open: the encounter clock stays paused (a roster rebuilt
 * meanwhile is paused again), so no foe walks up to the player standing at the entrance and the
 * land's keys stay locked. Released to what it was before.
 */
function holdLand(): void {
  if (release !== null) return;
  const before = useEncounterStore.getState().paused;
  const keep = (): void => {
    if (!useEncounterStore.getState().paused) useEncounterStore.setState({ paused: true });
  };
  keep();
  const unsubscribe = useEncounterStore.subscribe(keep);
  release = () => {
    unsubscribe();
    useEncounterStore.setState({ paused: before });
    release = null;
  };
}

function open(layer: OtherworldLayer): number {
  const seq = useOtherworldStore.getState().seq + 1;
  useOtherworldStore.setState({ layer, seq });
  holdLand();
  return seq;
}

/** Closes whatever layer is open; the player is where they stood, at the entrance. */
export function closeOtherworld(): void {
  const layer = useOtherworldStore.getState().layer;
  if (layer === null) return;
  useOtherworldStore.setState({ layer: null });
  release?.();
  // The workshop tagged calls with its draft; Play's own calls go back to the save (unless Play
  // itself is closing, which clears its scope on its own).
  if (
    layer.kind === "workshop" &&
    layer.scope !== null &&
    usageScope()?.kind === "work" &&
    useSessionStore.getState().screen === "play"
  ) {
    setUsageScope(layer.scope);
  }
  if (layer.kind === "play") void checkpointCurrentInstance();
}

function sameRef(a: WorkRef | undefined, b: WorkRef): boolean {
  return (
    a !== undefined &&
    a.workId === b.workId &&
    a.version === b.version &&
    a.contentHash === b.contentHash
  );
}

/**
 * The journey this entrance plays: its stored one while that is still pinned to exactly this
 * revision, else a fresh one (a save restored on another machine keeps no `work-plays/`).
 */
async function pinnedPlay(place: OtherworldPlace): Promise<Result<string>> {
  if (place.playId !== undefined) {
    const stored = await window.seed.works.readPlay(place.playId);
    if (
      stored.ok &&
      stored.value.worlds.length === 1 &&
      sameRef(stored.value.worlds[0], place.work)
    ) {
      return ok(place.playId);
    }
    if (
      !stored.ok &&
      stored.error.code !== "play-missing" &&
      stored.error.code !== "play-invalid"
    ) {
      return stored;
    }
  }
  const created = await window.seed.works.createPlay({ title: place.title, worlds: [place.work] });
  if (created.ok) return ok(created.value.playId);
  if (created.error.code === "work-missing") {
    return err(
      "work-missing",
      `The world behind ${place.title} (${place.work.workId}@${place.work.version}) is not on this device.`,
      "Otherworlds stay in the AI worlds of the device that placed them; import or publish that world here.",
    );
  }
  return created;
}

/** Stores the journey's id with its place (the player's own progress; the land store checkpoints it). */
function rememberPlay(instanceId: string | null, placeId: string, playId: string): void {
  const land = useLandStore.getState();
  if (land.instanceId !== instanceId || land.progress === null) return;
  const stored = land.progress.places?.find((one) => one.id === placeId);
  if (stored?.kind !== "otherworld" || stored.playId === playId) return;
  land.setPlacePlay(placeId, playId);
}

/** Walks into an otherworld: the land is saved first, then its world opens over the land. */
export function enterOtherworld(place: OtherworldPlace): void {
  if (useOtherworldStore.getState().layer !== null) return;
  void checkpointCurrentInstance();
  const instanceId = useLandStore.getState().instanceId;
  const seq = open({
    kind: "play",
    placeId: place.id,
    title: place.title,
    play: loading(),
    completed: false,
  });
  void pinnedPlay(place).then((result) => {
    const now = useOtherworldStore.getState();
    if (now.seq !== seq || now.layer?.kind !== "play") return;
    if (result.ok) rememberPlay(instanceId, place.id, result.value);
    useOtherworldStore.setState({ layer: { ...now.layer, play: fromResult(result) } });
  });
}

/**
 * The world said it is done (`host.complete`): the place is crossed. Everything written here is the
 * host's — the stored title and chunk — and it happens once per sitting however often a world says so.
 */
export function completeOtherworld(): void {
  const layer = useOtherworldStore.getState().layer;
  if (layer?.kind !== "play" || layer.completed) return;
  useOtherworldStore.setState({ layer: { ...layer, completed: true } });
  const land = useLandStore.getState();
  const stored = land.progress?.places?.find((one) => one.id === layer.placeId);
  if (stored === undefined || stored.kind !== "otherworld") return;
  land.setPlaceCleared(stored.id);
  recordDeed("place.crossed", land.world?.placeEvents[stored.id] ?? null);
  const world = useWorldStore.getState();
  world.appendKarma(
    makeKarmaEntry({
      floor: world.floor,
      action: "witness",
      choice: `crossed ${stored.title}`,
      effect: "",
      chunk: { cx: stored.cx, cz: stored.cz },
    }),
  );
  useSessionStore.getState().toast("success", translate("land.crossed", { title: stored.title }));
}

/**
 * Opens the workshop over Play to write a new otherworld from the player's words. The place maker
 * closes; the first version saved there places its entrance (`OtherworldLayer`).
 */
export async function writeOtherworld(
  words: string,
  title: string,
  wish: string,
): Promise<Result<void>> {
  const draft = await window.seed.works.createDraft(title);
  if (!draft.ok) return draft;
  const manifest = useSessionStore.getState().activeInstance?.cartridge.manifest ?? null;
  useSessionStore.getState().closeTweak();
  open({
    kind: "workshop",
    draftId: draft.value.draftId,
    initialRequest: words,
    wish,
    from:
      manifest === null ? null : { cartridgeId: manifest.cartridgeId, version: manifest.version },
    scope: usageScope(),
  });
  return ok(undefined);
}

/** Toasts where an entrance was placed, or why it was not. */
export function toastPlaced(result: Result<OtherworldPlace>): void {
  const session = useSessionStore.getState();
  if (result.ok) {
    const { title, cx, cz } = result.value;
    session.toast("success", translate("land.otherworldPlaced", { title, cx, cz }));
  } else {
    session.toast("danger", errorLine(result.error));
  }
}
