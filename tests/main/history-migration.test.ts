// Migrating a legacy save into a world's history (rev 6 phase 3, D6) through `WorldHost.ensure`,
// with the real DSL planner — isolated because these are silent-data-loss failures that one E2E
// run cannot stage (a crash between two renames, an older build writing the save afterwards).
//
// Failure modes guarded here (each test names one):
// 1. A rerun, or the same save migrated on a fresh copy with the same device key, writes a log that
//    is not byte-identical (different ids, receipt times or pack hashes).
// 2. Migration writes to its source: save.json, karma.jsonl, instance.json, chunks/, lore.jsonl or
//    notes.jsonl change.
// 3. A crash after the history was renamed into place but before world.json (and index.json) were
//    written makes the next open migrate again — a second world, or duplicated entries.
// 4. A staging directory left by a crash before its rename is taken for a history.
// 5. Catch-up after an older build wrote the save appends events the log already holds, or adds a
//    profile event because the player's name changed since the migration.

import { createHash } from "node:crypto";
import { copyFile, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { CHUNK_EXAMPLE, parseChunk, serializeDialogue, serializeScene } from "@dsl/index";
import { publishCartridgeRevision } from "@main/cartridges/store";
import { DSL_HISTORY } from "@main/histories/dslSeam";
import { WorldHost } from "@main/histories/host";
import { DeviceIdentity, deviceKeyPath, type KeyCipher } from "@main/identity/deviceKey";
import { appendNote, witnessChunk } from "@main/instances/land";
import { createInstance } from "@main/instances/store";
import type { LandNote, WitnessChunkInput } from "@shared/land";
import { ok } from "@shared/result";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { v2CartridgeInput } from "../fixtures/v2";

const CREATED = new Date("2026-09-27T08:00:00.000Z");
const CLOCK = new Date("2026-09-27T09:00:00.000Z");

const cipher: KeyCipher = {
  available: () => true,
  encrypt: (plain) => new TextEncoder().encode(`test:${plain}`),
  decrypt: (blob) => new TextDecoder().decode(blob).slice("test:".length),
};

let root = "";

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "unmapped-migration-"));
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

function unwrap<T>(result: { ok: true; value: T } | { ok: false; error: { code: string } }): T {
  if (!result.ok) throw new Error(`expected ok, got ${result.error.code}`);
  return result.value;
}

function chunk(instanceId: string, cx: number, cz: number): WitnessChunkInput {
  const draft = parseChunk(CHUNK_EXAMPLE, {
    coord: { cx, cz },
    biome: "countryside",
    ground: "grass",
    hole: null,
    lore: [],
    language: "en",
  });
  if (!draft.ok) throw new Error(draft.error.message);
  return {
    instanceId,
    cx,
    cz,
    scene: serializeScene(draft.value.scene),
    dialogues: Object.fromEntries(
      draft.value.dialogues.map((d) => [d.npcId, serializeDialogue(d)]),
    ),
    lore: draft.value.lore,
  };
}

function note(id: string, text: string, cx: number): LandNote {
  return {
    id,
    author: "Ann",
    at: "2026-09-27T08:30:00.000Z",
    coord: { cx, cz: 0, x: 4, z: 9 },
    anchors: [],
    text,
    contests: null,
  };
}

/** A pre-phase-3 save with one witnessed chunk and one note, the same bytes under any root. */
async function legacySave(base: string): Promise<string> {
  const manifest = unwrap(
    await publishCartridgeRevision(join(base, "cartridges"), v2CartridgeInput()),
  );
  const instances = join(base, "instances");
  const id = unwrap(await createInstance(instances, manifest, "Walker", CREATED)).meta.instanceId;
  unwrap(await witnessChunk(instances, chunk(id, 3, -2)));
  unwrap(
    await appendNote(instances, {
      instanceId: id,
      note: note("note-0001-aaaa", "Old bus stop.", 3),
    }),
  );
  return id;
}

function hostFor(base: string, now = CLOCK): WorldHost {
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
    clock: () => now,
    broadcast: () => undefined,
    ensureBaseGame: async () => ok(undefined),
  });
}

async function files(dir: string, base = dir): Promise<string[]> {
  const out: string[] = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await files(path, base)));
    else out.push(relative(base, path));
  }
  return out.sort();
}

