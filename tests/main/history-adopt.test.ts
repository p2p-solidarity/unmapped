// Adoption (rev 6 phase 3, D7): a never-attached world restored on another device is re-signed
// there — isolated because what it can lose (progress keys, references between events) does not
// show on screen until a later errand or note silently fails.
//
// Failure modes guarded here (each test names one):
// 1. Progress keys keep naming the old world's witness ids, so accepted errands vanish.
// 2. Events are re-signed with their references (note anchors) still naming old ids, so the fold
//    refuses them and they drop out of the adopted world.
// 3. The old history directory is written to (it must stay as it was, for a later restore).
// 4. Opening the save again adopts again, making a third world.

import { cp, mkdtemp, readFile, rm } from "node:fs/promises";
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
import { DSL_HISTORY } from "@main/histories/dslSeam";
import { WorldHost } from "@main/histories/host";
import { DeviceIdentity, type KeyCipher } from "@main/identity/deviceKey";
import { appendNote, witnessChunk } from "@main/instances/land";
import { checkpointInstance, createInstance } from "@main/instances/store";
import { ok } from "@shared/result";
import { EMPTY_INVENTORY } from "@shared/world";
import type { WorldProgress } from "@shared/worldProgress";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { v2CartridgeInput } from "../fixtures/v2";

const CREATED = new Date("2026-09-27T08:00:00.000Z");
const PLAYED = new Date("2026-09-27T08:45:00.000Z");

const cipher: KeyCipher = {
  available: () => true,
  encrypt: (plain) => new TextEncoder().encode(`test:${plain}`),
  decrypt: (blob) => new TextDecoder().decode(blob).slice("test:".length),
};

let root = "";

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "unmapped-adopt-"));
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

function unwrap<T>(result: { ok: true; value: T } | { ok: false; error: { code: string } }): T {
  if (!result.ok) throw new Error(`expected ok, got ${result.error.code}`);
  return result.value;
}

function hostFor(base: string): WorldHost {
  const identity = new DeviceIdentity(base, cipher);
  return new WorldHost({
    userData: base,
    cartridgesDir: join(base, "cartridges"),
    instancesDir: join(base, "instances"),
    works: {
      worksDir: join(base, "works"),
      playsDir: join(base, "work-plays"),
      draftsDir: join(base, "work-drafts"),
    },
    dsl: DSL_HISTORY,
    key: () => identity.get(),
    clock: () => new Date("2026-09-27T09:00:00.000Z"),
    broadcast: () => undefined,
    ensureBaseGame: async () => ok(undefined),
  });
}

/** A save with a chunk that has an errand in progress and a note anchored to its lore. */
async function legacySave(base: string): Promise<string> {
  const manifest = unwrap(
    await publishCartridgeRevision(join(base, "cartridges"), v2CartridgeInput()),
  );
  const instances = join(base, "instances");
  const record = unwrap(await createInstance(instances, manifest, "Walker", CREATED));
  const id = record.meta.instanceId;
  const draft = parseChunk(CHUNK_EXAMPLE, {
    coord: { cx: 3, cz: -2 },
    biome: "countryside",
    ground: "grass",
    hole: null,
    lore: [],
    language: "en",
  });
  if (!draft.ok) throw new Error(draft.error.message);
  const { scene, dialogues, errands, keepsakes, lore } = draft.value;
  unwrap(
    await witnessChunk(instances, {
      instanceId: id,
      cx: 3,
      cz: -2,
      scene: serializeScene(scene),
      dialogues: Object.fromEntries(dialogues.map((d) => [d.npcId, serializeDialogue(d)])),
      errands: serializeErrands({ errands, keepsakes }),
      lore,
    }),
  );
  const anchor = lore[0]?.id ?? "";
  unwrap(
    await appendNote(instances, {
      instanceId: id,
      note: {
        id: "note-0001-aaaa",
        author: "Ann",
        at: "2026-09-27T08:30:00.000Z",
        coord: { cx: 3, cz: -2, x: 4, z: 9 },
        anchors: [anchor],
        text: "The well still takes coins.",
        contests: null,
      },
    }),
  );
  const errand = errands[0]?.id ?? "";
  unwrap(
    await checkpointInstance(
      instances,
      {
        instanceId: id,
        expectedUpdatedAt: record.meta.updatedAt,
        flags: {},
        inventory: { items: [...EMPTY_INVENTORY.items], materials: [] },
        mutation: null,
        karma: [],
        land: {
          errands: { [`3,-2:${errand}`]: "reached" },
          home: { cx: 0, cz: 0, keepsakes: [] },
          door: [null, null, null, null],
        },
      },
      PLAYED,
    ),
  );
  return id;
}

async function logEvents(base: string, world: string) {
  const text = await readFile(join(base, "histories", world, "log.jsonl"), "utf8");
  return text
    .trim()
    .split("\n")
    .map((line) => (JSON.parse(line) as { event: Record<string, unknown> }).event);
}

async function progressOf(base: string, id: string): Promise<WorldProgress> {
  const path = join(base, "instances", id, "saves", "default", "progress.json");
  return JSON.parse(await readFile(path, "utf8")) as WorldProgress;
}

describe("adoption", () => {
  it("re-keys progress (1), re-links references (2), leaves the old world (3), once (4)", async () => {
    const a = join(root, "a");
    const id = await legacySave(a);
    const original = unwrap(await hostFor(a).ensure(id, "Ann"));
    expect(Object.keys((await progressOf(a, id)).errands)).toHaveLength(1);

    const b = join(root, "b");
    for (const dir of ["cartridges", "instances", "histories", "blobs"]) {
      await cp(join(a, dir), join(b, dir), { recursive: true });
    }
    const oldLog = await readFile(join(b, "histories", original.worldId, "log.jsonl"), "utf8");
    const adopted = unwrap(await hostFor(b).ensure(id, "Ann"));
    expect(adopted.adoptedFrom).toBe(original.worldId);
    expect(adopted.worldId).not.toBe(original.worldId);
    expect(adopted.lost).toEqual([]);

    const events = await logEvents(b, adopted.worldId);
    const before = await logEvents(a, original.worldId);
    expect(events.map((event) => event.kind)).toEqual(before.map((event) => event.kind));
    const witness = events.find((event) => event.kind === "witness");
    const noted = events.find((event) => event.kind === "note");
    if (witness === undefined || noted === undefined)
      throw new Error("expected a witness and a note");
    expect((noted.body as { anchors: string[] }).anchors).toEqual([witness.id]);
    const keys = Object.keys((await progressOf(b, id)).errands);
    expect(keys).toHaveLength(1);
    expect(keys[0]?.startsWith(`${witness.id}:`)).toBe(true);

    expect(await readFile(join(b, "histories", original.worldId, "log.jsonl"), "utf8")).toBe(
      oldLog,
    );
    const again = unwrap(await hostFor(b).ensure(id, "Ann"));
    expect([again.worldId, again.adoptedFrom, again.added]).toEqual([adopted.worldId, null, 0]);
  });
});
