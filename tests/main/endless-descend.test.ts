import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { publishCartridgeRevision } from "@main/cartridges/store";
import {
  completeInstance,
  createInstance,
  descendInstance,
  resolveInstance,
  transitionInstance,
} from "@main/instances/store";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { v2CartridgeInput } from "../fixtures/v2";

function unwrap<T>(result: { ok: true; value: T } | { ok: false; error: { code: string } }): T {
  if (!result.ok) throw new Error(`expected ok, got ${result.error.code}`);
  return result.value;
}

let root = "";
let cartridgesDir = "";
let instancesDir = "";

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "aether-endless-"));
  cartridgesDir = join(root, "cartridges");
  instancesDir = join(root, "instances");
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("descending below the ending", () => {
  it("stays locked until the ending, then saves one more depth per descent on the same seed", async () => {
    const manifest = unwrap(await publishCartridgeRevision(cartridgesDir, v2CartridgeInput()));
    const id = unwrap(await createInstance(instancesDir, manifest, "Depths run")).meta.instanceId;

    const early = await descendInstance(cartridgesDir, instancesDir, id);
    expect(early.ok ? null : early.error.code).toBe("endless-locked");

    unwrap(await transitionInstance(cartridgesDir, instancesDir, id, "ending"));
    unwrap(await completeInstance(cartridgesDir, instancesDir, id));
    const first = unwrap(await descendInstance(cartridgesDir, instancesDir, id));
    const second = unwrap(await descendInstance(cartridgesDir, instancesDir, id));

    expect(first.instance.save.endless?.depth).toBe(1);
    expect(second.instance.save.endless?.depth).toBe(2);
    expect(second.instance.save.endless?.seed).toBe(first.instance.save.endless?.seed);
    // The authored checkpoint and the immutable cartridge are untouched; only the depth moved.
    expect(second.instance.save.currentSceneId).toBe("ending");
    const reloaded = unwrap(await resolveInstance(cartridgesDir, instancesDir, id));
    expect(reloaded.instance.save.endless).toEqual(second.instance.save.endless);
  });
});
