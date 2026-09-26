// A `.spire-backup` of a save that plays in a world (rev 6 phase 3, D6 "Backups") carries its
// world.json, progress.json and the world's history. Isolated because the failure is silent loss
// that only shows on another machine: a restored save that re-migrates into a new world (its
// friends' shared world no longer matches) or forgets the player's progress.
//
// Failure modes guarded here (each test names one):
// 1. The export leaves out world.json, progress.json or history/log.jsonl, or the archive reader
//    refuses the entries its own export wrote.
// 2. Restoring on a device without that history does not install the same entries, or the restored
//    save is not pinned to the same world with the same progress.

import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { publishCartridgeRevision } from "@main/cartridges/store";
import { DSL_HISTORY } from "@main/histories/dslSeam";
import { WorldHost } from "@main/histories/host";
import { DeviceIdentity, type KeyCipher } from "@main/identity/deviceKey";
import {
  packInstanceBackup,
  restoreInstanceBackup,
  unpackInstanceBackup,
} from "@main/instances/backup";
import { createInstance } from "@main/instances/store";
import { canonicalJson } from "@shared/canonical";
import { ok } from "@shared/result";
import { unzipSync } from "fflate";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { v2CartridgeInput } from "../fixtures/v2";

const CREATED = new Date("2026-09-27T08:00:00.000Z");
const cipher: KeyCipher = {
  available: () => true,
  encrypt: (plain) => new TextEncoder().encode(`test:${plain}`),
  decrypt: (blob) => new TextDecoder().decode(blob).slice("test:".length),
};

/** Each test migrates a save on disk: room for a machine under load. */
const SLOW_MS = 30_000;

let root = "";

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "unmapped-backup-world-"));
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
    clock: () => CREATED,
    broadcast: () => undefined,
    ensureBaseGame: async () => ok(undefined),
  });
}

describe("a backup of a save in a world", () => {
  it(
    "carries the world and restores it on a device without it (1, 2)",
    async () => {
      const a = join(root, "a");
      const manifest = unwrap(
        await publishCartridgeRevision(join(a, "cartridges"), v2CartridgeInput()),
      );
      const id = unwrap(await createInstance(join(a, "instances"), manifest, "Walker", CREATED))
        .meta.instanceId;
      const ensured = unwrap(await hostFor(a).ensure(id, "Ann"));
      const packed = unwrap(
        await packInstanceBackup(
          join(a, "instances"),
          id,
          join(a, "cartridges"),
          join(a, "histories"),
        ),
      );
      const names = Object.keys(unzipSync(packed)).sort();
      expect(names).toEqual(
        expect.arrayContaining([
          "history/log.jsonl",
          "saves/default/progress.json",
          "saves/default/world.json",
        ]),
      );

      const b = join(root, "b");
      unwrap(await publishCartridgeRevision(join(b, "cartridges"), v2CartridgeInput()));
      const backup = unwrap(await unpackInstanceBackup(packed, join(b, "cartridges")));
      expect(backup.history?.pin.worldId).toBe(ensured.worldId);
      const restored = unwrap(
        await restoreInstanceBackup(
          join(b, "cartridges"),
          join(b, "instances"),
          backup,
          CREATED,
          join(b, "histories"),
        ),
      );
      expect(restored.historyNotice).toBeNull();
      // The same entries (the chain binds ids, which hash canonical JSON; key order is not content).
      const log = async (base: string) =>
        (await readFile(join(base, "histories", ensured.worldId, "log.jsonl"), "utf8"))
          .trim()
          .split("\n")
          .map((line) => canonicalJson(JSON.parse(line)));
      expect(await log(b)).toEqual(await log(a));
      const slot = join(b, "instances", restored.instance.meta.instanceId, "saves", "default");
      const pin = JSON.parse(await readFile(join(slot, "world.json"), "utf8")) as {
        worldId: string;
      };
      expect(pin.worldId).toBe(ensured.worldId);
      const progress = JSON.parse(await readFile(join(slot, "progress.json"), "utf8"));
      expect(progress).toEqual(ensured.progress);
    },
    SLOW_MS,
  );
});
