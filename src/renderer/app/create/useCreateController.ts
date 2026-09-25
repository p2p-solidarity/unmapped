// Create a game: a few words → world cards → look → story → a quote → Build. Only Build publishes.
// Foreground model calls go through `run` (one at a time, a stage label, a preview, Cancel); the
// look pictures (useLookPictures) and the story plan written ahead (useStoryAhead) run beside it.
import { contentLanguage, useT } from "@renderer/i18n";
import { useUsageScope } from "@renderer/llm";
import { buildWorld } from "@renderer/narrative/newWorld";
import { PEACEFUL } from "@renderer/narrative/openLandCartridge";
import { generationEventLabel } from "@renderer/narrative/sceneGeneration";
import { rewriteBiblePart, rewriteBibleParts, writeBible } from "@renderer/narrative/worldDraft";
import { useInferenceStore, useSessionStore } from "@renderer/state";
import { BIBLE_PARTS, type BibleFields, type BiblePart, flattenBible } from "@shared/bible";
import type { CreateDraft, CreateDraftEntry, DraftWorld } from "@shared/createDraft";
import { type AppError, fail, type Loadable, type Result } from "@shared/result";
import { useEffect, useRef, useState } from "react";
import { useRefreshProbe } from "../inferenceSync";
import { openInstance } from "../useInstanceLoader";
import {
  lockedParts,
  nameFromWords,
  storyBasis,
  storyPlan,
  storyStale,
  worldBasis,
  worldReady,
} from "./draftState";
import type { Idea } from "./IdeaStep";
import { CARD_LABEL, type Run, STEPS, type Stage } from "./stages";
import { useLookPictures } from "./useLookPictures";
import { useStoryActions } from "./useStoryActions";
import { useStoryAhead } from "./useStoryAhead";
import { patchBible } from "./WorldStep";

/** Characters of streamed text kept for the live preview: a whole story plan fits. */
const STREAM_KEEP = 24_000;
const cancelled = (error: AppError): boolean =>
  error.code === "cancelled" || error.code === "request-aborted";
const initialIdea = (): Idea => ({
  name: "",
  intent: "",
  story: "",
  language: contentLanguage(),
  play: PEACEFUL,
});

