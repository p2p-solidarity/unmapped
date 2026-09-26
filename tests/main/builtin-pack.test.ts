// The pack a shared built-in world's owner announces (rev 6 phase 4, D7: main/histories/
// builtInPack.ts). E2E shows the one pack a phone draws from; it cannot show a race between two
// passes or two owners' devices, nor a revision that only claims the shipped id@version.
//
// Failure modes guarded here, written before the code (each test names one):
// 1. Two passes started together (attach's own and the `opened` right after it, or two reconnects
//    close together) both sign a `pack`: two events for the same hash.
// 2. A world whose pack is already announced, queued in the outbox or sequenced, gets another one at
//    its next open.
// 3. A co-owner's device opening the world while the first owner's does announces a second `pack`
//    (only the first current owner writes it; once the maker is removed, the next one does).
// 4. The `pack` is announced although the service did not take the blob: a phone is sent to a pack
//    it cannot fetch.
// 5. A genesis that pins the shipped id@version under another content hash gets the shipped
//    revision's pack announced (admit checks only the hash the body names, so a phone would be
//    handed another revision than the genesis's).

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ensureBaseGame } from "@main/game/base";
import { announceBuiltInPack } from "@main/histories/builtInPack";
import type { HostCore } from "@main/histories/core";
import { DSL_HISTORY } from "@main/histories/dslSeam";
import { locked } from "@main/histories/fsx";
import type { LoadedWorld } from "@main/histories/loaded";
import type { DeviceKey } from "@main/identity/deviceKey";
import type { ContentHash } from "@shared/cartridge";
import { signatureVerdict, signEvent } from "@shared/history/sign";
import type { UnsignedEvent, UnsignedEventOf } from "@shared/history/types";
import { ok } from "@shared/result";
import type { WorldStatus } from "@shared/worldApi";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ANN, day, key, OWNER, SERVICE, World } from "../fixtures/history";

const AT = "ws://127.0.0.1:8799";

let root = "";
let cartridgesDir = "";
let shipped: ContentHash;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "unmapped-builtin-pack-"));
  cartridgesDir = join(root, "cartridges");
  const base = await ensureBaseGame(cartridgesDir);
  if (!base.ok) throw new Error(base.error.message);
  shipped = base.value.contentHash;
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

/** A world New game made on the newest shipped revision (or one only claiming its id@version). */
function builtInWorld(contentHash: ContentHash = shipped): World {
  return new World({
    cartridge: { cartridgeId: "aether-land", version: "1.3.0", contentHash },
    gates: [],
  });
}

/** The world as main holds it once attached: its fold, an outbox, a link to the service. */
function loaded(world: World, dir: string): LoadedWorld {
  return {
    id: world.id,
    dir,
    genesis: world.genesis,
    owner: key(OWNER),
    now: world.now,
    outbox: [],
    link: { v: 1, url: AT, key: key(SERVICE), attachedAt: day(0), diverged: null },
    ids: new Set(world.entries.map((entry) => entry.event.id)),
  } as unknown as LoadedWorld;
}

/**
 * A host core for `device` over one loaded world, with a service that counts blob PUTs and can
 * refuse them. `withWorld` queues like the real one, so passes interleave as they would.
 */
function hostFor(world: World, device: Uint8Array) {
  const held = loaded(world, join(root, "histories", world.id));
  const puts: string[] = [];
  const service = { refuse: false };
  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    await new Promise((resolve) => setTimeout(resolve, 5));
    if (init?.method !== "PUT") return new Response("", { status: 405 });
    if (service.refuse) return new Response('{"error":{"message":"busy"}}', { status: 503 });
    puts.push(String(input).slice(String(input).lastIndexOf("/") + 1));
    return new Response("{}", { status: 201 });
  }) as typeof fetch;
  const deviceKey = {
    author: key(device),
    signEvent: (unsigned: UnsignedEvent) => signEvent(unsigned as UnsignedEventOf<"pack">, device),
    blobAuth: () => "auth",
  } as unknown as DeviceKey;
  const status = { link: "online", role: "owner" } as WorldStatus;
  const core = {
    deps: {
      key: async () => ok(deviceKey),
      dsl: DSL_HISTORY,
      cartridgesDir,
      ensureBaseGame: () => ensureBaseGame(cartridgesDir),
      fetchImpl,
      broadcast: () => undefined,
    },
    blobsDir: join(root, "blobs"),
    sync: new Map(),
    verdictOf: DSL_HISTORY.entryVerdict,
    withWorld: <T>(id: string, run: (one: LoadedWorld) => Promise<T>) =>
      locked(`world:${id}`, () => run(held)),
    status: async () => status,
    nowIso: () => day(1),
    emitEntries: () => undefined,
    emitStatus: async () => undefined,
  } as unknown as HostCore;
  const packsQueued = () => held.outbox.filter((pending) => pending.event.kind === "pack");
  return { core, held, puts, service, packsQueued };
}

