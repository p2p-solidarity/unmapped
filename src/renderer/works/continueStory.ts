// The land writes the story's next chapter once every episode so far is cleared: one short
// `@@episode` block from the model, placed and numbered by the host. A malformed reply goes back
// once with the reason; after that it is an error the player sees, never an invented chapter. When
// the caller keeps the episode (`accept`: the `story.more` event, rev 6 phase 3 D5), a refusal
// about what the model wrote goes back the same way, from the same one repair; any other refusal
// is returned at once.

import { chat, usageTag } from "@renderer/llm";
import { isContentRefusal } from "@shared/history/repairable";
import { type AppError, err, fail, type Result } from "@shared/result";
import type { EpisodeProgress, StoryEpisode } from "@shared/story";
import { continueStoryMessages, parseNextEpisode } from "@shared/story";
import type { Json } from "@shared/works";

const NEXT_CHAPTER_TOKENS = 700;
const NEXT_CHAPTER_REPAIRS = 1;

export interface ContinueStoryRequest {
  logline: string;
  episodes: readonly StoryEpisode[];
  progress: Readonly<Record<string, EpisodeProgress>>;
  carry: Json | null;
  language: string;
  bible: { core: string; style: string };
  /** Whether the game has fighting (its rules declare combat). */
  combat: boolean;
  signal: AbortSignal;
}

export async function writeNextChapter(
  request: ContinueStoryRequest,
  accept?: (episode: StoryEpisode) => Promise<Result<unknown>>,
): Promise<Result<StoryEpisode>> {
  const cleared = request.episodes
    .filter((episode) => request.progress[episode.id]?.cleared === true)
    .map((episode) => ({
      title: episode.title,
      place: episode.place,
      kind: episode.kind,
      summary: request.progress[episode.id]?.summary ?? null,
    }));
  const messages = continueStoryMessages({
    logline: request.logline,
    cleared,
    carry: request.carry,
    language: request.language,
    core: request.bible.core,
    style: request.bible.style,
    combat: request.combat,
  });
  for (let attempt = 0; ; attempt += 1) {
    const reply = await chat(
      {
        messages,
        maxTokens: NEXT_CHAPTER_TOKENS,
        temperature: 0.7,
        grammar: null,
        stop: [],
        tools: [],
        usage: usageTag("story"),
      },
      undefined,
      { signal: request.signal },
    );
    if (!reply.ok) return reply;
    const next = parseNextEpisode(reply.value.text, request.episodes);
    let failure: AppError;
    if (next.ok) {
      if (accept === undefined) return next;
      if (request.signal.aborted) return err("request-aborted", "The request was cancelled.");
      const kept = await accept(next.value);
      if (kept.ok) return next;
      if (!isContentRefusal(kept.error)) return kept;
      failure = kept.error;
    } else {
      if (next.error.code === "story-ended") return next;
      failure = next.error;
    }
    if (attempt >= NEXT_CHAPTER_REPAIRS) return fail(failure);
    messages.push(
      { role: "assistant", content: reply.value.text.slice(0, 4_000) },
      {
        role: "user",
        content: `${failure.code}: ${failure.message} ${failure.hint ?? ""} Answer again in the exact format.`,
      },
    );
  }
}
