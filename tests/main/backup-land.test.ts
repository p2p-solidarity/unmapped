// `.spire-backup` with the witnessed land (untrusted input + silent data loss + legacy saves).
//
// Ways this can fail:
// 1. Export drops chunks (scene, dialogue, errands), lore.jsonl or notes.jsonl, so a restored save
//    has a blank land and no notes — silently, because the rest of the save restores fine.
// 2. An old backup (instance.json + save.json + karma.jsonl only) no longer imports.
// 3. An entry escapes the save on restore: `..`, an absolute or drive path, a backslash path.
// 4. An entry of an unexpected shape is accepted: a stray file in a chunk, a nested dialogue
//    folder, or a chunk name that aliases another (`03_-2` for `3_-2`, `-0` for `0`).
// 5. Land content the live writers would refuse is restored: a scene or dialogue that does not
//    parse, a resident without words or words for nobody, lore linking to nothing, lore on a chunk
//    the backup does not have, a chunk without scene.oui.
// 6. Notes the live writer would refuse are restored: a repeated id, or an answer to a note that is
//    not written before it — the notes panel would then show a reply to nothing.
// 7. A small archive inflates into something huge (declared sizes are trusted), or holds more
//    entries than any real save, and exhausts memory before any check runs.
// 8. A backup exported by an older build (instance/save format 1) fails with "expected 2" instead
//    of being upgraded against its exact cartridge revision.
// 9. A format 1 backup whose exact revision is not installed is re-pinned to something else.
// 10. Export hands out a backup import will refuse — one file over its own limit while the whole
//     archive is under the total — so the player keeps a backup that can never be restored.

import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  CHUNK_EXAMPLE,
  parseChunk,
  serializeDialogue,
  serializeErrands,
  serializeScene,
} from "@dsl/index";
import { publishCartridgeRevision } from "@main/cartridges/store";
import {
  packInstanceBackup,
  restoreInstanceBackup,
  unpackInstanceBackup,
} from "@main/instances/backup";
import { appendNote, readLand, witnessChunk } from "@main/instances/land";
import { createInstance, readInstance } from "@main/instances/store";
import type { WitnessChunkInput } from "@shared/land";
import { strToU8, unzipSync, zipSync } from "fflate";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { V1_INSTANCE_ID, v1CartridgeInput, v1InstanceFiles } from "../fixtures/v1";
import { v2CartridgeInput } from "../fixtures/v2";

let root = "";
let cartridgesDir = "";
let instancesDir = "";

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "aether-backup-land-"));
  cartridgesDir = join(root, "cartridges");
  instancesDir = join(root, "instances");
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

function unwrap<T>(result: { ok: true; value: T } | { ok: false; error: { code: string } }): T {
  if (!result.ok) throw new Error(`expected ok, got ${result.error.code}`);
  return result.value;
}

const codeOf = (result: { ok: boolean; error?: { code: string } }): string =>
  result.ok ? "ok" : (result.error?.code ?? "?");

function chunkInput(instanceId: string): WitnessChunkInput {
  const draft = parseChunk(CHUNK_EXAMPLE, {
    coord: { cx: 3, cz: -2 },
    biome: "countryside",
    ground: "grass",
    hole: null,
    lore: [],
    language: "en",
  });
  if (!draft.ok) throw new Error(draft.error.message);
  return {
    instanceId,
    cx: 3,
    cz: -2,
    scene: serializeScene(draft.value.scene),
    dialogues: Object.fromEntries(
      draft.value.dialogues.map((d) => [d.npcId, serializeDialogue(d)]),
    ),
    errands: serializeErrands({ errands: draft.value.errands, keepsakes: draft.value.keepsakes }),
    lore: draft.value.lore,
  };
}

const first = {
  id: "note-0001-aaaa",
  author: "Rin",
  at: "2026-09-26T08:00:00.000Z",
  coord: { cx: 3, cz: -2, x: 4, z: 9 },
  anchors: [],
  text: "The bus never stops here.",
  contests: null,
};
const answer = {
  ...first,
  id: "note-0002-bbbb",
  author: "Tomo",
  text: "It stopped for me.",
  contests: first.id,
};

/** An instance with one witnessed chunk (lore, dialogues, errands) and two notes. */
async function walkedSave(): Promise<string> {
  const manifest = unwrap(await publishCartridgeRevision(cartridgesDir, v2CartridgeInput()));
  const id = unwrap(await createInstance(instancesDir, manifest, "Walker")).meta.instanceId;
  unwrap(await witnessChunk(instancesDir, chunkInput(id)));
  unwrap(await appendNote(instancesDir, { instanceId: id, note: first }));
  unwrap(await appendNote(instancesDir, { instanceId: id, note: answer }));
  return id;
}

