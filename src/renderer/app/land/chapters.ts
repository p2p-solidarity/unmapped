// Story chapters in the game itself (@shared/chapter). A chapter is written once — by the model,
// ahead of the player or at the gate — and kept in the world's history (a `chapter` event, rev 6
// phase 3; before a save has a world, in the save); after that it is read, never generated, by
// everyone in the world. An attached world is asked first whether someone wrote it (`chapter:eN`,
// D15). On the land its people, finds and foes stand around the gate: talking, opening and
// defeating are the player's own progress, and the host clears the chapter when nothing is left
// (a `chapter.cleared` deed). A climb or a maze is played as a place and is cleared by reaching
// its far end.

import { type ChapterDraft, serializeScene } from "@dsl";
import { readChapter } from "@renderer/engine2d/chapterLayer";
import {
  appendToWorld,
  onHistory,
  seenHead,
  waitForFold,
  waitForHead,
  worldNow,
  writeBlocker,
} from "@renderer/history";
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
import { type AppError, err, errored, fail, ok, type Result, ready, toError } from "@shared/result";
import {
  episodeGate,
  mergeCarry,
  STORY_LIMITS,
  type StoryEpisode,
  storyEpisodes,
} from "@shared/story";
import { claimTarget } from "@shared/worldProtocol";
import { makeKarmaEntry } from "../karmaFile";
import { checkpointCurrentInstance } from "../usePersistWorld";
import { abandonClaim, type Claimed, claimToWrite } from "./claims";
import { recordDeed } from "./deeds";
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

/**
 * The chapter as the world's history holds it, with this player's progress in it; "unwritten"
 * when the history has none; an error for one that cannot be played in the game (an AI-work or a
 * closed chapter reads as told).
 */
function chapterFromWorld(episodeId: string): Result<ChapterStage> | "unwritten" {
  const chapter = useLandStore.getState().world?.chapters[episodeId];
  if (chapter === undefined) return "unwritten";
  const stage = stageOf(episodeId);
  return stage === null
    ? err("chapter-told", "This chapter was told in another way and is not played in the game.")
    : ok(stage);
}

