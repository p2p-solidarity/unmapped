import { chat } from "@renderer/llm";
import { GAMEPLAY_KIT_IDS, type StoryOutline } from "@shared/cartridge";
import type { CartridgeBlueprint } from "@shared/forge";
import { err, ok, type Result } from "@shared/result";
import { z } from "zod";

const storySchema: z.ZodType<StoryOutline> = z
  .object({
    premise: z.string().trim().min(1).max(1_200),
    finale: z.string().trim().min(1).max(800),
    scenes: z
      .array(
        z
          .object({
            id: z.string().regex(/^[a-z0-9][a-z0-9_-]{0,79}$/),
            title: z.string().trim().min(1).max(160),
            summary: z.string().trim().min(1).max(800),
            objective: z.string().trim().min(1).max(300),
            kit: z.enum(GAMEPLAY_KIT_IDS),
          })
          .strict(),
      )
      .length(3),
  })
  .strict();

function jsonObject(text: string): unknown {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}

export interface StoryRequest {
  name: string;
  blueprint: CartridgeBlueprint;
  language: string;
}

export async function generateStoryOutline(
  request: StoryRequest,
  onDelta?: (text: string) => void,
): Promise<Result<StoryOutline>> {
  const result = await chat(
    {
      messages: [
        {
          role: "system",
          content: `You are a game director, not a character novelist. Design a compact three-scene game cartridge around spaces, assets, traversal, interaction, and a playable finale. Return JSON only. Write player-facing text in ${request.language}. Every scene needs a unique ascii snake_case id. Available engine kits: ${GAMEPLAY_KIT_IDS.join(", ")}. Shape: {"premise":string,"finale":string,"scenes":[{"id":string,"title":string,"summary":string,"objective":string,"kit":one kit id}]}. Exactly three connected scenes. Do not invent a named protagonist or make the plot depend on character biography. Each summary must describe a materially different level composition and player action.`,
        },
        {
          role: "user",
          content: `Title: ${request.name}\nVisual direction: ${request.blueprint.visualDirection}\nAvailable scene assets: ${request.blueprint.assetPalette.join(", ")}\nRequired kit sequence: ${request.blueprint.sceneKits.join(" -> ")}\nGameplay brief: ${request.blueprint.gameplayBrief || "Build a focused journey through the space itself."}\nUse the required kit sequence in the same order, one kit per scene.`,
        },
      ],
      maxTokens: 900,
      temperature: 0.8,
      grammar: null,
      stop: [],
      tools: [],
    },
    onDelta,
  );
  if (!result.ok) return result;
  const parsed = storySchema.safeParse(jsonObject(result.value.text));
  if (!parsed.success) {
    return err(
      "story-outline-invalid",
      parsed.error.issues[0]?.message ?? "The model did not return a usable story outline.",
      "Retry Create; nothing is published until all scenes are valid.",
    );
  }
  if (new Set(parsed.data.scenes.map((scene) => scene.id)).size !== parsed.data.scenes.length) {
    return err("story-outline-invalid", "The story outline repeated a scene id.");
  }
  const requestedKits = request.blueprint.sceneKits;
  if (parsed.data.scenes.some((scene, index) => scene.kit !== requestedKits[index])) {
    return err(
      "story-outline-invalid",
      "The model changed the selected gameplay route.",
      "Retry Create; the three selected gameplay kits are kept fixed.",
    );
  }
  return ok(parsed.data);
}
