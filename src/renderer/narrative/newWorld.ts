// The minimal Create (plan.md §9): a name, one sentence of intent and a language become a world.
// The model writes the bible and the place the player wakes in; the ordinary Forge publishes it as
// an open-land cartridge (tps_exploration@1) with the bible hashed in, and a save is created. With
// no model there is no world — the caller shows the error and its hint, never a prebuilt world.

import { biblePrompt, type NewWorldContext, originIssues, parseBible } from "@dsl";
import { dslError } from "@dsl/parse/program";
import { chat } from "@renderer/llm";
import type { InstanceMeta, WorldBible } from "@shared/cartridge";
import { fail, ok, type Result } from "@shared/result";
import type { GenerationEvent, SceneGenerationRequest } from "@shared/scene-generation";
import { parseStoryReply, type StoryPlan, storyMessages } from "@shared/story";
import { openLandCartridge } from "./openLandCartridge";
import { generateProgram } from "./pipeline";
import { generateSceneArtifact } from "./sceneGeneration";
import { cartridgeIdFor } from "./ui/createModel";

export type NewWorldStage = "bible" | "story" | "origin" | "publish";

const STORY_REPAIRS = 2;

/**
 * The player's story → a plan of episodes placed on the map. The model answers in the @@ line
 * protocol; a malformed plan goes back with the reason, at most twice. No story, no plan: a world
 * made from one sentence simply has no episodes.
 */
async function planStory(
  story: string,
  bible: WorldBible,
  language: string,
  signal?: AbortSignal,
): Promise<Result<StoryPlan>> {
  const messages = storyMessages({ story, core: bible.core, style: bible.style, language });
  for (let attempt = 0; ; attempt += 1) {
    const reply = await chat(
      { messages, maxTokens: 4_000, temperature: 0.7, grammar: null, stop: [], tools: [] },
      undefined,
      signal === undefined ? {} : { signal },
    );
    if (!reply.ok) return reply;
    const plan = parseStoryReply(reply.value.text);
    if (plan.ok || attempt >= STORY_REPAIRS) return plan;
    messages.push(
      { role: "assistant", content: reply.value.text.slice(0, 20_000) },
      {
        role: "user",
        content: `${plan.error.message} ${plan.error.hint ?? ""} Answer again in the exact format.`,
      },
    );
  }
}

export async function makeWorld(
  ctx: NewWorldContext & { story?: string },
  onStage: (stage: NewWorldStage) => void,
  onGenerationEvent?: (event: GenerationEvent) => void,
  signal?: AbortSignal,
): Promise<Result<InstanceMeta>> {
  onStage("bible");
  const bible = await generateProgram<WorldBible>({
    system: biblePrompt(ctx),
    user: "Write the Bible program for this world now. Output the program only.",
    purpose: "free",
    language: ctx.language,
    parse: parseBible,
    maxTokens: 1400,
    temperature: 0.9,
  });
  if (!bible.ok) return bible;
  if (signal?.aborted) {
    return fail({ code: "request-aborted", message: "World generation was cancelled." });
  }

  let story: StoryPlan | undefined;
  if (ctx.story !== undefined && ctx.story.trim().length > 0) {
    onStage("story");
    const planned = await planStory(ctx.story, bible.value.graph, ctx.language, signal);
    if (!planned.ok) return planned;
    story = planned.value;
  }

  onStage("origin");
  const initialBrief = [
    `Create the open, walkable place where the player wakes in this world: ${ctx.intent.trim()}`,
    `World core: ${bible.value.graph.core}`,
    `Visual style: ${bible.value.graph.style}`,
    "Use a countryside biome and a 12 to 24 tile grass or sand floor.",
    "Place 1 to 3 residents, one sun light, and no exits, monsters, treasure, triggers, or platforms.",
    "Keep the centre tile empty and every floor edge open.",
  ]
    .join("\n")
    .slice(0, 2_000);
  let currentSource: string | null = null;
  let origin = await generateSceneArtifact(
    sceneRequest("new-room", initialBrief, ctx.language, currentSource),
    onGenerationEvent,
    signal,
  );
  if (!origin.ok) return origin;
  let issues = originIssues(origin.value.graph);
  for (let repair = 0; issues.length > 0 && repair < 2; repair += 1) {
    currentSource = origin.value.source;
    const diagnostics = issues
      .map((issue) => `${issue.message}${issue.hint === undefined ? "" : ` (${issue.hint})`}`)
      .join("\n")
      .slice(0, 1_400);
    origin = await generateSceneArtifact(
      sceneRequest(
        "repair-room",
        `Repair the current origin scene so it is safe and open for play. Fix every issue:\n${diagnostics}`,
        ctx.language,
        currentSource,
      ),
      onGenerationEvent,
      signal,
    );
    if (!origin.ok) return origin;
    issues = originIssues(origin.value.graph);
  }
  if (issues.length > 0) {
    return fail(
      dslError({
        code: "dsl-origin-unfit",
        message: `${issues.length} problem(s) make this place unfit to start in.`,
        hint: issues.map((issue) => `${issue.message} ${issue.hint ?? ""}`.trim()).join(" "),
        errors: issues,
      }),
    );
  }

  onStage("publish");
  // The world keeps the language it was made in, inside its hashed bible (Rule 10).
  const input = await openLandCartridge({
    cartridgeId: cartridgeIdFor(ctx.name),
    version: "1.0.0",
    name: ctx.name.trim(),
    author: "you",
    premise: ctx.intent.trim(),
    originSource: origin.value.source,
    bible: {
      core: bible.value.graph.core,
      style: `Language: ${ctx.language}\n${bible.value.graph.style}`,
    },
    ...(story === undefined ? {} : { story }),
    createdAt: new Date().toISOString(),
  });
  if (!input.ok) return input;
  const published = await window.seed.cartridges.publish(input.value);
  if (!published.ok) return published;
  const created = await window.seed.instances.create({
    cartridgeId: published.value.cartridgeId,
    version: published.value.version,
    name: published.value.name,
  });
  return created.ok ? ok(created.value.instance.meta) : created;
}

function sceneRequest(
  purpose: "new-room" | "repair-room",
  brief: string,
  language: string,
  currentSceneSource: string | null,
): SceneGenerationRequest {
  return {
    intent: {
      requestId: crypto.randomUUID(),
      purpose,
      brief: brief.slice(0, 2_000),
      language,
      sceneId: "origin",
    },
    state: {
      worldPlan: null,
      currentSceneSource,
      flags: {},
      inventory: [],
      assetCatalog: [],
      capabilityProfile: { entries: [] },
    },
    maxRepairAttempts: 2,
  };
}
