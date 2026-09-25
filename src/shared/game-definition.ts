// The authoring draft (plan.md §1, §2): what the player is assembling before anything is published.
// A draft never creates a save and never creates a character — those belong to the Instance
// boundary (plan.md §0.4). Pure data; no React, no Electron.

import type { AssetPackRef, AssetRef } from "./assets";
import type {
  CapabilityKey,
  CapabilityProfile,
  CapabilityResolution,
  CapabilitySpec,
  ModuleLock,
} from "./capabilities";
import type { CartridgeRef, ContentHash } from "./cartridge";
import type { DesignReview } from "./design-review";
import { findMode, type GameModeId, type ModeAxis, type ModeSelection } from "./mode-catalog";
import type { ModLock } from "./mods";

export const GAME_DEFINITION_FORMAT_VERSION = 2 as const;

// ── Scene bases and slots ────────────────────────────────────────────────────────────────────

export const SCENE_SLOT_ROLES = [
  "opening",
  "hub",
  "encounter",
  "puzzle",
  "boss",
  "ending",
  "custom",
] as const;
export type SceneSlotRole = (typeof SCENE_SLOT_ROLES)[number];

/** A visual/material starting point chosen in the Scene Base Gallery. Not a finished level. */
export interface SceneBaseSelection {
  baseIds: string[];
  /** Why this set is on screen: which reroll produced it. Traceability, not identity. */
  rerollSeed: number;
}

export interface SceneSlot {
  slotId: string;
  role: SceneSlotRole;
  title: string;
  /** Null until the player picks a candidate for this slot in the Scene Gallery (M4). */
  selectedCandidateId: string | null;
}

// ── Patches ──────────────────────────────────────────────────────────────────────────────────

/**
 * The only way the AI may change a draft (plan.md §2.4). Chat prose has no write permission: the
 * model proposes patches, the player accepts them, then the deterministic compiler re-runs.
 */
export type DefinitionPatch =
  | { type: "set_capability"; key: CapabilityKey; value: string }
  /** The player taking back an accepted decision; the key goes back to what the modes ask for. */
  | { type: "clear_capability"; key: CapabilityKey }
  | { type: "add_mode"; mode: GameModeId }
  | { type: "remove_mode"; mode: GameModeId }
  | { type: "select_option"; questionId: string; optionId: string };

// ── Staleness ────────────────────────────────────────────────────────────────────────────────

/**
 * plan.md §2.2: changing a mode must invalidate what depended on it and say so — never silently
 * reuse a stale review, never wipe unaffected work.
 */
export interface DraftStaleness {
  designReview: boolean;
  /** slotIds whose selected candidate no longer matches the current definition. */
  sceneSlots: string[];
}

export const FRESH_STALENESS: DraftStaleness = { designReview: false, sceneSlots: [] };

// ── Draft ────────────────────────────────────────────────────────────────────────────────────

export interface GameDefinitionDraft {
  formatVersion: number;
  name: string;
  /** The player's own sentence about the game. Anchors every generation prompt; never invented. */
  brief: string;
  cartridgeId: string;
  author: string;
  selection: ModeSelection;
  /** Accepted `set_capability` decisions; they win over the modes' own requested values. */
  overrides: Partial<Record<CapabilityKey, string>>;
  acceptedSubstitutions: Partial<Record<CapabilitySpec, CapabilitySpec>>;
  /** Latest deterministic compiler result, including every capability context. */
  capabilityResolution: CapabilityResolution | null;
  sceneBases: SceneBaseSelection | null;
  review: DesignReview | null;
  slots: SceneSlot[];
  stale: DraftStaleness;
  updatedAt: string;
}

/**
 * One compiler context frozen for runtime. The compiler's diagnostics are deliberately omitted:
 * a cartridge stores only profiles that were ready when it was forged.
 */
export interface FrozenCapabilityContext {
  contextId: string;
  profile: CapabilityProfile;
}

export interface CapabilityContextTransition {
  fromContextId: string;
  toContextId: string;
  trigger: "scene_enter" | "scene_exit" | "phase_change" | "typed_effect";
  triggerId: string;
}

export interface GameCapabilityProfile {
  profileId: string;
  defaultContextId: string;
  contexts: FrozenCapabilityContext[];
  transitions: CapabilityContextTransition[];
}

export interface ScenePlanTransition {
  fromSceneId: string;
  toSceneId: string;
  triggerId: string;
  requiresFlags: string[];
}

