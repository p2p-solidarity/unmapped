import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readCartridgeRevision } from "@main/cartridges/store";
import { ensureBaseGame } from "@main/game/base";
import { createInstance, resolveInstance } from "@main/instances/store";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

let root = "";

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "aether-base-game-"));
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

function unwrap<T>(result: { ok: true; value: T } | { ok: false; error: { code: string } }): T {
  if (!result.ok) throw new Error(`expected ok, got ${result.error.code}`);
  return result.value;
}

describe("the one game", () => {
  it("installs once, with its bible, and holds a land per seed", async () => {
    const cartridgesDir = join(root, "cartridges");
    const instancesDir = join(root, "instances");
    const first = unwrap(await ensureBaseGame(cartridgesDir));
    const again = unwrap(await ensureBaseGame(cartridgesDir));
    expect(again.contentHash).toBe(first.contentHash);

    const revision = unwrap(
      await readCartridgeRevision(cartridgesDir, first.cartridgeId, first.version),
    );
    expect(revision.bible?.core).toContain("Premise:");
    // No resident, prop or line is shipped: people arrive by witnessing.
    expect(revision.scenes.origin).not.toMatch(/NPC\(|Prop\(|Treasure\(/);

    const run = unwrap(await createInstance(instancesDir, first, "Seeded", new Date(), "ABCD2345"));
    const resolved = unwrap(
      await resolveInstance(cartridgesDir, instancesDir, run.meta.instanceId),
    );
    expect(resolved.instance.save.seed).toBe("ABCD2345");
  });
});

describe("installing the one game twice at once", () => {
  it("answers both requests with the same revision", async () => {
    const cartridgesDir = join(root, "cartridges");
    const [a, b] = await Promise.all([
      ensureBaseGame(cartridgesDir),
      ensureBaseGame(cartridgesDir),
    ]);
    expect(unwrap(a).contentHash).toBe(unwrap(b).contentHash);
  });
});
