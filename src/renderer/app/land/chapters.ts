// Story chapters in the game itself (@shared/chapter). A chapter is written once — by the model,
// ahead of the player or at the gate — and stored in the save; after that it is read, never
// generated. On the land its people, finds and foes stand around the gate: talking, opening and
// defeating are recorded in the chapter's stage, and the host clears the chapter when nothing is
// left. A climb or a maze is played as a place and is cleared by reaching its far end.

import { type ChapterDraft, serializeScene } from "@dsl";
import { readChapter } from "@renderer/engine2d/chapterLayer";
import { contentLanguage, translate } from "@renderer/i18n";
import { generateChapter } from "@renderer/narrative/chapter";
import { generatePlace } from "@renderer/narrative/place";
import { useLandStore, useSessionStore, useWorldStore } from "@renderer/state";
import { bibleLanguage } from "@shared/cartridge";
import {
  CHAPTER_LIMITS,
  type ChapterParts,
  type ChapterStage,
  chapterKind,
  chapterLeft,
  chapterPlaceKind,
  parseChapterMonster,
  parseChapterTarget,
} from "@shared/chapter";
import { type AppError, err, errored, fail, ok, type Result, ready } from "@shared/result";
import { episodeGate, mergeCarry, type StoryEpisode, storyEpisodes } from "@shared/story";
import { makeKarmaEntry } from "../karmaFile";
import { checkpointCurrentInstance } from "../usePersistWorld";
import { playablePlace, residentWords } from "./places";

export const CHAPTER_CANCELLED = "chapter-cancelled";

function episodeById(id: string): StoryEpisode | null {
  const plan = useSessionStore.getState().activeInstance?.cartridge.story ?? null;
  if (plan === null) return null;
  const more = useLandStore.getState().progress?.storyMore;
  return storyEpisodes(plan, more).find((episode) => episode.id === id) ?? null;
}

function stageOf(id: string): ChapterStage | null {
  return useLandStore.getState().progress?.episodes?.[id]?.stage ?? null;
}

/** A failed call that was aborted is a cancellation, whatever the transport said about it. */
function cancelledOr(error: AppError, signal: AbortSignal): Result<never> {
  return signal.aborted ? err(CHAPTER_CANCELLED, "Cancelled; nothing was changed.") : fail(error);
}

export function chapterParts(draft: ChapterDraft): ChapterParts {
  return {
    npcs: draft.npcs.map((npc) => npc.id),
    treasures: draft.treasures.map((treasure) => treasure.id),
    monsters: draft.monsters.map((monster) => monster.id),
  };
}

/**
 * Writes one chapter and stores it in the save: a Chapter program for the land, or a place's
 * Scene program and its residents' words for a climb or a maze. One model call (plus at most two
 * repairs); aborting `signal` stops the call itself. Nothing is stored when it fails, when the call
 * was aborted before its reply or when the save changed meanwhile. Callers go through
 * `chapterJobs.ts`, so one chapter is only ever written once at a time.
 */
export async function writeChapter(
  episode: StoryEpisode,
  signal: AbortSignal,
): Promise<Result<ChapterStage>> {
  const active = useSessionStore.getState().activeInstance;
  const land = useLandStore.getState();
  if (active === null || land.progress === null) {
    return err("chapter-no-land", "Chapters are played on open land.", "Open a story world.");
  }
  const instanceId = land.instanceId;
  const bible = active.cartridge.bible;
  const world = useWorldStore.getState();
  const combat = world.gameplayRules?.combat !== null && world.gameplayRules?.combat !== undefined;
  const language = world.genesis?.language ?? bibleLanguage(bible) ?? contentLanguage();
  const kind = chapterKind(episode.kind);
  const place = chapterPlaceKind(kind);
  let source: string;
  let dialogues: Record<string, string> | null = null;
  if (place === null) {
    const carry = land.progress.storyCarry ?? null;
    const written = await generateChapter({
      title: episode.title,
      place: episode.place,
      kind: episode.kind,
      brief: episode.brief,
      logline: active.cartridge.story?.logline ?? "",
      carry: carry === null ? null : JSON.stringify(carry),
      combat,
      language,
      bible,
      signal,
    });
    if (!written.ok) return cancelledOr(written.error, signal);
    source = `${written.value.source.replace(/\n*$/, "")}\n`;
  } else {
    const written = await generatePlace({
      kind: place,
      wish: `${episode.title} — ${episode.brief}`,
      combat,
      language,
      bible,
      signal,
    });
    if (!written.ok) return cancelledOr(written.error, signal);
    source = `${serializeScene(written.value.graph.graph).replace(/\n*$/, "")}\n`;
    const words = residentWords(written.value.graph.dialogues);
    if (!words.ok) return words;
    dialogues = words.value;
  }
  // A chapter that made it back before a stop is kept: it is paid for, and a resume would ask again.
  if (useLandStore.getState().instanceId !== instanceId) {
    return err(CHAPTER_CANCELLED, "The save changed meanwhile; nothing was changed.");
  }
  if (source.length > CHAPTER_LIMITS.sourceChars) {
    return err("chapter-too-large", "The model wrote more than a chapter can hold.", "Retry.");
  }
  const seed = crypto.getRandomValues(new Uint32Array(1))[0] ?? 1;
  const stage: ChapterStage = {
    kind,
    source,
    ...(dialogues === null ? {} : { dialogues }),
    seed,
    found: [],
    felled: [],
    met: [],
  };
  useLandStore.getState().setEpisode(episode.id, { stage });
  void checkpointCurrentInstance();
  return ok(stage);
}

