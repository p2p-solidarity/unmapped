// Create a game: durable idea → reviewed world → reviewed story → Build. Only Build publishes.
import { contentLanguage, type StringKey, useT } from "@renderer/i18n";
import { buildWorld, type NewWorldStage } from "@renderer/narrative/newWorld";
import { PEACEFUL } from "@renderer/narrative/openLandCartridge";
import { generationEventLabel } from "@renderer/narrative/sceneGeneration";
import {
  rewriteBiblePart,
  rewriteChapter,
  rewriteUnlocked,
  writeBible,
  writeChapterAt,
  writeStory,
} from "@renderer/narrative/worldDraft";
import { useInferenceStore, useSessionStore } from "@renderer/state";
import { type BiblePart, flattenBible } from "@shared/bible";
import type { CreateDraft, CreateDraftEntry, CreateStep, DraftChapter } from "@shared/createDraft";
import { type AppError, fail, type Loadable, type Result } from "@shared/result";
import { STORY_LIMITS } from "@shared/story";
import { useEffect, useRef, useState } from "react";
import { useRefreshProbe } from "../inferenceSync";
import { openInstance } from "../useInstanceLoader";
import {
  editContext,
  storyBasis,
  storyPlan,
  storyStale,
  worldBasis,
  worldReady,
} from "./draftState";
import type { Idea } from "./IdeaStep";
import { patchBible } from "./WorldStep";

export const STEPS: readonly CreateStep[] = ["idea", "world", "story", "build"];
export const STEP_LABEL: Record<CreateStep, StringKey> = {
  idea: "create.stepIdea",
  world: "create.stepWorld",
  story: "create.stepStory",
  build: "create.stepBuild",
};
type Stage = "world" | "card" | "story" | "chapter" | "insert" | "note" | NewWorldStage;
export const STAGE_LABEL: Record<Stage, StringKey> = {
  world: "create.stageWorld",
  card: "create.stageCard",
  story: "create.stageStory",
  chapter: "create.stageChapter",
  insert: "create.stageInsert",
  note: "create.stageNote",
  origin: "create.stageOrigin",
  publish: "create.stagePublish",
};
const CARD_LABEL: Record<BiblePart, StringKey> = {
  premise: "create.partPremise",
  tone: "create.partTone",
  rules: "create.partRules",
  taboos: "create.partTaboos",
  naming: "create.partNaming",
  voice: "create.partVoice",
};
const cancelled = (error: AppError): boolean =>
  error.code === "cancelled" || error.code === "request-aborted";
const initialIdea = (): Idea => ({
  name: "",
  intent: "",
  story: "",
  language: contentLanguage(),
  play: PEACEFUL,
});

