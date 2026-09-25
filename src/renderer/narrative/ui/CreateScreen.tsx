import { GameShell } from "@renderer/app/shell/GameShell";
import worldForgeArt from "@renderer/assets/generated/world-forge.png";
import { useAuthoringStore } from "@renderer/state";
import { Button, ErrorBlock, StatePanel, space, Text, TextField } from "@renderer/ui";
import { type CapabilitySpec, SUBSTITUTIONS } from "@shared/capabilities";
import type { InstanceMeta } from "@shared/cartridge";
import { answerQuestion, decideSuggestion, reviewStatus } from "@shared/design-review";
import { applyPatch, type GameDefinitionDraft } from "@shared/game-definition";
import { EMPTY_MODE_SELECTION, type ModeSelection, selectedModeIds } from "@shared/mode-catalog";
import type { AppError } from "@shared/result";
import type { SceneBase } from "@shared/scene-bases";
import { type AuthoringSnapshot, markGalleryStale } from "@shared/scene-gallery";
import { type JSX, useEffect, useMemo, useState } from "react";
import { generateDesignReview } from "../designInterview";
import { CapabilityReport } from "./CapabilityReport";
import {
  cartridgeIdFor,
  compileDraft,
  defaultSlots,
  readyForForge,
  selectedBase,
  selectionFromModes,
  updateDefinition,
  withGallery,
} from "./createModel";
import { DescribeGame } from "./DescribeGame";
import { DesignReviewPanel } from "./DesignReviewPanel";
import { ForgeStep } from "./ForgeStep";
import { GenreMatrix } from "./GenreMatrix";
import { SceneBaseGallery } from "./SceneBaseGallery";
import { SceneGalleryStep } from "./SceneGalleryStep";
import { StoryStep } from "./StoryStep";

const STEPS = [
  "Scene base",
  "Modes",
  "Design review",
  "Scenes",
  "Story & voices",
  "Forge",
] as const;

export interface CreateScreenProps {
  onCancel(): void;
  onCreated(meta: InstanceMeta): void;
}

