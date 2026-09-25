// Create a game (plan.md §9), in two halves the player sees apart. `planWorld`: a name, one
// sentence, a story and a language become the world bible and the chapters on the map — cheap to
// read, edit or ask for again. `buildWorld`: the place the player wakes in is written, the ordinary
// Forge publishes an open-land cartridge (tps_exploration@1) with the bible, the story and the
// chosen play style, and a save is created. With no model there is no world — the caller shows
// the error and its hint, never a prebuilt world.

import { biblePrompt, type NewWorldContext, originIssues, parseBible } from "@dsl";
import { dslError } from "@dsl/parse/program";
import { chat } from "@renderer/llm";
import type { InstanceMeta, WorldBible } from "@shared/cartridge";
import { fail, ok, type Result } from "@shared/result";
import type { GenerationEvent, SceneGenerationRequest } from "@shared/scene-generation";
import { parseStoryReply, type StoryPlan, storyMessages } from "@shared/story";
import { openLandCartridge, type PlayStyle } from "./openLandCartridge";
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
export async function planStory(
  story: string,
  bible: WorldBible,
  language: string,
  combat: boolean,
  signal?: AbortSignal,
): Promise<Result<StoryPlan>> {
  const messages = storyMessages({ story, core: bible.core, style: bible.style, language, combat });
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

/** What the player asked for on the first page of Create a game. */
export interface WorldIdea extends NewWorldContext {
  /** Their story; empty makes a world without chapters. */
  story: string;
  play: PlayStyle;
}

/** What the model proposed, before anything is published; the player may edit the chapters. */
export interface WorldPlan {
  bible: WorldBible;
  story: StoryPlan | null;
}

const aborted = () => fail({ code: "request-aborted", message: "World generation was cancelled." });

export async function planWorld(
  idea: WorldIdea,
  onStage: (stage: NewWorldStage) => void,
  signal?: AbortSignal,
): Promise<Result<WorldPlan>> {
  const ctx = { ...idea, fights: idea.play.fights };
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
  if (signal?.aborted) return aborted();
  if (ctx.story.trim().length === 0) return ok({ bible: bible.value.graph, story: null });
  onStage("story");
  const combat = ctx.play.fights !== "none";
  const planned = await planStory(ctx.story, bible.value.graph, ctx.language, combat, signal);
  if (!planned.ok) return planned;
  if (signal?.aborted) return aborted();
  return ok({ bible: bible.value.graph, story: planned.value });
}

export async function buildWorld(
  ctx: WorldIdea,
  plan: WorldPlan,
  onStage: (stage: NewWorldStage) => void,
  onGenerationEvent?: (event: GenerationEvent) => void,
  signal?: AbortSignal,
): Promise<Result<InstanceMeta>> {
  const story = plan.story ?? undefined;
  onStage("origin");
  const initialBrief = [
    `Create the open, walkable place where the player wakes in this world: ${ctx.intent.trim()}`,
    `World core: ${plan.bible.core}`,
    `Visual style: ${plan.bible.style}`,
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
      core: plan.bible.core,
      style: `Language: ${ctx.language}\n${plan.bible.style}`,
    },
    ...(story === undefined ? {} : { story }),
    createdAt: new Date().toISOString(),
    play: ctx.play,
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
