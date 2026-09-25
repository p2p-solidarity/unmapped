// Places on the land (地點): asking for one, walking into it, and coming back out. A place is the
// save's own (`land.places`), so adding one never makes a new cartridge version or a new run; its
// entrance is chosen by the host, the model writes only what lives inside (`generatePlace`), and the
// ground is rebuilt from its seed every time it is entered (`buildPlace`).

import { parseScene, serializeScene } from "@dsl";
import { generatePlace } from "@renderer/narrative/place";
import {
  type ActivePlace,
  useEngineStore,
  useLandStore,
  useSessionStore,
  useWorldStore,
} from "@renderer/state";
import { bibleLanguage } from "@shared/cartridge";
import { chunkOf } from "@shared/chunks";
import { kitTuning } from "@shared/forge";
import type { GameplayRules } from "@shared/gameplay";
import {
  buildPlace,
  type LandPlace,
  PLACE_KIT,
  PLACE_LIMITS,
  type PlaceKind,
  placeGate,
  placeSpot,
  wishedDirection,
} from "@shared/places";
import { err, ok, type Result } from "@shared/result";
import { storyEpisodes } from "@shared/story";
import { makeKarmaEntry } from "../karmaFile";
import { checkpointCurrentInstance } from "../usePersistWorld";
import { clearChapterById } from "./chapters";

/**
 * The rules a place plays under: its kit's stock tuning, with everything the player carries from
 * the land — combat, weapons, squad, pacing, progression and key bindings. No layout generation:
 * the place's ground is already built.
 */
export function placeRules(rules: GameplayRules | null, kind: PlaceKind): GameplayRules | null {
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
export function playablePlace(place: LandPlace): Result<ActivePlace> {
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
 * Asks the model for a place of `kind` and puts its entrance a short walk from the player. Costs
 * one model call; nothing is added when it fails.
 */
export async function createPlace(kind: PlaceKind, wish: string): Promise<Result<LandPlace>> {
  const active = useSessionStore.getState().activeInstance;
  const land = useLandStore.getState();
  const progress = land.progress;
  if (active === null || progress === null) {
    return err("place-no-land", "Places are added to open land.", "Open a world with open land.");
  }
  const places = progress.places ?? [];
  if (places.length >= PLACE_LIMITS.max) {
    return err("place-full", `This land already has ${PLACE_LIMITS.max} places.`);
  }
  const bible = active.cartridge.bible;
  const rules = useWorldStore.getState().gameplayRules;
  const language =
    useWorldStore.getState().genesis?.language ?? bibleLanguage(bible) ?? navigator.language;
  const written = await generatePlace({
    kind,
    wish,
    combat: rules?.combat !== null && rules?.combat !== undefined,
    language,
    bible,
  });
  if (!written.ok) return written;

  const plan = active.cartridge.story ?? null;
  const gates = plan === null ? [] : storyEpisodes(plan, progress.storyMore);
  const here = useEngineStore.getState().chunk ?? chunkOf(0, 0);
  const spot = placeSpot(here, [...gates, ...places], wishedDirection(wish));
  if (spot === null) return err("place-no-room", "There is no free ground near here for a place.");

  let n = places.length + 1;
  while (places.some((one) => one.id === `p${n}`)) n += 1;
  const seed = crypto.getRandomValues(new Uint32Array(1))[0] ?? 1;
  const source = `${serializeScene(written.value.graph).replace(/\n*$/, "")}\n`;
  if (source.length > PLACE_LIMITS.sourceChars) {
    return err("place-too-large", "The model wrote more than a place can hold.", "Ask again.");
  }
  const place: LandPlace = {
    id: `p${n}`,
    kind,
    title: written.value.graph.name.slice(0, PLACE_LIMITS.titleChars) || kind,
    ...spot,
    seed,
    source,
    cleared: false,
  };
  land.addPlace(place);
  return ok(place);
}

/** Walks into a place: the land is saved first, then the place is played on top of it. */
export function enterPlace(id: string): void {
  const session = useSessionStore.getState();
  const place = useLandStore.getState().progress?.places?.find((one) => one.id === id);
  if (place === undefined) {
    session.toast("danger", "That place is not on this land.");
    return;
  }
  const playable = playablePlace(place);
  if (!playable.ok) {
    session.toast("danger", playable.error.message);
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
    session.toast("success", `Crossed ${place.title}`);
  }
  session.leavePlace();
}
