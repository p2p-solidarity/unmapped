import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { publishCartridgeRevision } from "@main/cartridges/store";
import {
  createInstance,
  listInstances,
  listLegacyInstances,
  resolveInstance,
} from "@main/instances/store";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { v2CartridgeInput } from "../fixtures/v2";

let root = "";

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "aether-legacy-saves-"));
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

function unwrap<T>(result: { ok: true; value: T } | { ok: false; error: { code: string } }): T {
  if (!result.ok) throw new Error(`expected ok, got ${result.error.code}`);
  return result.value;
}

describe("saves from an older build", () => {
  it("lists them separately instead of failing the whole library", async () => {
    const cartridgesDir = join(root, "cartridges");
    const instancesDir = join(root, "instances");
    const manifest = unwrap(await publishCartridgeRevision(cartridgesDir, v2CartridgeInput()));
    const current = unwrap(await createInstance(instancesDir, manifest, "Current run"));
    const oldDir = join(instancesDir, "old-run-1");
    await mkdir(join(oldDir, "saves", "default"), { recursive: true });
    const { runtimePin: _pin, ...legacyMeta } = current.meta;
    await writeFile(
      join(oldDir, "instance.json"),
      JSON.stringify({ ...legacyMeta, formatVersion: 1, instanceId: "old-run-1" }),
    );

    const listed = unwrap(await listInstances(instancesDir));
    expect(listed.map((meta) => meta.instanceId)).toEqual([current.meta.instanceId]);
    expect(unwrap(await listLegacyInstances(instancesDir))).toEqual(["old-run-1"]);
    const opened = await resolveInstance(cartridgesDir, instancesDir, "old-run-1");
    expect(opened.ok ? "ok" : opened.error.code).toBe("instance-legacy-format");
  });
});
