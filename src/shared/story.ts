// Story → RPG map. A player's story becomes the world bible plus a short chain of episodes; each
// episode is a chapter played in the game itself at its gate on the open land — people to meet,
// things to find, foes to beat, or a climb or a maze entered from the gate (@shared/chapter) —
// and what the player earns is carried on to the next one. The plan is cartridge content
// (`bible/story.json`, hashed); what each chapter wrote and how far it got live in the save.
// Once the authored episodes are cleared the land writes further chapters one at a time; those
// are save-owned (`land.storyMore`) and follow the authored ones (`storyEpisodes`).

import { z } from "zod";
import type { ChapterStage } from "./chapter";
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

/**
 * Episode ids run `e1`–`e99`, so a story — authored episodes plus the chapters the land wrote
 * after them — has at most this many. Past it the story has reached its last chapter.
 */
export const STORY_CAP = 99;

const text = (max: number) => z.string().min(1).max(max);

export const storyEpisodeSchema = z
  .object({
    id: z.string().regex(/^e[1-9][0-9]?$/),
    title: text(STORY_LIMITS.titleChars),
    place: text(STORY_LIMITS.placeChars),
    kind: text(STORY_LIMITS.kindChars),
    brief: text(STORY_LIMITS.briefChars),
    cx: z.number().int().min(-64).max(64),
    cz: z.number().int().min(-64).max(64),
  })
  .strict();

export const storyPlanSchema = z
  .object({
    formatVersion: z.literal(1),
    logline: text(STORY_LIMITS.loglineChars),
    episodes: z
      .array(storyEpisodeSchema)
      .min(STORY_LIMITS.minEpisodes)
      .max(STORY_LIMITS.maxEpisodes),
  })
  .strict();

/** The whole story as it stands: the cartridge's episodes, then the chapters the land wrote. */
export function storyEpisodes(
  plan: Pick<StoryPlan, "episodes">,
  more: readonly StoryEpisode[] | null | undefined,
): StoryEpisode[] {
  const authored = new Set(plan.episodes.map((episode) => episode.id));
  return [...plan.episodes, ...(more ?? []).filter((episode) => !authored.has(episode.id))];
}

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

const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
/** Radius factor of the gate spiral: every gate ends up 2–3 chunks from its nearest neighbour. */
const GATE_SPREAD = 1.6;

function coordKey(coord: ChunkCoord): string {
  return `${coord.cx},${coord.cz}`;
}

/** Spiral slot n, turning further round (then a little further out) past every `used` chunk. */
function spiralSlot(n: number, used: Set<string>): ChunkCoord {
  for (let turn = 0; ; turn += 1) {
    const radius = GATE_SPREAD * Math.sqrt(n + 1) + Math.floor(turn / 16) * 0.5;
    const angle = n * GOLDEN_ANGLE + turn * 0.4;
    const coord = {
      cx: Math.round(Math.cos(angle) * radius),
      cz: Math.round(Math.sin(angle) * radius),
    };
    if (used.has(coordKey(coord))) continue;
    used.add(coordKey(coord));
    return coord;
  }
}

/**
 * Where gates 0…count-1 stand: a sunflower (phyllotaxis) spiral — radius c·√(n+1), a golden
 * angle per gate — so however long the story runs every gate has neighbours a few chunks away and
 * the spiral stays inside the map (radius < 17 chunks at the cap). The origin is never a gate.
 */
export function episodePlaces(count: number): ChunkCoord[] {
  const used = new Set<string>(["0,0"]);
  return Array.from({ length: count }, (_, n) => spiralSlot(n, used));
}

/**
 * Where gate `index` (0-based) stands: its slot on the same spiral, clear of the earlier slots and
 * of `taken` — the gates already on the land, which in an older cartridge were placed differently.
 */
export function episodePlace(index: number, taken: readonly ChunkCoord[] = []): ChunkCoord {
  const earlier = episodePlaces(index);
  return spiralSlot(index, new Set(["0,0", ...[...earlier, ...taken].map(coordKey)]));
}

/** Chunk bound of a gate (the story schema's ±64, less a margin so the trail can still turn). */
const TRAIL_BOUND = 60;
/** How far (chunks) a chapter the land writes stands from the one before it. */
const TRAIL_STEP = 2.5;

/**
 * Where the land's next chapter stands: a short walk (≈ TRAIL_STEP chunks) from the previous
 * gate, turning a golden angle each chapter so the trail wanders instead of running off in a line,
 * clear of every gate already placed, of the origin, and of the map's edge. A global spiral would
 * put chapter n+1 ever further from chapter n; this keeps every next chapter the same walk away.
 */
