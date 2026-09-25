// An open-land cartridge from one origin scene: the ordinary Forge with the one game's fixed mode
// (`adventure_rpg` → a single `tps_exploration@1` context), a bible hashed in, and no finale. A
// play style chosen when the world is made adds fighting (a gun or a blade) to that same context,
// so the world starts with its rules instead of needing a mod revision.
// Pure apart from hashing, so the built-in game is produced by a script with exactly the code a
// model-written world is published with.

import { parseRules, parseScene, serializeRules } from "@dsl";
import { type CapabilityRequirement, compileCapabilities } from "@shared/capabilities";
import { BUILTIN_MODULES } from "@shared/capability-modules";
import type { PublishCartridgeInput, WorldBible } from "@shared/cartridge";
import { hashText } from "@shared/content-hash";
import { type ModeSelection, requirementsFor } from "@shared/mode-catalog";
import { err, ok, type Result } from "@shared/result";
import type { AuthoringSnapshot } from "@shared/scene-gallery";
import type { StoryPlan } from "@shared/story";
import { buildCartridge } from "./forge";

const ORIGIN_SLOT = "origin";
const SELECTION: ModeSelection = {
  genres: ["adventure_rpg"],
  timings: [],
  structures: [],
  settings: [],
};

export interface PlayStyle {
  /** Fighting on the land: none, a gun or a blade. */
  fights: "none" | "gun" | "blade";
  /** What the player calls their weapon, in their own words; empty keeps the forge's name. */
  weapon: string;
}

export const PEACEFUL: PlayStyle = { fights: "none", weapon: "" };

function styleRequirements(style: PlayStyle): CapabilityRequirement[] {
  const specs = [
    ...(style.fights === "gun" ? ["combat:shooter"] : []),
    ...(style.fights === "blade" ? ["combat:melee"] : []),
  ];
  return specs.map((spec) => {
    const [key = "", value = ""] = spec.split(":");
    return {
      key: key as CapabilityRequirement["key"],
      value,
      required: true,
      sourceModes: [],
      reason: "Chosen when the world was made.",
    };
  });
}

export interface OpenLandInput {
  cartridgeId: string;
  version: string;
  name: string;
  author: string;
  premise: string;
  originSource: string;
  bible: WorldBible;
  /** Episodes the player's story became; the built-in game has none. */
  story?: StoryPlan;
  /** Fixed for the built-in game so its content hash is stable; now for a new world. */
  createdAt: string;
  /** Peaceful when absent (the built-in game). */
  play?: PlayStyle;
}

export async function openLandCartridge(
  input: OpenLandInput,
): Promise<Result<PublishCartridgeInput>> {
  const origin = parseScene(input.originSource);
  if (!origin.ok) return err("open-land-origin-invalid", origin.error.message, origin.error.hint);
  const play = input.play ?? PEACEFUL;
  const resolution = compileCapabilities({
    requirements: [...requirementsFor(SELECTION), ...styleRequirements(play)],
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
  const rules = namedWeapon(built.value.rules, play.weapon.trim());
  if (!rules.ok) return rules;
  return ok({
    ...built.value,
    rules: rules.value,
    manifest: { ...built.value.manifest, version: input.version, createdAt: input.createdAt },
    bible: input.bible,
    ...(input.story === undefined ? {} : { story: input.story }),
  });
}

/** The forged rules with the player's own name on the starting weapon. */
function namedWeapon(source: string, name: string): Result<string> {
  if (name === "") return ok(source);
  const rules = parseRules(source);
  if (!rules.ok) return err("open-land-rules-invalid", rules.error.message);
  const [first, ...rest] = rules.value.weapons;
  if (first === undefined) return ok(source);
  const weapons = [{ ...first, name: name.slice(0, 40) }, ...rest];
  return ok(`${serializeRules({ ...rules.value, weapons }).replace(/\n*$/, "")}\n`);
}
