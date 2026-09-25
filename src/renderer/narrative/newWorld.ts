// Create a game (plan.md §9), last step. Everything before it — the bible, the story, every
// partial rewrite — is reviewed and edited in the Create screen (worldDraft.ts) and kept in a
// draft; nothing is published until here. `buildWorld`: the place the player wakes in is written,
// the ordinary Forge publishes an open-land cartridge (tps_exploration@1) with the bible, the
// story and the chosen play style, and a save is created. With no model there is no world — the
// caller shows the error and its hint, never a prebuilt world.

import type { NewWorldContext } from "@dsl";
import { playerName } from "@renderer/net/room";
import { useSessionStore } from "@renderer/state/sessionStore";
import type { InstanceMeta, WorldBible } from "@shared/cartridge";
import { fail, ok, type Result } from "@shared/result";
import type { GenerationEvent } from "@shared/scene-generation";
import type { StoryPlan } from "@shared/story";
import { checkPlayKinds } from "@shared/storyEdits";
import { openLandCartridge, type PlayStyle } from "./openLandCartridge";
import { generateOrigin } from "./originScene";

export type NewWorldStage = "origin" | "publish";

/** What the player asked for on the first page of Create a game. */
export interface WorldIdea extends NewWorldContext {
  /** Their own story: optional material for the bible and the chapters. */
  story: string;
  play: PlayStyle;
}

/** What the player reviewed and kept: the bible as published, and the chapters. */
export interface WorldPlan {
  bible: WorldBible;
  story: StoryPlan | null;
}

const aborted = () => fail({ code: "request-aborted", message: "World generation was cancelled." });

export async function buildWorld(
  ctx: WorldIdea,
  plan: WorldPlan,
  onStage: (stage: NewWorldStage) => void,
  onGenerationEvent?: (event: GenerationEvent) => void,
  signal?: AbortSignal,
): Promise<Result<InstanceMeta>> {
  const story = plan.story ?? undefined;
  // Checked again here, before any model call or publish: never a chapter the land cannot play.
  if (story !== undefined) {
    const kinds = checkPlayKinds(story.episodes, ctx.play.fights !== "none");
    if (!kinds.ok) return kinds;
  }
  onStage("origin");
  // The selected System → Model route writes this scene, including non-Apple chat providers.
  const origin = await generateOrigin({
    world: ctx,
    bible: plan.bible,
    ...(onGenerationEvent === undefined ? {} : { onGenerationEvent }),
    ...(signal === undefined ? {} : { signal }),
  });
  if (!origin.ok) return origin;

  // A cancel that lands while the origin was being checked still stops before anything is published.
  if (signal?.aborted) return aborted();
  onStage("publish");
  // The world keeps the language it was made in, inside its hashed bible (Rule 10).
  const input = await openLandCartridge({
    cartridgeId: cartridgeIdFor(ctx.name),
    version: "1.0.0",
    name: ctx.name.trim(),
    author: authorName(),
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

/** Who made the world: the player's profile name, else the name this device plays under. */
function authorName(): string {
  const profile = useSessionStore.getState().playerProfile?.displayName.trim() ?? "";
  if (profile !== "") return profile.slice(0, 120);
  return playerName().trim().slice(0, 120);
}

/** One word of a name as an id label: plain ascii, accents dropped, else its IDNA (punycode) form. */
function idLabel(word: string): string | null {
  const plain = word
    .normalize("NFKD")
    .replace(/\p{M}+/gu, "")
    .toLowerCase();
  if (/^[a-z0-9]+$/.test(plain)) return plain;
  try {
    // The form a browser gives a non-ascii host name ("xn--…"): ascii, and it decodes back.
    const host = new URL(`http://${word.normalize("NFC")}.invalid/`).hostname;
    const label = host.slice(0, host.indexOf("."));
    return /^[a-z0-9-]+$/.test(label) ? label : null;
  } catch {
    return null;
  }
}

/**
 * A new world's cartridge id: a readable ascii form of its name (Latin names as themselves,
 * other scripts as punycode, which decodes back to the name) plus a short random tail so names
 * may repeat and a rebuilt world never collides with an earlier one. Always a valid cartridge id.
 */
export function cartridgeIdFor(name: string): string {
  const labels: string[] = [];
  let length = 0;
  for (const word of name.normalize("NFC").split(/[^\p{L}\p{N}\p{M}]+/u)) {
    const label = word === "" ? null : idLabel(word);
    if (label === null) continue;
    if (length + label.length + 1 > 60) {
      // A first word longer than the whole stem still names the world, cut short.
      if (labels.length === 0) labels.push(label.slice(0, 60).replace(/-+$/, ""));
      break;
    }
    labels.push(label);
    length += label.length + 1;
  }
  return `${labels.join("-") || "world"}-${crypto.randomUUID().slice(0, 6)}`;
}
