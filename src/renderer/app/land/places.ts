// Places on the land (地點): asking for one, walking into it, and coming back out. A place belongs
// to the world, not the cartridge: a `place` event of its history (rev 6 phase 3, D3), so adding one
// never makes a new cartridge version or a new run, and everyone in the world walks into it. Its
// entrance is chosen by the writer (`placeSpot` over the world's gates and places; a spot taken
// meanwhile is chosen again with no model call), the model writes only what lives inside
// (`generatePlace`), and the ground is rebuilt from its seed every time it is entered
// (`buildPlace`). An otherworld (異界) is an entrance into one published AI world: placing it asks no
// model (its pack goes into the blob store, so friends can fetch it), and walking in opens the
// sandboxed player over the land (`OtherworldState.ts`). Crossing a place is the player's own
// progress (progress.json) and a `deed` the world can retell.

import { parseDialogue, parseScene, serializeDialogue, serializeScene } from "@dsl";
import { appendToWorld, onHistory, seenHead, syncWorld, writeBlocker } from "@renderer/history";
import { contentLanguage, errorLine, translate } from "@renderer/i18n";
import { generatePlace } from "@renderer/narrative/place";
import {
  type ActivePlace,
  openWorld,
  useEngineStore,
  useLandStore,
  useSessionStore,
  useWorldStore,
} from "@renderer/state";
import { bibleLanguage } from "@shared/cartridge";
import { type ChunkCoord, chunkOf } from "@shared/chunks";
import { kitTuning } from "@shared/forge";
import type { GameplayRules } from "@shared/gameplay";
import { placeIdOf } from "@shared/history/ids";
import type { PlaceBody } from "@shared/history/types";
import {
  buildPlace,
  isOtherworld,
  type LandPlace,
  type OtherworldPlace,
  PLACE_KIT,
  PLACE_LIMITS,
  placeGate,
  placeSpot,
  type WrittenPlace,
  type WrittenPlaceKind,
  wishedDirection,
} from "@shared/places";
import { err, errored, ok, type Result, ready } from "@shared/result";
import { storyEpisodes } from "@shared/story";
import type { WorkManifest } from "@shared/works";
import type { DialogueGraph } from "@shared/world";
import { makeKarmaEntry } from "../karmaFile";
import { checkpointCurrentInstance } from "../usePersistWorld";
import { clearChapterById } from "./chapters";
import { recordDeed } from "./deeds";
import { enterOtherworld } from "./OtherworldState";

/**
 * The rules a place plays under: its kit's stock tuning, with everything the player carries from
 * the land — combat, weapons, squad, pacing, progression and key bindings. No layout generation:
 * the place's ground is already built.
 */
export function placeRules(
  rules: GameplayRules | null,
  kind: WrittenPlaceKind,
): GameplayRules | null {
  if (rules === null) return null;
  const kit = PLACE_KIT[kind];
  return {
    ...rules,
    defaultKit: kit,
    kits: [...rules.kits.filter((one) => one.id !== kit), kitTuning(kit)],
    generation: null,
  };
}

/** The playable place: the stored program parsed and set on the host's ground. */
export function playablePlace(place: WrittenPlace): Result<ActivePlace> {
  const written = parseScene(place.source);
  if (!written.ok) {
    return err(
      "place-invalid",
      `The stored program of ${place.title} no longer parses: ${written.error.message}`,
      "Restore this save from a backup, or ask for a new place.",
    );
  }
  const built = buildPlace(place, written.value);
  return ok({
    id: place.id,
    title: place.title,
    graph: built.graph,
    rules: placeRules(useWorldStore.getState().gameplayRules, place.kind),
    goalExit: built.goalExit,
  });
}

/**
 * Each resident's words as the Dialogue programs a place keeps, keyed by NPC id; an error when one
 * is more than a save holds (nothing is stored then).
 */
export function residentWords(dialogues: readonly DialogueGraph[]): Result<Record<string, string>> {
  if (dialogues.length > PLACE_LIMITS.residents) {
    return err(
      "place-too-large",
      "The place has more residents than the save can hold.",
      "Ask again.",
    );
  }
  const words: Record<string, string> = {};
  for (const dialogue of dialogues) {
    const source = serializeDialogue(dialogue);
    if (source.length > PLACE_LIMITS.dialogueChars) {
      return err("place-too-large", "The model wrote more than a place can hold.", "Ask again.");
    }
    words[dialogue.npcId] = source;
  }
  return ok(words);
}

const UNWRITTEN_HINT =
  "This place was written before its residents' words were kept with it; talking never asks the model.";

/**
 * Talking to someone inside a place reads the words written with it — never the model (plan.md
 * §1.4). A resident of a place written before words were kept says so, like one on the land.
 */
