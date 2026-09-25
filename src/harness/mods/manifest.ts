// `mod.yml` → a validated `ModManifest`, and a bundle whose every referenced file is present.
//
// A mod is data, never code (Rule 11): markdown sections, declarative tools over the GameEffect
// vocabulary, and skill files. Everything a mod can say is checked here, before anything of it
// reaches a live context — an unparseable manifest is a `Result` error the Mods panel shows, not
// a half-mounted mod.

import { GAME_EFFECT_KINDS } from "@shared/effects";
import type { ModBundle, ModManifest, ModParamSchema } from "@shared/mods";
import { err, ok, type Result } from "@shared/result";
import { load as parseYaml } from "js-yaml";
import { z } from "zod";
import { ORDER } from "../order";
import { parseSkillFile } from "../skills";
import type { SkillSummary } from "../types";

const MOD_NAME = /^[a-z0-9][a-z0-9-]{1,40}$/;
const TOOL_NAME = /^[a-z][a-z0-9_]{1,40}$/;
const SECTION_NAME = /^[a-z0-9][a-z0-9-]{0,60}$/;
const SEMVER = /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/;

/** A path inside the mod directory: relative, forward slashes, no escape hatches. */
const relativePath = z
  .string()
  .min(1)
  .refine((value) => !value.startsWith("/") && !/^[a-zA-Z]:/.test(value), "must be relative")
  .refine((value) => !value.split("/").includes(".."), "must not contain `..`")
  .refine((value) => !value.includes("\\"), "use forward slashes");

const paramSpecSchema: z.ZodType<ModParamSchema> = z.lazy(() =>
  z.discriminatedUnion("type", [
    z.object({
      type: z.literal("string"),
      description: z.string().optional(),
      enum: z.array(z.string().min(1)).min(1).optional(),
      required: z.literal(true).optional(),
    }),
    z.object({
      type: z.literal("number"),
      description: z.string().optional(),
      minimum: z.number().optional(),
      maximum: z.number().optional(),
      required: z.literal(true).optional(),
    }),
    z.object({
      type: z.literal("integer"),
      description: z.string().optional(),
      minimum: z.number().optional(),
      maximum: z.number().optional(),
      required: z.literal(true).optional(),
    }),
    z.object({
      type: z.literal("boolean"),
      description: z.string().optional(),
      required: z.literal(true).optional(),
    }),
    z.object({
      type: z.literal("array"),
      description: z.string().optional(),
      items: paramSpecSchema,
      required: z.literal(true).optional(),
    }),
  ]),
);

const promptSectionSchema = z.object({
  name: z.string().regex(SECTION_NAME, "section names are lowercase words joined by hyphens"),
  order: z
    .number()
    .int()
    .min(ORDER.MOD_MIN, `mod sections live in ${ORDER.MOD_MIN}..${ORDER.MOD_MAX}`)
    .max(ORDER.MOD_MAX, `mod sections live in ${ORDER.MOD_MIN}..${ORDER.MOD_MAX}`),
  file: relativePath,
});

const modToolSchema = z.object({
  name: z.string().regex(TOOL_NAME, "tool names are lowercase words joined by underscores"),
  description: z.string().min(1),
  parameters: z.record(z.string().regex(/^[a-z][a-z0-9_]*$/), paramSpecSchema).default({}),
  effect: z.object({ kind: z.enum(GAME_EFFECT_KINDS) }).catchall(z.unknown()),
});

const uniqueBy = <T>(values: T[], key: (value: T) => string): string | null => {
  const seen = new Set<string>();
  for (const value of values) {
    const name = key(value);
    if (seen.has(name)) return name;
    seen.add(name);
  }
  return null;
};

