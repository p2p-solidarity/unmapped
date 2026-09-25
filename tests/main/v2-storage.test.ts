import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseRules, serializeRules } from "@dsl/index";
import { canonicalJson, sha256 } from "@main/cartridges/integrity";
import { packCartridge, unpackCartridge } from "@main/cartridges/pack";
import { publishCartridgeRevision, readCartridgeRevision } from "@main/cartridges/store";
import { createInstance, resolveInstance } from "@main/instances/store";
import { upgradeInstance } from "@main/instances/upgrade";
import { createWorkspaceFromRevision, publishWorkspace } from "@main/workspaces/store";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { v2CartridgeInput } from "../fixtures/v2";

function unwrap<T>(result: { ok: true; value: T } | { ok: false; error: { code: string } }): T {
  if (!result.ok) throw new Error(`expected ok, got ${result.error.code}`);
  return result.value;
}

let root = "";
let cartridgesDir = "";
let instancesDir = "";
let workspacesDir = "";

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "aether-v2-storage-"));
  cartridgesDir = join(root, "cartridges");
  instancesDir = join(root, "instances");
  workspacesDir = join(root, "workspaces");
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("v2 storage", () => {
  it("normalizes source line endings before hashing immutable content", async () => {
    const crlf = v2CartridgeInput();
    crlf.rules = crlf.rules.replace(/\n/g, "\r\n");
    crlf.scenes = Object.fromEntries(
      Object.entries(crlf.scenes).map(([id, source]) => [id, source.replace(/\n/g, "\r\n")]),
    );

    const first = unwrap(await publishCartridgeRevision(cartridgesDir, crlf));
    const second = unwrap(await publishCartridgeRevision(cartridgesDir, v2CartridgeInput()));
    const loaded = unwrap(await readCartridgeRevision(cartridgesDir, "v2-world", "2.0.0"));

    expect(second.contentHash).toBe(first.contentHash);
    expect(loaded.rules).not.toContain("\r");
    expect(Object.values(loaded.scenes).every((source) => !source.includes("\r"))).toBe(true);
  });

  it("rejects a tampered runtime pin when resolving", async () => {
    const manifest = unwrap(await publishCartridgeRevision(cartridgesDir, v2CartridgeInput()));
    const instance = unwrap(await createInstance(instancesDir, manifest, "Tampered run"));
    const path = join(instancesDir, instance.meta.instanceId, "instance.json");
    const raw = JSON.parse(await readFile(path, "utf8"));
    raw.runtimePin.profileHash = `sha256:${"0".repeat(64)}`;
    await writeFile(path, `${JSON.stringify(raw, null, 2)}\n`, "utf8");

    const resolved = await resolveInstance(cartridgesDir, instancesDir, instance.meta.instanceId);
    expect(resolved.ok).toBe(false);
    if (!resolved.ok) expect(resolved.error.code).toBe("save-identity-mismatch");
  });

  it("rejects untrusted module bytes and malformed ordered locks", async () => {
    const untrusted = v2CartridgeInput();
    if (untrusted.manifest.formatVersion !== 2) throw new Error("expected v2 manifest");
    const firstModule = untrusted.manifest.definition.moduleLock.entries[0];
    if (firstModule === undefined) throw new Error("expected a locked module");
    untrusted.manifest.definition.moduleLock.entries[0] = {
      ...firstModule,
      implementedBy: "a caller-provided implementation claim",
    };
    const moduleResult = await publishCartridgeRevision(cartridgesDir, untrusted);
    expect(moduleResult.ok).toBe(false);
    if (!moduleResult.ok) expect(moduleResult.error.code).toBe("cartridge-module-lock-untrusted");

    const duplicatePack = v2CartridgeInput();
    if (duplicatePack.manifest.formatVersion !== 2) throw new Error("expected v2 manifest");
    const firstPack = duplicatePack.manifest.definition.assetPacks[0];
    if (firstPack === undefined) throw new Error("expected a locked asset pack");
    duplicatePack.manifest.definition.assetPacks.push(structuredClone(firstPack));
    const assetResult = await publishCartridgeRevision(cartridgesDir, duplicatePack);
    expect(assetResult.ok).toBe(false);
    if (!assetResult.ok) expect(assetResult.error.code).toBe("cartridge-assets-invalid");

    const unknownWeaponAsset = v2CartridgeInput();
    const rules = unwrap(parseRules(unknownWeaponAsset.rules));
    unknownWeaponAsset.rules = serializeRules({
      ...rules,
      combat: { playerHp: 100, monsterHpBase: 30, monsterHpPerLevel: 10 },
      weapons: [
        {
          id: "bad",
          name: "Bad",
          kind: "gun",
          damage: 1,
          range: 1,
          cooldownMs: 1,
          magazine: 1,
          assetId: "unknown:gun",
        },
      ],
    });
    const weaponResult = await publishCartridgeRevision(cartridgesDir, unknownWeaponAsset);
    expect(weaponResult.ok).toBe(false);
    if (!weaponResult.ok) expect(weaponResult.error.code).toBe("cartridge-assets-mismatch");

    const incompleteContextLock = v2CartridgeInput();
    if (incompleteContextLock.manifest.formatVersion !== 2) throw new Error("expected v2 manifest");
    const opening = incompleteContextLock.manifest.definition.scenes[0];
    if (opening === undefined) throw new Error("expected an opening scene");
    opening.requiredModules = opening.requiredModules.filter(
      (moduleId) => moduleId !== "offline_session",
    );
    const contextResult = await publishCartridgeRevision(cartridgesDir, incompleteContextLock);
    expect(contextResult.ok).toBe(false);
    if (!contextResult.ok) expect(contextResult.error.code).toBe("cartridge-module-missing");

    const duplicateMod = v2CartridgeInput();
    if (duplicateMod.manifest.formatVersion !== 2) throw new Error("expected v2 manifest");
    const entry = {
      name: "rules-plus",
      version: "1.0.0",
      contentHash: sha256("rules-plus"),
      affectsRuntime: false,
      provides: ["rules"],
    };
    duplicateMod.manifest.definition.modLock.entries = [entry, structuredClone(entry)];
    duplicateMod.manifest.definition.modLock.lockHash = sha256(
      canonicalJson(duplicateMod.manifest.definition.modLock.entries),
    );
    const modResult = await publishCartridgeRevision(cartridgesDir, duplicateMod);
    expect(modResult.ok).toBe(false);
    if (!modResult.ok) expect(modResult.error.code).toBe("cartridge-mod-lock-invalid");
  });

  it("requires a fresh instance when an explicit upgrade changes the runtime lock", async () => {
    const first = unwrap(await publishCartridgeRevision(cartridgesDir, v2CartridgeInput()));
    const instance = unwrap(await createInstance(instancesDir, first, "Pinned runtime"));
    const next = v2CartridgeInput("2.1.0");
    if (next.manifest.formatVersion !== 2) throw new Error("expected v2 manifest");
    next.manifest.definition.moduleLock.entries.reverse();
    unwrap(await publishCartridgeRevision(cartridgesDir, next));

    const upgraded = await upgradeInstance(
      cartridgesDir,
      instancesDir,
      instance.meta.instanceId,
      "2.1.0",
    );
    expect(upgraded.ok).toBe(false);
    if (!upgraded.ok) expect(upgraded.error.code).toBe("upgrade-runtime-migration-required");

    const reloaded = unwrap(
      await resolveInstance(cartridgesDir, instancesDir, instance.meta.instanceId),
    );
    expect(reloaded.instance.meta.cartridge).toEqual(instance.meta.cartridge);
  });

  it("round-trips v2 packages and remixes without dropping the definition", async () => {
    const manifest = unwrap(await publishCartridgeRevision(cartridgesDir, v2CartridgeInput()));
    const revision = unwrap(await readCartridgeRevision(cartridgesDir, "v2-world", "2.0.0"));
    const unpacked = unwrap(unpackCartridge(unwrap(packCartridge(revision))));
    expect(unpacked.manifest).toEqual(manifest);

    const workspace = unwrap(
      await createWorkspaceFromRevision(workspacesDir, revision, {
        mode: "remix",
        targetCartridgeId: "v2-remix",
        name: "V2 Remix",
        author: "remixer",
        now: new Date("2026-09-26T01:00:00Z"),
      }),
    );
    const remixed = unwrap(
      await publishWorkspace(workspacesDir, cartridgesDir, workspace.meta.workspaceId, "1.0.0"),
    );
    expect(remixed.formatVersion).toBe(2);
    if (remixed.formatVersion !== 2) throw new Error("expected v2 remix");
    expect(remixed.definition.capabilityProfile.contexts).toEqual(
      manifest.formatVersion === 2 ? manifest.definition.capabilityProfile.contexts : [],
    );
    expect(remixed.definition.gameId).toBe("v2-remix");
    expect(remixed.lineage.parent?.contentHash).toBe(manifest.contentHash);
  });
});