describe("a shared built-in world's pack", () => {
  it("is announced once when two passes start together (1)", async () => {
    const world = builtInWorld();
    const { core, puts, packsQueued } = hostFor(world, OWNER);
    const [a, b] = await Promise.all([
      announceBuiltInPack(core, world.id, AT),
      announceBuiltInPack(core, world.id, AT),
    ]);
    const hashes = [a, b].map((one) => (one.ok ? one.value : one.error.code));
    expect(hashes.filter((one) => one !== null)).toHaveLength(1);
    expect(packsQueued()).toHaveLength(1);
    const [pending] = packsQueued();
    expect(pending?.event.body).toMatchObject({ cartridge: shipped });
    expect(puts).toHaveLength(1);
  });

  it("is not announced again once queued or sequenced (2)", async () => {
    const world = builtInWorld();
    const { core, held, puts, packsQueued } = hostFor(world, OWNER);
    const first = await announceBuiltInPack(core, world.id, AT);
    expect(first.ok && first.value !== null).toBe(true);
    // Queued, not yet sequenced: the next open finds it in the outbox.
    expect(await announceBuiltInPack(core, world.id, AT)).toEqual(ok(null));
    // Sequenced: the service took it, the outbox emptied, the fold holds it.
    const [pending] = packsQueued();
    if (pending === undefined) throw new Error("no pack queued");
    world.append(pending.event, day(1), signatureVerdict(pending.event));
    held.now = world.now;
    held.outbox = [];
    expect(held.now.pack?.pack).toBe(first.ok ? first.value : null);
    expect(await announceBuiltInPack(core, world.id, AT)).toEqual(ok(null));
    expect(packsQueued()).toHaveLength(0);
    expect(puts).toHaveLength(1);
  });

  it("is written by the first current owner only (3)", async () => {
    const world = builtInWorld();
    world.join(ANN, "Ann", day(0, 1));
    world.write("owner.add", { key: key(ANN) }, OWNER, day(0, 2));
    const coOwner = hostFor(world, ANN);
    expect(await announceBuiltInPack(coOwner.core, world.id, AT)).toEqual(ok(null));
    expect(coOwner.packsQueued()).toHaveLength(0);
    expect(coOwner.puts).toHaveLength(0);
    // The maker's key removed as an owner: Ann is now the first, and she announces it.
    world.write("owner.remove", { key: key(OWNER) }, ANN, day(0, 3));
    const next = hostFor(world, ANN);
    const announced = await announceBuiltInPack(next.core, world.id, AT);
    expect(announced.ok && announced.value !== null).toBe(true);
    expect(next.packsQueued()).toHaveLength(1);
  });

  it("is announced only after the service took the blob (4)", async () => {
    const world = builtInWorld();
    const { core, puts, service, packsQueued } = hostFor(world, OWNER);
    service.refuse = true;
    const refused = await announceBuiltInPack(core, world.id, AT);
    expect(refused).toMatchObject({ ok: false, error: { code: "blob-http-failed" } });
    expect(packsQueued()).toHaveLength(0);
    service.refuse = false;
    const retried = await announceBuiltInPack(core, world.id, AT);
    expect(retried.ok && retried.value !== null).toBe(true);
    expect(puts).toHaveLength(1);
    expect(packsQueued()).toHaveLength(1);
  });

  it("is never the shipped revision's for a genesis pinning another hash (5)", async () => {
    const forged = `sha256:${"ab".repeat(32)}` as ContentHash;
    const world = builtInWorld(forged);
    const { core, puts, packsQueued } = hostFor(world, OWNER);
    const result = await announceBuiltInPack(core, world.id, AT);
    expect(result).toMatchObject({ ok: false, error: { code: "cartridge-missing" } });
    expect(puts).toHaveLength(0);
    expect(packsQueued()).toHaveLength(0);
  });
});
