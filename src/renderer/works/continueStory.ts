// The land writes the story's next chapter once every episode so far is cleared: one short
// `@@episode` block from the model, placed and numbered by the host. A malformed reply goes back
// once with the reason; after that it is an error the player sees, never an invented chapter.

import { chat } from "@renderer/llm";
import type { Result } from "@shared/result";
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
  signal: AbortSignal;
}

export async function writeNextChapter(
  request: ContinueStoryRequest,
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
      },
      undefined,
      { signal: request.signal },
    );
    if (!reply.ok) return reply;
    const next = parseNextEpisode(reply.value.text, request.episodes);
    if (next.ok || attempt >= NEXT_CHAPTER_REPAIRS || next.error.code === "story-ended")
      return next;
    messages.push(
      { role: "assistant", content: reply.value.text.slice(0, 4_000) },
      {
        role: "user",
        content: `${next.error.message} ${next.error.hint ?? ""} Answer again in the exact format.`,
      },
    );
  }
}
