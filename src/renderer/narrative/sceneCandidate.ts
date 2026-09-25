// One Scene Gallery candidate, written by the model against the space the author chose.
//
// prompt (dsl) → chat → parse → candidateIssues → repair (≤ 2 rounds, `generateProgram`) → a
// `SceneCandidate` carrying the exact program text that parsed and a receipt naming the model.
// There is no deterministic fallback: a candidate that cannot be generated is an error the Scene
// Gallery shows, with the reroll button still there (Rule 2, Rule 7).

import {
  type CandidateSceneContext,
  candidateIssues,
  candidateScenePrompt,
  parseScene,
  sceneGrammar,
  serializeScene,
} from "@dsl";
import { dslError } from "@dsl/parse/program";
import { useInferenceStore } from "@renderer/state/inferenceStore";
import type { CapabilityProfile } from "@shared/capabilities";
import { hashText } from "@shared/content-hash";
import { kitFor } from "@shared/forge";
import type { GameDefinitionDraft } from "@shared/game-definition";
import { selectedModeIds } from "@shared/mode-catalog";
import { ok, type Result } from "@shared/result";
import type { SceneBase } from "@shared/scene-bases";
import type { SceneCandidate, SceneGallerySlot } from "@shared/scene-gallery";
import type { SceneGraph } from "@shared/world";
import { generateProgram, grammarForProvider } from "./pipeline";

export const CANDIDATE_MAX_TOKENS = 2600;
export const CANDIDATE_TEMPERATURE = 0.95;

export interface CandidateRequest {
  slot: SceneGallerySlot;
  base: SceneBase;
  profile: CapabilityProfile;
  draft: GameDefinitionDraft;
  /** 1-based position of this scene in the plan, and how many scenes there are. */
  position: number;
  total: number;
  terminal: boolean;
  language: string;
  seed: number;
  operation: SceneCandidate["receipt"]["operation"];
}

function contextFor(request: CandidateRequest): CandidateSceneContext {
  return {
    gameTitle: request.draft.name,
    brief: request.draft.brief,
    modes: selectedModeIds(request.draft.selection),
    sceneTitle: request.slot.title,
    sceneRole: request.slot.role,
    position: request.position,
    total: request.total,
    terminal: request.terminal,
    base: request.base,
    kit: kitFor(request.profile),
    combat: request.profile.entries.some((entry) => entry.key === "combat"),
    language: request.language,
  };
}

/** `parseScene` plus the fit checks; both failures reach the repair round the same way. */
function parseFor(ctx: CandidateSceneContext) {
  return (source: string): Result<SceneGraph, ReturnType<typeof dslError>> => {
    const scene = parseScene(source);
    if (!scene.ok) return scene;
    const issues = candidateIssues(scene.value, ctx);
    if (issues.length === 0) return scene;
    return {
      ok: false,
      error: dslError({
        code: "dsl-candidate-unfit",
        message: `${issues.length} problem(s) make this scene unfit for the chosen space.`,
        hint: "Resend the whole Scene program with every listed problem fixed.",
        errors: issues,
      }),
    };
  };
}

function modelId(): string | null {
  return useInferenceStore.getState().config?.model ?? null;
}

export async function generateSceneCandidate(
  request: CandidateRequest,
): Promise<Result<SceneCandidate>> {
  const ctx = contextFor(request);
  const program = await generateProgram<SceneGraph>({
    system: candidateScenePrompt(ctx),
    user: [
      `Write the Scene program for "${request.slot.title}" now.`,
      request.terminal
        ? "It is the last scene of the cartridge."
        : `It is scene ${request.position} of ${request.total}.`,
      "Output the program only.",
    ].join("\n"),
    purpose: "scene",
    language: request.language,
    parse: parseFor(ctx),
    grammar: grammarForProvider(sceneGrammar()),
    maxTokens: CANDIDATE_MAX_TOKENS,
    temperature: CANDIDATE_TEMPERATURE,
  });
  if (!program.ok) return program;

  // The canonical serialisation is what the visual editor round-trips and what Forge publishes,
  // so the candidate stores that rather than whatever whitespace the model happened to emit.
  const sceneSource = `${serializeScene(program.value.graph).replace(/\n*$/, "")}\n`;
  const [contentHash, requestHash] = await Promise.all([
    hashText(sceneSource),
    hashText(
      JSON.stringify({
        slotId: request.slot.slotId,
        contextId: request.slot.contextId,
        baseId: request.base.id,
        brief: request.draft.brief,
        modes: ctx.modes,
        seed: request.seed,
      }),
    ),
  ]);
  return ok({
    candidateId: `candidate-${crypto.randomUUID().slice(0, 8)}`,
    slotId: request.slot.slotId,
    contextId: request.slot.contextId,
    baseId: request.base.id,
    title: program.value.graph.name || request.slot.title,
    sceneSource,
    contentHash,
    status: "ready",
    staleReason: null,
    dialogues: {},
    receipt: {
      operation: request.operation,
      generationSeed: request.seed,
      requestHash,
      parentCandidateHash: null,
      modelId: modelId(),
      createdAt: new Date().toISOString(),
    },
  });
}
