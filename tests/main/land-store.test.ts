import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CHUNK_EXAMPLE, parseChunk, serializeDialogue, serializeScene } from "@dsl/index";
import { publishCartridgeRevision } from "@main/cartridges/store";
import { appendNote, readLand, witnessChunk } from "@main/instances/land";
import { createInstance } from "@main/instances/store";
import type { WitnessChunkInput } from "@shared/land";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { v2CartridgeInput } from "../fixtures/v2";

let root = "";

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "aether-land-"));
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

function unwrap<T>(result: { ok: true; value: T } | { ok: false; error: { code: string } }): T {
  if (!result.ok) throw new Error(`expected ok, got ${result.error.code}`);
  return result.value;
}

async function instanceId(): Promise<string> {
  const manifest = unwrap(
    await publishCartridgeRevision(join(root, "cartridges"), v2CartridgeInput()),
  );
  return unwrap(await createInstance(join(root, "instances"), manifest, "Walker")).meta.instanceId;
}

function witnessInput(id: string): WitnessChunkInput {
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
    instanceId: id,
    cx: 3,
    cz: -2,
    scene: serializeScene(draft.value.scene),
    dialogues: Object.fromEntries(
      draft.value.dialogues.map((d) => [d.npcId, serializeDialogue(d)]),
    ),
    lore: draft.value.lore,
  };
}

describe("witnessed land", () => {
  it("writes a chunk once, reads it back and refuses a second witness", async () => {
    const instancesDir = join(root, "instances");
    const id = await instanceId();
    const input = witnessInput(id);
    unwrap(await witnessChunk(instancesDir, input));

    const land = unwrap(await readLand(instancesDir, id));
    expect(land.chunks).toEqual([
      { cx: 3, cz: -2, scene: input.scene, dialogues: input.dialogues, errands: input.errands },
    ]);
    expect(land.lore.map((node) => node.id)).toEqual(input.lore.map((node) => node.id));

    const again = await witnessChunk(instancesDir, input);
    expect(again.ok ? "ok" : again.error.code).toBe("chunk-already-witnessed");
  });

  it("rejects lore that links to nothing and dialogue that belongs to nobody", async () => {
    const instancesDir = join(root, "instances");
    const id = await instanceId();
    const input = witnessInput(id);
    const dangling = {
      ...input,
      lore: input.lore.map((node) => ({ ...node, links: ["ghost@9,9"] })),
    };
    const refused = await witnessChunk(instancesDir, dangling);
    expect(refused.ok ? "ok" : refused.error.code).toBe("witness-lore-invalid");

    const stray = {
      ...input,
      dialogues: { ...input.dialogues, nobody: input.dialogues.rin ?? "" },
    };
    const mismatch = await witnessChunk(instancesDir, stray);
    expect(mismatch.ok ? "ok" : mismatch.error.code).toBe("witness-dialogue-mismatch");
    expect(unwrap(await readLand(instancesDir, id))).toEqual({ chunks: [], lore: [], notes: [] });
  });
});

describe("notes", () => {
  it("appends notes, keeps disagreements side by side and refuses answers to nothing", async () => {
    const instancesDir = join(root, "instances");
    const id = await instanceId();
    const first = {
      id: "note-0001-aaaa",
      author: "Rin",
      at: "2026-09-26T08:00:00.000Z",
      coord: { cx: 2, cz: 0, x: 4, z: 9 },
      anchors: [],
      text: "The bus never stops here.",
      contests: null,
    };
    const other = {
      ...first,
      id: "note-0002-bbbb",
      author: "Tomo",
      text: "It stopped for me.",
      contests: first.id,
    };
    unwrap(await appendNote(instancesDir, { instanceId: id, note: first }));
    unwrap(await appendNote(instancesDir, { instanceId: id, note: other }));
    expect(unwrap(await readLand(instancesDir, id)).notes).toEqual([first, other]);

    const orphan = { ...first, id: "note-0003-cccc", contests: "note-missing" };
    const refused = await appendNote(instancesDir, { instanceId: id, note: orphan });
    expect(refused.ok ? "ok" : refused.error.code).toBe("note-contests-missing");
  });
});
