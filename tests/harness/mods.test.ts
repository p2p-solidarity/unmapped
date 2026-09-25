import {
  createHarness,
  type Harness,
  modPlugin,
  parseModManifest,
  validateModBundle,
} from "@harness";
import type { EffectOutcome, GameEffect } from "@shared/effects";
import type { ModBundle } from "@shared/mods";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { harnessFixture } from "../fixtures/harness/world";

const GOOD = harnessFixture("onsen-festival.yml");
const BROKEN = harnessFixture("broken.yml");

function bundle(overrides: Partial<ModBundle> = {}): ModBundle {
  const manifest = parseModManifest(GOOD);
  if (!manifest.ok) throw new Error(manifest.error.message);
  return {
    manifest: manifest.value,
    files: {
      "prompt/lore.md": harnessFixture("lore.md"),
      "skills/lantern-ritual/SKILL.md": harnessFixture("lantern-skill.md"),
    },
    dir: "/tmp/mods/onsen-festival",
    ...overrides,
  };
}

describe("parseModManifest", () => {
  it("reports every way the broken manifest is wrong", () => {
    const result = parseModManifest(BROKEN);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("mod-manifest-invalid");
    const message = result.error.message;
    expect(message).toContain("name:");
    expect(message).toContain("version:");
    // Section order is outside the 400..600 window reserved for mods.
    expect(message).toContain("prompt.0.order");
    expect(message).toContain("prompt.0.file");
    expect(message).toContain("tools.0.name");
    expect(message).toContain("tools.0.parameters.hue");
    expect(message).toContain("tools.0.effect.kind");
    expect(message).toContain("skills.0");
  });

  it("rejects duplicate section and tool names", () => {
    const result = parseModManifest(
      `name: dupes
version: 1.0.0
prompt:
  - { name: lore, order: 410, file: a.md }
  - { name: lore, order: 420, file: b.md }
tools:
  - { name: ring, description: d, effect: { kind: narrate } }
  - { name: ring, description: d, effect: { kind: narrate } }
`,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message).toContain('duplicate section name "lore"');
    expect(result.error.message).toContain('duplicate tool name "ring"');
  });

  it("rejects YAML that is not a mapping", () => {
    expect(parseModManifest("- a\n- b\n")).toMatchObject({ ok: false });
    expect(parseModManifest("name: [\n")).toMatchObject({
      ok: false,
      error: { code: "mod-manifest-yaml" },
    });
  });
});

describe("validateModBundle", () => {
  it("rejects a manifest that points at a file the bundle does not carry", () => {
    const result = validateModBundle(bundle({ files: {} }));
    expect(result).toMatchObject({ ok: false, error: { code: "mod-file-missing" } });
  });

  it("rejects a skill file with no frontmatter", () => {
    const result = validateModBundle(
      bundle({
        files: {
          "prompt/lore.md": "lore",
          "skills/broken/SKILL.md": "no frontmatter here",
        },
      }),
    );
    expect(result).toMatchObject({ ok: false, error: { code: "skill-frontmatter" } });
  });
});

describe("modPlugin", () => {
  let harness: Harness;
  let applied: GameEffect[];

  beforeEach(() => {
    harness = createHarness();
    applied = [];
    harness.ctx.effects.provider((effect) => {
      applied.push(effect);
      return Promise.resolve<EffectOutcome>({ ok: true, message: "the lanterns catch" });
    });
  });

  afterEach(async () => {
    await harness.dispose();
  });

  it("contributes a section, its tools and its skills, then takes them all back", async () => {
    const assemble = { purpose: "free", language: "ja-JP" } as const;
    const fiber = harness.ctx.plugin(modPlugin(bundle()));
    await fiber;

    expect(harness.ctx.systemPrompt.assemble(assemble).sections).toEqual([
      "onsen-festival:onsen-lore",
    ]);
    expect(harness.ctx.systemPrompt.assemble(assemble).text).toContain("Onsen Undercurrent");
    expect(harness.ctx.tools.schemas().map((schema) => schema.name)).toEqual([
      "light_lanterns",
      "offer_towel",
    ]);
    expect(harness.ctx.skills.catalog()).toEqual([
      {
        name: "lantern-ritual",
        description: "How the seven lanterns are lit, in order, and what each one answers for.",
        source: "onsen-festival",
      },
    ]);
    expect(harness.ctx.skills.catalogText()).toContain("- lantern-ritual:");
    await expect(harness.ctx.skills.load("lantern-ritual")).resolves.toMatchObject({
      ok: true,
      value: expect.stringContaining("Light them from the east."),
    });

    await fiber.dispose();

    expect(harness.ctx.systemPrompt.assemble(assemble)).toEqual({ text: "", sections: [] });
    expect(harness.ctx.tools.schemas()).toEqual([]);
    expect(harness.ctx.skills.catalog()).toEqual([]);
    expect(harness.ctx.skills.catalogText()).toBe("");
  });

  it("fills the effect template from the model's arguments", async () => {
    await harness.ctx.plugin(modPlugin(bundle()));
    const result = await harness.ctx.tools.execute(
      { id: "c1", name: "light_lanterns", arguments: '{"hue":"#f2b06a","density":0.01}' },
      { purpose: "resolve" },
    );

    expect(result).toMatchObject({ isError: false, content: "the lanterns catch" });
    expect(applied).toEqual([
      { kind: "mutate_world", skyColor: "#f2b06a", fogDensity: 0.01, biome: "onsen_town" },
    ]);
  });

  it("refuses an argument the manifest did not declare", async () => {
    await harness.ctx.plugin(modPlugin(bundle()));
    const result = await harness.ctx.tools.execute(
      { id: "c1", name: "light_lanterns", arguments: '{"hue":"purple"}' },
      { purpose: "resolve" },
    );
    expect(result.isError).toBe(true);
    expect(result.content).toContain("invalid arguments");
    expect(applied).toEqual([]);
  });

  it("turns an unfilled placeholder into an error result naming it", async () => {
    // `density` is optional, so a call that omits it leaves `{{density}}` unresolved.
    await harness.ctx.plugin(modPlugin(bundle()));
    const result = await harness.ctx.tools.execute(
      { id: "c1", name: "light_lanterns", arguments: '{"hue":"#f2b06a"}' },
      { purpose: "resolve" },
    );
    expect(result.isError).toBe(true);
    expect(result.content).toContain('unknown placeholder "{{density}}"');
    expect(applied).toEqual([]);
  });
});
