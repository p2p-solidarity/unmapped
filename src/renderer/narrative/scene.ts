// Floor generation. The system turn is the DSL's scene prompt (library schema + world rules +
// the player's language); the user turn is only "write this floor now".

import { parseScene, sceneGrammar, scenePrompt } from "@dsl";
import type { Result } from "@shared/result";
import type { Genesis, Inventory, KarmaEntry, SceneGraph } from "@shared/world";
import { generateProgram, grammarForProvider, type Program } from "./pipeline";
import { inventorySummary, karmaSummary } from "./summaries";

export const SCENE_MAX_TOKENS = 2200;
export const SCENE_TEMPERATURE = 0.9;

export interface GenerateSceneInput {
  genesis: Genesis;
  floor: number;
  karma: KarmaEntry[];
  /** Label of the exit the player walked through, or null on floor 1. */
  previousExit: string | null;
  inventory: Inventory;
}

export function generateScene(
  input: GenerateSceneInput,
  onDelta?: (text: string) => void,
): Promise<Result<Program<SceneGraph>>> {
  const system = scenePrompt({
    genesis: input.genesis,
    floor: input.floor,
    previousExit: input.previousExit,
    karmaSummary: karmaSummary(input.karma),
    inventorySummary: inventorySummary(input.inventory),
  });

  const user = [
    `Write the Scene program for floor ${input.floor}.`,
    input.previousExit === null
      ? "This is the first floor of this world."
      : `The player arrived through the exit labelled "${input.previousExit}".`,
    "Output the program only.",
  ].join("\n");

  return generateProgram<SceneGraph>({
    system,
    user,
    purpose: "scene",
    language: input.genesis.language,
    parse: parseScene,
    grammar: grammarForProvider(sceneGrammar()),
    maxTokens: SCENE_MAX_TOKENS,
    temperature: SCENE_TEMPERATURE,
    onDelta,
  });
}
