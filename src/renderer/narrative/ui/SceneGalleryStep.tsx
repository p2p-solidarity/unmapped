// Scene gallery step (plan.md §2.5): every scene slot, its candidates, and the actions on them.
//
// Split out of CreateScreen because it is one job with a lot of verbs — generate, reroll all,
// refine by prompt, hand-edit in the visual editor, reorder, pick entry and endings. The screen
// owns the draft and the busy/error state; this component only turns clicks into `save(...)`.

import { serializeScene } from "@dsl";
import type { CapabilityResolution } from "@shared/capabilities";
import { hashText } from "@shared/content-hash";
import type { AppError } from "@shared/result";
import type { SceneBase } from "@shared/scene-bases";
import {
  type AuthoringSnapshot,
  addSlot,
  duplicateCandidate,
  moveSlot,
  replaceCandidates,
  type SceneCandidate,
  type SceneGallerySlot,
  type SceneGalleryState,
  selectCandidate,
  setEntrySlot,
  setSlotContext,
  toggleEndingSlot,
} from "@shared/scene-gallery";
import type { SceneGraph } from "@shared/world";
import type { JSX } from "react";
import { type CandidateRequest, generateCandidateSet, refineCandidate } from "../candidates";
import { withGallery } from "./createModel";
import { SceneGallery } from "./SceneGallery";

/**
 * Selecting a scene also renames its slot to the place the model named, so three scenes read as
 * three places in the plan, the step list and the exit labels — not as "Scene 1, 2, 3".
 */
function adopt(gallery: SceneGalleryState, slotId: string, candidateId: string): SceneGalleryState {
  const selected = selectCandidate(gallery, slotId, candidateId);
  const title = selected.slots
    .find((slot) => slot.slotId === slotId)
    ?.candidates.find((one) => one.candidateId === candidateId)?.title;
  if (title === undefined || title.trim().length === 0) return selected;
  return {
    ...selected,
    slots: selected.slots.map((slot) => (slot.slotId === slotId ? { ...slot, title } : slot)),
  };
}

function pickFirst(
  gallery: SceneGalleryState,
  slotId: string,
  candidates: SceneCandidate[],
): SceneGalleryState {
  const replaced = replaceCandidates(gallery, slotId, candidates);
  const first = candidates[0];
  return first === undefined ? replaced : adopt(replaced, slotId, first.candidateId);
}

export interface SceneGalleryStepProps {
  snapshot: AuthoringSnapshot;
  resolution: CapabilityResolution;
  base: SceneBase | null;
  busy: string | null;
  error: AppError | null;
  setBusy(busy: string | null): void;
  setOperationError(error: AppError | null): void;
  save(change: (current: AuthoringSnapshot) => AuthoringSnapshot): void;
}

