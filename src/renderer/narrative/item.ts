import type { NarrativeContext } from "@shared/world";
// The wish altar. Materials are the cost; the wish is the prompt. The DSL prompt encodes the
// rule that a wish with nothing to spend comes back cursed — we never fabricate an item here.

import { itemPrompt, parseItem } from "@dsl";
import type { Result } from "@shared/result";
import { fail, ok } from "@shared/result";
import type { Genesis, Inventory, ItemSpec } from "@shared/world";
import { generateProgram } from "./pipeline";
import { inventorySummary } from "./summaries";

export const ITEM_MAX_TOKENS = 800;
export const ITEM_TEMPERATURE = 1;

export interface GenerateItemInput {
  wish: string;
  materials: string[];
  genesis: Genesis | NarrativeContext;
  inventory: Inventory;
  floor: number;
}

export interface GeneratedItem {
  source: string;
  item: ItemSpec;
}

export async function generateItem(
  input: GenerateItemInput,
  onDelta?: (text: string) => void,
): Promise<Result<GeneratedItem>> {
  const system = itemPrompt({
    genesis: input.genesis,
    wish: input.wish,
    materials: input.materials,
    floor: input.floor,
    inventorySummary: inventorySummary(input.inventory),
  });

  const user = [
    `The player wishes: "${input.wish}"`,
    input.materials.length === 0
      ? "They offer no materials."
      : `They offer: ${input.materials.join(", ")}.`,
    "Write the Item program. Output the program only.",
  ].join("\n");

  const result = await generateProgram<ItemSpec>({
    system,
    user,
    purpose: "item",
    language: input.genesis.language,
    parse: parseItem,
    maxTokens: ITEM_MAX_TOKENS,
    temperature: ITEM_TEMPERATURE,
    onDelta,
  });
  if (!result.ok) return fail(result.error);
  return ok({ source: result.value.source, item: result.value.graph });
}