export function useCreateController() {
  const t = useT();
  const setScreen = useSessionStore((state) => state.setScreen);
  const probe = useInferenceStore((state) => state.probe);
  const refreshProbe = useRefreshProbe();
  const [entries, setEntries] = useState<Loadable<CreateDraftEntry[]>>({ status: "loading" });
  const [draft, setDraft] = useState<CreateDraft | null>(null);
  const latest = useRef<CreateDraft | null>(null);
  const saves = useRef<Promise<void>>(Promise.resolve());
  const saveFailed = useRef(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<AppError | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [stage, setStage] = useState<Stage | null>(null);
  const [stageArg, setStageArg] = useState<Record<string, string | number>>({});
  const [progress, setProgress] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const controller = useRef<AbortController | null>(null);

  useEffect(() => {
    refreshProbe();
    void window.seed.createDrafts
      .list()
      .then((result) =>
        setEntries(
          result.ok
            ? { status: "ready", value: result.value }
            : { status: "error", error: result.error },
        ),
      );
  }, [refreshProbe]);
  useEffect(() => {
    if (stage === null) return;
    const started = Date.now();
    const timer = window.setInterval(
      () => setElapsed(Math.floor((Date.now() - started) / 1000)),
      1000,
    );
    return () => window.clearInterval(timer);
  }, [stage]);

  const offline: AppError | null =
    probe.status === "error" || (probe.status === "ready" && !probe.value.reachable)
      ? {
          code: "new-world-no-model",
          message: t("create.offlineMessage"),
          hint: t("create.offlineHint"),
        }
      : null;
  const busy = stage !== null;

  const refresh = async (): Promise<void> => {
    const result = await window.seed.createDrafts.list();
    setEntries(
      result.ok
        ? { status: "ready", value: result.value }
        : { status: "error", error: result.error },
    );
  };

  // Serial autosaves prevent an older edit from landing after a newer one.
  const keep = (next: CreateDraft): void => {
    latest.current = next;
    setDraft(next);
    setSaving(true);
    saves.current = saves.current.then(async () => {
      const saved = await window.seed.createDrafts.save(next);
      saveFailed.current = !saved.ok;
      if (!saved.ok) setError(saved.error);
      if (latest.current === next) setSaving(false);
    });
  };
  const update = (change: (current: CreateDraft) => CreateDraft): void => {
    if (latest.current !== null) keep(change(latest.current));
  };
  const start = async (): Promise<void> => {
    setError(null);
    const created = await window.seed.createDrafts.create(initialIdea());
    if (!created.ok) {
      setError(created.error);
      return;
    }
    latest.current = created.value;
    setDraft(created.value);
    await refresh();
  };
  const open = async (id: string): Promise<void> => {
    setError(null);
    const read = await window.seed.createDrafts.read(id);
    if (!read.ok) {
      setError(read.error);
      return;
    }
    latest.current = read.value;
    setDraft(read.value);
  };
  const remove = async (id: string): Promise<void> => {
    setDeleteId(null);
    const result = await window.seed.createDrafts.remove(id);
    if (!result.ok) setError(result.error);
    await refresh();
  };
  const back = async (): Promise<void> => {
    if (busy) return;
    await saves.current;
    if (saveFailed.current) return;
    if (draft === null) {
      setScreen("worlds");
      return;
    }
    if (draft.step === "idea") {
      latest.current = null;
      setDraft(null);
      await refresh();
      return;
    }
    update((one) => ({ ...one, step: STEPS[STEPS.indexOf(one.step) - 1] ?? "idea" }));
  };

  const run = async <T>(
    at: Stage,
    work: (signal: AbortSignal, onDelta: (text: string) => void) => Promise<Result<T>>,
    arg: Record<string, string | number> = {},
  ): Promise<Result<T>> => {
    setError(null);
    setProgress(null);
    setStageArg(arg);
    setStage(at);
    setElapsed(0);
    const request = new AbortController();
    controller.current = request;
    try {
      const result = await work(request.signal, (text) => setProgress(text.slice(-500)));
      if (request.signal.aborted)
        return fail({ code: "cancelled", message: "The request was cancelled." });
      if (!result.ok && !cancelled(result.error)) setError(result.error);
      return result;
    } finally {
      controller.current = null;
      setStage(null);
      setProgress(null);
    }
  };

  const writeWorld = async (): Promise<void> => {
    const current = latest.current;
    if (current === null || current.idea.name.trim() === "" || current.idea.intent.trim() === "")
      return;
    const result = await run("world", (signal, onDelta) =>
      writeBible(current.idea, { signal, onDelta }),
    );
    if (!result.ok) return;
    update((one) => ({
      ...one,
      step: "world",
      world: {
        fields: result.value,
        edited: [],
        basis: worldBasis(one.idea),
        rev: (one.world?.rev ?? 0) + 1,
      },
    }));
  };
  const cardEdit = (part: BiblePart, value: string | string[]): void =>
    update((one) =>
      one.world === null
        ? one
        : {
            ...one,
            world: {
              ...one.world,
              fields: patchBible(one.world.fields, part, value),
              edited: [...new Set([...one.world.edited, part])],
              rev: one.world.rev + 1,
            },
          },
    );
  const cardRewrite = async (part: BiblePart, note: string): Promise<void> => {
    const current = latest.current;
    if (current === null || current.world === null) return;
    const fields = current.world.fields;
    const result = await run(
      "card",
      (signal, onDelta) => rewriteBiblePart(current.idea, fields, part, note, { signal, onDelta }),
      { part: t(CARD_LABEL[part]) },
    );
    if (!result.ok) return;
    const value = result.value[part];
    if (value === undefined) return;
    update((one) =>
      one.world === null
        ? one
        : {
            ...one,
            world: {
              ...one.world,
              fields: patchBible(one.world.fields, part, value),
              edited: one.world.edited.filter((item) => item !== part),
              rev: one.world.rev + 1,
            },
          },
    );
  };
  const writeTheStory = async (): Promise<void> => {
    const current = latest.current;
    if (current === null || current.world === null || !worldReady(current)) return;
    const fields = current.world.fields;
    const result = await run("story", (signal, onDelta) =>
      writeStory(current.idea, fields, { signal, onDelta }),
    );
    if (!result.ok) return;
    update((one) => {
      const basis = storyBasis(one);
      if (basis === null) return one;
      return {
        ...one,
        step: "story",
        story: {
          logline: result.value.logline,
          loglineEdited: false,
          chapters: result.value.chapters.map((text) => ({
            ...text,
            key: crypto.randomUUID().replaceAll("-", "").slice(0, 16),
            locked: false,
            edited: false,
          })),
          basis,
        },
      };
    });
  };
  const editChapter = (index: number, patch: Partial<DraftChapter>): void =>
    update((one) =>
      one.story === null
        ? one
        : {
            ...one,
            story: {
              ...one.story,
              chapters: one.story.chapters.map((ch, at) =>
                at === index ? { ...ch, ...patch } : ch,
              ),
            },
          },
    );
  const rewriteOne = async (index: number, note: string): Promise<void> => {
    const current = latest.current;
    if (current === null) return;
    const ctx = editContext(current);
    const key = current.story?.chapters[index]?.key;
    if (ctx === null || key === undefined || current.story?.chapters[index]?.locked) return;
    const result = await run(
      "chapter",
      (signal, onDelta) => rewriteChapter(ctx, index, note, { signal, onDelta }),
      { n: index + 1 },
    );
    if (!result.ok) return;
    update((one) =>
      one.story === null
        ? one
        : {
            ...one,
            story: {
              ...one.story,
              chapters: one.story.chapters.map((ch) =>
                ch.key === key && !ch.locked ? { ...ch, ...result.value, edited: false } : ch,
              ),
            },
          },
    );
  };
  const insert = async (index: number): Promise<void> => {
    const current = latest.current;
    if (
      current === null ||
      current.story === null ||
      current.story.chapters.length >= STORY_LIMITS.maxEpisodes
    )
      return;
    const ctx = editContext(current);
    if (ctx === null) return;
    const result = await run(
      "insert",
      (signal, onDelta) => writeChapterAt(ctx, index, { signal, onDelta }),
      { n: index + 1 },
    );
    if (!result.ok) return;
    update((one) =>
      one.story === null
        ? one
        : {
            ...one,
            story: {
              ...one.story,
              chapters: [
                ...one.story.chapters.slice(0, index),
                {
                  ...result.value,
                  key: crypto.randomUUID().replaceAll("-", "").slice(0, 16),
                  locked: false,
                  edited: false,
                },
                ...one.story.chapters.slice(index),
              ],
            },
          },
    );
  };
  const revise = async (note: string): Promise<void> => {
    const current = latest.current;
    if (current === null || current.story === null) return;
    const ctx = editContext(current);
    if (ctx === null) return;
    const unlocked = current.story.chapters.flatMap((one, index) => (one.locked ? [] : [index]));
    if (unlocked.length === 0) return;
    const chapters = current.story.chapters;
    const keys = unlocked
      .map((index) => chapters[index]?.key)
      .filter((key): key is string => key !== undefined);
    const result = await run("note", (signal, onDelta) =>
      rewriteUnlocked(ctx, unlocked, note, { signal, onDelta }),
    );
    if (!result.ok) return;
    update((one) =>
      one.story === null
        ? one
        : {
            ...one,
            story: {
              ...one.story,
              chapters: one.story.chapters.map((ch) => {
                const at = keys.indexOf(ch.key);
                const target = unlocked[at];
                const replacement = target === undefined ? undefined : result.value.get(target);
                return replacement === undefined || ch.locked
                  ? ch
                  : { ...ch, ...replacement, edited: false };
              }),
            },
          },
    );
  };
  const build = async (): Promise<void> => {
    const current = latest.current;
    if (current === null || !worldReady(current) || storyStale(current) || current.world === null)
      return;
    const story = storyPlan(current);
    if (story === null) return;
    await saves.current;
    if (saveFailed.current) return;
    const fields = current.world.fields;
    const result = await run("origin", (signal) =>
      buildWorld(
        current.idea,
        { bible: flattenBible(fields), story },
        (next) => setStage(next),
        (event) => setProgress(generationEventLabel(event)),
        signal,
      ),
    );
    if (!result.ok) return;
    const removed = await window.seed.createDrafts.remove(current.draftId);
    if (!removed.ok) setError(removed.error);
    void openInstance(result.value.instanceId);
  };

  return {
    entries,
    draft,
    saving,
    error,
    deleteId,
    setDeleteId,
    stage,
    stageArg,
    progress,
    elapsed,
    controller,
    offline,
    busy,
    refreshProbe,
    setScreen,
    start,
    open,
    remove,
    back,
    update,
    writeWorld,
    cardEdit,
    cardRewrite,
    writeTheStory,
    editChapter,
    rewriteOne,
    insert,
    revise,
    build,
  };
}
