// Story → RPG map. A player's story becomes the world bible plus a short chain of episodes; each
// episode is a place on the open land where an AI-written world (`interactive-web@1`) is played —
// a duel, a maze, a chase, a puzzle — and what the player earns is carried on to the next one.
// The plan is cartridge content (`bible/story.json`, hashed); episode progress lives in the save.

import { z } from "zod";
import { CHUNK_SIZE, type ChunkCoord } from "./chunks";
import type { ChatMessage } from "./llm";
import { err, ok, type Result } from "./result";
import type { Json, WorkRef } from "./works";

export const STORY_FILE = "bible/story.json" as const;

export const STORY_LIMITS = {
  minEpisodes: 3,
  maxEpisodes: 8,
  storyChars: 4_000,
  loglineChars: 300,
  titleChars: 60,
  placeChars: 60,
  kindChars: 40,
  briefChars: 600,
} as const;

export interface StoryEpisode {
  id: string;
  title: string;
  /** What the locals call the place it happens. */
  place: string;
  /** Free label for the kind of play ("maze", "turn-based duel", "platform chase"); never a kit. */
  kind: string;
  /** What happens there, in the world's language; becomes the world-generation request. */
  brief: string;
  /** Chunk the episode's gate stands in. Chosen by the host, never by the model. */
  cx: number;
  cz: number;
}

export interface StoryPlan {
  formatVersion: 1;
  logline: string;
  episodes: StoryEpisode[];
}

const text = (max: number) => z.string().min(1).max(max);

export const storyPlanSchema = z
  .object({
    formatVersion: z.literal(1),
    logline: text(STORY_LIMITS.loglineChars),
    episodes: z
      .array(
        z
          .object({
            id: z.string().regex(/^e[1-9][0-9]?$/),
            title: text(STORY_LIMITS.titleChars),
            place: text(STORY_LIMITS.placeChars),
            kind: text(STORY_LIMITS.kindChars),
            brief: text(STORY_LIMITS.briefChars),
            cx: z.number().int().min(-64).max(64),
            cz: z.number().int().min(-64).max(64),
          })
          .strict(),
      )
      .min(STORY_LIMITS.minEpisodes)
      .max(STORY_LIMITS.maxEpisodes),
  })
  .strict();

/** The exact bytes stored and hashed for a plan; parse(storyText(p)) deep-equals p. */
export function storyText(plan: StoryPlan): string {
  return `${JSON.stringify(plan, null, 2)}\n`;
}

export function parseStoryText(raw: string): Result<StoryPlan> {
  try {
    const parsed = storyPlanSchema.safeParse(JSON.parse(raw));
    if (parsed.success) return ok(parsed.data);
    const issue = parsed.error.issues[0];
    return err(
      "story-invalid",
      `story.json: ${issue?.path.join(".") ?? "root"} — ${issue?.message}`,
    );
  } catch {
    return err("story-invalid", "story.json is not valid JSON.");
  }
}

/**
 * Where episode n (0-based) stands: one step further out per episode along a golden-angle spiral,
 * so the story leads the player outward across the open land and no two gates share a chunk.
 */
export function episodePlace(index: number): ChunkCoord {
  const taken = new Set<string>(["0,0"]);
  let coord: ChunkCoord = { cx: 1, cz: 0 };
  for (let step = 0; step <= index; step += 1) {
    const radius = 1 + step;
    let angle = step * 2.399963;
    do {
      coord = {
        cx: Math.round(Math.cos(angle) * radius),
        cz: Math.round(Math.sin(angle) * radius),
      };
      angle += 0.5;
    } while (taken.has(`${coord.cx},${coord.cz}`));
    taken.add(`${coord.cx},${coord.cz}`);
  }
  return coord;
}

/** World position (tile centre) of an episode's gate: the middle of its chunk. */
export function episodeGate(episode: Pick<StoryEpisode, "cx" | "cz">): { x: number; z: number } {
  return { x: episode.cx * CHUNK_SIZE + 16.5, z: episode.cz * CHUNK_SIZE + 16.5 };
}

export function episodeTarget(id: string): string {
  return `episode:${id}`;
}

export function parseEpisodeTarget(id: string): string | null {
  const match = /^episode:(e[1-9][0-9]?)$/.exec(id);
  return match?.[1] ?? null;
}

/** Save-owned progress of one episode. */
export interface EpisodeProgress {
  /** Draft the episode's world was generated in (kept so it can be changed later). */
  draftId: string | null;
  /** The immutable revision that was played. */
  work: WorkRef | null;
  /** Journey of one world holding that play's saved state. */
  playId: string | null;
  cleared: boolean;
  summary: string | null;
}

/** Episodes open one after another: the first at once, every later one once the previous is cleared. */
export function episodeUnlocked(
  plan: StoryPlan,
  progress: Readonly<Record<string, EpisodeProgress>>,
  id: string,
): boolean {
  const index = plan.episodes.findIndex((episode) => episode.id === id);
  if (index <= 0) return index === 0;
  const previous = plan.episodes[index - 1];
  return previous !== undefined && progress[previous.id]?.cleared === true;
}

/** The first episode not yet cleared, or null once the whole story is done. */
export function nextEpisode(
  plan: StoryPlan,
  progress: Readonly<Record<string, EpisodeProgress>>,
): StoryEpisode | null {
  return plan.episodes.find((episode) => progress[episode.id]?.cleared !== true) ?? null;
}

