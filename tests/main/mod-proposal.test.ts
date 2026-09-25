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
function lockedModules(manifest: object): string[] {
  const definition = (
    manifest as { definition?: { moduleLock: { entries: { moduleId: string }[] } } }
  ).definition;
  return definition?.moduleLock.entries.map((m) => m.moduleId) ?? [];
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
  it("adds what an unarmed cartridge lacks instead of refusing, and still publishes", async () => {
    const root = await mkdtemp(join(tmpdir(), "aether-unarmed-test-"));
    try {
      const bible = { core: "A quiet lighthouse island.", style: "Language: zh-TW\nShort lines." };
      const manifest = unwrap(
        await publishCartridgeRevision(root, { ...v2CartridgeInput(), bible }),
      );
      const base = unwrap(
        await readCartridgeRevision(root, manifest.cartridgeId, manifest.version),
      );
      expect(unwrap(parseRules(base.rules)).combat).toBeNull();
      const input = proposal(base);
      const sceneId = Object.keys(base.scenes)[0] ?? "";
      input.operations.push({
        type: "scene_patch",
        sceneId,
        patch: {
          operations: [
            { type: "add_monster", kind: "slime", x: 3, z: 4, level: 2, weakness: "salt" },
          ],
        },
      });
      const gun = input.operations[0];
      if (gun?.type !== "add_weapon") throw new Error("weapon operation expected");
      input.operations[0] = { ...gun, weapon: { ...gun.weapon, assetId: "none" } };
      const preview = unwrap(previewModProposal(base, input));
      const rules = unwrap(parseRules(preview.revision.rules));
      expect(rules.combat).not.toBeNull();
      expect(rules.weapons[0]?.assetId).toBeUndefined();
      const lock = lockedModules(preview.revision.manifest);
      expect(lock).toContain("shooter_combat");
      expect(preview.compatibility.reasons.join(" ")).toContain("Turns combat on");
      const scene = unwrap(parseScene(preview.revision.scenes[sceneId] ?? ""));
      expect(scene.monsters.map((m) => m.kind)).toEqual(["slime"]);
      const published = unwrap(await publishCartridgeRevision(root, preview.revision));
      // A mod never costs the world its bible: the new version can still be witnessed.
      const next = unwrap(
        await readCartridgeRevision(root, published.cartridgeId, published.version),
      );
      expect(next.bible).toEqual(base.bible);
      expect(next.bible?.core).toContain("lighthouse");

      const squad = proposal(base);
      squad.operations = [{ type: "add_capability_module", moduleId: "team_party", version: "9" }];
      squad.targetVersion = "9.0.0";
      const withSquad = unwrap(previewModProposal(base, squad));
      const squadLock = lockedModules(withSquad.revision.manifest);
      expect(squadLock.indexOf("shooter_combat")).toBeLessThan(squadLock.indexOf("team_party"));
      expect(unwrap(parseRules(withSquad.revision.rules)).party).not.toBeNull();
      unwrap(await publishCartridgeRevision(root, withSquad.revision));

      const unknown = proposal(base);
      unknown.operations = [{ type: "add_capability_module", moduleId: "jetpack", version: "1" }];
      const refused = previewModProposal(base, unknown);
      expect(refused.ok ? "ok" : refused.error.code).toBe("mod-module-missing");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
