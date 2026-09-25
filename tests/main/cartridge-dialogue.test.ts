// Baked NPC conversations are cartridge content: hashed with everything else, read back with the
// revision, carried by a .cartridge, and refused when they name someone the scene does not have.

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { packCartridge, unpackCartridge } from "@main/cartridges/pack";
import { publishCartridgeRevision, readCartridgeRevision } from "@main/cartridges/store";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { KEEPER_DIALOGUE, v2CartridgeInput, v2CartridgeWithVoices } from "../fixtures/v2";

function unwrap<T>(result: { ok: true; value: T } | { ok: false; error: { code: string } }): T {
  if (!result.ok) throw new Error(`expected ok, got ${result.error.code}`);
  return result.value;
}

let root = "";
let cartridgesDir = "";

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "aether-dialogue-"));
  cartridgesDir = join(root, "cartridges");
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("baked cartridge dialogue", () => {
  it("publishes, declares and reads back one conversation per NPC", async () => {
    const manifest = unwrap(await publishCartridgeRevision(cartridgesDir, v2CartridgeWithVoices()));
    expect(manifest.files.map((file) => file.path)).toContain("dialogue/opening/keeper.oui");

    const loaded = unwrap(await readCartridgeRevision(cartridgesDir, "v2-world", "2.0.0"));
    expect(loaded.dialogues["opening/keeper"]).toBe(KEEPER_DIALOGUE);
  });

  it("changes the cartridge identity, because the words are part of the content", async () => {
    const withVoices = unwrap(
      await publishCartridgeRevision(cartridgesDir, v2CartridgeWithVoices("2.0.0")),
    );
    const silent = v2CartridgeWithVoices("2.0.1");
    silent.dialogues = {};
    const without = unwrap(await publishCartridgeRevision(cartridgesDir, silent));
    expect(withVoices.contentHash).not.toBe(without.contentHash);
  });

  it("survives a .cartridge round trip", async () => {
    unwrap(await publishCartridgeRevision(cartridgesDir, v2CartridgeWithVoices()));
    const revision = unwrap(await readCartridgeRevision(cartridgesDir, "v2-world", "2.0.0"));
    const packed = unwrap(packCartridge(revision));
    const restored = unwrap(unpackCartridge(packed));
    expect(restored.dialogues).toEqual(revision.dialogues);
    expect(restored.manifest.contentHash).toBe(revision.manifest.contentHash);
  });

  it("refuses a conversation for an NPC the scene does not contain", async () => {
    const input = v2CartridgeWithVoices();
    input.dialogues = { "opening/ghost": KEEPER_DIALOGUE };
    const published = await publishCartridgeRevision(cartridgesDir, input);
    expect(published.ok).toBe(false);
    if (!published.ok) expect(published.error.code).toBe("cartridge-dialogue-invalid");
  });

  it("refuses a conversation filed under a different speaker", async () => {
    const input = v2CartridgeWithVoices();
    input.dialogues = {
      "opening/keeper": KEEPER_DIALOGUE.replace('Dialogue("keeper"', 'Dialogue("someone_else"'),
    };
    const published = await publishCartridgeRevision(cartridgesDir, input);
    expect(published.ok).toBe(false);
    if (!published.ok) expect(published.error.code).toBe("cartridge-dialogue-invalid");
  });

  it("leaves a cartridge with no baked voices with an empty map, not a missing one", async () => {
    unwrap(await publishCartridgeRevision(cartridgesDir, v2CartridgeInput()));
    const loaded = unwrap(await readCartridgeRevision(cartridgesDir, "v2-world", "2.0.0"));
    expect(loaded.dialogues).toEqual({});
  });
});
