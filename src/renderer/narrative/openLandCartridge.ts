// An open-land cartridge from one origin scene: the ordinary Forge with the one game's fixed mode
// (`adventure_rpg` → a single `tps_exploration@1` context), a bible hashed in, and no finale.
// Pure apart from hashing, so the built-in game is produced by a script with exactly the code a
// model-written world is published with.

import { parseScene } from "@dsl";
import { compileCapabilities } from "@shared/capabilities";
import { BUILTIN_MODULES } from "@shared/capability-modules";
import type { PublishCartridgeInput, WorldBible } from "@shared/cartridge";
import { hashText } from "@shared/content-hash";
import { type ModeSelection, requirementsFor } from "@shared/mode-catalog";
import { err, ok, type Result } from "@shared/result";
import type { AuthoringSnapshot } from "@shared/scene-gallery";
import { buildCartridge } from "./forge";

const ORIGIN_SLOT = "origin";
const SELECTION: ModeSelection = {
  genres: ["adventure_rpg"],
  timings: [],
  structures: [],
  settings: [],
};

export interface OpenLandInput {
  cartridgeId: string;
  version: string;
  name: string;
  author: string;
  premise: string;
  originSource: string;
  bible: WorldBible;
  /** Fixed for the built-in game so its content hash is stable; now for a new world. */
  createdAt: string;
}

export async function openLandCartridge(
  input: OpenLandInput,
): Promise<Result<PublishCartridgeInput>> {
  const origin = parseScene(input.originSource);
  if (!origin.ok) return err("open-land-origin-invalid", origin.error.message, origin.error.hint);
  const resolution = compileCapabilities({
    requirements: requirementsFor(SELECTION),
    modules: BUILTIN_MODULES,
    overrides: {},
    accepted: {},
  });
  const context = resolution.contexts[0];
  if (resolution.status !== "ready" || context === undefined) {
    return err(
      "open-land-capabilities",
      "The open-land game could not be compiled.",
      "This is a bug; report it.",
    );
  }
  const contentHash = await hashText(input.originSource);
  const title = origin.value.name;
  const snapshot: AuthoringSnapshot = {
    formatVersion: 1,
    workspaceId: `open-land-${input.cartridgeId}`,
    draft: {
      formatVersion: 2,
      name: input.name,
      brief: input.premise,
      cartridgeId: input.cartridgeId,
      author: input.author,
      selection: SELECTION,
      overrides: {},
      acceptedSubstitutions: {},
      capabilityResolution: resolution,
      sceneBases: null,
      review: null,
      slots: [],
      stale: { designReview: false, sceneSlots: [] },
      updatedAt: input.createdAt,
    },
    gallery: {
      formatVersion: 1,
      slots: [
        {
          slotId: ORIGIN_SLOT,
          role: "hub",
          title,
          contextId: context.contextId,
          baseId: ORIGIN_SLOT,
          selectedCandidateId: ORIGIN_SLOT,
          candidates: [
            {
              candidateId: ORIGIN_SLOT,
              slotId: ORIGIN_SLOT,
              contextId: context.contextId,
              baseId: ORIGIN_SLOT,
              title,
              sceneSource: input.originSource,
              contentHash,
              status: "ready",
              staleReason: null,
              dialogues: {},
              receipt: {
                operation: "initial",
                generationSeed: 0,
                requestHash: contentHash,
                parentCandidateHash: null,
                modelId: null,
                createdAt: input.createdAt,
              },
            },
          ],
        },
      ],
      entrySlotId: ORIGIN_SLOT,
      endingSlotIds: [ORIGIN_SLOT],
    },
    narrative: {
      required: false,
      premise: input.premise,
      finale: "",
      scenes: [{ sceneId: ORIGIN_SLOT, title, summary: "", objective: "" }],
    },
    updatedAt: input.createdAt,
  };
  const built = await buildCartridge(snapshot, resolution);
  if (!built.ok) return built;
  return ok({
    ...built.value,
    manifest: { ...built.value.manifest, version: input.version, createdAt: input.createdAt },
    bible: input.bible,
  });
}