export function talkInPlace(npcId: string): void {
  const session = useSessionStore.getState();
  const place = session.place;
  if (place === null) return;
  const speaker = place.graph.npcs.find((npc) => npc.id === npcId)?.name ?? npcId;
  const progress = useLandStore.getState().progress;
  const stored = progress?.places?.find((one) => one.id === place.id);
  const words =
    place.chapter === undefined
      ? stored === undefined || isOtherworld(stored)
        ? undefined
        : stored.dialogues
      : progress?.episodes?.[place.chapter]?.stage?.dialogues;
  const source = words?.[npcId];
  if (source === undefined) {
    session.showWitnessedDialogue(
      npcId,
      speaker,
      errored({
        code: "dialogue-unwritten",
        message: `What ${speaker} says has not been written yet.`,
        hint: UNWRITTEN_HINT,
      }),
    );
    return;
  }
  const dialogue = parseDialogue(source);
  session.showWitnessedDialogue(
    npcId,
    speaker,
    dialogue.ok
      ? ready(dialogue.value)
      : errored({
          code: "dialogue-invalid",
          message: `The stored words of ${speaker} no longer parse: ${dialogue.error.message}`,
          hint: "Restore this save from a backup, or ask for a new place.",
        }),
  );
}

/** The open land a place can be added to, or why there is none. */
function placeableLand(): Result<{ instanceId: string | null; places: LandPlace[] }> {
  const active = useSessionStore.getState().activeInstance;
  const land = useLandStore.getState();
  if (active === null || land.progress === null) {
    return err("place-no-land", "Places are added to open land.", "Open a world with open land.");
  }
  const places = land.progress.places ?? [];
  if (places.length >= PLACE_LIMITS.max) {
    return err("place-full", `This land already has ${PLACE_LIMITS.max} places.`);
  }
  return ok({ instanceId: land.instanceId, places });
}

/**
 * Where a new entrance goes and its id: a short walk from the player (toward the direction they
 * named), never on home, a story gate or another place.
 */
function newEntrance(
  places: readonly LandPlace[],
  wish: string,
): Result<{ id: string } & ChunkCoord> {
  const plan = useSessionStore.getState().activeInstance?.cartridge.story ?? null;
  const more = useLandStore.getState().progress?.storyMore;
  const gates = plan === null ? [] : storyEpisodes(plan, more);
  const here = useEngineStore.getState().chunk ?? chunkOf(0, 0);
  const spot = placeSpot(here, [...gates, ...places], wishedDirection(wish));
  if (spot === null) return err("place-no-room", "There is no free ground near here for a place.");
  let n = places.length + 1;
  while (places.some((one) => one.id === `p${n}`)) n += 1;
  return ok({ id: `p${n}`, ...spot });
}

/**
 * Writes a place into the world's history at a free spot near the player; a spot someone took
 * meanwhile (`place-spot-taken`) is chosen again from the fresh history, with no model call.
 */
async function appendPlace(
  body: Omit<PlaceBody, "at">,
  wish: string,
  seen: number,
): Promise<Result<{ id: string } & ChunkCoord>> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const entrance = newEntrance(useLandStore.getState().progress?.places ?? [], wish);
    if (!entrance.ok) return entrance;
    const at = { cx: entrance.value.cx, cz: entrance.value.cz };
    const stored = await appendToWorld({ kind: "place", body: { ...body, at }, seen });
    if (stored.ok) return ok({ id: placeIdOf(stored.value.id), ...at });
    if (stored.error.code !== "place-spot-taken") return stored;
    await syncWorld();
  }
  return err("place-no-room", "There is no free ground near here for a place.");
}

function randomSeed(): number {
  return crypto.getRandomValues(new Uint32Array(1))[0] ?? 1;
}

/**
 * Puts the entrance of an otherworld — one published AI world of this device — a short walk from
 * the player. Asks no model: the world is already written, and stays in `works/` (Rule 12).
 */
export async function placeOtherworld(
  work: WorkManifest,
  wish: string,
): Promise<Result<OtherworldPlace>> {
  const land = placeableLand();
  if (!land.ok) return land;
  const title = work.title.trim().slice(0, PLACE_LIMITS.titleChars) || work.workId;
  const ref = { workId: work.workId, version: work.version, contentHash: work.contentHash };
  // No key yet, or a world this device only reads: nothing new is written (D7).
  const blocked = writeBlocker();
  if (blocked !== null) return { ok: false, error: blocked };
  if (onHistory()) {
    const worldId = openWorld()?.worldId ?? null;
    if (worldId === null) return err("world-not-open", "This save's world is not open.");
    const seen = seenHead();
    const pack = await window.seed.world.packWork(worldId, ref);
    if (!pack.ok) return pack;
    const body = {
      kind: "otherworld" as const,
      title,
      seed: randomSeed(),
      work: { ...ref, pack: pack.value },
    };
    const placed = await appendPlace(body, wish, seen);
    if (!placed.ok) return placed;
    return ok({ ...placed.value, kind: "otherworld", title, work: ref, cleared: false });
  }
  const entrance = newEntrance(land.value.places, wish);
  if (!entrance.ok) return entrance;
  const place: OtherworldPlace = {
    ...entrance.value,
    kind: "otherworld",
    title,
    work: ref,
    cleared: false,
  };
  useLandStore.getState().addPlace(place);
  return ok(place);
}

