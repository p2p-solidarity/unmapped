// Migrating the story and the player's own progress (rev 6 phase 3, D6 steps 5–7 and
// "Personal progress"): continued chapters (`story.more`), each episode's chapter — as played, as
// an AI work, or closed — the deeds the karma ledger records, and `progress.json` keyed into the
// history.

import type { ChapterKind } from "@shared/chapter";
import type { ChunkCoord } from "@shared/chunks";
import type { ChapterBody, DeedBody } from "@shared/history/types";
import type { ErrandStage } from "@shared/land";
import { ok, type Result } from "@shared/result";
import { type EpisodeProgress, STORY_LIMITS, type StoryEpisode } from "@shared/story";
import type { KarmaEntry } from "@shared/world";
import { readWorldProgress, type WorldProgress } from "@shared/worldProgress";
import {
  compareText,
  episodeNumber,
  errandRef,
  onChunk,
  oneLine,
  put,
  type Run,
  shown,
  skip,
  sortedEntries,
  unsigned,
  type WorkPack,
  workPack,
} from "./migrateRun";

const CLEARED = "cleared chapter ";
const CROSSED = "crossed ";
const FINISHED = "finished ";

export function migrateMore(run: Run): void {
  for (const { id, title, place, kind, brief, cx, cz } of run.land?.storyMore ?? []) {
    const body = { episode: { id, title, place, kind, brief, cx, cz } };
    const event = put(run, "story.more", id, unsigned(run, "story.more", body, run.createdAt));
    if (event !== null) run.more.set(id, event);
  }
}

type ChapterTail =
  | { kind: ChapterKind; source: string; dialogues?: Record<string, string>; seed: number }
  | { kind: "work"; work: WorkPack }
  | { kind: "closed" };

/** What an episode wrote: its chapter as played, the AI work it was played as, or a closed draft. */
function chapterTail(run: Run, progress: EpisodeProgress): Result<ChapterTail> | null {
  const stage = progress.stage ?? null;
  if (stage !== null) {
    return ok({
      kind: stage.kind,
      source: stage.source,
      ...(stage.dialogues === undefined ? {} : { dialogues: { ...stage.dialogues } }),
      seed: stage.seed,
    });
  }
  if (progress.work !== null) {
    const work = workPack(run, progress.work);
    return work.ok ? ok({ kind: "work", work: work.value }) : work;
  }
  return progress.draftId === null ? null : ok({ kind: "closed" });
}

/** The whole story as the legacy save reads it: authored episodes, then the land's own. */
function storyOf(run: Run): { episodes: StoryEpisode[]; authored: ReadonlySet<string> } {
  const authored = run.files.cartridge.story?.episodes ?? [];
  const ids = new Set(authored.map((episode) => episode.id));
  const more = (run.land?.storyMore ?? []).filter((episode) => !ids.has(episode.id));
  return { episodes: [...authored, ...more], authored: ids };
}

/** A chapter per episode that wrote one, in story order; strays (no such episode) are reported. */
export function migrateChapters(run: Run): void {
  const progress = run.land?.episodes ?? {};
  const { episodes, authored } = storyOf(run);
  const known = episodes.map((episode) => episode.id).filter((id) => progress[id] !== undefined);
  const strays = Object.keys(progress)
    .filter((id) => !episodes.some((episode) => episode.id === id))
    .sort((a, b) => episodeNumber(a) - episodeNumber(b));
  for (const id of [...known, ...strays]) {
    const played = progress[id];
    const tail = played === undefined ? null : chapterTail(run, played);
    if (tail === null) continue;
    if (!tail.ok) {
      skip(run, "chapter", id, tail.error.code, tail.error.message);
      continue;
    }
    const episode = episodes.find((one) => one.id === id);
    if (episode === undefined) {
      skip(run, "chapter", id, "chapter-episode-unknown", `The story has no episode ${id}.`);
      continue;
    }
    const more = authored.has(id) ? null : (run.more.get(id) ?? null);
    if (!authored.has(id) && more === null) {
      skip(run, "chapter", id, "chapter-more-missing", `Episode ${id} stayed out of the history.`);
      continue;
    }
    const title = oneLine(episode.title, STORY_LIMITS.titleChars);
    const body = { episodeId: id, title, more, ...tail.value } as ChapterBody;
    const event = put(run, "chapter", id, unsigned(run, "chapter", body, run.createdAt));
    if (event !== null) run.chapters.set(id, event);
  }
}

