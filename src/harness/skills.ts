// `ctx.skills` — the on-demand catalog.
//
// A skill is a markdown file with YAML frontmatter. Only its one-line description is in the
// prompt; the body costs nothing until the model calls the `skill` tool. Providers come from
// mods (and from the renderer, for world-local skills); the first provider to claim a name wins.

import { type Context, Service } from "@deepseek-ai/cordis";
import { err, ok, type Result } from "@shared/result";
import { load as parseYaml } from "js-yaml";
import { z } from "zod";
import type { SkillProvider, SkillSummary } from "./types";

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/;

const frontmatterSchema = z.object({
  name: z
    .string()
    .min(1)
    .regex(/^[a-z0-9][a-z0-9-]{0,60}$/, "skill names are lowercase words joined by hyphens"),
  description: z.string().min(1),
});

/**
 * Parse one `SKILL.md`. Pure: the caller owns the filesystem, this owns the format.
 *
 * @param path - where the text came from; becomes the summary's `source`.
 */
export function parseSkillFile(
  path: string,
  text: string,
): Result<{ summary: SkillSummary; body: string }> {
  const match = FRONTMATTER.exec(text);
  if (match === null) {
    return err(
      "skill-frontmatter",
      `${path} has no YAML frontmatter`,
      "start the file with a --- fenced block declaring `name` and `description`",
    );
  }
  let document: unknown;
  try {
    document = parseYaml(match[1] ?? "");
  } catch (thrown) {
    return err(
      "skill-frontmatter",
      `${path} has invalid YAML frontmatter: ${thrown instanceof Error ? thrown.message : String(thrown)}`,
    );
  }
  const parsed = frontmatterSchema.safeParse(document);
  if (!parsed.success) {
    return err(
      "skill-frontmatter",
      `${path} frontmatter is invalid: ${parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ")}`,
      "`name` and `description` are both required",
    );
  }
  return ok({
    summary: { name: parsed.data.name, description: parsed.data.description, source: path },
    body: text.slice(match[0].length).trim(),
  });
}

export class SkillsService extends Service {
  /** Registration order matters: the first provider listing a name owns it. */
  private readonly providers: SkillProvider[] = [];

  constructor(ctx: Context) {
    super(ctx, "skills");
  }

  provider(provider: SkillProvider): () => void {
    return this.ctx.effect(() => {
      this.providers.push(provider);
      return () => {
        const at = this.providers.indexOf(provider);
        if (at >= 0) this.providers.splice(at, 1);
      };
    }, "skills.provider()");
  }

  /** Every skill, deduplicated by name (first provider wins), sorted for a stable prompt. */
  catalog(): SkillSummary[] {
    const byName = new Map<string, SkillSummary>();
    for (const provider of this.providers) {
      for (const summary of provider.list()) {
        if (!byName.has(summary.name)) byName.set(summary.name, summary);
      }
    }
    return [...byName.values()].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  }

  /** Load a skill body. The provider that owns the name in `catalog()` is the one asked. */
  async load(name: string): Promise<Result<string>> {
    for (const provider of this.providers) {
      if (!provider.list().some((summary) => summary.name === name)) continue;
      return provider.load(name);
    }
    const known = this.catalog().map((summary) => summary.name);
    return err(
      "skill-not-found",
      `no skill named "${name}"`,
      known.length > 0 ? `available skills: ${known.join(", ")}` : "no skills are loaded",
    );
  }

  /** The `<available_skills>` block for the system prompt; "" when nothing is loaded. */
  catalogText(): string {
    const skills = this.catalog();
    if (skills.length === 0) return "";
    const lines = skills.map((skill) => `- ${skill.name}: ${skill.description}`);
    return `<available_skills>\n${lines.join("\n")}\n</available_skills>`;
  }
}
