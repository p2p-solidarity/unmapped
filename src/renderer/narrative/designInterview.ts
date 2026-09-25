import { chat } from "@renderer/llm";
import {
  CAPABILITY_KEYS,
  type CapabilityResolution,
  specKey,
  specValue,
} from "@shared/capabilities";
import { BUILTIN_MODULES } from "@shared/capability-modules";
import { DESIGN_QUESTION_CATEGORIES, type DesignReview, reviewStatus } from "@shared/design-review";
import type { DefinitionPatch } from "@shared/game-definition";
import { type GameModeId, MODE_CATALOG } from "@shared/mode-catalog";
import { err, ok, type Result } from "@shared/result";
import { z } from "zod";

// A closed enum rather than z.custom: z.toJSONSchema throws on custom types at module load, and an
// enum also shows the model the exact ids it may use instead of leaving it to guess.
const modeIdSchema = z.enum(MODE_CATALOG.map((mode) => mode.id) as [GameModeId, ...GameModeId[]]);

// The model may only pin a capability to a value an installed module implements. A free string let
// it invent `ui = target_preview`, which the player accepted and which then blocked Forge forever.
const setCapabilitySchemas = CAPABILITY_KEYS.flatMap((key) => {
  const values = [
    ...new Set(
      BUILTIN_MODULES.flatMap((module) => module.provides)
        .filter((spec) => specKey(spec) === key)
        .map(specValue),
    ),
  ];
  return values.length === 0
    ? []
    : [
        z
          .object({
            type: z.literal("set_capability"),
            key: z.literal(key),
            value: z.enum(values as [string, ...string[]]),
          })
          .strict(),
      ];
});

// A plain union: every set_capability variant shares the same `type`, so it cannot discriminate.
const patchSchema: z.ZodType<DefinitionPatch> = z.union([
  ...setCapabilitySchemas,
  z.object({ type: z.literal("add_mode"), mode: modeIdSchema }).strict(),
  z.object({ type: z.literal("remove_mode"), mode: modeIdSchema }).strict(),
  z
    .object({
      type: z.literal("select_option"),
      questionId: z.string().min(1).max(80),
      optionId: z.string().min(1).max(80),
    })
    .strict(),
]);

const optionSchema = z
  .object({
    id: z.string().min(1).max(80),
    label: z.string().min(1).max(100),
    description: z.string().min(1).max(280),
    patches: z.array(patchSchema).max(8),
  })
  .strict();

const questionSchema = z
  .object({
    id: z.string().min(1).max(80),
    category: z.enum(DESIGN_QUESTION_CATEGORIES),
    question: z.string().min(1).max(240),
    required: z.boolean(),
    affects: z.array(z.enum(CAPABILITY_KEYS)).max(CAPABILITY_KEYS.length),
    multiSelect: z.boolean(),
    options: z.array(optionSchema).min(2).max(5),
  })
  .strict();

const suggestionSchema = z
  .object({
    id: z.string().min(1).max(80),
    title: z.string().min(1).max(120),
    rationale: z.string().min(1).max(360),
    patches: z.array(patchSchema).max(8),
  })
  .strict();

const responseSchema = z
  .object({
    questions: z.array(questionSchema).max(8),
    suggestions: z.array(suggestionSchema).max(8),
  })
  .strict();

/**
 * Keeps every item that validates and drops the rest. The model is a guest (Rule 7): one question
 * with a mislabelled field is not a reason to throw away the four good ones beside it. Nothing
 * invalid is ever repaired into something plausible — it is simply not shown.
 */
function salvage<T>(
  items: unknown,
  schema: z.ZodType<T>,
  limit: number,
): { kept: T[]; firstIssue: string | null } {
  if (!Array.isArray(items)) return { kept: [], firstIssue: null };
  const kept: T[] = [];
  let firstIssue: string | null = null;
  for (const item of items.slice(0, limit)) {
    const parsed = schema.safeParse(item);
    if (parsed.success) kept.push(parsed.data);
    else firstIssue ??= parsed.error.issues[0]?.message ?? "invalid item";
  }
  return { kept, firstIssue };
}

const { $schema: _dialect, ...responseJsonSchema } = z.toJSONSchema(responseSchema) as Record<
  string,
  unknown
>;

const tool = {
  name: "propose_design_review",
  description: "Return typed design questions and suggestions. This never edits the game directly.",
  parameters: responseJsonSchema,
};

export async function generateDesignReview(
  resolution: CapabilityResolution,
  selectedModes: string[],
  language: string,
): Promise<Result<DesignReview>> {
  const result = await chat({
    messages: [
      {
        role: "system",
        content: [
          "You are a game design interviewer. Use only the propose_design_review tool.",
          `Write player-facing text in ${language}.`,
          "Ask only decisions that materially affect the supplied capability resolution.",
          "For FPS + turns + teams, cover aim timing, turn ownership, team shape, and synchronization when relevant.",
          "Every proposed write must be a typed DefinitionPatch. Never write rules, scenes, code, or save data.",
        ].join(" "),
      },
      { role: "user", content: JSON.stringify({ selectedModes, resolution }) },
    ],
    maxTokens: 1800,
    temperature: 0.3,
    grammar: null,
    stop: [],
    tools: [tool],
  });
  if (!result.ok) return result;
  const call = result.value.toolCalls.find((one) => one.name === tool.name);
  if (call === undefined)
    return err(
      "design-review-missing",
      "The model did not return a typed design review.",
      "Try the interview again.",
    );
  let raw: unknown;
  try {
    raw = JSON.parse(call.arguments);
  } catch {
    return err(
      "design-review-invalid",
      "The design review was not valid JSON.",
      "Try the interview again.",
    );
  }
  const body = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;
  const questions = salvage(body.questions, questionSchema, 8);
  const suggestions = salvage(body.suggestions, suggestionSchema, 8);
  // Only an answer with nothing usable in it is an error; partial answers are still an interview.
  if (questions.kept.length === 0 && suggestions.kept.length === 0) {
    const issue = questions.firstIssue ?? suggestions.firstIssue;
    return err(
      "design-review-invalid",
      issue ?? "The model returned no design questions or suggestions.",
      "Try the interview again, or skip it — the review is optional.",
    );
  }
  const review: DesignReview = {
    reviewId: crypto.randomUUID(),
    resolution,
    questions: questions.kept,
    suggestions: suggestions.kept.map((suggestion) => ({
      ...suggestion,
      status: "proposed",
    })),
    answers: {},
    acceptedPatches: [],
    messages: [],
    status: "waiting_for_user",
  };
  return ok({ ...review, status: reviewStatus(review) });
}