const FIELD = /^(title|place|kind|brief)\s*[:：]\s*(.*)$/i;

/**
 * The model answers in a line protocol (like worlds): `@@logline`, then one `@@episode` block per
 * episode with `title:`, `place:`, `kind:` and `brief:` lines, then `@@end`. Places on the map are
 * assigned here, not by the model.
 */
export function parseStoryReply(reply: string): Result<StoryPlan> {
  let logline = "";
  const episodes: Array<Omit<StoryEpisode, "id" | "cx" | "cz">> = [];
  let section: "logline" | "episode" | null = null;
  let current: Record<string, string> = {};
  const flush = (): void => {
    if (section === "episode" && Object.keys(current).length > 0) {
      episodes.push({
        title: (current.title ?? "").slice(0, STORY_LIMITS.titleChars),
        place: (current.place ?? "").slice(0, STORY_LIMITS.placeChars),
        kind: (current.kind ?? "").slice(0, STORY_LIMITS.kindChars),
        brief: (current.brief ?? "").slice(0, STORY_LIMITS.briefChars),
      });
    }
    current = {};
  };
  for (const raw of reply.replace(/\r\n?/g, "\n").split("\n")) {
    const line = raw.trim();
    if (/^```/.test(line)) continue;
    if (/^@@logline\b/i.test(line)) {
      flush();
      section = "logline";
      continue;
    }
    if (/^@@episode\b/i.test(line)) {
      flush();
      section = "episode";
      continue;
    }
    if (/^@@end\b/i.test(line)) {
      flush();
      section = null;
      break;
    }
    if (section === "logline" && line !== "") logline = `${logline} ${line}`.trim();
    if (section === "episode") {
      const field = FIELD.exec(line);
      if (field !== null) current[(field[1] ?? "").toLowerCase()] = (field[2] ?? "").trim();
      else if (line !== "" && current.brief !== undefined)
        current.brief = `${current.brief} ${line}`;
    }
  }
  flush();
  const plan: StoryPlan = {
    formatVersion: 1,
    logline: logline.slice(0, STORY_LIMITS.loglineChars),
    episodes: episodes.slice(0, STORY_LIMITS.maxEpisodes).map((episode, index) => ({
      id: `e${index + 1}`,
      ...episode,
      ...episodePlace(index),
    })),
  };
  const checked = storyPlanSchema.safeParse(plan);
  if (checked.success) return ok(checked.data);
  const issue = checked.error.issues[0];
  return err(
    "story-reply-invalid",
    `The story plan is incomplete: ${issue?.path.join(".") || "root"} — ${issue?.message}`,
    `Answer with @@logline and ${STORY_LIMITS.minEpisodes}–${STORY_LIMITS.maxEpisodes} @@episode blocks, each with title, place, kind and brief.`,
  );
}

export interface StoryPromptInput {
  story: string;
  core: string;
  style: string;
  language: string;
}

export function storyMessages(input: StoryPromptInput): ChatMessage[] {
  return [
    {
      role: "system",
      content: `You turn a player's story into a short chain of playable episodes for an open-world RPG.
Each episode is one small, self-contained game played at a place on the map: vary the kind of play between episodes (for example a turn-based duel, a maze, a real-time chase or fight, a platform climb, a puzzle, a card or dice contest, a stealth escape, a choice-driven scene) and let the stakes rise toward the end.
Write every text in ${input.language}. Keep the world's rules and tone:
CORE: ${input.core.slice(0, 1_500)}
STYLE: ${input.style.slice(0, 600)}

Reply ONLY in this line format, with ${STORY_LIMITS.minEpisodes} to 6 episodes:
@@logline
<one sentence: the story's through-line>
@@episode
title: <short title>
place: <what the locals call the place>
kind: <kind of play, a few words>
brief: <2-3 sentences: what the player does there, how it is won, what they carry away>
@@end`,
    },
    { role: "user", content: input.story.slice(0, STORY_LIMITS.storyChars) },
  ];
}

/** The one request an episode's world is generated from: the brief plus just enough story. */
export function episodeRequest(
  plan: StoryPlan,
  episode: StoryEpisode,
  bible: { core: string; style: string },
): string {
  const index = plan.episodes.findIndex((entry) => entry.id === episode.id);
  return [
    `Episode ${index + 1} of ${plan.episodes.length} — "${episode.title}" at ${episode.place} (${episode.kind}).`,
    episode.brief,
    `Story so far: ${plan.logline}`,
    `World: ${bible.core.slice(0, 700)}`,
    `Style: ${bible.style.slice(0, 300)}`,
    "host.carry holds what the player brings from earlier episodes (may be null): show it, use it if it fits, and pass it on in host.complete with what they earned added — never drop what came in.",
  ].join("\n");
}

/** Merges what an episode hands back into the story's carried state, keeping earlier keys. */
export function mergeCarry(before: Json | null, after: Json | null): Json | null {
  const isObject = (value: Json | null): value is { [key: string]: Json } =>
    value !== null && typeof value === "object" && !Array.isArray(value);
  if (!isObject(after)) return after ?? before;
  if (!isObject(before)) return after;
  return { ...before, ...after };
}
