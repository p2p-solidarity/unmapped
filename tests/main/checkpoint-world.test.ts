// Checkpointing a save that plays in a world (rev 6 phase 3, D1, D6 "Source files"): after its
// migration the save's legacy land fields are frozen (an older build and the catch-up read them),
// karma.jsonl only grows (its lines date migrated deeds), and the player's own progress goes to
// progress.json. Isolated because every failure here is silent data loss E2E cannot stage: the
// damage only shows when an older build or a later catch-up reads the save.
//
// Failure modes guarded here (each test names one):
// 1. A checkpoint changes a frozen legacy field (errands, places, storyMore, an episode's stage)
//    and it is written — the older build and the catch-up then read something the history never had.
// 2. A save that never had those fields (a new game) cannot checkpoint because "absent" and "empty"
//    are compared as different — Play would trip the guard on every save.
// 3. A shortened or rewritten ledger replaces karma.jsonl.
// 4. progress.json of another world is written into this save, or a checkpoint's progress moves an
//    errand, an episode or a place backwards over what a catch-up merged meanwhile.
// 5. A save without a world (no key yet) is refused today's checkpoints, or gets a progress.json.

import { mkdtemp, readFile, rm } from "node:fs/promises";
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
import { witnessChunk } from "@main/instances/land";
import { checkpointInstance, createInstance, resolveInstance } from "@main/instances/store";
import type { InstanceProgressInput } from "@shared/cartridge";
import type { LandProgress } from "@shared/land";
import { ok } from "@shared/result";
import type { WorldProgress } from "@shared/worldProgress";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { v2CartridgeInput } from "../fixtures/v2";

const CREATED = new Date("2026-09-27T08:00:00.000Z");
const CLOCK = new Date("2026-09-27T09:00:00.000Z");

const cipher: KeyCipher = {
  available: () => true,
  encrypt: (plain) => new TextEncoder().encode(`test:${plain}`),
  decrypt: (blob) => new TextDecoder().decode(blob).slice("test:".length),
};

/** Each test migrates a save on disk: room for a machine under load. */
const SLOW_MS = 30_000;

let root = "";

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "unmapped-checkpoint-world-"));
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

function unwrap<T>(result: { ok: true; value: T } | { ok: false; error: { code: string } }): T {
  if (!result.ok) throw new Error(`expected ok, got ${result.error.code}`);
  return result.value;
}

const instancesDir = () => join(root, "instances");
const cartridgesDir = () => join(root, "cartridges");

function host(): WorldHost {
  const identity = new DeviceIdentity(root, cipher);
  return new WorldHost({
    userData: root,
    cartridgesDir: cartridgesDir(),
    instancesDir: instancesDir(),
    works: {
      worksDir: join(root, "works"),
      playsDir: join(root, "work-plays"),
      draftsDir: join(root, "work-drafts"),
    },
    dsl: DSL_HISTORY,
    key: () => identity.get(),
    clock: () => CLOCK,
    broadcast: () => undefined,
    ensureBaseGame: async () => ok(undefined),
  });
}

/** A witnessed chunk with an errand (`lost_key`), written the pre-history way. */
async function witnessWithErrand(instanceId: string, cx: number, cz: number): Promise<void> {
  const draft = parseChunk(CHUNK_EXAMPLE, {
    coord: { cx, cz },
    biome: "countryside",
    ground: "grass",
    hole: null,
    lore: [],
    language: "en",
  });
  if (!draft.ok) throw new Error(draft.error.message);
  unwrap(
    await witnessChunk(instancesDir(), {
      instanceId,
      cx,
      cz,
      scene: serializeScene(draft.value.scene),
      dialogues: Object.fromEntries(
        draft.value.dialogues.map((one) => [one.npcId, serializeDialogue(one)]),
      ),
      errands: serializeErrands({ errands: draft.value.errands, keepsakes: draft.value.keepsakes }),
      lore: draft.value.lore,
    }),
  );
}

const HOME = { cx: 0, cz: 0, keepsakes: [] };
const DOOR = [null, null, null, null];

async function current(instanceId: string) {
  return unwrap(await resolveInstance(cartridgesDir(), instancesDir(), instanceId)).instance;
}

async function checkpoint(instanceId: string, patch: Partial<InstanceProgressInput>) {
  const instance = await current(instanceId);
  return checkpointInstance(instancesDir(), {
    instanceId,
    expectedUpdatedAt: instance.meta.updatedAt,
    flags: instance.save.flags,
    inventory: instance.save.inventory,
    mutation: instance.save.mutation,
    karma: instance.karma,
    ...patch,
  });
}

/** A legacy save with an accepted errand on chunk (3, -2), migrated into its world. */
async function migratedSave(): Promise<{ id: string; worldId: string; progress: WorldProgress }> {
  const manifest = unwrap(await publishCartridgeRevision(cartridgesDir(), v2CartridgeInput()));
  const id = unwrap(await createInstance(instancesDir(), manifest, "Walker", CREATED)).meta
    .instanceId;
  await witnessWithErrand(id, 3, -2);
  const land: LandProgress = { errands: { "3,-2:lost_key": "accepted" }, home: HOME, door: DOOR };
  unwrap(await checkpoint(id, { land }));
  const ensured = unwrap(await host().ensure(id, "Ann"));
  return { id, worldId: ensured.worldId, progress: ensured.progress };
}

async function progressFile(id: string): Promise<WorldProgress> {
  const text = await readFile(
    join(instancesDir(), id, "saves", "default", "progress.json"),
    "utf8",
  );
  return JSON.parse(text) as WorldProgress;
}

