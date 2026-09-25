import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ensureBaseGame } from "@main/game/base";
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
