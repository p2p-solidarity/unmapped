import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseRules, parseScene, serializeRules, serializeScene } from "@dsl/index";
import { deriveRuntimePin, sha256 } from "@main/cartridges/integrity";
import { publishCartridgeRevision, readCartridgeRevision } from "@main/cartridges/store";
import { createInstance, resolveInstance } from "@main/instances/store";
import { previewModProposal } from "@main/mods/proposal";
import { BUILTIN_MODULES } from "@shared/capability-modules";
import type { CartridgeRevision } from "@shared/cartridge";
import type { SeedModProposal } from "@shared/mods";
import type { Result } from "@shared/result";
import { describe, expect, it } from "vitest";
import { v2CartridgeInput } from "../fixtures/v2";

function unwrap<T>(result: Result<T>): T {
  if (!result.ok) throw new Error(`${result.error.code}: ${result.error.message}`);
  return result.value;
}
function armedInput() {
  const input = v2CartridgeInput();
  if (input.manifest.formatVersion !== 2) throw new Error("v2 required");
  const module = BUILTIN_MODULES.find((item) => item.provides.includes("combat:shooter"));
  if (!module) throw new Error("shooter module required");
  input.manifest.definition.moduleLock.entries.push(structuredClone(module));
  for (const context of input.manifest.definition.capabilityProfile.contexts)
    context.profile.entries.push({ key: "combat", value: "shooter", moduleId: module.moduleId });
  for (const selected of input.manifest.definition.scenes) {
    const graph = unwrap(parseScene(input.scenes[selected.sceneId] ?? ""));
    selected.requiredModules.push(module.moduleId);
    if (!graph.contract) throw new Error("contract required");
    graph.contract.requiredModules = selected.requiredModules;
    input.scenes[selected.sceneId] = `${serializeScene(graph)}\n`;
    selected.sourceHash = sha256(input.scenes[selected.sceneId] ?? "");
  }
  const rules = unwrap(parseRules(input.rules));
  input.rules = serializeRules({
    ...rules,
    combat: { playerHp: 100, monsterHpBase: 30, monsterHpPerLevel: 10 },
  });
  expect(new Set(input.manifest.definition.moduleLock.entries.map((m) => m.moduleId)).size).toBe(
    input.manifest.definition.moduleLock.entries.length,
  );
  return input;
}
function proposal(base: CartridgeRevision): SeedModProposal {
  return {
    proposalId: "test-gun",
    base: {
      cartridgeId: base.manifest.cartridgeId,
      version: base.manifest.version,
      contentHash: base.manifest.contentHash,
    },
    authorPrompt: "Add my gun",
    generatedAt: "2026-09-26T01:00:00.000Z",
    operations: [
      {
        type: "add_weapon",
        weapon: {
          weaponId: "my_gun",
          name: "My gun",
          kind: "gun",
          damage: 30,
          range: 20,
          cooldownMs: 300,
          ammoType: null,
          magazine: 12,
          assetId: "builtin:tree",
        },
      },
    ],
  };
}
describe("typed mod publication", () => {
  it("previews then publishes a new hash while the old instance stays unchanged", async () => {
    const root = await mkdtemp(join(tmpdir(), "aether-mod-test-"));
    try {
      const cartridges = join(root, "cartridges");
      const instances = join(root, "instances");
      const manifest = unwrap(await publishCartridgeRevision(cartridges, armedInput()));
      const base = unwrap(
        await readCartridgeRevision(cartridges, manifest.cartridgeId, manifest.version),
      );
      const instance = unwrap(await createInstance(instances, manifest, "Original"));
      const preview = unwrap(previewModProposal(base, proposal(base)));
      expect(preview.compatibility.saveImpact).toBe("new_instance");
      expect(unwrap(parseRules(base.rules)).weapons).toHaveLength(0);
      const published = unwrap(await publishCartridgeRevision(cartridges, preview.revision));
      expect(published.contentHash).not.toBe(manifest.contentHash);
      expect(unwrap(deriveRuntimePin(published)).effectiveHash).not.toBe(
        unwrap(deriveRuntimePin(manifest)).effectiveHash,
      );
      const old = unwrap(await resolveInstance(cartridges, instances, instance.meta.instanceId));
      expect(old.instance).toEqual(instance);
      expect(old.cartridge).toEqual(base);
      const next = unwrap(
        await readCartridgeRevision(cartridges, published.cartridgeId, published.version),
      );
      expect(unwrap(parseRules(next.rules)).weapons[0]?.id).toBe("my_gun");
      const bad = proposal(base);
      bad.base.contentHash = `sha256:${"0".repeat(64)}`;
      expect(previewModProposal(base, bad).ok).toBe(false);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
  it("rebuilds every timing context and requires a new run", async () => {
    const root = await mkdtemp(join(tmpdir(), "aether-timing-test-"));
    try {
      const manifest = unwrap(await publishCartridgeRevision(root, armedInput()));
      const base = unwrap(
        await readCartridgeRevision(root, manifest.cartridgeId, manifest.version),
      );
      const input = proposal(base);
      input.operations = [
        {
          type: "change_timing",
          change: {
            from: "realtime",
            to: "revolver",
            resolution: "shared_team",
            turnDurationMs: null,
          },
        },
      ];
      const preview = unwrap(previewModProposal(base, input));
      const published = unwrap(await publishCartridgeRevision(root, preview.revision));
      expect(published.formatVersion).toBe(2);
      if (published.formatVersion !== 2) return;
      expect(
        published.definition.capabilityProfile.contexts.every((c) =>
          c.profile.entries.some((e) => e.key === "timing" && e.value === "revolver"),
        ),
      ).toBe(true);
      expect(preview.compatibility.saveImpact).toBe("new_instance");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