describe("a checkpoint of a save in a world", () => {
  it(
    "refuses a change to a frozen legacy field and writes the live ones (1)",
    async () => {
      const { id } = await migratedSave();
      const stored = (await current(id)).save.land;
      const moved = await checkpoint(id, {
        land: { ...(stored as LandProgress), errands: { "3,-2:lost_key": "done" } },
      });
      expect(moved.ok ? "ok" : moved.error.code).toBe("legacy-land-changed");
      const place = {
        id: "p1",
        title: "A new course",
        cx: 2,
        cz: 2,
        cleared: false,
        kind: "side" as const,
        seed: 1,
        source: 'root = Scene("x", [])',
      };
      const added = await checkpoint(id, {
        land: { ...(stored as LandProgress), places: [place] },
      });
      expect(added.ok ? "ok" : added.error.code).toBe("legacy-land-changed");

      const home = { cx: 0, cz: 0, keepsakes: [] };
      const door = [{ kind: "place" as const, cx: 3, cz: -2, label: "Crossing" }, null, null, null];
      unwrap(await checkpoint(id, { land: { errands: {}, ...stored, home, door } }));
      const after = (await current(id)).save.land;
      expect(after?.errands).toEqual({ "3,-2:lost_key": "accepted" });
      expect(after?.door[0]).toEqual(door[0]);
    },
    SLOW_MS,
  );

  it(
    "treats a field a new game never had as unchanged (2)",
    async () => {
      const manifest = unwrap(await publishCartridgeRevision(cartridgesDir(), v2CartridgeInput()));
      const id = unwrap(await createInstance(instancesDir(), manifest, "New", CREATED)).meta
        .instanceId;
      unwrap(await host().ensure(id, "Ann"));
      expect((await current(id)).save.land).toBeUndefined();
      unwrap(await checkpoint(id, { land: { errands: {}, home: HOME, door: DOOR, episodes: {} } }));
      expect((await current(id)).save.land?.door).toEqual(DOOR);
    },
    SLOW_MS,
  );

  it(
    "only lets karma.jsonl grow (3)",
    async () => {
      const { id } = await migratedSave();
      const line = {
        at: CLOCK.toISOString(),
        floor: 1,
        npcId: null,
        action: "witness" as const,
        choice: "x",
        effect: "",
      };
      unwrap(await checkpoint(id, { karma: [...(await current(id)).karma, line] }));
      const grown = (await current(id)).karma;
      expect(grown.length).toBeGreaterThan(0);
      const shorter = await checkpoint(id, { karma: grown.slice(1) });
      expect(shorter.ok ? "ok" : shorter.error.code).toBe("karma-not-append-only");
      const rewritten = await checkpoint(id, {
        karma: grown.map((one, index) => (index === 0 ? { ...one, choice: "rewritten" } : one)),
      });
      expect(rewritten.ok ? "ok" : rewritten.error.code).toBe("karma-not-append-only");
    },
    SLOW_MS,
  );

  it(
    "writes this world's progress, merged and never backwards (4)",
    async () => {
      const { id, worldId, progress } = await migratedSave();
      const [errandKey] = Object.keys(progress.errands);
      expect(errandKey).toMatch(/^h[a-z2-7]{52}:lost_key$/);
      if (errandKey === undefined) return;
      const foreign = await checkpoint(id, {
        progress: { ...progress, worldId: `h${"a".repeat(52)}` },
      });
      expect(foreign.ok ? "ok" : foreign.error.code).toBe("progress-world-mismatch");

      const done: WorldProgress = {
        ...progress,
        errands: { [errandKey]: "done" },
        episodes: {
          e1: { cleared: true, summary: "Met Rin.", found: [], felled: [], met: ["rin"] },
        },
        places: { p1: { cleared: true } },
      };
      unwrap(await checkpoint(id, { progress: done }));
      const back: WorldProgress = {
        v: 1,
        worldId,
        errands: { [errandKey]: "accepted" },
        episodes: { e1: { cleared: false, summary: null, found: [], felled: [], met: [] } },
        places: { p1: { cleared: false } },
      };
      unwrap(await checkpoint(id, { progress: back }));
      const stored = await progressFile(id);
      expect(stored.errands[errandKey]).toBe("done");
      expect(stored.episodes.e1?.cleared).toBe(true);
      expect(stored.episodes.e1?.met).toEqual(["rin"]);
      expect(stored.places.p1?.cleared).toBe(true);
    },
    SLOW_MS,
  );

  it(
    "keeps today's checkpoint for a save without a world, and gives it no progress (5)",
    async () => {
      const manifest = unwrap(await publishCartridgeRevision(cartridgesDir(), v2CartridgeInput()));
      const id = unwrap(await createInstance(instancesDir(), manifest, "Keyless", CREATED)).meta
        .instanceId;
      const land: LandProgress = { errands: { "1,1:x": "accepted" }, home: HOME, door: DOOR };
      unwrap(await checkpoint(id, { land }));
      unwrap(await checkpoint(id, { land: { ...land, errands: { "1,1:x": "done" } }, karma: [] }));
      expect((await current(id)).save.land?.errands).toEqual({ "1,1:x": "done" });
      const progress: WorldProgress = {
        v: 1,
        worldId: `h${"b".repeat(52)}`,
        errands: {},
        episodes: {},
        places: {},
      };
      const refused = await checkpoint(id, { progress });
      expect(refused.ok ? "ok" : refused.error.code).toBe("progress-no-world");
    },
    SLOW_MS,
  );
});