export interface ScenePlan {
  orderedSceneIds: string[];
  entrySceneId: string;
  endingSceneIds: string[];
  transitions: ScenePlanTransition[];
}

export interface SelectedScene {
  sceneId: string;
  slotId: string;
  candidateId: string;
  sourceHash: ContentHash;
  requiredProfileId: string;
  requiredContextId: string;
  requiredModules: string[];
  assets: AssetRef[];
}

export interface NarrativeScene {
  sceneId: string;
  title: string;
  summary: string;
  objective: string;
}

export interface NarrativeLayer {
  required: boolean;
  premise: string;
  finale: string;
  scenes: NarrativeScene[];
}

export interface GenerationReceipt {
  operation:
    | "base"
    | "initial"
    | "reroll_all"
    | "reroll_slot"
    | "refine"
    | "duplicate"
    | "visual_edit";
  generationSeed: number;
  requestHash: ContentHash;
  parentCandidateHash: ContentHash | null;
  modelId: string | null;
  createdAt: string;
}

/** The frozen form written into a v2 cartridge. */
export interface GameDefinition {
  formatVersion: typeof GAME_DEFINITION_FORMAT_VERSION;
  gameId: string;
  title: string;
  description: string;
  author: string;
  modeSelection: ModeSelection;
  capabilityProfile: GameCapabilityProfile;
  assetPacks: AssetPackRef[];
  scenePlan: ScenePlan;
  scenes: SelectedScene[];
  narrative: NarrativeLayer;
  moduleLock: ModuleLock;
  modLock: ModLock;
  provenance: {
    source: "new" | "remix" | "legacy-import";
    parent: CartridgeRef | null;
    generation: GenerationReceipt[];
  };
}

export function emptyDraft(now: string): GameDefinitionDraft {
  return {
    formatVersion: GAME_DEFINITION_FORMAT_VERSION,
    name: "",
    brief: "",
    cartridgeId: "",
    author: "",
    selection: { genres: [], timings: [], structures: [], settings: [] },
    overrides: {},
    acceptedSubstitutions: {},
    capabilityResolution: null,
    sceneBases: null,
    review: null,
    slots: [],
    stale: { ...FRESH_STALENESS, sceneSlots: [] },
    updatedAt: now,
  };
}

/** Applies one accepted patch. Returns a new draft; never mutates the input. */
export function applyPatch(
  draft: GameDefinitionDraft,
  patch: DefinitionPatch,
): GameDefinitionDraft {
  switch (patch.type) {
    case "set_capability":
      return staleAfterDefinitionChange({
        ...draft,
        overrides: { ...draft.overrides, [patch.key]: patch.value },
      });
    case "clear_capability": {
      const { [patch.key]: _cleared, ...overrides } = draft.overrides;
      return staleAfterDefinitionChange({ ...draft, overrides });
    }
    case "add_mode":
    case "remove_mode":
      return staleAfterDefinitionChange({
        ...draft,
        selection: editSelection(draft.selection, patch),
      });
    // A chosen option is recorded on the review itself; the option's own patches carry the change.
    case "select_option":
      return draft;
  }
}

function staleAfterDefinitionChange(draft: GameDefinitionDraft): GameDefinitionDraft {
  return {
    ...draft,
    capabilityResolution: null,
    review: draft.review === null ? null : { ...draft.review, status: "blocked" },
    stale: {
      designReview: draft.review !== null,
      sceneSlots: draft.slots.map((slot) => slot.slotId),
    },
  };
}

const AXIS_FIELD: Record<ModeAxis, keyof ModeSelection> = {
  genre: "genres",
  timing: "timings",
  structure: "structures",
  setting: "settings",
};

/** Adds or removes one mode on the axis the catalog says it belongs to. Unknown ids are ignored. */
function editSelection(
  selection: ModeSelection,
  patch: { type: "add_mode" | "remove_mode"; mode: GameModeId },
): ModeSelection {
  const mode = findMode(patch.mode);
  if (mode === null) return selection;
  const field = AXIS_FIELD[mode.axis];
  const list = selection[field] as string[];
  const next =
    patch.type === "add_mode"
      ? list.includes(patch.mode)
        ? list
        : [...list, patch.mode]
      : list.filter((id) => id !== patch.mode);
  return { ...selection, [field]: next };
}