export function trailPlace(before: readonly Pick<StoryEpisode, "cx" | "cz">[]): ChunkCoord {
  const last = before[before.length - 1];
  if (last === undefined) return episodePlace(0);
  const used = new Set<string>(["0,0", ...before.map(coordKey)]);
  const heading = before.length * GOLDEN_ANGLE;
  for (let ring = 0; ring < 8; ring += 1) {
    for (let turn = 0; turn < 16; turn += 1) {
      const angle = heading + turn * ((Math.PI * 2) / 16);
      const coord = {
        cx: last.cx + Math.round(Math.cos(angle) * (TRAIL_STEP + ring)),
        cz: last.cz + Math.round(Math.sin(angle) * (TRAIL_STEP + ring)),
      };
      if (Math.abs(coord.cx) > TRAIL_BOUND || Math.abs(coord.cz) > TRAIL_BOUND) continue;
      if (!used.has(coordKey(coord))) return coord;
    }
  }
  return episodePlace(before.length, before);
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
  /**
   * Saves from before chapters were played in the game kept a separate AI-written world per
   * episode: its draft, the revision played and the journey holding its state. Still read, so
   * those saves open; never written any more.
   */
  draftId: string | null;
  work: WorkRef | null;
  playId: string | null;
  cleared: boolean;
  summary: string | null;
  /** The chapter as written for play in the game, and how far the player got in it. */
  stage?: ChapterStage | null;
}

/** Episodes open one after another: the first at once, every later one once the previous is cleared. */
export function episodeUnlocked(
  episodes: readonly StoryEpisode[],
  progress: Readonly<Record<string, EpisodeProgress>>,
  id: string,
): boolean {
  const index = episodes.findIndex((episode) => episode.id === id);
  if (index <= 0) return index === 0;
  const previous = episodes[index - 1];
  return previous !== undefined && progress[previous.id]?.cleared === true;
}

/** The first episode not yet cleared, or null once every episode written so far is done. */
export function nextEpisode(
  episodes: readonly StoryEpisode[],
  progress: Readonly<Record<string, EpisodeProgress>>,
): StoryEpisode | null {
  return episodes.find((episode) => progress[episode.id]?.cleared !== true) ?? null;
}

/** What the story needs next, as far as writing ahead is concerned. */
export type StoryStep =
  /** The next chapter is not written yet: write it before the player reaches its gate. */
  | { kind: "prepare"; episode: StoryEpisode }
  /** The next chapter is written; nothing to do until it is cleared. */
  | { kind: "ready"; episode: StoryEpisode }
  /** Everything written so far is cleared: the land writes the next chapter. */
  | { kind: "continue" }
  /** Everything is cleared and the story has reached `STORY_CAP` episodes. */
  | { kind: "ended" };

export function storyStep(
  episodes: readonly StoryEpisode[],
  progress: Readonly<Record<string, EpisodeProgress>>,
): StoryStep {
  const next = nextEpisode(episodes, progress);
  if (next !== null) {
    return (progress[next.id]?.stage ?? null) === null
      ? { kind: "prepare", episode: next }
      : { kind: "ready", episode: next };
  }
  return episodes.length < STORY_CAP ? { kind: "continue" } : { kind: "ended" };
}

const FIELD = /^(title|place|kind|brief)\s*[:：]\s*(.*)$/i;

type EpisodeText = Omit<StoryEpisode, "id" | "cx" | "cz">;

/**
 * Reads the story line protocol: an optional `@@logline` section, then `@@episode` blocks with
 * `title:`, `place:`, `kind:` and `brief:` lines (a brief may run over several lines), up to
 * `@@end`. Fields are cut to their limits; whether anything is missing is the caller's check.
 */
function readStoryBlocks(reply: string): { logline: string; episodes: EpisodeText[] } {
  let logline = "";
  const episodes: EpisodeText[] = [];
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
  return { logline: logline.slice(0, STORY_LIMITS.loglineChars), episodes };
}

/**
 * The model answers in a line protocol (like worlds): `@@logline`, then one `@@episode` block per
 * episode with `title:`, `place:`, `kind:` and `brief:` lines, then `@@end`. Places on the map are
 * assigned here, not by the model.
 */