/** Appends a chapter event: authored episodes stand alone, continued ones name their story.more. */
async function appendChapter(
  episode: StoryEpisode,
  written: Pick<ChapterStage, "kind" | "source" | "seed"> & {
    dialogues: Record<string, string> | null;
  },
  seen: number,
): Promise<Result<ChapterStage>> {
  const now = worldNow();
  const authored = now?.genesis.body.gates.some((gate) => gate.id === episode.id) ?? false;
  const more = authored ? null : (useLandStore.getState().world?.moreIds[episode.id] ?? null);
  if (!authored && more === null) {
    return err(
      "chapter-more-missing",
      `Episode ${episode.id} is not in this world's story yet.`,
      "Wait for the story to reach it.",
    );
  }
  const title = episode.title.replace(/\s+/g, " ").trim().slice(0, STORY_LIMITS.titleChars);
  const body = {
    episodeId: episode.id,
    title: title.length > 0 ? title : episode.id,
    more,
    kind: written.kind,
    source: written.source,
    ...(written.dialogues === null ? {} : { dialogues: written.dialogues }),
    seed: written.seed,
  };
  const stored = await appendToWorld({ kind: "chapter", body, seen });
  if (!stored.ok) return stored;
  const fresh: ChapterStage = {
    kind: written.kind,
    source: written.source,
    ...(written.dialogues === null ? {} : { dialogues: written.dialogues }),
    seed: written.seed,
    found: [],
    felled: [],
    met: [],
  };
  return ok(stageOf(episode.id) ?? fresh);
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
 * repairs, whether the parser or the world's history refused it); aborting `signal` stops the call
 * itself. Nothing is stored when it fails, when the call was aborted before its reply or when the
 * save changed meanwhile. Callers go through `chapterJobs.ts`, so one chapter is only ever written
 * once at a time.
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
  const history = onHistory();
  let claimed: Claimed | null = null;
  const target = claimTarget({ kind: "chapter", episodeId: episode.id });
  // No key yet, or a world this device only reads: nothing new is written (D7).
  const blocked = writeBlocker();
  if (blocked !== null) return { ok: false, error: blocked };
  if (history) {
    const known = chapterFromWorld(episode.id);
    if (known !== "unwritten") return known;
    claimed = await claimToWrite(target);
    if (claimed.kind === "refused") return { ok: false, error: claimed.error };
    if (claimed.kind === "written") {
      const n = claimed.n;
      if (n !== null) await waitForHead(n);
      else await waitForFold((now) => now.chapters[episode.id]?.live != null);
      const read = chapterFromWorld(episode.id);
      return read === "unwritten"
        ? err(
            "chapter-not-arrived",
            "Someone wrote this chapter, but it has not arrived yet.",
            "Retry in a moment.",
          )
        : read;
    }
  }
  const relay = claimed?.kind === "write" ? claimed : null;
  const abandon = (): void => {
    if (relay !== null) abandonClaim(target, relay);
  };
  // `seen`: the history's head when this chapter began to be written (D2).
  const seen = seenHead();
  const bible = active.cartridge.bible;
  const world = useWorldStore.getState();
  const combat = world.gameplayRules?.combat !== null && world.gameplayRules?.combat !== undefined;
  const language = world.genesis?.language ?? bibleLanguage(bible) ?? contentLanguage();
  const kind = chapterKind(episode.kind);
  const place = chapterPlaceKind(kind);
  // What was kept: the chapter's event appended (or, before a save has a world, its stage stored).
  const kept: { stage: ChapterStage | null } = { stage: null };
  // Runs inside the model's repair loop (D5): a size or a program the world's history refuses goes
  // back to the model as one of its two repairs; the save changing or the door does not.
  const keep = async (
    raw: string,
    dialogues: Record<string, string> | null,
  ): Promise<Result<void>> => {
    // A chapter that made it back before a stop is kept: it is paid for, and a resume would ask again.
    if (useLandStore.getState().instanceId !== instanceId) {
      return err(CHAPTER_CANCELLED, "The save changed meanwhile; nothing was changed.");
    }
    const source = `${raw.replace(/\n*$/, "")}\n`;
    if (source.length > CHAPTER_LIMITS.sourceChars) {
      return err("chapter-too-large", "The model wrote more than a chapter can hold.", "Retry.");
    }
    const seed = crypto.getRandomValues(new Uint32Array(1))[0] ?? 1;
    if (history) {
      const stored = await appendChapter(episode, { kind, source, dialogues, seed }, seen);
      if (!stored.ok) return stored;
      kept.stage = stored.value;
      return ok(undefined);
    }
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
    kept.stage = stage;
    return ok(undefined);
  };
  let written: Result<unknown>;
  try {
    if (place === null) {
      const carry = land.progress.storyCarry ?? null;
      written = await generateChapter({
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
        accept: ({ source }) => keep(source, null),
      });
    } else {
      written = await generatePlace({
        kind: place,
        wish: `${episode.title} — ${episode.brief}`,
        combat,
        language,
        bible,
        signal,
        accept: async ({ graph }) => {
          const words = residentWords(graph.dialogues);
          return words.ok ? keep(serializeScene(graph.graph), words.value) : words;
        },
      });
    }
  } catch (thrown) {
    written = fail(toError(thrown, "chapter-failed"));
  }
  if (!written.ok || kept.stage === null) {
    // Every way out but a kept chapter ends the relay "abort" and releases the lease.
    abandon();
    return written.ok
      ? err(CHAPTER_CANCELLED, "Nothing was kept.")
      : cancelledOr(written.error, signal);
  }
  relay?.relay?.end("done");
  return ok(kept.stage);
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
  recordDeed("chapter.cleared", useLandStore.getState().world?.chapters[episode.id]?.id ?? null);
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