const manifestSchema = z
  .object({
    name: z.string().regex(MOD_NAME, "mod names are lowercase words joined by hyphens"),
    version: z.string().regex(SEMVER, "version must look like 1.2.3"),
    author: z.string().default(""),
    description: z.string().default(""),
    inject: z.array(z.string().regex(MOD_NAME)).default([]),
    prompt: z.array(promptSectionSchema).default([]),
    tools: z.array(modToolSchema).default([]),
    skills: z.array(relativePath).default([]),
  })
  .superRefine((manifest, ctx) => {
    const duplicateSection = uniqueBy(manifest.prompt, (section) => section.name);
    if (duplicateSection !== null) {
      ctx.addIssue({
        code: "custom",
        path: ["prompt"],
        message: `duplicate section name "${duplicateSection}"`,
      });
    }
    const duplicateTool = uniqueBy(manifest.tools, (tool) => tool.name);
    if (duplicateTool !== null) {
      ctx.addIssue({
        code: "custom",
        path: ["tools"],
        message: `duplicate tool name "${duplicateTool}"`,
      });
    }
  });

function describe(error: z.ZodError): string {
  return error.issues
    .map((issue) => `${issue.path.length > 0 ? issue.path.join(".") : "(root)"}: ${issue.message}`)
    .join("; ");
}

/** Parse and validate a `mod.yml`. */
export function parseModManifest(yaml: string): Result<ModManifest> {
  let document: unknown;
  try {
    document = parseYaml(yaml);
  } catch (thrown) {
    return err(
      "mod-manifest-yaml",
      `mod.yml is not valid YAML: ${thrown instanceof Error ? thrown.message : String(thrown)}`,
    );
  }
  const parsed = manifestSchema.safeParse(document);
  if (!parsed.success) {
    return err("mod-manifest-invalid", `mod.yml is invalid: ${describe(parsed.error)}`);
  }
  return ok(parsed.data);
}

/** One resolved skill file of a bundle. */
export interface BundledSkill {
  summary: SkillSummary;
  body: string;
}

/**
 * Resolve every `skills:` directory to its entries: `<dir>/<name>/SKILL.md` bundles and flat
 * `<dir>/<name>.md` files. A malformed skill file fails the whole bundle, so a typo surfaces at
 * install time instead of the first time the model asks for it.
 */
export function collectSkillFiles(bundle: ModBundle): Result<BundledSkill[]> {
  const skills: BundledSkill[] = [];
  const seen = new Set<string>();
  for (const dir of bundle.manifest.skills) {
    const prefix = `${dir.replace(/\/+$/, "")}/`;
    for (const [path, text] of Object.entries(bundle.files)) {
      if (!path.startsWith(prefix)) continue;
      const rest = path.slice(prefix.length);
      const isBundle = /^[^/]+\/SKILL\.md$/.test(rest);
      const isFlat = /^[^/]+\.md$/.test(rest);
      if (!isBundle && !isFlat) continue;
      const parsed = parseSkillFile(path, text);
      if (!parsed.ok) return parsed;
      if (seen.has(parsed.value.summary.name)) {
        return err(
          "mod-skill-duplicate",
          `mod "${bundle.manifest.name}" declares the skill "${parsed.value.summary.name}" twice`,
        );
      }
      seen.add(parsed.value.summary.name);
      skills.push({
        summary: { ...parsed.value.summary, source: bundle.manifest.name },
        body: parsed.value.body,
      });
    }
  }
  return ok(skills);
}

/** Check a bundle against its own manifest: every referenced file must be in `files`. */
export function validateModBundle(bundle: ModBundle): Result<ModBundle> {
  for (const section of bundle.manifest.prompt) {
    if (!Object.hasOwn(bundle.files, section.file)) {
      return err(
        "mod-file-missing",
        `mod "${bundle.manifest.name}" section "${section.name}" references ${section.file}, which is not in the bundle`,
        `bundled files: ${Object.keys(bundle.files).sort().join(", ") || "(none)"}`,
      );
    }
  }
  const skills = collectSkillFiles(bundle);
  if (!skills.ok) return skills;
  return ok(bundle);
}