/** Records one thing done in a chapter; clears the chapter when that was the last. */
function mark(episodeId: string, field: "found" | "felled" | "met", localId: string): void {
  const stage = stageOf(episodeId);
  const episode = episodeById(episodeId);
  if (stage === null || episode === null || stage[field].includes(localId)) return;
  const next = { ...stage, [field]: [...stage[field], localId].slice(-CHAPTER_LIMITS.doneIds) };
  useLandStore.getState().setEpisode(episodeId, { stage: next });
  const draft = next.kind === "land" ? readChapter(next.source) : null;
  if (draft === null) return;
  const left = chapterLeft(chapterParts(draft), next);
  if (left.talk + left.find + left.defeat > 0) {
    void checkpointCurrentInstance();
    return;
  }
  clearChapter(
    episode,
    draft.goal,
    draft.treasures.flatMap((treasure) => treasure.loot),
  );
}

/** Marks a chapter cleared, carries on what it gave and remembers it in karma. */
export function clearChapter(episode: StoryEpisode, summary: string, earned: string[]): void {
  const land = useLandStore.getState();
  if (land.progress?.episodes?.[episode.id]?.cleared === true) return;
  land.setEpisode(episode.id, { cleared: true, summary });
  const before = land.progress?.storyCarry ?? null;
  land.setStoryCarry(mergeCarry(before, earned.length === 0 ? null : { [episode.title]: earned }));
  const world = useWorldStore.getState();
  world.appendKarma(
    makeKarmaEntry({
      floor: world.floor,
      action: "witness",
      choice: `cleared chapter ${episode.title}`,
      effect: summary,
      chunk: { cx: episode.cx, cz: episode.cz },
    }),
  );
  useSessionStore
    .getState()
    .toast("success", translate("land.chapterClearedToast", { title: episode.title }));
  void checkpointCurrentInstance();
}

/** A place chapter's far end was reached. */
export function clearChapterById(episodeId: string, summary: string): void {
  const episode = episodeById(episodeId);
  if (episode !== null) clearChapter(episode, summary, []);
}

function chapterAt(targetId: string) {
  const at = parseChapterTarget(targetId);
  const stage = at === null ? null : stageOf(at.episodeId);
  const draft = stage === null ? null : readChapter(stage.source);
  return at === null || draft === null ? null : { ...at, draft };
}

/** Talking to someone of a chapter: their words were written with the chapter. */
export function talkChapter(targetId: string): void {
  const session = useSessionStore.getState();
  const found = chapterAt(targetId);
  const npc = found?.draft.npcs.find((one) => one.id === found.localId);
  if (found === null || npc === undefined) {
    session.toast("danger", translate("land.notChapterPerson"));
    return;
  }
  const dialogue = found.draft.dialogues.find((one) => one.npcId === npc.id);
  session.showWitnessedDialogue(
    targetId,
    npc.name,
    dialogue === undefined
      ? errored({
          code: "chapter-dialogue-missing",
          message: `What ${npc.name} says was not written.`,
          hint: "Rewrite this chapter from its gate.",
        })
      : ready(dialogue),
  );
  mark(found.episodeId, "met", npc.id);
}

export function openChapterTreasure(targetId: string): void {
  const session = useSessionStore.getState();
  const found = chapterAt(targetId);
  const treasure = found?.draft.treasures.find((one) => one.id === found.localId);
  if (found === null || treasure === undefined) {
    session.toast("danger", translate("land.notChapterTreasure"));
    return;
  }
  if (stageOf(found.episodeId)?.found.includes(treasure.id)) return;
  const world = useWorldStore.getState();
  if (treasure.loot.length > 0) world.addMaterials(treasure.loot);
  world.appendKarma(
    makeKarmaEntry({
      floor: world.floor,
      action: "trade",
      choice: `opened ${treasure.id}`,
      effect: treasure.loot.join(", "),
    }),
  );
  session.toast(
    treasure.loot.length > 0 ? "success" : "info",
    treasure.loot.length > 0
      ? translate("land.found", { items: treasure.loot.join(", ") })
      : translate("land.empty"),
  );
  mark(found.episodeId, "found", treasure.id);
}

/** A combatant fell on the land; if it was a chapter's, the chapter remembers. */
export function chapterFelled(combatantId: string): void {
  const at = parseChapterMonster(combatantId);
  if (at !== null) mark(at.episodeId, "felled", at.localId);
}

/** Walks into a chapter that is a climb or a maze; the land is saved first. */
export function enterChapterPlace(episode: StoryEpisode): Result<void> {
  const stage = stageOf(episode.id);
  const kind = stage === null ? null : chapterPlaceKind(stage.kind);
  if (stage === null || kind === null) {
    return err("chapter-not-place", "This chapter is played on the land, around its gate.");
  }
  const playable = playablePlace({
    id: episode.id,
    kind,
    title: episode.title,
    cx: episode.cx,
    cz: episode.cz,
    seed: stage.seed,
    source: stage.source,
    cleared: false,
  });
  if (!playable.ok) return playable;
  void checkpointCurrentInstance();
  const gate = episodeGate(episode);
  useSessionStore
    .getState()
    .enterPlace({ ...playable.value, chapter: episode.id }, { x: gate.x, z: gate.z + 1.4 });
  return ok(undefined);
}
