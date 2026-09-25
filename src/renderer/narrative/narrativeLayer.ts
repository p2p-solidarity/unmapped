import { chat } from "@renderer/llm";
import type { NarrativeLayer } from "@shared/game-definition";
import { err, ok, type Result } from "@shared/result";
import type { SceneCandidate, SceneGallerySlot } from "@shared/scene-gallery";
import { z } from "zod";

const schema: z.ZodType<NarrativeLayer> = z
  .object({
    required: z.boolean(),
    premise: z.string().min(1).max(1200),
    finale: z.string().min(1).max(800),
    scenes: z
      .array(
        z
          .object({
            sceneId: z.string().min(1).max(80),
            title: z.string().min(1).max(160),
            summary: z.string().min(1).max(800),
            objective: z.string().min(1).max(300),
          })
          .strict(),
      )
      .min(1)
      .max(32),
  })
  .strict();

// The scene item shape is spelled out: an `items: { type: "object" }` with no properties told the
// model nothing, so it answered with scenes missing `summary`/`objective` and the whole layer was
// rejected as invalid.
const tool = {
  name: "write_narrative_layer",
  description:
    "Write story metadata for already selected scenes without changing their layouts or rules.",
  parameters: {
    type: "object",
    additionalProperties: false,
    required: ["required", "premise", "finale", "scenes"],
    properties: {
      required: { type: "boolean" },
      premise: { type: "string", description: "What this game is about, in a short paragraph." },
      finale: { type: "string", description: "What the player is left with at the ending." },
      scenes: {
        type: "array",
        description: "One entry per given scene, in the same order, with the same sceneId.",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["sceneId", "title", "summary", "objective"],
          properties: {
            sceneId: { type: "string", description: "Copied verbatim from the input." },
            title: { type: "string" },
            summary: { type: "string", description: "What happens here, in one or two sentences." },
            objective: { type: "string", description: "What the player is here to do." },
          },
        },
      },
    },
  },
};

export async function generateNarrativeLayer(
  slots: SceneGallerySlot[],
  language: string,
): Promise<Result<NarrativeLayer>> {
  const selected = slots.flatMap((slot) => {
    const candidate: SceneCandidate | undefined = slot.candidates.find(
      (one) => one.candidateId === slot.selectedCandidateId,
    );
    return candidate === undefined
      ? []
      : [
          {
            sceneId: slot.slotId,
            title: slot.title,
            contextId: slot.contextId,
            sceneSource: candidate.sceneSource,
          },
        ];
  });
  if (selected.length !== slots.length || selected.length === 0) {
    return err(
      "narrative-scenes-incomplete",
      "Select one candidate for every scene before writing story.",
    );
  }
  const result = await chat({
    messages: [
      {
        role: "system",
        content: `Use only write_narrative_layer. Write in ${language}. Answer with one scene entry per given scene, in the same order and with the same sceneId, and fill in every field. The scene order and ids are immutable. Add story metadata only; never alter layouts, capability contexts, rules, assets, or save state.`,
      },
      { role: "user", content: JSON.stringify(selected) },
    ],
    maxTokens: 1600,
    temperature: 0.7,
    grammar: null,
    stop: [],
    tools: [tool],
  });
  if (!result.ok) return result;
  const call = result.value.toolCalls.find((one) => one.name === tool.name);
  if (call === undefined)
    return err("narrative-missing", "The model did not return typed narrative data.", "Try again.");
  let raw: unknown;
  try {
    raw = JSON.parse(call.arguments);
  } catch {
    return err("narrative-invalid", "The narrative response was invalid JSON.", "Try again.");
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success)
    return err(
      "narrative-invalid",
      parsed.error.issues[0]?.message ?? "Invalid narrative.",
      "Try again.",
    );
  if (parsed.data.scenes.some((scene, index) => scene.sceneId !== selected[index]?.sceneId)) {
    return err(
      "narrative-scene-mismatch",
      "The model changed the scene order or ids.",
      "Try again.",
    );
  }
  return ok(parsed.data);
}
