// A world brought back up on another service from its `.world` file (rev 6 phase 4, D5): the
// mirror, the rehost, and the attach paths a co-owner and a mirror need — plus three limits the
// other session's world-probe found open against a live service. Isolated because each is a peer
// or a file that E2E cannot forge, or a receipt under the wrong key (silent data loss for every
// member). What this file guards, written before the code:
//   1. A mirror sequences a submit (its receipt would be under a key the schedule never gives).
//   2. A mirror grants a claim, so a client spends a model call on a place it can never write.
//   3. A mirror beats.
//   4. A co-owner's rehost (`sequencer` naming this service) is refused, or one by an owner removed
//      before it is accepted; or the receipts after a rehost do not verify, or the old ones stop
//      verifying.
//   5. A `sequencer` naming another service's key is sequenced (P3 D2 step 4).
//   6. A log receipted by another service, copied in by hand rather than imported, is served.
//   7. A co-owner's attach fails (its upload checked against the genesis author alone), or a
//      co-owner's sequencer inside an upload is not seen as one (then the log fails verifying).
//   8. Attaching a never-attached world the service holds as a mirror is refused, or loses entries.
//   9. `attach` ignores D9's open-worlds-per-connection limit (world-probe: 10 on one socket).
//  10. A visitor at its daily new-key cap hears `quota-visitor-keys` where the door's
//      `access-visitor-kind` is the honest answer (world-probe).
//  11. Importing a file over a world held with another history merges the two.
//  12. An oversized frame closes the socket at Bun's transport (1006) before the hub can answer
//      `frame-too-large` / 1009 (world-probe) — main.ts, Bun only: checked live, not here.
//  13. `GET /v1/worlds/<id>/export` hands a world to a key the door keeps out, or hands a reader a
//      file that does not verify.

import { cpSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { verifyWorldFile } from "@dsl/history/worldBundle";
import { type BundleBlob, buildWorldBundle } from "@dsl/history/worldBundleWrite";
import { publishCartridgeRevision, readCartridgeRevision } from "@main/cartridges/store";
import { packCartridgeReproducibly } from "@main/histories/packs";
import type { ContentHash } from "@shared/cartridge";
import { contentHash } from "@shared/history/ids";
import { verifyLog } from "@shared/history/log";
import { blobAuthHeader, signText } from "@shared/history/sign";
import type { GenesisBody, LogEntry } from "@shared/history/types";
import { bundleSignText } from "@shared/worldBundle";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { beatPass } from "../../src/service/beats";
import { importWorld } from "../../src/service/bundle";
import { handleHttp } from "../../src/service/http";
import { FileStore } from "../../src/service/store";
import { v2CartridgeInput } from "../fixtures/v2";
import {
  at,
  attach,
  BEN,
  Client,
  GENESIS,
  headOf,
  keyOf,
  LocalWorld,
  makeService,
  noteBody,
  OWNER,
  sign,
  tempDir,
  VIC,
} from "./support";

let root = "";
let pack: BundleBlob;
let cartridge: GenesisBody["cartridge"];

beforeAll(async () => {
  root = mkdtempSync(join(tmpdir(), "unmapped-mirror-"));
  const dir = join(root, "cartridges");
  const published = await publishCartridgeRevision(dir, v2CartridgeInput());
  if (!published.ok) throw new Error(published.error.message);
  const revision = await readCartridgeRevision(dir, "v2-world", "2.0.0");
  if (!revision.ok) throw new Error(revision.error.message);
  const bytes = packCartridgeReproducibly(revision.value);
  if (!bytes.ok) throw new Error(bytes.error.message);
  pack = { hash: contentHash(bytes.value) as ContentHash, bytes: bytes.value };
  const { cartridgeId, version, contentHash: hash } = revision.value.manifest;
  cartridge = { cartridgeId, version, contentHash: hash };
});

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

function served(hub: ReturnType<typeof makeService>["hub"], world: string): LogEntry[] {
  const held = hub.worlds.get(world);
  if (held === undefined) throw new Error("not held");
  return Array.from({ length: held.head.n }, (_, index) => {
    const entry = held.entryAt(index + 1);
    if (entry === null) throw new Error("unreadable");
    return entry;
  });
}

function worldFile(entries: readonly LogEntry[]): Uint8Array {
  const built = buildWorldBundle({
    entries,
    genesisPack: pack,
    works: [],
    exportedAt: at(20),
    signer: { key: keyOf(BEN), sign: (m) => signText(BEN, bundleSignText(m)) },
  });
  if (!built.ok) throw new Error(`${built.error.code}: ${built.error.message}`);
  return built.value.bytes;
}

/** A world with a co-owner (BEN), attached to S1, then brought up as a mirror on S2. */
function mirrored(options: { removeBen?: boolean } = {}) {
  const s1 = makeService();
  const world = new LocalWorld({ ...GENESIS, cartridge });
  world.write("owner.add", { key: keyOf(BEN) }, OWNER, at(0, 1));
  if (options.removeBen === true) world.write("owner.remove", { key: keyOf(BEN) }, OWNER, at(0, 2));
  attach(new Client(s1.hub, OWNER), world);
  const old = served(s1.hub, world.id);
  const dir = tempDir();
  const store = new FileStore(dir);
  store.ensure();
  const imported = importWorld(store, worldFile(old), at(20));
  if (!imported.ok) throw new Error(`${imported.error.code}: ${imported.error.message}`);
  const s2 = makeService({ dir });
  return { s1, s2, world, old, dir };
}

describe("a mirror", () => {
  it("serves reads and refuses submits (1)", () => {
    const { s2, world, old } = mirrored();
    const owner = new Client(s2.hub, OWNER);
    owner.open(world.id);
    expect(owner.last("opened")?.role).toBe("owner");
    expect(owner.entries(world.id)).toEqual(old);
    owner.submit(world.id, sign(world.id, "note", noteBody(), OWNER, old.length));
    expect(owner.codes()).toEqual(["world-mirror-only"]);
    expect(headOf(s2.hub, world.id)).toBe(old.length);
  });

  it("refuses a claim at once (2)", () => {
    const { s2, world } = mirrored();
    const owner = new Client(s2.hub, OWNER);
    owner.open(world.id);
    owner.send({ t: "claim", world: world.id, target: "chunk:1,1" });
    expect(owner.last("claimed")?.status).toBe("refused");
    expect(owner.codes()).toEqual(["world-mirror-only"]);
  });

  it("writes no beat (3)", () => {
    const { s2, world, old } = mirrored();
    s2.clock.ms += 30 * 24 * 60 * 60 * 1000;
    beatPass(s2.hub);
    expect(headOf(s2.hub, world.id)).toBe(old.length);
  });

  it("is rehosted by a co-owner's sequencer; old and new receipts verify (4)", () => {
    const { s1, s2, world, old } = mirrored();
    const ben = new Client(s2.hub, BEN);
    ben.open(world.id);
    const body = { url: "ws://127.0.0.1:8798", key: s2.hub.key.key };
    ben.submit(world.id, sign(world.id, "sequencer", body, BEN, old.length));
    expect(ben.codes()).toEqual([]);
    ben.submit(world.id, sign(world.id, "note", noteBody("on S2"), BEN, old.length + 1));
    expect(ben.codes()).toEqual([]);
    const log = served(s2.hub, world.id);
    expect(log.slice(0, old.length)).toEqual(old);
    const checked = verifyLog(world.id, log);
    expect(checked.ok && checked.value.schedule.map((step) => step.key)).toEqual([
      s1.hub.key.key,
      s2.hub.key.key,
    ]);
    // Reloaded from disk, the rehosted world is this service's own.
    const again = makeService({ dir: s2.dir });
    expect(again.hub.broken.size).toBe(0);
    expect(headOf(again.hub, world.id)).toBe(old.length + 2);
  });

  it("refuses the sequencer of an owner removed before it (4)", () => {
    const { s2, world, old } = mirrored({ removeBen: true });
    const ben = new Client(s2.hub, BEN);
    ben.open(world.id);
    const body = { url: "ws://127.0.0.1:8798", key: s2.hub.key.key };
    ben.submit(world.id, sign(world.id, "sequencer", body, BEN, old.length));
    expect(ben.codes()).not.toEqual([]);
    expect(headOf(s2.hub, world.id)).toBe(old.length);
  });

  it("refuses a sequencer naming another service (5)", () => {
    const { s1, s2, world, old } = mirrored();
    const owner = new Client(s2.hub, OWNER);
    owner.open(world.id);
    const body = { url: "ws://127.0.0.1:8797", key: s1.hub.key.key };
    owner.submit(world.id, sign(world.id, "sequencer", body, OWNER, old.length));
    expect(owner.codes()).toEqual(["sequencer-key-foreign"]);
  });

  it("is only a mirror when imported: a copied foreign log stays unserved (6)", () => {
    const { s1, world } = mirrored();
    const dir = tempDir();
    cpSync(join(s1.dir, "worlds"), join(dir, "worlds"), { recursive: true });
    const copy = makeService({ dir });
    expect(copy.hub.broken.get(world.id)?.code).toBe("world-key-foreign");
  });

  it("refuses a file over a world it holds with another history (11)", () => {
    const { dir, world, old } = mirrored();
    const other = new LocalWorld({ ...GENESIS, cartridge });
    other.write("owner.add", { key: keyOf(BEN) }, OWNER, at(0, 1));
    other.write("note", noteBody("a fork"), OWNER, at(0, 3));
    expect(other.id).toBe(world.id);
    const store = new FileStore(dir);
    const again = importWorld(store, worldFile(other.entries), at(21));
    expect(again.ok ? null : again.error.code).toBe("import-world-exists");
    const same = importWorld(store, worldFile(old), at(21));
    expect(same.ok && same.value.again).toBe(true);
  });
});

describe("attach", () => {
  it("lets a co-owner attach, and sees a co-owner's sequencer in an upload (7)", () => {
    const service = makeService();
    const world = new LocalWorld();
    world.write("owner.add", { key: keyOf(BEN) }, OWNER, at(0, 1));
    const ben = new Client(service.hub, BEN);
    attach(ben, world, 64, world.sequencer(service.hub.key.key, BEN));
    expect(ben.codes()).toEqual([]);
    expect(ben.last("opened")?.role).toBe("owner");
    expect(verifyLog(world.id, ben.entries(world.id)).ok).toBe(true);
    const stranger = new Client(makeService().hub, VIC);
    attach(stranger, world, 64, world.sequencer(stranger.hub.key.key, VIC));
    expect(stranger.codes()).toEqual(["attach-not-owner"]);
  });

  it("attaches a never-attached mirror of the same log, re-receipted (8)", () => {
    const world = new LocalWorld({ ...GENESIS, cartridge });
    world.write("note", noteBody(), OWNER, at(0, 1));
    const dir = tempDir();
    const store = new FileStore(dir);
    store.ensure();
    const imported = importWorld(store, worldFile(world.entries), at(2));
    if (!imported.ok) throw new Error(imported.error.message);
    const service = makeService({ dir });
    const owner = new Client(service.hub, OWNER);
    attach(owner, world);
    expect(owner.codes()).toEqual([]);
    const log = owner.entries(world.id);
    expect(log).toHaveLength(world.entries.length + 1);
    expect(verifyLog(world.id, log).ok).toBe(true);
    expect(makeService({ dir }).hub.broken.size).toBe(0);
  });

  it("keeps D9's open-worlds limit (9)", () => {
    const service = makeService({ limits: { openWorlds: 1 } });
    const owner = new Client(service.hub, OWNER);
    attach(owner, new LocalWorld());
    attach(owner, new LocalWorld({ name: "Another" }));
    expect(owner.codes()).toEqual(["quota-open-worlds"]);
  });
});

describe("submit", () => {
  it("answers with the door before the visitors' quotas (10)", () => {
    const service = makeService({ limits: { newVisitorKeysPerIp: 0 } });
    const world = new LocalWorld();
    world.write("access", { policy: "public" }, OWNER, at(0, 1));
    attach(new Client(service.hub, OWNER), world);
    const visitor = new Client(service.hub, VIC, "10.9.9.9");
    visitor.open(world.id);
    const place = {
      kind: "otherworld" as const,
      title: "A door",
      at: { cx: 3, cz: 4 },
      seed: 1,
      work: {
        workId: "w",
        version: "1.0.0",
        contentHash: `sha256:${"a".repeat(64)}`,
        pack: `sha256:${"b".repeat(64)}`,
      },
    };
    visitor.submit(
      world.id,
      sign(world.id, "place", place as never, VIC, headOf(service.hub, world.id)),
    );
    expect(visitor.codes()).toEqual(["access-visitor-kind"]);
  });
});

describe("GET /v1/worlds/<id>/export (13)", () => {
  it("serves readers a file that verifies, and nobody else", async () => {
    const { s2, world, old } = mirrored();
    const path = `/v1/worlds/${world.id}/export`;
    const get = (who: Uint8Array) =>
      handleHttp(
        { hub: s2.hub, test: false, advance: () => 0 },
        new Request(`http://127.0.0.1${path}`, {
          headers: {
            "x-unmapped-auth": blobAuthHeader(who, {
              method: "GET",
              path,
              ts: Math.floor(Date.now() / 1000),
              body: new Uint8Array(0),
            }),
          },
        }),
      );
    expect((await get(VIC)).status).toBe(403);
    const got = await get(BEN);
    expect(got.status).toBe(200);
    const { report } = verifyWorldFile(new Uint8Array(await got.arrayBuffer()));
    expect(report.problems).toEqual([]);
    expect(report.entries).toBe(old.length);
    expect(report.exportedBy).toBe(s2.hub.key.key);
  });
});
