// `modPlugin(bundle)` — a validated mod, mounted as a Cordis plugin.
//
// Everything it registers goes through a service (which registers through `ctx.effect`), so
// `fiber.dispose()` — or the disposer `apply` returns — removes the mod's sections, tools and
// skills completely, while a world stays open.

import type { Context } from "@deepseek-ai/cordis";
import type { ModBundle, ModManifest, ModTool } from "@shared/mods";
import { err, ok, type Result } from "@shared/result";
import { defineTool, toParamSpecMap } from "../defineTool";
import { type HarnessPlugin, unwind } from "../events";
import type { JsonValue, SkillSummary, ToolDefinition } from "../types";
import { jsonRecord, outcomeText, outcomeValue } from "../values";
import { collectSkillFiles } from "./manifest";
import { fillTemplate } from "./template";

/** Namespaced so two mods may both ship a section called "lore". */
function sectionName(manifest: ModManifest, name: string): string {
  return `${manifest.name}:${name}`;
}

/** A declarative tool: validate the arguments, fill the effect template, apply the effect. */
function modTool(ctx: Context, tool: ModTool): ToolDefinition {
  return defineTool({
    name: tool.name,
    description: tool.description,
    parameters: toParamSpecMap(tool.parameters),
    async execute(args): Promise<JsonValue> {
      const filled = fillTemplate(tool.effect, jsonRecord(args));
      // A throw here becomes an `isError` tool result naming the placeholder, which is exactly
      // what the model needs to correct its next call.
      if (!filled.ok) throw new Error(filled.error.message);
      return outcomeValue(await ctx.effects.apply(filled.value));
    },
    render: (_args, value) => outcomeText(value),
  });
}

export function modPlugin(bundle: ModBundle): HarnessPlugin {
  const { manifest } = bundle;
  return {
    name: `mod:${manifest.name}`,
    inject: ["systemPrompt", "tools", "skills", "effects"],
    apply(ctx: Context): () => void {
      const disposers: (() => void)[] = [];

      for (const section of manifest.prompt) {
        disposers.push(
          ctx.systemPrompt.section({
            name: sectionName(manifest, section.name),
            order: section.order,
            text: bundle.files[section.file] ?? "",
            // A mod ships arbitrary markdown; treating a stray `{{` in it as a variable
            // reference would break every assembly, so mod prose stays literal.
            interpolate: false,
          }),
        );
      }

      for (const tool of manifest.tools) disposers.push(ctx.tools.register(modTool(ctx, tool)));

      // `validateModBundle` is the gate for malformed skills; a bundle that skipped it simply
      // contributes no catalog rather than failing the mount.
      const skills = collectSkillFiles(bundle);
      if (skills.ok && skills.value.length > 0) {
        const summaries: SkillSummary[] = skills.value.map((skill) => skill.summary);
        const bodies = new Map(skills.value.map((skill) => [skill.summary.name, skill.body]));
        disposers.push(
          ctx.skills.provider({
            list: () => summaries,
            load: (name): Promise<Result<string>> => {
              const body = bodies.get(name);
              return Promise.resolve(
                body === undefined
                  ? err("skill-not-found", `mod "${manifest.name}" has no skill "${name}"`)
                  : ok(body),
              );
            },
          }),
        );
      }

      return unwind(disposers);
    },
  };
}