/** The packed files of a walked save, as a mutable map to tamper with. */
async function packedFiles(id: string): Promise<Record<string, Uint8Array>> {
  return unzipSync(unwrap(await packInstanceBackup(instancesDir, id, cartridgesDir)));
}

const CHUNK = "saves/default/chunks/3_-2";

describe("a backup keeps the witnessed land", () => {
  it("restores chunks, lore and notes exactly, on another machine (1)", async () => {
    const id = await walkedSave();
    const packed = unwrap(await packInstanceBackup(instancesDir, id, cartridgesDir));
    expect(Object.keys(unzipSync(packed)).sort()).toEqual([
      "instance.json",
      `${CHUNK}/dialogue/rin.oui`,
      `${CHUNK}/dialogue/tomo.oui`,
      `${CHUNK}/errands.oui`,
      `${CHUNK}/scene.oui`,
      "saves/default/karma.jsonl",
      "saves/default/lore.jsonl",
      "saves/default/notes.jsonl",
      "saves/default/save.json",
    ]);
    const elsewhere = join(root, "elsewhere");
    const backup = unwrap(await unpackInstanceBackup(packed, cartridgesDir));
    const restored = unwrap(await restoreInstanceBackup(cartridgesDir, elsewhere, backup));
    expect(restored.instance.meta.instanceId).toBe(id);
    expect(unwrap(await readLand(elsewhere, id))).toEqual(unwrap(await readLand(instancesDir, id)));
    const before = unwrap(await readInstance(instancesDir, id));
    const after = unwrap(await readInstance(elsewhere, id));
    expect({ ...after.save, updatedAt: "" }).toEqual({ ...before.save, updatedAt: "" });
    expect(after.karma).toEqual(before.karma);
  });

  it("still imports a backup of only instance.json, save.json and karma.jsonl (2)", async () => {
    const id = await walkedSave();
    const files = await packedFiles(id);
    const old = Object.fromEntries(
      Object.entries(files).filter(([name]) => !/chunks|lore|notes/.test(name)),
    );
    expect(Object.keys(old)).toHaveLength(3);
    const backup = unwrap(await unpackInstanceBackup(zipSync(old), cartridgesDir));
    expect(backup.land).toEqual({ chunks: [], lore: [], notes: [] });
  });
});

