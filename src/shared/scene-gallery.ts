import type { ContentHash } from "./cartridge";
import type {
  GameDefinitionDraft,
  GenerationReceipt,
  NarrativeLayer,
  SceneSlotRole,
} from "./game-definition";

export const SCENE_GALLERY_FORMAT_VERSION = 1 as const;

export type CandidateStatus = "ready" | "stale" | "error";

export interface SceneCandidate {
  candidateId: string;
  slotId: string;
  /** Every scene chooses one compiler context; no context is silently discarded. */
  contextId: string;
  baseId: string;
  title: string;
  /** Parsed before it enters this type; the DSL remains the runtime source of truth. */
  sceneSource: string;
  contentHash: ContentHash;
  status: CandidateStatus;
  staleReason: "modes_changed" | "base_changed" | "context_removed" | null;
  /**
   * One written Dialogue program per NPC id of `sceneSource`, baked so the published cartridge can
   * be played with no model running. Empty until the Story step writes them.
   */
  dialogues: Record<string, string>;
  receipt: GenerationReceipt;
  assetHashes?: ContentHash[];
}

export interface SceneGallerySlot {
  slotId: string;
  role: SceneSlotRole;
  title: string;
  contextId: string;
  baseId: string;
  selectedCandidateId: string | null;
  candidates: SceneCandidate[];
}

export interface SceneGalleryState {
  formatVersion: typeof SCENE_GALLERY_FORMAT_VERSION;
  slots: SceneGallerySlot[];
  entrySlotId: string | null;
  endingSlotIds: string[];
}

export interface AuthoringSnapshot {
  formatVersion: 1;
  workspaceId: string;
  draft: GameDefinitionDraft;
  gallery: SceneGalleryState;
  narrative: NarrativeLayer | null;
  updatedAt: string;
}

export interface CreateAuthoringInput {
  name: string;
  author: string;
}

export interface NewSceneSlot {
  slotId: string;
  role: SceneSlotRole;
  title: string;
  contextId: string;
  baseId: string;
}

export function emptyGallery(): SceneGalleryState {
  return {
    formatVersion: SCENE_GALLERY_FORMAT_VERSION,
    slots: [],
    entrySlotId: null,
    endingSlotIds: [],
  };
}

export function addSlot(state: SceneGalleryState, input: NewSceneSlot): SceneGalleryState {
  if (state.slots.some((slot) => slot.slotId === input.slotId)) return state;
  const slot: SceneGallerySlot = { ...input, selectedCandidateId: null, candidates: [] };
  return {
    ...state,
    slots: [...state.slots, slot],
    entrySlotId: state.entrySlotId ?? input.slotId,
    endingSlotIds:
      input.role === "ending" ? [...state.endingSlotIds, input.slotId] : state.endingSlotIds,
  };
}

export function removeSlot(state: SceneGalleryState, slotId: string): SceneGalleryState {
  const slots = state.slots.filter((slot) => slot.slotId !== slotId);
  if (slots.length === state.slots.length) return state;
  return {
    ...state,
    slots,
    entrySlotId: state.entrySlotId === slotId ? (slots[0]?.slotId ?? null) : state.entrySlotId,
    endingSlotIds: state.endingSlotIds.filter((id) => id !== slotId),
  };
}

export function moveSlot(
  state: SceneGalleryState,
  slotId: string,
  targetIndex: number,
): SceneGalleryState {
  const from = state.slots.findIndex((slot) => slot.slotId === slotId);
  if (from < 0) return state;
  const slots = [...state.slots];
  const [slot] = slots.splice(from, 1);
  if (slot === undefined) return state;
  slots.splice(Math.max(0, Math.min(targetIndex, slots.length)), 0, slot);
  return { ...state, slots };
}

export function setEntrySlot(state: SceneGalleryState, slotId: string): SceneGalleryState {
  return state.slots.some((slot) => slot.slotId === slotId)
    ? { ...state, entrySlotId: slotId }
    : state;
}

export function toggleEndingSlot(state: SceneGalleryState, slotId: string): SceneGalleryState {
  if (!state.slots.some((slot) => slot.slotId === slotId)) return state;
  const endingSlotIds = state.endingSlotIds.includes(slotId)
    ? state.endingSlotIds.filter((id) => id !== slotId)
    : [...state.endingSlotIds, slotId];
  return { ...state, endingSlotIds };
}

/** Changing a slot's runtime context invalidates its candidates by construction. */
export function setSlotContext(
  state: SceneGalleryState,
  slotId: string,
  contextId: string,
): SceneGalleryState {
  if (contextId.length === 0) return state;
  return updateSlot(state, slotId, (slot) =>
    slot.contextId === contextId
      ? slot
      : { ...slot, contextId, selectedCandidateId: null, candidates: [] },
  );
}

export function replaceCandidates(
  state: SceneGalleryState,
  slotId: string,
  candidates: SceneCandidate[],
): SceneGalleryState {
  return updateSlot(state, slotId, (slot) => ({
    ...slot,
    candidates: candidates.filter((candidate) => candidate.slotId === slotId),
    selectedCandidateId: null,
  }));
}

export function selectCandidate(
  state: SceneGalleryState,
  slotId: string,
  candidateId: string,
): SceneGalleryState {
  return updateSlot(state, slotId, (slot) =>
    slot.candidates.some((candidate) => candidate.candidateId === candidateId)
      ? { ...slot, selectedCandidateId: candidateId }
      : slot,
  );
}

export function duplicateCandidate(
  state: SceneGalleryState,
  slotId: string,
  candidateId: string,
  duplicateId: string,
): SceneGalleryState {
  return updateSlot(state, slotId, (slot) => {
    const source = slot.candidates.find((candidate) => candidate.candidateId === candidateId);
    if (source === undefined || slot.candidates.some((one) => one.candidateId === duplicateId))
      return slot;
    const duplicate: SceneCandidate = {
      ...source,
      dialogues: { ...source.dialogues },
      candidateId: duplicateId,
      title: `${source.title} copy`,
      receipt: {
        ...source.receipt,
        operation: "duplicate",
        parentCandidateHash: source.receipt.requestHash,
      },
    };
    return { ...slot, candidates: [...slot.candidates, duplicate] };
  });
}

export function markGalleryStale(
  state: SceneGalleryState,
  slotIds: readonly string[],
  reason: NonNullable<SceneCandidate["staleReason"]>,
): SceneGalleryState {
  const affected = new Set(slotIds);
  return {
    ...state,
    slots: state.slots.map((slot) =>
      affected.has(slot.slotId)
        ? {
            ...slot,
            candidates: slot.candidates.map((candidate) => ({
              ...candidate,
              status: "stale" as const,
              staleReason: reason,
            })),
          }
        : slot,
    ),
  };
}

function updateSlot(
  state: SceneGalleryState,
  slotId: string,
  update: (slot: SceneGallerySlot) => SceneGallerySlot,
): SceneGalleryState {
  return {
    ...state,
    slots: state.slots.map((slot) => (slot.slotId === slotId ? update(slot) : slot)),
  };
}
