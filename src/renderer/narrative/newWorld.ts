// The minimal Create (plan.md §9): a name, one sentence of intent and a language become a world.
// The model writes the bible and the place the player wakes in; the ordinary Forge publishes it as
// an open-land cartridge (tps_exploration@1) with the bible hashed in, and a save is created. With
// no model there is no world — the caller shows the error and its hint, never a prebuilt world.

import {
  biblePrompt,
  type NewWorldContext,
  originIssues,
  originPrompt,
  parseBible,
  parseScene,
} from "@dsl";
import { dslError } from "@dsl/parse/program";
import type { InstanceMeta, WorldBible } from "@shared/cartridge";
import { ok, type Result } from "@shared/result";
import type { SceneGraph } from "@shared/world";
import { openLandCartridge } from "./openLandCartridge";
import { generateProgram } from "./pipeline";
import { cartridgeIdFor } from "./ui/createModel";

export type NewWorldStage = "bible" | "origin" | "publish";

function parseOrigin(source: string) {
  const scene = parseScene(source);
  if (!scene.ok) return scene;
  const issues = originIssues(scene.value);
  return issues.length === 0
    ? scene
    : {
        ok: false as const,
        error: dslError({
          code: "dsl-origin-unfit",
          message: `${issues.length} problem(s) make this place unfit to start in.`,
          hint: "Resend the whole Scene program with every listed problem fixed.",
          errors: issues,
        }),
      };
}

export async function makeWorld(
  ctx: NewWorldContext,
  onStage: (stage: NewWorldStage) => void,
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

  onStage("origin");
  const origin = await generateProgram<SceneGraph>({
    system: originPrompt(ctx, bible.value.graph),
    user: "Write the Scene program of the place the player wakes in. Output the program only.",
    purpose: "scene",
    language: ctx.language,
    parse: parseOrigin,
    maxTokens: 2200,
    temperature: 0.9,
  });
  if (!origin.ok) return origin;

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