describe("an archive is untrusted", () => {
  it("refuses paths that leave the save or do not have an expected shape (3, 4)", async () => {
    const files = await packedFiles(await walkedSave());
    const scene = files[`${CHUNK}/scene.oui`] ?? new Uint8Array();
    const cases: Array<[string, string]> = [
      ["../instance.json", "backup-unsafe"],
      [`${CHUNK}/../../../../../evil.oui`, "backup-unsafe"],
      ["/etc/evil.oui", "backup-unsafe"],
      ["C:/evil.oui", "backup-unsafe"],
      ["saves\\default\\notes.jsonl", "backup-unsafe"],
      [`${CHUNK}/./scene.oui`, "backup-unsafe"],
      [`${CHUNK}/evil.js`, "backup-unknown-file"],
      [`${CHUNK}/dialogue/deep/rin.oui`, "backup-unknown-file"],
      ["saves/default/chunks/03_-2/scene.oui", "backup-unknown-file"],
      ["saves/default/chunks/-0_1/scene.oui", "backup-unknown-file"],
      ["saves/default/chunks/99999_0/scene.oui", "backup-unknown-file"],
      ["saves/default/extra.json", "backup-unknown-file"],
    ];
    for (const [name, code] of cases) {
      const tampered = await unpackInstanceBackup(
        zipSync({ ...files, [name]: scene }),
        cartridgesDir,
      );
      expect(codeOf(tampered), name).toBe(code);
    }
  });

  it("refuses land the live writers would refuse (5)", async () => {
    const files = await packedFiles(await walkedSave());
    const lore = new TextDecoder().decode(files["saves/default/lore.jsonl"]);
    const [firstLore = ""] = lore.trim().split("\n");
    const cases: Array<[string, Record<string, Uint8Array | undefined>, string]> = [
      [
        "scene that does not parse",
        { [`${CHUNK}/scene.oui`]: strToU8("root = Nope(") },
        "backup-land-invalid",
      ],
      [
        "words for nobody",
        { [`${CHUNK}/dialogue/ghost.oui`]: files[`${CHUNK}/dialogue/rin.oui`] },
        "backup-land-invalid",
      ],
      [
        "a resident without words",
        { [`${CHUNK}/dialogue/rin.oui`]: undefined },
        "backup-land-invalid",
      ],
      [
        "lore linking to nothing",
        {
          "saves/default/lore.jsonl": strToU8(
            `${firstLore.replace('"links":[]', '"links":["ghost@9,9"]')}\n`,
          ),
        },
        "backup-land-invalid",
      ],
      [
        "lore on a missing chunk",
        {
          "saves/default/lore.jsonl": strToU8(
            `${lore}${firstLore.replaceAll("3,-2", "5,5").replace('"cx":3,"cz":-2', '"cx":5,"cz":5')}\n`,
          ),
        },
        "backup-land-invalid",
      ],
      ["a chunk without scene.oui", { [`${CHUNK}/scene.oui`]: undefined }, "backup-incomplete"],
      [
        "lore that is not JSON",
        { "saves/default/lore.jsonl": strToU8("{\n") },
        "backup-land-invalid",
      ],
    ];
    for (const [label, change, code] of cases) {
      const next = { ...files };
      for (const [name, bytes] of Object.entries(change)) {
        if (bytes === undefined) delete next[name];
        else next[name] = bytes;
      }
      expect(codeOf(await unpackInstanceBackup(zipSync(next), cartridgesDir)), label).toBe(code);
    }
  });

  it("refuses notes that repeat or answer a note not written before them (6)", async () => {
    const files = await packedFiles(await walkedSave());
    const line = (note: object) => JSON.stringify(note);
    const repeated = strToU8(`${line(first)}\n${line(first)}\n`);
    const reversed = strToU8(`${line(answer)}\n${line(first)}\n`);
    for (const notes of [repeated, reversed]) {
      const tampered = zipSync({ ...files, "saves/default/notes.jsonl": notes });
      expect(codeOf(await unpackInstanceBackup(tampered, cartridgesDir))).toBe(
        "backup-land-invalid",
      );
    }
  });

  it("refuses an entry that inflates past its limit, and more dialogue than any chunk holds (7)", async () => {
    const files = await packedFiles(await walkedSave());
    // 300 KiB of one letter deflates to a few hundred bytes; the scene limit is 256 KiB.
    const bomb = zipSync(
      { ...files, [`${CHUNK}/scene.oui`]: strToU8("a".repeat(300 * 1024)) },
      { level: 9 },
    );
    expect(bomb.byteLength).toBeLessThan(64 * 1024);
    expect(codeOf(await unpackInstanceBackup(bomb, cartridgesDir))).toBe("backup-too-large");

    const crowd = { ...files };
    for (let n = 0; n < 65; n += 1) crowd[`${CHUNK}/dialogue/npc_${n}.oui`] = strToU8("x");
    expect(codeOf(await unpackInstanceBackup(zipSync(crowd), cartridgesDir))).toBe(
      "backup-too-large",
    );
  });
});

describe("export and import agree", () => {
  it("refuses to export a save import could not restore (10)", async () => {
    const id = await walkedSave();
    // ~18 MiB of valid notes: over notes.jsonl's own 16 MiB limit, far under the 256 MiB total.
    const lines = Array.from({ length: 40_000 }, (_, n) =>
      JSON.stringify({ ...first, id: `note-${String(n).padStart(8, "0")}`, text: "x".repeat(280) }),
    );
    await writeFile(
      join(instancesDir, id, "saves", "default", "notes.jsonl"),
      `${lines.join("\n")}\n`,
    );
    const packed = await packInstanceBackup(instancesDir, id, cartridgesDir);
    expect(codeOf(packed)).toBe("backup-too-large");
  });
});

describe("a backup from an older build", () => {
  it("is upgraded against its exact revision, and refused without it (8, 9)", async () => {
    const legacyCartridges = join(root, "legacy-cartridges");
    const manifest = unwrap(await publishCartridgeRevision(legacyCartridges, v1CartridgeInput()));
    const ref = {
      cartridgeId: manifest.cartridgeId,
      version: manifest.version,
      contentHash: manifest.contentHash,
    };
    const files = v1InstanceFiles(ref);
    const archive = zipSync({
      "instance.json": strToU8(JSON.stringify(files.instance)),
      "saves/default/save.json": strToU8(JSON.stringify(files.save)),
      "saves/default/karma.jsonl": strToU8(files.karma),
    });

    const missing = await unpackInstanceBackup(archive, join(root, "no-cartridges"));
    expect(codeOf(missing)).toBe("cartridge-missing");

    const backup = unwrap(await unpackInstanceBackup(archive, legacyCartridges));
    expect(backup.meta).toMatchObject({
      formatVersion: 2,
      instanceId: V1_INSTANCE_ID,
      cartridge: ref,
    });
    expect(backup.save).toMatchObject({ formatVersion: 2, player: null, party: null });
    const restored = unwrap(await restoreInstanceBackup(legacyCartridges, instancesDir, backup));
    expect(restored.cartridge.manifest.contentHash).toBe(manifest.contentHash);
    expect(restored.instance.karma).toHaveLength(1);
  });
});
