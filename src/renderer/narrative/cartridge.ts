import { parseScene, sceneGrammar, scenePromptLibrary, serializeScene } from "@dsl/index";
import type { StoryOutline } from "@shared/cartridge";
import type { CartridgeBlueprint } from "@shared/forge";
import { err, ok, type Result } from "@shared/result";
import type { Genesis } from "@shared/world";
import { generateProgram, grammarForProvider } from "./pipeline";

export const DEFAULT_RULES_SOURCE = [
  'root = Rules("tps_exploration@1", "grounded", [tps, fps, side, topdown, forward, back, left, right, sprint, jump, interact, flashlight, inspect])',
  'tps = Kit("tps_exploration@1", 4, 7, 6.4, 15, 2, 55, 0.0022, 9)',
  'fps = Kit("fps_puzzle@1", 3.5, 5, 0, 15, 3, 70, 0.0022, 0)',
  'side = Kit("platformer_2_5d@1", 4.5, 7, 7, 17, 2, 50, 0.0022, 12)',
  'topdown = Kit("topdown_puzzle@1", 4, 5, 0, 15, 2.5, 48, 0.0022, 14)',
  'forward = Bind("move_forward", ["KeyW", "ArrowUp"])',
  'back = Bind("move_backward", ["KeyS", "ArrowDown"])',
  'left = Bind("move_left", ["KeyA", "ArrowLeft"])',
  'right = Bind("move_right", ["KeyD", "ArrowRight"])',
  'sprint = Bind("sprint", ["ShiftLeft", "ShiftRight"])',
  'jump = Bind("jump", ["Space"])',
  'interact = Bind("interact", ["KeyE"])',
  'flashlight = Bind("flashlight", ["KeyF"])',
  'inspect = Bind("inspect", ["MouseLeft"])',
].join("\n");

export async function bakeStoryScenes(
  genesis: Genesis,
  blueprint: CartridgeBlueprint,
  story: StoryOutline,
  onDelta?: (text: string) => void,
): Promise<Result<Record<string, string>>> {
  const generated = await Promise.all(
    story.scenes.map((outline, index) => {
      const next = story.scenes[index + 1];
      const kitGuide: Record<string, string> = {
        "tps_exploration@1":
          "Build a broad, landmark-led route with elevation changes, readable distant silhouettes, and alternate paths.",
        "fps_puzzle@1":
          "Build tighter chambers, occlusion, close-range mechanisms, deliberate sightlines, and an inspectable route.",
        "platformer_2_5d@1":
          "Build a left-to-right platform sequence with clear silhouettes, height rhythm, gaps, and safe landings.",
        "topdown_puzzle@1":
          "Build a compact readable puzzle board with obstacle lanes, loops, spatial clues, and a visible goal.",
      };
      const system = scenePromptLibrary.prompt({
        preamble: [
          "You are an asset-first level designer writing one OpenUI Lang Scene program.",
          `Cartridge premise: ${story.premise}`,
          `Scene: ${outline.title}. ${outline.summary}`,
          `Player objective: ${outline.objective}`,
          `Art direction: ${blueprint.visualDirection}`,
          `Gameplay kit: ${outline.kit}. ${kitGuide[outline.kit]}`,
          `Only use these biomes: ${blueprint.biomePalette.join(", ")}.`,
          `Build the space primarily from these props: ${blueprint.assetPalette.join(", ")}. Reuse and scale them into a strong environmental composition.`,
        ].join("\n"),
        additionalRules: [
          `Write all player-facing text in ${genesis.language}.`,
          "Exactly one Floor and one Sky; include ambient or sun light plus purposeful point lights.",
          "Use 10 to 24 Props, 2 to 8 Platforms or Patches, and enough Walls to shape traversal. The geometry and prop silhouettes must change substantially from the other scenes.",
          "Leave the centre spawn tile clear. Keep every prop inside the Floor. Do not seal the route with walls.",
          next === undefined
            ? `This is the finale: write exactly one Exit at a visually unmistakable destination. Its label names the ending ("${story.finale}" in short); reaching it completes the game.`
            : `Write exactly one Exit whose label points toward ${next.title}.`,
          "Characters are optional and secondary. Prefer environmental action over dialogue. Use at most one NPC.",
          "Do not write a Contract; the cartridge compiler attaches the verified scene contract.",
          "Answer with the program only. Every child statement must be referenced by root exactly once.",
        ],
        examples: [],
      });
      return generateProgram({
        system,
        user: `Forge scene ${index + 1} of 3 now. Make its playable shape express ${outline.objective}.`,
        purpose: "scene",
        language: genesis.language,
        parse: parseScene,
        grammar: grammarForProvider(sceneGrammar()),
        maxTokens: 2600,
        temperature: 0.92,
        onDelta,
      });
    }),
  );
  const scenes: Record<string, string> = {};
  for (const [index, result] of generated.entries()) {
    if (!result?.ok) return result ?? err("scene-generation-failed", "A scene was not generated.");
    const outline = story.scenes[index];
    if (outline === undefined) return err("story-outline-invalid", "A story scene is missing.");
    const next = story.scenes[index + 1];
    const graph = result.value.graph;
    if (graph.exits.length === 0) {
      return err(
        "scene-exit-missing",
        next === undefined
          ? `${outline.title} has no ending gate.`
          : `${outline.title} has no exit to its next story scene.`,
        "Retry Create; every scene needs one Exit so the cartridge can be completed offline.",
      );
    }
    scenes[outline.id] = serializeScene({
      ...graph,
      name: outline.title,
      contract: {
        sceneId: outline.id,
        kit: outline.kit,
        requiresFlags: index === 0 ? [] : [`${story.scenes[index - 1]?.id}_done`],
        requiresItems: [],
        inventoryPolicy: "carry",
        grantsFlags: [`${outline.id}_done`],
        terminal: next === undefined,
      },
      // One exit per scene: the next scene's stable id, or the ending gate (no target) in the finale.
      exits: graph.exits
        .slice(0, 1)
        .map((exit) =>
          next === undefined
            ? { ...exit, targetSceneId: null }
            : { ...exit, to: next.title, targetSceneId: next.id },
        ),
    });
  }
  return ok(scenes);
}