/** New fields from the model, with every locked card kept as the player had it. */
function keepLocked(world: DraftWorld | null, fields: BibleFields): BibleFields {
  if (world === null) return fields;
  let next = fields;
  for (const part of lockedParts(world)) next = patchBible(next, part, world.fields[part]);
  return next;
}

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
  // Every call made for this draft counts toward it, and toward the world Build makes from it.
  useUsageScope(draft === null ? null : { kind: "create", id: draft.draftId });

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
    if (latest.current === null) return;
    const next = change(latest.current);
    if (next !== latest.current) keep(next);
  };

  const looks = useLookPictures(draft?.draftId ?? null, latest, saves, update);
  const ahead = useStoryAhead(draft, latest, update);

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

  async function runStage<T>(
    at: Stage,
    work: (signal: AbortSignal, onDelta: (text: string) => void) => Promise<Result<T>>,
    arg: Record<string, string | number> = {},
  ): Promise<Result<T>> {
    setError(null);
    setProgress(null);
    setStageArg(arg);
    setStage(at);
    setElapsed(0);
    const request = new AbortController();
    controller.current = request;
    // Deltas are pieces: the preview reads everything written so far (StreamPreview).
    let streamed = "";
    try {
      const result = await work(request.signal, (text) => {
        streamed += text;
        setProgress(streamed.slice(-STREAM_KEEP));
      });
      if (request.signal.aborted)
        return fail({ code: "cancelled", message: "The request was cancelled." });
      if (!result.ok && !cancelled(result.error)) setError(result.error);
      return result;
    } finally {
      controller.current = null;
      setStage(null);
      setProgress(null);
    }
  }
  const run: Run = runStage;
  const story = useStoryActions(latest, update, run);

  // While the look step is shown the story plan is written ahead, if the draft has none that fits.
  const step = draft?.step ?? null;
  const draftKey = draft?.draftId ?? null;
  // biome-ignore lint/correctness/useExhaustiveDependencies: start reads the latest draft itself
  useEffect(() => {
    if (step === "look") ahead.start();
  }, [step, draftKey]);

  /** The name alone: a rename never makes the world stale. */
  const rename = (name: string): void =>
    update((one) => ({ ...one, idea: { ...one.idea, name: name.slice(0, 60) } }));

  const writeWorld = async (): Promise<void> => {
    const current = latest.current;
    if (current === null || current.idea.intent.trim() === "") return;
    // Only the words are needed: a blank name is taken from their first clause, and stays editable.
    const named = current.idea.name.trim() !== "";
    const idea = named
      ? current.idea
      : { ...current.idea, name: nameFromWords(current.idea.intent) };
    if (!named) rename(idea.name);
    const result = await run("world", (signal, onDelta) => writeBible(idea, { signal, onDelta }));
    if (!result.ok) return;
    update((one) => {
      const locked = one.world === null ? [] : lockedParts(one.world);
      return {
        ...one,
        step: "world",
        world: {
          fields: keepLocked(one.world, result.value),
          edited: (one.world?.edited ?? []).filter((part) => locked.includes(part)),
          basis: worldBasis(one.idea),
          rev: (one.world?.rev ?? 0) + 1,
          locked: [...locked],
        },
      };
    });
  };
  const keepWorld = (): void =>
    update((one) =>
      one.world === null
        ? one
        : { ...one, world: { ...one.world, basis: worldBasis(one.idea), rev: one.world.rev + 1 } },
    );
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
  const cardLock = (part: BiblePart): void =>
    update((one) => {
      if (one.world === null) return one;
      const locked = lockedParts(one.world);
      const next = locked.includes(part)
        ? locked.filter((item) => item !== part)
        : BIBLE_PARTS.filter((item) => item === part || locked.includes(item));
      return { ...one, world: { ...one.world, locked: next } };
    });
  /** Model-written parts land only on cards that are still unlocked when the reply arrives. */
  const landCards = (value: Partial<BibleFields>, parts: readonly BiblePart[]): void =>
    update((one) => {
      if (one.world === null) return one;
      const locked = lockedParts(one.world);
      const landing = parts.filter((part) => !locked.includes(part) && value[part] !== undefined);
      if (landing.length === 0) return one;
      let fields = one.world.fields;
      for (const part of landing) {
        fields = patchBible(fields, part, value[part] as string | string[]);
      }
      return {
        ...one,
        world: {
          ...one.world,
          fields,
          edited: one.world.edited.filter((item) => !landing.includes(item)),
          rev: one.world.rev + 1,
        },
      };
    });
  const cardRewrite = async (part: BiblePart, note: string): Promise<void> => {
    const current = latest.current;
    if (current === null || current.world === null) return;
    if (lockedParts(current.world).includes(part)) return;
    const fields = current.world.fields;
    const result = await run(
      "card",
      (signal, onDelta) => rewriteBiblePart(current.idea, fields, part, note, { signal, onDelta }),
      { part: t(CARD_LABEL[part]) },
    );
    if (result.ok) landCards(result.value, [part]);
  };
  const cardsRewrite = async (note: string): Promise<void> => {
    const current = latest.current;
    if (current === null || current.world === null) return;
    const locked = lockedParts(current.world);
    const parts = BIBLE_PARTS.filter((part) => !locked.includes(part));
    if (parts.length === 0) return;
    const fields = current.world.fields;
    const result = await run("cards", (signal, onDelta) =>
      rewriteBibleParts(current.idea, fields, parts, note, { signal, onDelta }),
    );
    if (result.ok) landCards(result.value, parts);
  };

  /** World → look: the first visit draws the pictures (the story starts writing beside them). */
  const toLook = (): void => {
    const first = latest.current?.look === undefined;
    update((one) => ({ ...one, step: "look" }));
    if (first) void looks.draw();
  };
  /** Look → story, with the chosen picture or, when none is chosen, recorded as going without. */
  const toStory = (): void => {
    update((one) => {
      const look = one.look ?? { pictures: [], chosen: null };
      return { ...one, step: "story", look: { ...look, skipped: look.chosen === null } };
    });
    ahead.start();
  };
  const keepStory = (): void =>
    update((one) => {
      const basis = storyBasis(one);
      return one.story === null || basis === null
        ? one
        : { ...one, story: { ...one.story, basis } };
    });

  const build = async (): Promise<void> => {
    const current = latest.current;
    if (current === null || !worldReady(current) || storyStale(current) || current.world === null)
      return;
    const plan = storyPlan(current);
    if (plan === null) return;
    const chosen = current.look?.chosen ?? null;
    const look = looks.chosenPng(current);
    if (chosen !== null && look === null) {
      setError({
        code: "create-look-missing",
        message: "The chosen picture could not be read.",
        hint: "Pick another picture, or go on without one.",
      });
      return;
    }
    // A name cleared after the world was written is taken from the words again.
    const idea =
      current.idea.name.trim() === ""
        ? { ...current.idea, name: nameFromWords(current.idea.intent) }
        : current.idea;
    if (idea !== current.idea) rename(idea.name);
    await saves.current;
    if (saveFailed.current) return;
    const fields = current.world.fields;
    const result = await run("origin", (signal) =>
      buildWorld(
        idea,
        { bible: flattenBible(fields), story: plan, look },
        (next) => setStage(next),
        (event) => setProgress(generationEventLabel(event)),
        signal,
      ),
    );
    if (!result.ok) return;
    const linked = await window.seed.usage.link(
      { kind: "create", id: current.draftId },
      { kind: "instance", id: result.value.instanceId },
    );
    if (!linked.ok) setError(linked.error);
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
    rename,
    writeWorld,
    keepWorld,
    cardEdit,
    cardLock,
    cardRewrite,
    cardsRewrite,
    toLook,
    toStory,
    keepStory,
    looks,
    ahead,
    story,
    build,
  };
}

export type CreateController = ReturnType<typeof useCreateController>;
