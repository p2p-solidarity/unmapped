// Scene Gallery generation verbs. Every candidate is written by the model against the space the
// author chose (`sceneCandidate.ts`); there is no deterministic stand-in, so a slot with no model
// reachable stays empty and says why (Rule 2).

import { parseScene, sceneGrammar, serializeScene } from "@dsl";
import { chat } from "@renderer/llm";
import { hashText } from "@shared/content-hash";
import { err, ok, type Result } from "@shared/result";
import type { SceneCandidate } from "@shared/scene-gallery";
import { type CandidateRequest, generateSceneCandidate } from "./sceneCandidate";

export type { CandidateRequest } from "./sceneCandidate";
export { generateSceneCandidate } from "./sceneCandidate";

function id(prefix: string): string {
  return `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
}

/**
 * `count` alternatives for one slot, generated in parallel from different seeds. A run in which
 * every attempt failed is an error; a partial run keeps what came back, because one unusable
 * reroll is not a reason to throw away two good scenes.
 */
export async function generateCandidateSet(
  request: CandidateRequest,
  count = 3,
): Promise<Result<SceneCandidate[]>> {
  const results = await Promise.all(
    Array.from({ length: Math.max(1, count) }, (_, index) =>
      generateSceneCandidate({ ...request, seed: request.seed + index * 7919 }),
    ),
  );
  const ready = results.flatMap((result) => (result.ok ? [result.value] : []));
  if (ready.length > 0) return ok(ready);
  const first = results.find((result) => !result.ok);
  return first !== undefined && !first.ok
    ? first
    : err("candidate-generation-failed", "No scene candidate could be generated.");
}

export async function refineCandidate(
  candidate: SceneCandidate,
  instruction: string,
  modelId: string,
): Promise<Result<SceneCandidate>> {
  const requestHash = await hashText(`${candidate.contentHash}\n${instruction.trim()}`);
  const completion = await chat({
    messages: [
      {
        role: "system",
        content: [
          "Edit one Unwritten Land Scene program according to the request.",
          "Return only a complete OpenUI Lang Scene program accepted by the supplied grammar.",
          "Keep the Contract scene id, preserve a reachable exit, and do not invent JavaScript, assets, or engine systems.",
        ].join(" "),
      },
      {
        role: "user",
        content: `Request: ${instruction.trim()}\n\nCurrent program:\n${candidate.sceneSource}`,
      },
    ],
    maxTokens: 2400,
    temperature: 0.6,
    grammar: sceneGrammar(),
    stop: [],
    tools: [],
  });
  if (!completion.ok) return completion;
  const parsed = parseScene(completion.value.text);
  if (!parsed.ok) return err("candidate-invalid", parsed.error.message, parsed.error.hint);
  if (parsed.value.contract !== null && parsed.value.contract.sceneId !== candidate.slotId) {
    return err(
      "candidate-contract-mismatch",
      "Refined scene changed its slot identity.",
      "Keep the existing Contract scene id.",
    );
  }
  const sceneSource = serializeScene(parsed.value);
  const contentHash = await hashText(sceneSource);
  // A refined scene may have renamed or removed people, so the baked voices no longer fit it.
  const npcIds = new Set(parsed.value.npcs.map((npc) => npc.id));
  const dialogues = Object.fromEntries(
    Object.entries(candidate.dialogues).filter(([npcId]) => npcIds.has(npcId)),
  );
  return ok({
    ...candidate,
    candidateId: id("candidate"),
    sceneSource,
    contentHash,
    status: "ready",
    staleReason: null,
    dialogues,
    receipt: {
      operation: "refine",
      generationSeed: 0,
      requestHash,
      parentCandidateHash: candidate.contentHash,
      modelId,
      createdAt: new Date().toISOString(),
    },
  });
}
