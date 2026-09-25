// A .cartridge is how a world travels between machines, so its import must reproduce the exact
// revision that was exported. What could go wrong (silent data loss E2E would only see as a
// different hash, or as a world that quietly lost its bible):
//   1. Import republishes only manifest, rules, scenes and assets: the bible, the story and the baked
//      dialogues are dropped, so the imported revision is another world with the same name.
//   2. Importing the same pack twice is refused as a version conflict instead of being a no-op.
//   3. The world's look picture (`assets/look.png`, rev 6 D2) changes or disappears on the way:
//      the import has another hash, or `readLookPicture` hands later pictures no reference.

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { installCartridgePack } from "@main/cartridges/install";
import { readLookPicture } from "@main/cartridges/look";
import { packCartridge } from "@main/cartridges/pack";
import { publishCartridgeRevision, readCartridgeRevision } from "@main/cartridges/store";
import { LOOK_PICTURE_ASSET, type PublishCartridgeInput } from "@shared/cartridge";
import { episodePlaces, type StoryPlan } from "@shared/story";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { v2CartridgeWithVoices } from "../fixtures/v2";

function unwrap<T>(result: { ok: true; value: T } | { ok: false; error: { code: string } }): T {
  if (!result.ok) throw new Error(`expected ok, got ${result.error.code}`);
  return result.value;
}

let root = "";

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "aether-pack-roundtrip-"));
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

function fullWorld(): PublishCartridgeInput {
  const input = v2CartridgeWithVoices("3.1.0");
  const places = episodePlaces(3);
  const story: StoryPlan = {
    formatVersion: 1,
    logline: "A lamp keeper waits for the last ferry.",
    episodes: ["Lamp", "Ferry", "Shore"].map((title, at) => ({
      id: `e${at + 1}`,
      title,
      place: `${title} landing`,
      kind: "meet",
      brief: `Meet whoever keeps the ${title.toLowerCase()}.`,
      ...(places[at] ?? { cx: 1, cz: 0 }),
    })),
  };
  return {
    ...input,
    bible: {
      core: "Premise: A coast where the survey ships stopped coming.\nTone: Quiet.",
      style: "Naming: Two-word names.\nVoice: Short sentences.\nLook: Whitewashed stone houses.",
    },
    story,
  };
}

describe("a .cartridge export and import", () => {
  it("brings back the same revision, bible, story and dialogues included (1)", async () => {
    const source = join(root, "a");
    const target = join(root, "b");
    const published = unwrap(await publishCartridgeRevision(source, fullWorld()));
    const revision = unwrap(
      await readCartridgeRevision(source, published.cartridgeId, published.version),
    );
    expect(revision.bible).not.toBeNull();
    expect(revision.story).not.toBeNull();
    expect(Object.keys(revision.dialogues)).toEqual(["opening/keeper"]);

    const imported = unwrap(await installCartridgePack(target, unwrap(packCartridge(revision))));
    expect(imported.contentHash).toBe(published.contentHash);
    const again = unwrap(
      await readCartridgeRevision(target, imported.cartridgeId, imported.version),
    );
    expect(again.bible).toEqual(revision.bible);
    expect(again.story).toEqual(revision.story);
    expect(again.dialogues).toEqual(revision.dialogues);
  });

  it("treats a second import of the same pack as a no-op (2)", async () => {
    const source = join(root, "a");
    const target = join(root, "b");
    const published = unwrap(await publishCartridgeRevision(source, fullWorld()));
    const revision = unwrap(
      await readCartridgeRevision(source, published.cartridgeId, published.version),
    );
    const bytes = unwrap(packCartridge(revision));
    unwrap(await installCartridgePack(target, bytes));
    expect(unwrap(await installCartridgePack(target, bytes)).contentHash).toBe(
      published.contentHash,
    );
  });

  it("keeps the look picture byte for byte, and reads it back as the reference (3)", async () => {
    const source = join(root, "a");
    const target = join(root, "b");
    // A PNG signature and a few arbitrary bytes: the path is what is under test, not the image.
    const look = new Uint8Array([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 1, 2, 250, 255,
    ]);
    const withLook = fullWorld();
    const published = unwrap(
      await publishCartridgeRevision(source, {
        ...withLook,
        assets: { ...withLook.assets, [LOOK_PICTURE_ASSET]: look },
      }),
    );
    expect(published.files.some((file) => file.path === `assets/${LOOK_PICTURE_ASSET}`)).toBe(true);
    const revision = unwrap(
      await readCartridgeRevision(source, published.cartridgeId, published.version),
    );
    const imported = unwrap(await installCartridgePack(target, unwrap(packCartridge(revision))));
    expect(imported.contentHash).toBe(published.contentHash);
    const back = unwrap(await readLookPicture(imported.cartridgeId, imported.version, target));
    expect(back).toEqual(look);

    const without = unwrap(await publishCartridgeRevision(join(root, "c"), fullWorld()));
    expect(
      unwrap(await readLookPicture(without.cartridgeId, without.version, join(root, "c"))),
    ).toBeNull();
  });
});
