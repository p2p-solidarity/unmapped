// Skills: a catalog in the prompt, a body on demand.
//
// Listing every skill body would cost the whole context window of a 4B local model, so the
// prompt carries one line per skill and the model pays for a body only when it asks for one.

import type { Context } from "@deepseek-ai/cordis";
import { defineTool } from "../defineTool";
import { type HarnessPlugin, unwind } from "../events";
import { ORDER } from "../order";
import type { JsonValue } from "../types";

/** After the world context (it describes what the model may *fetch*, not what is true now). */
const CATALOG_ORDER = ORDER.CONTEXT + 50;

export const skillTool: HarnessPlugin = {
  name: "builtin:skill-tool",
  inject: ["systemPrompt", "skills", "tools"],
  apply(ctx: Context): () => void {
    return unwind([
      ctx.systemPrompt.section({
        name: "skills:catalog",
        order: CATALOG_ORDER,
        text: () => {
          const catalog = ctx.skills.catalogText();
          return catalog.length === 0
            ? ""
            : `${catalog}\n\nCall \`skill\` with one of these names when the situation is exactly what it describes.`;
        },
        // Skill descriptions come from mod files: data, not a template.
        interpolate: false,
      }),
      ctx.tools.register(
        defineTool({
          name: "skill",
          description:
            "Load the full text of one skill from <available_skills>. Use it when the situation matches a skill's description and you need its rules before you answer.",
          parameters: {
            name: {
              type: "string",
              required: true,
              description: "A name from <available_skills>.",
            },
          },
          async execute(args): Promise<JsonValue> {
            const loaded = await ctx.skills.load(args.name);
            if (!loaded.ok) {
              throw new Error(
                loaded.error.hint === undefined
                  ? loaded.error.message
                  : `${loaded.error.message} (${loaded.error.hint})`,
              );
            }
            return loaded.value;
          },
          render: (_args, value) => (typeof value === "string" ? value : JSON.stringify(value)),
        }),
      ),
    ]);
  },
};