export function parseStoryReply(reply: string): Result<StoryPlan> {
  const blocks = readStoryBlocks(reply);
  const kept = blocks.episodes.slice(0, STORY_LIMITS.maxEpisodes);
  const places = episodePlaces(kept.length);
  const plan: StoryPlan = {
    formatVersion: 1,
    logline: blocks.logline,
    episodes: kept.map((episode, index) => ({
      id: `e${index + 1}`,
      ...episode,
      ...(places[index] ?? { cx: 1, cz: 0 }),
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

/**
 * What a chapter can be, because the game can play it: no card tables, dice or pages of choices,
 * which the land cannot show (@shared/chapter).
 */
function kindsOfPlay(combat: boolean): string {
  return combat
    ? "The kinds of play the game has: meet (people to talk to), search (things to find), fight (foes to beat), climb (a side-scrolling course) and maze (a dungeon); a land chapter usually mixes meeting, finding and fighting."
    : "The kinds of play the game has: meet (people to talk to), search (things to find), climb (a side-scrolling course) and maze (a dungeon). This game has no fighting: never write a fight.";
}

function kindLine(combat: boolean): string {
  return combat ? "meet, search, fight, climb, maze" : "meet, search, climb, maze";
}

export interface StoryPromptInput {
  story: string;
  core: string;
  style: string;
  language: string;
  /** Whether the game has fighting; without it no chapter is a fight. Defaults to true. */
  combat?: boolean;
}

export function storyMessages(input: StoryPromptInput): ChatMessage[] {
  return [
    {
      role: "system",
      content: `You turn a player's story into a short chain of playable episodes for an open-world RPG.
Each episode is one chapter played in the game itself at a place on the map. ${kindsOfPlay(input.combat ?? true)} Vary the kind between episodes and let the stakes rise toward the end.
Write every text in ${input.language}. Keep the world's rules and tone:
CORE: ${input.core.slice(0, 1_500)}
STYLE: ${input.style.slice(0, 600)}

Reply ONLY in this line format, with ${STORY_LIMITS.minEpisodes} to 6 episodes:
@@logline
<one sentence: the story's through-line>
@@episode
title: <short title>
place: <what the locals call the place>
kind: <one of: ${kindLine(input.combat ?? true)}>
brief: <2-3 sentences: what the player does there, how it is won, what they carry away>
@@end`,
    },
    { role: "user", content: input.story.slice(0, STORY_LIMITS.storyChars) },
  ];
}

/** The first free id after the episodes already written, or null once all of e1–e99 are used. */
function freeEpisodeId(before: readonly StoryEpisode[]): string | null {
  const used = new Set(before.map((episode) => episode.id));
  for (let step = 0; step < STORY_CAP; step += 1) {
    const id = `e${((before.length + step) % STORY_CAP) + 1}`;
    if (!used.has(id)) return id;
  }
  return null;
}

/**
 * The land's next chapter: a single `@@episode` block (title/place/kind/brief lines, `@@end`).
 * The host gives it the next free id and a gate on the spiral clear of every gate before it.
 */
export function parseNextEpisode(
  reply: string,
  before: readonly StoryEpisode[],
): Result<StoryEpisode> {
  const id = before.length >= STORY_CAP ? null : freeEpisodeId(before);
  if (id === null) {
    return err(
      "story-ended",
      `The story already has ${STORY_CAP} episodes; it has reached its last chapter.`,
    );
  }
  const written = readStoryBlocks(reply).episodes[0] ?? {
    title: "",
    place: "",
    kind: "",
    brief: "",
  };
  const episode: StoryEpisode = { id, ...written, ...trailPlace(before) };
  const checked = storyEpisodeSchema.safeParse(episode);
  if (checked.success) return ok(checked.data);
  const issue = checked.error.issues[0];
  return err(
    "story-next-invalid",
    `The next chapter is incomplete: ${issue?.path.join(".") || "root"} — ${issue?.message}`,
    "Answer with exactly one @@episode block with title, place, kind and brief lines, then @@end.",
  );
}

export interface ContinueStoryInput {
  logline: string;
  /** Episodes cleared so far, oldest first, with the summary their world handed back. */
  cleared: ReadonlyArray<
    Pick<StoryEpisode, "title" | "place" | "kind"> & { summary: string | null }
  >;
  carry: Json | null;
  language: string;
  core: string;
  style: string;
  /** Whether the game has fighting; without it no chapter is a fight. Defaults to true. */
  combat?: boolean;
}

/** Only the latest cleared episodes go to the model: the reply is one short block, so is the ask. */
const CONTINUE_RECENT = 6;

export function continueStoryMessages(input: ContinueStoryInput): ChatMessage[] {
  const recent = input.cleared.slice(-CONTINUE_RECENT);
  const skipped = input.cleared.length - recent.length;
  const lines = recent.map(
    (episode, index) =>
      `${skipped + index + 1}. ${episode.title} — ${episode.place} (${episode.kind}): ${(episode.summary ?? "cleared").slice(0, 200)}`,
  );
  return [
    {
      role: "system",
      content: `You continue an open-world RPG story whose episodes so far have all been played.
Write exactly ONE next episode: one chapter played in the game itself at a new place on the map, following from what happened. ${kindsOfPlay(input.combat ?? true)} Use a different kind from the last episode.
Write every text in ${input.language}. Keep the world's rules and tone:
CORE: ${input.core.slice(0, 1_000)}
STYLE: ${input.style.slice(0, 400)}

Reply ONLY in this line format:
@@episode
title: <short title>
place: <what the locals call the place>
kind: <one of: ${kindLine(input.combat ?? true)}>
brief: <2-3 sentences: what the player does there, how it is won, what they carry away>
@@end`,
    },
    {
      role: "user",
      content: [
        `Story: ${input.logline}`,
        `Played so far${skipped > 0 ? ` (last ${recent.length} of ${input.cleared.length})` : ""}:`,
        ...lines,
        `The player carries: ${(JSON.stringify(input.carry) ?? "null").slice(0, 600)}`,
        "Write the next episode.",
      ].join("\n"),
    },
  ];
}

/** Merges what an episode hands back into the story's carried state, keeping earlier keys. */
export function mergeCarry(before: Json | null, after: Json | null): Json | null {
  const isObject = (value: Json | null): value is { [key: string]: Json } =>
    value !== null && typeof value === "object" && !Array.isArray(value);
  if (!isObject(after)) return after ?? before;
  if (!isObject(before)) return after;
  return { ...before, ...after };
}