/**
 * Asks the model for a place of `kind`, with what each resident says, and puts its entrance a
 * short walk from the player. Costs one model call (plus at most two repairs, whether the parser or
 * the world's history refused it); nothing is added when it fails.
 */
export async function createPlace(
  kind: WrittenPlaceKind,
  wish: string,
): Promise<Result<WrittenPlace>> {
  const active = useSessionStore.getState().activeInstance;
  const land = useLandStore.getState();
  const placeable = placeableLand();
  if (!placeable.ok) return placeable;
  if (active === null) return err("place-no-land", "Places are added to open land.");
  const instanceId = placeable.value.instanceId;
  const history = onHistory();
  const blocked = writeBlocker();
  if (blocked !== null) return { ok: false, error: blocked };
  // `seen`: the history's head when this place began to be written (D2).
  const seen = seenHead();
  const bible = active.cartridge.bible;
  const rules = useWorldStore.getState().gameplayRules;
  const language =
    useWorldStore.getState().genesis?.language ?? bibleLanguage(bible) ?? contentLanguage();
  const kept: { place: WrittenPlace | null } = { place: null };
  const written = await generatePlace({
    kind,
    wish,
    combat: rules?.combat !== null && rules?.combat !== undefined,
    language,
    bible,
    // Kept from inside the model's repair loop (D5): a size or a program the world's history
    // refuses goes back to the model; a spot taken meanwhile is chosen again with no model call.
    accept: async ({ graph: { graph, dialogues } }) => {
      if (
        useLandStore.getState().instanceId !== instanceId ||
        useSessionStore.getState().activeInstance?.instance.meta.instanceId !== instanceId
      ) {
        return err("place-save-changed", "The save changed while this place was being written.");
      }
      const words = residentWords(dialogues);
      if (!words.ok) return words;
      const seed = randomSeed();
      const source = `${serializeScene(graph).replace(/\n*$/, "")}\n`;
      if (source.length > PLACE_LIMITS.sourceChars) {
        return err("place-too-large", "The model wrote more than a place can hold.", "Ask again.");
      }
      const title = graph.name.slice(0, PLACE_LIMITS.titleChars) || kind;
      const body = { kind, title, seed, source, dialogues: words.value };
      if (history) {
        const placed = await appendPlace(body, wish, seen);
        if (!placed.ok) return placed;
        kept.place = { ...placed.value, ...body, cleared: false };
        return ok(undefined);
      }
      // Read again: the land may have gained a place while the model wrote this one.
      const entrance = newEntrance(useLandStore.getState().progress?.places ?? [], wish);
      if (!entrance.ok) return entrance;
      const place: WrittenPlace = { ...entrance.value, ...body, cleared: false };
      land.addPlace(place);
      kept.place = place;
      return ok(undefined);
    },
  });
  if (!written.ok) return written;
  return kept.place === null ? err("place-not-kept", "Nothing was kept.") : ok(kept.place);
}

/** Walks into a place: the land is saved first, then the place is played on top of it. */
export function enterPlace(id: string): void {
  const session = useSessionStore.getState();
  const place = useLandStore.getState().progress?.places?.find((one) => one.id === id);
  if (place === undefined) {
    session.toast("danger", translate("land.placeMissing"));
    return;
  }
  if (isOtherworld(place)) {
    enterOtherworld(place);
    return;
  }
  const playable = playablePlace(place);
  if (!playable.ok) {
    session.toast("danger", errorLine(playable.error));
    return;
  }
  void checkpointCurrentInstance();
  const gate = placeGate(place);
  // Back out onto the ford just south of the entrance, not onto the entrance itself.
  session.enterPlace(playable.value, { x: gate.x, z: gate.z + 1.4 });
}

/** Leaves the place; through its far end it counts as crossed and the land remembers it. */
export function leavePlace(finished: boolean): void {
  const session = useSessionStore.getState();
  const place = session.place;
  if (place === null) return;
  // A chapter played as a place is the story's, not one of the land's own places.
  if (place.chapter !== undefined) {
    if (finished) clearChapterById(place.chapter, place.graph.quests[0]?.text ?? place.title);
    session.leavePlace();
    return;
  }
  if (finished) {
    useLandStore.getState().setPlaceCleared(place.id);
    recordDeed("place.crossed", useLandStore.getState().world?.placeEvents[place.id] ?? null);
    const world = useWorldStore.getState();
    const stored = useLandStore.getState().progress?.places?.find((one) => one.id === place.id);
    world.appendKarma(
      makeKarmaEntry({
        floor: world.floor,
        action: "witness",
        choice: `crossed ${place.title}`,
        effect: place.graph.quests[0]?.text ?? "",
        ...(stored === undefined ? {} : { chunk: { cx: stored.cx, cz: stored.cz } }),
      }),
    );
    session.toast("success", translate("land.crossed", { title: place.title }));
  }
  session.leavePlace();
}