export function SceneGalleryStep({
  snapshot,
  resolution,
  base,
  busy,
  error: operationError,
  setBusy,
  setOperationError,
  save,
}: SceneGalleryStepProps): JSX.Element {
  const requestFor = (
    slot: SceneGallerySlot,
    operation: CandidateRequest["operation"],
  ): CandidateRequest | null => {
    const context = resolution.contexts.find((one) => one.contextId === slot.contextId);
    if (base === null || context?.profile == null) return null;
    const index = snapshot.gallery.slots.findIndex((one) => one.slotId === slot.slotId);
    return {
      slot,
      base,
      profile: context.profile,
      draft: snapshot.draft,
      position: index + 1,
      total: snapshot.gallery.slots.length,
      terminal: snapshot.gallery.endingSlotIds.includes(slot.slotId),
      language: navigator.language,
      seed: Math.floor(Math.random() * 2 ** 31),
      operation,
    };
  };

  const generate = async (slot: SceneGallerySlot): Promise<void> => {
    const request = requestFor(slot, slot.candidates.length === 0 ? "initial" : "reroll_slot");
    if (request === null) return;
    setBusy(slot.slotId);
    setOperationError(null);
    const generated = await generateCandidateSet(request);
    setBusy(null);
    if (!generated.ok) return setOperationError(generated.error);
    save((current) => {
      // A reroll is "give me something new", so the first new candidate is picked straight away;
      // leaving the scene unselected only turned into a Forge error two steps later.
      const next = withGallery(current, pickFirst(current.gallery, slot.slotId, generated.value));
      return {
        ...next,
        draft: {
          ...next.draft,
          stale: {
            ...next.draft.stale,
            sceneSlots: next.draft.stale.sceneSlots.filter((id) => id !== slot.slotId),
          },
        },
      };
    });
  };

  const generateAll = async (): Promise<void> => {
    if (base === null || snapshot.gallery.slots.length === 0) return;
    const requests = snapshot.gallery.slots.map((slot) => requestFor(slot, "reroll_all"));
    if (requests.some((request) => request === null)) {
      return setOperationError({
        code: "candidate-context-missing",
        message: "Every scene needs a ready capability context.",
      });
    }
    setBusy("all");
    setOperationError(null);
    const generated = await Promise.all(
      requests.map(async (request) =>
        request === null
          ? null
          : { slotId: request.slot.slotId, result: await generateCandidateSet(request) },
      ),
    );
    setBusy(null);
    const failed = generated.find((one) => one !== null && !one.result.ok);
    if (failed !== null && failed !== undefined && !failed.result.ok) {
      setOperationError(failed.result.error);
    }
    const written = generated.flatMap((one) =>
      one === null || !one.result.ok ? [] : [{ slotId: one.slotId, candidates: one.result.value }],
    );
    if (written.length === 0) return;
    save((current) => {
      const gallery = written.reduce(
        (next, one) => pickFirst(next, one.slotId, one.candidates),
        current.gallery,
      );
      const done = new Set(written.map((one) => one.slotId));
      const synced = withGallery(current, gallery);
      return {
        ...synced,
        draft: {
          ...synced.draft,
          stale: {
            ...synced.draft.stale,
            sceneSlots: synced.draft.stale.sceneSlots.filter((id) => !done.has(id)),
          },
        },
      };
    });
  };

  const refine = async (
    slotId: string,
    candidateId: string,
    instruction: string,
  ): Promise<void> => {
    const candidate = snapshot.gallery.slots
      .find((slot) => slot.slotId === slotId)
      ?.candidates.find((one) => one.candidateId === candidateId);
    if (candidate === undefined) return;
    setBusy(slotId);
    setOperationError(null);
    const result = await refineCandidate(candidate, instruction, "configured-model");
    setBusy(null);
    if (!result.ok) return setOperationError(result.error);
    save((current) =>
      withGallery(current, {
        ...current.gallery,
        slots: current.gallery.slots.map((slot) =>
          slot.slotId === slotId
            ? { ...slot, candidates: [...slot.candidates, result.value] }
            : slot,
        ),
      }),
    );
  };

  const editCandidate = async (
    slotId: string,
    candidateId: string,
    graph: SceneGraph,
  ): Promise<void> => {
    const candidate = snapshot.gallery.slots
      .find((slot) => slot.slotId === slotId)
      ?.candidates.find((one) => one.candidateId === candidateId);
    if (candidate === undefined) return;
    const sceneSource = serializeScene(graph);
    // Hand-editing can rename or delete people, so voices that no longer have an NPC are dropped
    // rather than published against a name the scene does not contain.
    const npcIds = new Set(graph.npcs.map((npc) => npc.id));
    const dialogues = Object.fromEntries(
      Object.entries(candidate.dialogues).filter(([npcId]) => npcIds.has(npcId)),
    );
    const [contentHash, requestHash] = await Promise.all([
      hashText(sceneSource),
      hashText(`visual-edit\n${candidate.contentHash}\n${sceneSource}`),
    ]);
    save((current) =>
      withGallery(current, {
        ...current.gallery,
        slots: current.gallery.slots.map((slot) =>
          slot.slotId === slotId
            ? {
                ...slot,
                candidates: slot.candidates.map((one) =>
                  one.candidateId === candidateId
                    ? {
                        ...one,
                        sceneSource,
                        contentHash,
                        status: "ready",
                        staleReason: null,
                        dialogues,
                        receipt: {
                          operation: "visual_edit",
                          generationSeed: 0,
                          requestHash,
                          parentCandidateHash: candidate.contentHash,
                          modelId: null,
                          createdAt: new Date().toISOString(),
                        },
                      }
                    : one,
                ),
              }
            : slot,
        ),
      }),
    );
  };

  return (
    <SceneGallery
      gallery={snapshot.gallery}
      contexts={resolution.contexts}
      busySlotId={busy}
      error={operationError}
      onAdd={() => {
        const context =
          resolution.contexts[snapshot.gallery.slots.length % resolution.contexts.length];
        if (context === undefined || base === null) return;
        save((current) => {
          const slotId = `scene-${crypto.randomUUID().slice(0, 8)}`;
          const synced = withGallery(
            current,
            addSlot(current.gallery, {
              slotId,
              role: "custom",
              title: `Scene ${current.gallery.slots.length + 1}`,
              contextId: context.contextId,
              baseId: base.id,
            }),
          );
          return {
            ...synced,
            draft: {
              ...synced.draft,
              stale: {
                ...synced.draft.stale,
                sceneSlots: [...new Set([...synced.draft.stale.sceneSlots, slotId])],
              },
            },
          };
        });
      }}
      onGenerateAll={() => void generateAll()}
      onGenerate={(slot) => void generate(slot)}
      onSelect={(slotId, id) =>
        save((current) => withGallery(current, adopt(current.gallery, slotId, id)))
      }
      onDuplicate={(slotId, id) =>
        save((current) =>
          withGallery(
            current,
            duplicateCandidate(
              current.gallery,
              slotId,
              id,
              `candidate-${crypto.randomUUID().slice(0, 8)}`,
            ),
          ),
        )
      }
      onRefine={(slotId, id, prompt) => void refine(slotId, id, prompt)}
      onContext={(slotId, contextId) =>
        save((current) => {
          const synced = withGallery(current, setSlotContext(current.gallery, slotId, contextId));
          return {
            ...synced,
            draft: {
              ...synced.draft,
              stale: {
                ...synced.draft.stale,
                sceneSlots: [...new Set([...synced.draft.stale.sceneSlots, slotId])],
              },
            },
          };
        })
      }
      onMove={(id, offset) =>
        save((current) =>
          withGallery(
            current,
            moveSlot(
              current.gallery,
              id,
              current.gallery.slots.findIndex((slot) => slot.slotId === id) + offset,
            ),
          ),
        )
      }
      onEntry={(id) => save((current) => withGallery(current, setEntrySlot(current.gallery, id)))}
      onEnding={(id) =>
        save((current) => withGallery(current, toggleEndingSlot(current.gallery, id)))
      }
      onEdit={(slotId, candidateId, graph) => void editCandidate(slotId, candidateId, graph)}
    />
  );
}