/** The deed a karma line records, if it is one: cleared chapters, crossed places, errands. */
function deedOfLine(
  run: Run,
  line: KarmaEntry,
): { what: DeedBody["what"]; ref: string | null } | null {
  const here = (coord: ChunkCoord): boolean => line.cx === undefined || onChunk(line, coord);
  if (line.action === "witness" && line.choice.startsWith(CLEARED)) {
    const title = line.choice.slice(CLEARED.length);
    const episode = storyOf(run).episodes.find((one) => one.title === title && here(one));
    const ref = episode === undefined ? null : (run.chapters.get(episode.id) ?? null);
    return { what: "chapter.cleared", ref };
  }
  if (line.action === "witness" && line.choice.startsWith(CROSSED)) {
    const title = line.choice.slice(CROSSED.length);
    const place = (run.land?.places ?? []).find((one) => one.title === title && here(one));
    return { what: "place.crossed", ref: place ? (run.places.get(place.id) ?? null) : null };
  }
  if (line.action === "request" && line.choice.startsWith(FINISHED) && line.cx !== undefined) {
    const ref = errandRef(run, `${line.cx},${line.cz}:${line.choice.slice(FINISHED.length)}`);
    return { what: "errand.done", ref: ref.ok ? ref.value : null };
  }
  return null;
}

/**
 * Deeds for karma's cleared-chapter and crossed lines (dated by the line) and for finished errands
 * (from the legacy errands, dated by their karma line when there is one); one per ref.
 */
export function migrateDeeds(run: Run): void {
  const written = new Set<string>();
  const deed = (what: DeedBody["what"], ref: string, when: string, key: string): void => {
    if (written.has(ref)) return;
    written.add(ref);
    put(run, "deed", key, unsigned(run, "deed", { what, ref }, when));
  };
  for (const line of run.files.karma) {
    const found = deedOfLine(run, line);
    if (found === null) continue;
    if (found.ref === null) {
      const message = "What the deed names stayed out of the history.";
      skip(run, "deed", line.choice, "deed-ref-missing", message);
      continue;
    }
    deed(found.what, found.ref, shown(line.at, run.createdAt), line.choice);
  }
  for (const [key, stage] of sortedEntries(run.land?.errands ?? {})) {
    const ref = stage === "done" ? errandRef(run, key) : null;
    if (ref?.ok) deed("errand.done", ref.value, run.createdAt, key);
  }
}

/**
 * `progress.json` (D1) from the legacy errands (re-keyed `<witness id>:<errand id>`; one whose
 * chunk stayed legacyOnly is reported and keeps its legacy key in the frozen save), episodes and
 * places (keyed by their legacy ids, which migrated places keep).
 */
export function progressOf(run: Run): Result<WorldProgress> {
  const errands: [string, ErrandStage][] = [];
  for (const [key, stage] of sortedEntries(run.land?.errands ?? {})) {
    const ref = errandRef(run, key);
    if (ref.ok) errands.push([ref.value, stage]);
    else skip(run, "errand", key, ref.error.code, ref.error.message);
  }
  const episodes = Object.entries(run.land?.episodes ?? {})
    .sort(([a], [b]) => episodeNumber(a) - episodeNumber(b))
    .map(([id, played]) => [
      id,
      {
        cleared: played.cleared,
        summary: played.summary,
        found: [...(played.stage?.found ?? [])],
        felled: [...(played.stage?.felled ?? [])],
        met: [...(played.stage?.met ?? [])],
        ...(played.playId === null ? {} : { playId: played.playId }),
      },
    ]);
  const places = (run.land?.places ?? []).map((place) => [
    place.id,
    {
      cleared: place.cleared,
      ...(place.kind === "otherworld" && place.playId !== undefined
        ? { playId: place.playId }
        : {}),
    },
  ]);
  return readWorldProgress({
    v: 1,
    worldId: run.planner.world,
    errands: Object.fromEntries(errands.sort(([a], [b]) => compareText(a, b))),
    episodes: Object.fromEntries(episodes),
    places: Object.fromEntries(places),
  });
}
