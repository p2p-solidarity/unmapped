import { parseRules, parseScene, serializeRules } from "@dsl";
import { type CapabilityResolution, compileCapabilities } from "@shared/capabilities";
import { BUILTIN_MODULES } from "@shared/capability-modules";
import type { PublishCartridgeInput } from "@shared/cartridge";
import type { GameDefinitionDraft } from "@shared/game-definition";
import {
  findMode,
  type GameModeId,
  type ModeSelection,
  requirementsFor,
} from "@shared/mode-catalog";
import { rulesForSceneContext } from "@shared/runtime-context";
import { rollBases, type SceneBase } from "@shared/scene-bases";
import {
  type AuthoringSnapshot,
  addSlot,
  markGalleryStale,
  type SceneGalleryState,
  selectCandidate,
  setSlotContext,
} from "@shared/scene-gallery";

export function selectionFromModes(modes: GameModeId[]): ModeSelection {
  const next: ModeSelection = { genres: [], timings: [], structures: [], settings: [] };
  for (const id of modes) {
    const axis = findMode(id)?.axis;
    if (axis === "genre") next.genres.push(id as ModeSelection["genres"][number]);
    if (axis === "timing") next.timings.push(id as ModeSelection["timings"][number]);
    if (axis === "structure") next.structures.push(id as ModeSelection["structures"][number]);
    if (axis === "setting") next.settings.push(id as ModeSelection["settings"][number]);
  }
  return next;
}

export function compileDraft(draft: GameDefinitionDraft): CapabilityResolution {
  return compileCapabilities({
    requirements: requirementsFor(draft.selection),
    modules: BUILTIN_MODULES,
    overrides: draft.overrides,
    accepted: draft.acceptedSubstitutions,
  });
}

export function cartridgeIdFor(name: string): string {
  const stem =
    name
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "cartridge";
  return `${stem}-${crypto.randomUUID().slice(0, 8)}`;
}

export function updateDefinition(
  snapshot: AuthoringSnapshot,
  draft: GameDefinitionDraft,
): AuthoringSnapshot {
  return {
    ...snapshot,
    draft: {
      ...draft,
      capabilityResolution: compileDraft(draft),
      updatedAt: new Date().toISOString(),
    },
    gallery: markGalleryStale(
      snapshot.gallery,
      snapshot.gallery.slots.map((slot) => slot.slotId),
      "modes_changed",
    ),
    narrative: null,
  };
}

export function defaultSlots(
  snapshot: AuthoringSnapshot,
  resolution: CapabilityResolution,
  base: SceneBase,
): AuthoringSnapshot {
  if (snapshot.gallery.slots.length > 0) return snapshot;
  const context = resolution.contexts.find((one) => one.profile !== null);
  if (context === undefined) return snapshot;
  const gallery = addSlot(snapshot.gallery, {
    slotId: "scene-1",
    role: "ending",
    title: "Scene 1",
    contextId: context.contextId,
    baseId: base.id,
  });
  return withGallery(
    {
      ...snapshot,
      draft: { ...snapshot.draft, stale: { ...snapshot.draft.stale, sceneSlots: [] } },
    },
    gallery,
  );
}

export function selectedBase(snapshot: AuthoringSnapshot): SceneBase | null {
  const selection = snapshot.draft.sceneBases;
  if (selection === null) return null;
  return rollBases(selection.rerollSeed).find((base) => base.id === selection.baseIds[0]) ?? null;
}

export function withGallery(
  snapshot: AuthoringSnapshot,
  gallery: SceneGalleryState,
): AuthoringSnapshot {
  return {
    ...snapshot,
    gallery,
    narrative: null,
    draft: {
      ...snapshot.draft,
      slots: gallery.slots.map(({ slotId, role, title, selectedCandidateId }) => ({
        slotId,
        role,
        title,
        selectedCandidateId,
      })),
    },
  };
}

export function previewRules(input: PublishCartridgeInput, sceneSource: string): string | null {
  if (input.manifest.formatVersion !== 2) return input.rules;
  const scene = parseScene(sceneSource);
  const rules = parseRules(input.rules);
  if (!scene.ok || !rules.ok) return null;
  const scoped = rulesForSceneContext(input.manifest.definition, rules.value, scene.value);
  return scoped.ok ? serializeRules(scoped.value) : null;
}

/**
 * Fills in whatever Forge would otherwise refuse over, using the choice a player would make
 * anyway: a scene with nothing selected (a reroll clears the selection) → its first ready
 * candidate; no entry → the first scene; no ending → the last; a scene pointing at a context that
 * cannot play → the first one that can.
 *
 * Nothing here calls the model and nothing already chosen is overridden: a slot with no candidate
 * stays empty, and Forge says so rather than inventing a scene (Rule 2).
 */
export function readyForForge(
  snapshot: AuthoringSnapshot,
  resolution: CapabilityResolution,
  base: SceneBase | null,
): AuthoringSnapshot {
  const playable = resolution.contexts.find((context) => context.profile !== null);
  if (base === null || playable === undefined) return snapshot;

  // Reaching Forge through the step list rather than Next can leave the identity unfilled.
  const named = snapshot.draft.name.trim() || "Untitled Game";
  const seeded: AuthoringSnapshot =
    snapshot.draft.cartridgeId.length > 0 && snapshot.draft.name.trim().length > 0
      ? snapshot
      : {
          ...snapshot,
          draft: {
            ...snapshot.draft,
            name: named,
            cartridgeId: snapshot.draft.cartridgeId || cartridgeIdFor(named),
          },
        };
  const ready = new Set(
    resolution.contexts.filter((one) => one.profile !== null).map((one) => one.contextId),
  );

  let gallery = seeded.gallery;
  for (const slot of gallery.slots) {
    if (!ready.has(slot.contextId))
      gallery = setSlotContext(gallery, slot.slotId, playable.contextId);
    const current = gallery.slots.find((one) => one.slotId === slot.slotId);
    if (current === undefined) continue;
    if (current.candidates.some((one) => one.candidateId === current.selectedCandidateId)) continue;
    const candidates = current.candidates;
    const pick = candidates.find((one) => one.status !== "stale") ?? candidates[0];
    if (pick !== undefined) gallery = selectCandidate(gallery, current.slotId, pick.candidateId);
  }

  const ids = gallery.slots.map((slot) => slot.slotId);
  const entrySlotId =
    gallery.entrySlotId !== null && ids.includes(gallery.entrySlotId)
      ? gallery.entrySlotId
      : (ids[0] ?? null);
  const endings = gallery.endingSlotIds.filter((id) => ids.includes(id));
  const last = ids.at(-1);
  gallery = {
    ...gallery,
    entrySlotId,
    endingSlotIds: endings.length > 0 || last === undefined ? endings : [last],
  };

  const next = withGallery(seeded, gallery);
  // Filling in a selection is not a reason to throw away a story the player already generated.
  return { ...next, narrative: snapshot.narrative };
}
