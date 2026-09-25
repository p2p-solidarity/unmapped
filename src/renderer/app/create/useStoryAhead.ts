// The story plan written in the background (rev 6 phase 2, D1): it starts while the look step is
// shown — the pictures and the plan are made at once, so the player is never just waiting — and
// streams into the story preview. One plan at a time: a second start while one runs does nothing.
// It fits the world as it was when it started (its basis is taken then); if the world is written
// again or a card changes meanwhile, or the player closes the draft or leaves Create, the call is
// aborted and nothing is kept.

import { writeStory } from "@renderer/narrative/worldDraft";
import type { CreateDraft } from "@shared/createDraft";
import type { AppError } from "@shared/result";
import { type MutableRefObject, useEffect, useRef, useState } from "react";
import { storyBasis, storyStale, worldReady } from "./draftState";
import { newKey } from "./stages";

/** Characters of streamed text kept for the preview: a whole story plan fits. */
const STREAM_KEEP = 24_000;

export interface StoryAhead {
  /** The plan being written: what has streamed so far and when it started; null when idle. */
  writing: { text: string; started: number } | null;
  error: AppError | null;
  /** Starts the plan if the draft has a ready world and no fresh story, and none is running. */
  start(): void;
  /** Stops a running plan; nothing it wrote is kept. */
  cancel(): void;
}

export function useStoryAhead(
  draft: CreateDraft | null,
  latest: MutableRefObject<CreateDraft | null>,
  update: (change: (current: CreateDraft) => CreateDraft) => void,
): StoryAhead {
  const [writing, setWriting] = useState<StoryAhead["writing"]>(null);
  const [error, setError] = useState<AppError | null>(null);
  const job = useRef<{ controller: AbortController; draftId: string; rev: number } | null>(null);

  const cancel = (): void => {
    job.current?.controller.abort();
  };

  const start = (): void => {
    const current = latest.current;
    if (job.current !== null || current === null || current.world === null) return;
    if (!worldReady(current) || (current.story !== null && !storyStale(current))) return;
    const basis = storyBasis(current);
    if (basis === null) return;
    const controller = new AbortController();
    const mine = { controller, draftId: current.draftId, rev: current.world.rev };
    job.current = mine;
    setError(null);
    const started = Date.now();
    setWriting({ text: "", started });
    let streamed = "";
    void writeStory(current.idea, current.world.fields, {
      signal: controller.signal,
      onDelta: (text) => {
        streamed += text;
        if (job.current === mine) setWriting({ text: streamed.slice(-STREAM_KEEP), started });
      },
    }).then((result) => {
      if (job.current === mine) {
        job.current = null;
        setWriting(null);
      }
      if (controller.signal.aborted) return;
      if (!result.ok) {
        setError(result.error);
        return;
      }
      update((one) =>
        one.draftId !== mine.draftId || one.world?.rev !== mine.rev
          ? one
          : {
              ...one,
              story: {
                logline: result.value.logline,
                loglineEdited: false,
                chapters: result.value.chapters.map((text) => ({
                  ...text,
                  key: newKey(),
                  locked: false,
                  edited: false,
                })),
                basis,
              },
            },
      );
    });
  };

  // The plan fits one world of one draft: another draft, or a world that changed, stops it.
  const draftId = draft?.draftId ?? null;
  const rev = draft?.world?.rev ?? null;
  useEffect(() => {
    const running = job.current;
    if (running === null) return;
    if (running.draftId !== draftId || running.rev !== rev) {
      running.controller.abort();
      job.current = null;
      setWriting(null);
    }
  }, [draftId, rev]);

  // Leaving Create stops it too.
  useEffect(
    () => () => {
      job.current?.controller.abort();
      job.current = null;
    },
    [],
  );

  // A new draft starts without the last one's failure.
  // biome-ignore lint/correctness/useExhaustiveDependencies: keyed by the draft's identity
  useEffect(() => {
    setError(null);
  }, [draftId]);

  return { writing, error, start, cancel };
}