/** sha256 of every legacy source file of the instance (not world.json / progress.json). */
async function sources(base: string, id: string): Promise<Record<string, string>> {
  const dir = join(base, "instances", id);
  const out: Record<string, string> = {};
  for (const path of await files(dir)) {
    if (path.endsWith("world.json") || path.endsWith("progress.json")) continue;
    out[path] = createHash("sha256")
      .update(await readFile(join(dir, path)))
      .digest("hex");
  }
  return out;
}

async function logText(base: string, worldId: string): Promise<string> {
  return readFile(join(base, "histories", worldId, "log.jsonl"), "utf8");
}

function kinds(log: string): string[] {
  return log
    .trim()
    .split("\n")
    .map((line) => (JSON.parse(line) as { event: { kind: string } }).event.kind);
}

describe("migration", () => {
  it("is byte-identical on rerun and on a fresh copy (1) and never touches its source (2)", async () => {
    const a = join(root, "a");
    const id = await legacySave(a);
    const before = await sources(a, id);
    const first = unwrap(await hostFor(a).ensure(id, "Ann"));
    expect(first.migrated).toBe(true);
    const log = await logText(a, first.worldId);
    expect(kinds(log)).toEqual(["genesis", "pack", "profile", "witness", "note"]);
    const rerun = unwrap(await hostFor(a).ensure(id, "Ann"));
    expect([rerun.worldId, rerun.migrated, rerun.added]).toEqual([first.worldId, false, 0]);
    expect(await logText(a, first.worldId)).toBe(log);
    expect(await sources(a, id)).toEqual(before);

    const b = join(root, "b");
    expect(await legacySave(b)).toBe(id);
    await mkdir(join(b, "identity"), { recursive: true });
    await copyFile(deviceKeyPath(a), deviceKeyPath(b));
    // A day later on the other copy: receipt times come from the events, never from the clock.
    const copy = unwrap(await hostFor(b, new Date("2026-09-28T10:00:00.000Z")).ensure(id, "Ann"));
    expect(copy.worldId).toBe(first.worldId);
    expect(await logText(b, copy.worldId)).toBe(log);
  });

  it("finishes a commit cut between rename and pin without a second world (3, 4)", async () => {
    const id = await legacySave(root);
    const first = unwrap(await hostFor(root).ensure(id, "Ann"));
    const log = await logText(root, first.worldId);
    const save = join(root, "instances", id, "saves", "default");
    await rm(join(save, "world.json"));
    await rm(join(save, "progress.json"));
    await rm(join(root, "histories", "index.json"));
    const staging = join(root, "histories", ".staging-other-1-2");
    await mkdir(staging, { recursive: true });
    await writeFile(join(staging, "log.jsonl"), '{"n":1,"rt":"2026-09-27T08:0');

    const again = unwrap(await hostFor(root).ensure(id, "Ann"));
    expect([again.worldId, again.migrated, again.added]).toEqual([first.worldId, false, 0]);
    expect(await logText(root, first.worldId)).toBe(log);
    const pin = JSON.parse(await readFile(join(save, "world.json"), "utf8")) as { worldId: string };
    expect(pin.worldId).toBe(first.worldId);
    const index = await readFile(join(root, "histories", "index.json"), "utf8");
    expect(index).toContain(first.worldId);
    const worlds = (await readdir(join(root, "histories"))).filter((name) => name.startsWith("h"));
    expect(worlds).toEqual([first.worldId]);
  });

  it("adds only what an older build wrote since, once, under the migration's name (5)", async () => {
    const id = await legacySave(root);
    const first = unwrap(await hostFor(root).ensure(id, "Ann"));
    const instances = join(root, "instances");
    unwrap(await witnessChunk(instances, chunk(id, 5, 1)));
    unwrap(
      await appendNote(instances, { instanceId: id, note: note("note-0002-bbbb", "New sign.", 5) }),
    );

    const caught = unwrap(await hostFor(root).ensure(id, "Bea"));
    expect([caught.worldId, caught.added]).toEqual([first.worldId, 2]);
    const log = await logText(root, first.worldId);
    expect(kinds(log)).toEqual([
      "genesis",
      "pack",
      "profile",
      "witness",
      "note",
      "witness",
      "note",
    ]);
    const ids = log
      .trim()
      .split("\n")
      .map((line) => (JSON.parse(line) as { event: { id: string } }).event.id);
    expect(new Set(ids).size).toBe(ids.length);

    const settled = unwrap(await hostFor(root).ensure(id, "Bea"));
    expect(settled.added).toBe(0);
    expect(await logText(root, first.worldId)).toBe(log);
  });
});