export function CreateScreen({ onCancel, onCreated }: CreateScreenProps): JSX.Element {
  const authoring = useAuthoringStore();
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const [operationError, setOperationError] = useState<AppError | null>(null);

  useEffect(() => {
    void authoring.hydrate();
  }, [authoring.hydrate]);
  const snapshot = authoring.snapshot;
  const resolution = useMemo(
    () =>
      snapshot === null
        ? compileDraft({
            formatVersion: 2,
            name: "",
            brief: "",
            cartridgeId: "",
            author: "",
            selection: EMPTY_MODE_SELECTION,
            overrides: {},
            acceptedSubstitutions: {},
            capabilityResolution: null,
            sceneBases: null,
            review: null,
            slots: [],
            stale: { designReview: false, sceneSlots: [] },
            updatedAt: "",
          })
        : compileDraft(snapshot.draft),
    [snapshot],
  );
  const base = snapshot === null ? null : selectedBase(snapshot);

  // Loading and failure still sit inside the shell with a way out: a draft that will not load
  // must never leave New Game on a screen with nothing to press.
  if (authoring.status === "loading" || authoring.status === "idle" || snapshot === null) {
    const failed = authoring.status === "error" || (authoring.status === "ready" && !snapshot);
    return (
      <GameShell art={worldForgeArt} hints={[{ keys: ["Esc"], label: "Back", onPress: onCancel }]}>
        <div className="forge" style={{ gap: space.md }}>
          <StatePanel
            state={
              failed
                ? {
                    status: "error",
                    error: authoring.error ?? {
                      code: "authoring-load",
                      message: "Create draft could not be loaded.",
                    },
                  }
                : { status: "loading" }
            }
            loadingText="Loading Create draft…"
          >
            {() => null}
          </StatePanel>
          <div className="forge-foot">
            <Button variant="ghost" onClick={onCancel}>
              Back
            </Button>
            {failed ? (
              <Button
                variant="primary"
                onClick={() => {
                  // Forget the broken pointer and try a clean draft.
                  authoring.clear();
                  void authoring.hydrate();
                }}
              >
                Start a new draft
              </Button>
            ) : null}
          </div>
        </div>
      </GameShell>
    );
  }

  const save = (change: (current: AuthoringSnapshot) => AuthoringSnapshot): void => {
    setOperationError(null);
    void authoring.update(change);
  };
  const changeSelection = (selection: ModeSelection): void =>
    save((current) =>
      updateDefinition(current, {
        ...current.draft,
        selection,
        review:
          current.draft.review === null ? null : { ...current.draft.review, status: "blocked" },
        stale: {
          designReview: current.draft.review !== null,
          sceneSlots: current.gallery.slots.map((slot) => slot.slotId),
        },
      }),
    );
  const acceptSubstitution = (missing: CapabilitySpec, use: CapabilitySpec): void =>
    save((current) =>
      updateDefinition(current, {
        ...current.draft,
        acceptedSubstitutions: { ...current.draft.acceptedSubstitutions, [missing]: use },
      }),
    );

  const runReview = async (): Promise<void> => {
    setBusy("review");
    setOperationError(null);
    const result = await generateDesignReview(
      resolution,
      selectedModeIds(snapshot.draft.selection),
      navigator.language,
    );
    setBusy(null);
    if (!result.ok) return setOperationError(result.error);
    save((current) => ({
      ...current,
      draft: {
        ...current.draft,
        review: result.value,
        stale: { ...current.draft.stale, designReview: false },
      },
    }));
  };
  const applyReview = (
    review: NonNullable<GameDefinitionDraft["review"]>,
    patches: Parameters<typeof applyPatch>[1][],
  ): void =>
    save((current) => {
      let draft = current.draft;
      for (const patch of patches) draft = applyPatch(draft, patch);
      const nextResolution = compileDraft(draft);
      const nextReview = { ...review, resolution: nextResolution };
      return updateDefinition(current, {
        ...draft,
        review: { ...nextReview, status: reviewStatus(nextReview) },
        stale: { ...draft.stale, designReview: false },
      });
    });

  const selectBase = (next: SceneBase): void =>
    save((current) => {
      const synced = withGallery(
        current,
        markGalleryStale(
          {
            ...current.gallery,
            slots: current.gallery.slots.map((slot) => ({ ...slot, baseId: next.id })),
          },
          current.gallery.slots.map((slot) => slot.slotId),
          "base_changed",
        ),
      );
      return {
        ...synced,
        draft: {
          ...synced.draft,
          sceneBases: { baseIds: [next.id], rerollSeed: current.draft.sceneBases?.rerollSeed ?? 1 },
          stale: {
            ...synced.draft.stale,
            sceneSlots: current.gallery.slots.map((slot) => slot.slotId),
          },
        },
      };
    });

  // Undecided scenes, entry or ending are filled in (and saved, so the gallery shows the pick)
  // rather than reported back as a reason Forge cannot run. Nothing here asks the model: a slot
  // with no candidate stays empty and Forge says so.
  const prepare = (): AuthoringSnapshot => {
    const ready = readyForForge(snapshot, resolution, base);
    if (ready !== snapshot) save(() => ready);
    return ready;
  };

  // Leaving Modes creates the first scene slot so the gallery has something to generate into.
  // The scene itself is written in the gallery, on purpose: a model call behind "Next" is a
  // surprise, and its failure belongs next to the reroll button that can retry it.
  const next = (): void => {
    if (step === 1 && base !== null && snapshot.gallery.slots.length === 0) {
      save((current) => {
        const seeded = defaultSlots(current, resolution, base);
        const name = seeded.draft.name.trim() || "Untitled Game";
        return {
          ...seeded,
          draft: {
            ...seeded.draft,
            name,
            cartridgeId: seeded.draft.cartridgeId || cartridgeIdFor(name),
          },
        };
      });
    }
    setStep((current) => Math.min(STEPS.length - 1, current + 1));
  };
  const modes = selectedModeIds(snapshot.draft.selection);
  const canNext = step === 0 ? base !== null : step === 1 ? modes.length > 0 : true;

  return (
    <GameShell
      art={worldForgeArt}
      hints={[
        { keys: ["Esc"], label: "Back", onPress: step === 0 ? onCancel : () => setStep(step - 1) },
      ]}
    >
      <div className="forge">
        <nav className="forge-steps" aria-label="Create steps">
          {STEPS.map((label, index) => (
            <Button
              key={label}
              variant="ghost"
              className="forge-step"
              active={index === step}
              disabled={busy !== null}
              onClick={() => setStep(index)}
            >
              {label}
            </Button>
          ))}
        </nav>
        <div className="forge-body forge-grid forge-grid--brief g-enter" key={step}>
          <div style={{ minHeight: 0, display: "flex", flexDirection: "column", gap: space.md }}>
            {step === 1 ? (
              <>
                <TextField
                  label="Game title"
                  value={snapshot.draft.name}
                  onChange={(event) =>
                    save((current) => ({
                      ...current,
                      draft: {
                        ...current.draft,
                        name: event.target.value,
                        cartridgeId:
                          current.draft.cartridgeId || cartridgeIdFor(event.target.value),
                      },
                    }))
                  }
                />
                <DescribeGame
                  placeholder="2D platform shooter / turn-based team FPS / first-person maze"
                  value={snapshot.draft.brief}
                  onChange={(brief) =>
                    save((current) => ({ ...current, draft: { ...current.draft, brief } }))
                  }
                  onModes={(ids) => changeSelection(selectionFromModes(ids))}
                />
                <GenreMatrix selection={snapshot.draft.selection} onChange={changeSelection} />
              </>
            ) : null}
            {step === 2 ? (
              <DesignReviewPanel
                review={snapshot.draft.review}
                busy={busy === "review"}
                error={operationError}
                onGenerate={() => void runReview()}
                onSkip={() => setStep(3)}
                onAnswer={(questionId, optionIds) => {
                  const current = snapshot.draft.review;
                  if (current === null) return;
                  const nextReview = answerQuestion(current, questionId, optionIds);
                  const question = nextReview.questions.find((one) => one.id === questionId);
                  applyReview(
                    nextReview,
                    question?.options
                      .filter((option) => optionIds.includes(option.id))
                      .flatMap((option) => option.patches) ?? [],
                  );
                }}
                onSuggestion={(id, decision) => {
                  const current = snapshot.draft.review;
                  if (current === null) return;
                  const suggestion = current.suggestions.find((one) => one.id === id);
                  applyReview(
                    decideSuggestion(current, id, decision),
                    decision === "accepted" ? (suggestion?.patches ?? []) : [],
                  );
                }}
              />
            ) : null}
            {step === 0 ? (
              <SceneBaseGallery
                selectedId={base?.id ?? null}
                generated={resolution.selectedModules.some(
                  (module) => module.moduleId === "maze_generation",
                )}
                profile={resolution.contexts[0]?.profile ?? null}
                rerollSeed={snapshot.draft.sceneBases?.rerollSeed ?? 1}
                onReroll={(seed) =>
                  save((current) => ({
                    ...current,
                    gallery: markGalleryStale(
                      current.gallery,
                      current.gallery.slots.map((slot) => slot.slotId),
                      "base_changed",
                    ),
                    narrative: null,
                    draft: {
                      ...current.draft,
                      sceneBases: { baseIds: [], rerollSeed: seed },
                      stale: {
                        ...current.draft.stale,
                        sceneSlots: current.gallery.slots.map((slot) => slot.slotId),
                      },
                    },
                  }))
                }
                onSelect={selectBase}
              />
            ) : null}
            {step === 3 ? (
              <SceneGalleryStep
                snapshot={snapshot}
                resolution={resolution}
                base={base}
                busy={busy}
                error={operationError}
                setBusy={setBusy}
                setOperationError={setOperationError}
                save={save}
              />
            ) : null}
            {step === 4 ? (
              <StoryStep
                snapshot={snapshot}
                busy={busy}
                setBusy={setBusy}
                setOperationError={setOperationError}
                save={save}
              />
            ) : null}
            {step === 5 ? (
              <ForgeStep
                snapshot={snapshot}
                resolution={resolution}
                busy={busy}
                setBusy={setBusy}
                setOperationError={setOperationError}
                prepare={prepare}
                onCreated={onCreated}
              />
            ) : null}
          </div>
          <CapabilityReport
            resolution={resolution}
            applied={SUBSTITUTIONS.filter(
              (one) => snapshot.draft.acceptedSubstitutions[one.missing] === one.use,
            )}
            onAccept={(one) => acceptSubstitution(one.missing, one.use)}
            overrides={snapshot.draft.overrides}
            onRevoke={(key) =>
              save((current) =>
                updateDefinition(
                  current,
                  applyPatch(current.draft, { type: "clear_capability", key }),
                ),
              )
            }
            onAcceptAll={(substitutions) =>
              save((current) =>
                updateDefinition(current, {
                  ...current.draft,
                  acceptedSubstitutions: {
                    ...current.draft.acceptedSubstitutions,
                    ...Object.fromEntries(substitutions.map((one) => [one.missing, one.use])),
                  },
                }),
              )
            }
          />
        </div>
        {operationError ? <ErrorBlock error={operationError} /> : null}
        {authoring.error ? <ErrorBlock error={authoring.error} /> : null}
        <div className="forge-foot">
          <Button
            variant="ghost"
            disabled={busy !== null}
            onClick={step === 0 ? onCancel : () => setStep(step - 1)}
          >
            {step === 0 ? "Cancel" : "Back"}
          </Button>
          {step < STEPS.length - 1 ? (
            <Button variant="primary" disabled={!canNext || busy !== null} onClick={next}>
              Next
            </Button>
          ) : null}
          <Text variant="caption" tone="dim">
            Draft saved in workspace {snapshot.workspaceId}
          </Text>
        </div>
      </div>
    </GameShell>
  );
}
