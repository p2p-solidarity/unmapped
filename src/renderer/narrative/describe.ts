// Free text → modes. "I want 2D Mario with a gun" is a better way to start than reading 75 chips,
// so the player types it and the model picks from the catalogue.
//
// It picks; it never invents. The model is given only the modes this engine can actually build,
// and the schema validates every id against that same list — so a description of a game we cannot
// make comes back as the closest thing we can, plus a note saying what was dropped, rather than a
// selection that dead-ends later (Rule 2).

import { chat } from "@renderer/llm";
import { type GameModeId, MAX_SELECTED_MODES, MODE_CATALOG } from "@shared/mode-catalog";
import { err, ok, type Result } from "@shared/result";
import { z } from "zod";

export interface DescribedGame {
  modes: GameModeId[];
  /** One line saying what was understood, and anything that could not be honoured. */
  note: string;
}

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

function catalogue(): string {
  return MODE_CATALOG.map((mode) => {
    const aliases = mode.aliases.length > 0 ? ` (${mode.aliases.join(", ")})` : "";
    return `${mode.id} [${mode.axis}] ${mode.label}${aliases}`;
  }).join("\n");
}

export async function modesFromDescription(input: {
  text: string;
  language: string;
}): Promise<Result<DescribedGame>> {
  const selectable = new Set(MODE_CATALOG.map((mode) => mode.id));

  const schema: z.ZodType<DescribedGame> = z
    .object({
      modes: z
        .array(z.string())
        .min(1)
        .max(MAX_SELECTED_MODES)
        .transform((ids) => ids.filter((id): id is GameModeId => selectable.has(id as GameModeId)))
        .refine((ids) => ids.length > 0, "none of those modes exist"),
      note: z.string().trim().min(1).max(200),
    })
    .strict();

  const result = await chat({
    messages: [
      {
        role: "system",
        content: [
          "You turn a description of a game into a selection of modes. Return JSON only.",
          'Shape: {"modes":[id,...],"note":string}.',
          "Pick only ids from the list below — never invent one.",
          "Prefer one genre, one pacing, one player structure and one setting where they apply.",
          `Write the note in ${input.language}: say what you understood, and name anything the`,
          "engine cannot do yet; keep those requested modes in the selection so the UI can explain them.",
          "",
          "Available modes:",
          catalogue(),
        ].join("\n"),
      },
      { role: "user", content: input.text },
    ],
    maxTokens: 400,
    temperature: 0.2,
    grammar: null,
    stop: [],
    tools: [],
  });
  if (!result.ok) return result;

  const parsed = schema.safeParse(jsonObject(result.value.text));
  if (!parsed.success) {
    return err(
      "describe-invalid",
      parsed.error.issues[0]?.message ?? "模型沒有挑出可用的模式。",
      "換個說法，或直接從下面的卡片自己挑。",
    );
  }
  return ok(parsed.data);
}
