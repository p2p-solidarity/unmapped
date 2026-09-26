// Co-owners, the chain opt-in and the light chain's answer on this device (rev 6 phase 4, D5, D6,
// app side) — isolated only where E2E cannot see the failure: what a device signs before the fold
// has judged it, who the door and the library treat as an owner, what a crafted invite link can make
// a preview claim, and what main reads when no chain is configured.
//
// Failure modes guarded here, written before the code (each test names one):
// 1. A device that owns nothing (a member, a visitor, an owner removed earlier) calls addOwner,
//    removeOwner or setChainRecording through IPC and main signs the event before the fold refuses
//    it: a signed owner event that could be replayed or queued exists at all.
// 2. The last owner is removed through IPC (`owner-last` must come back before anything is signed),
//    leaving a world nobody can change.
// 3. A co-owner's device is treated as a mere member: the door lists it as "member", hides the
//    invites it made (so they can no longer be revoked), and the library badges its world "joined".
// 4. A preview trusts an invite whose `&o=` path starts at a key that is not the world's maker (or
//    has no path at all while its signer is a co-owner): the door would show a stranger's world as
//    the one the link promises. Join refuses these; preview must refuse them the same way.
// 5. With no UNMAPPED_PROVENANCE_* configured (or half of it), `world.provenance` still reads the
//    log or builds an RPC client: the chain must be switchable off entirely.

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { provenanceReader } from "@main/chain/provenance";
import type { HostCore } from "@main/histories/core";
import { badgeKind, doorPeople, previewInvite, readDoor } from "@main/histories/door";
import { DSL_HISTORY } from "@main/histories/dslSeam";
import { issuedLineOf, recordIssued } from "@main/histories/issued";
import { fetchHistory } from "@main/histories/join";
import type { LoadedWorld } from "@main/histories/loaded";
import { addOwner, removeOwner, setChainRecording } from "@main/histories/owners";
import { readWorldProvenance } from "@main/histories/provenanceRead";
import type { DeviceKey } from "@main/identity/deviceKey";
import { inviteLink } from "@shared/history/access";
import { ownerPath } from "@shared/history/owners";
import { ok } from "@shared/result";
import type { WorldStatus } from "@shared/worldApi";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ANN, BEN, day, key, OWNER, SERVICE, VISITOR, World } from "../fixtures/history";

vi.mock("@main/histories/join", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@main/histories/join")>()),
  fetchHistory: vi.fn(),
}));

let root = "";

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "unmapped-owners-"));
});

afterEach(async () => {
  vi.unstubAllEnvs();
  await rm(root, { recursive: true, force: true });
});

/** The world as main holds it once attached: the fold, no outbox, a link to a service. */
function loaded(world: World, dir = root): LoadedWorld {
  return {
    id: world.id,
    dir,
    genesis: world.genesis,
    owner: key(OWNER),
    now: world.now,
    outbox: [],
    link: {
      v: 1,
      url: "wss://worlds.example",
      key: key(SERVICE),
      attachedAt: day(0),
      diverged: null,
    },
    ids: new Set(world.entries.map((entry) => entry.event.id)),
  } as unknown as LoadedWorld;
}

/**
 * A host core for `device` whose key records every kind it is asked to sign and then throws:
 * a refusal must come back as a value with nothing recorded, an admitted draft reaches signing.
 */
function coreFor(world: World, device: Uint8Array): { core: HostCore; signed: string[] } {
  const signed: string[] = [];
  const deviceKey = {
    author: key(device),
    signEvent: (unsigned: { kind: string }) => {
      signed.push(unsigned.kind);
      throw new Error("signed");
    },
  } as unknown as DeviceKey;
  const status = { link: "online", role: "owner" } as WorldStatus;
  const core = {
    deps: { key: async () => ok(deviceKey), dsl: DSL_HISTORY },
    withWorld: <T>(_id: string, run: (world: LoadedWorld) => Promise<T>) => run(loaded(world)),
    status: async () => status,
    nowIso: () => day(1),
  } as unknown as HostCore;
  return { core, signed };
}

/** Mira owns it; Ann and Ben joined as members; Ann became a co-owner, Ben was one and is not. */
function sharedWorld(): { world: World; annAdded: ReturnType<World["write"]> } {
  const world = new World();
  world.join(ANN, "Ann", day(0, 1));
  world.join(BEN, "Ben", day(0, 2));
  const annAdded = world.write("owner.add", { key: key(ANN) }, OWNER, day(0, 3));
  world.write("owner.add", { key: key(BEN) }, OWNER, day(0, 4));
  world.write("owner.remove", { key: key(BEN) }, ANN, day(0, 5));
  return { world, annAdded };
}

describe("owner actions through IPC", () => {
  it("refuses a device that owns nothing before anything is signed (1)", async () => {
    const { world } = sharedWorld();
    // Ben is a member whose ownership ended; the visitor never belonged at all.
    for (const device of [BEN, VISITOR]) {
      const calls = [
        (core: HostCore) => addOwner(core, world.id, key(device)),
        (core: HostCore) => removeOwner(core, world.id, key(ANN)),
        (core: HostCore) => setChainRecording(core, world.id, true),
      ];
      for (const call of calls) {
        const { core, signed } = coreFor(world, device);
        expect(await call(core)).toMatchObject({ ok: false, error: { code: "access-owner-only" } });
        expect(signed).toEqual([]);
      }
    }
    // The control: a co-owner's own device gets as far as signing each of them.
    for (const call of [
      (core: HostCore) => addOwner(core, world.id, key(VISITOR)),
      (core: HostCore) => removeOwner(core, world.id, key(OWNER)),
      (core: HostCore) => setChainRecording(core, world.id, true),
    ]) {
      const { core, signed } = coreFor(world, ANN);
      await expect(call(core)).rejects.toThrow("signed");
      expect(signed).toHaveLength(1);
    }
  });

  it("never removes the last owner, and says so before signing (2)", async () => {
    const alone = new World();
    const { core, signed } = coreFor(alone, OWNER);
    expect(await removeOwner(core, alone.id, key(OWNER))).toMatchObject({
      ok: false,
      error: { code: "owner-last" },
    });
    // After Ann stops owning it, Mira is the last owner again.
    const { world } = sharedWorld();
    world.write("owner.remove", { key: key(ANN) }, OWNER, day(0, 6));
    const again = coreFor(world, OWNER);
    expect(await removeOwner(again.core, world.id, key(OWNER))).toMatchObject({
      ok: false,
      error: { code: "owner-last" },
    });
    expect([...signed, ...again.signed]).toEqual([]);
  });
});

describe("a co-owner's device", () => {
  it("is listed, badged and served as an owner, its own invites included (3)", async () => {
    const { world, annAdded } = sharedWorld();
    const n = world.now.events[annAdded.id]?.n;
    const rows = doorPeople(world.now, key(ANN), world.now.head.n);
    expect(rows.map((row) => [row.kind, row.key, row.me])).toEqual([
      ["owner", key(OWNER), false],
      ["co-owner", key(ANN), true],
      ["member", key(BEN), false],
    ]);
    expect(rows[1]?.n).toBe(n);

    const here = { local: false, migrated: false };
    expect(badgeKind(world.now, { ...here, me: key(ANN) })).toBe("shared");
    expect(badgeKind(world.now, { ...here, me: key(BEN) })).toBe("joined");
    expect(badgeKind(world.now, { ...here, local: true, me: key(ANN) })).toBe("local");

    const ticket = world.invite({ by: ANN });
    await recordIssued(root, issuedLineOf(ticket.invite, day(0, 7)));
    const door = await readDoor(coreFor(world, ANN).core, world.id);
    expect(door.ok && door.value.invites.map((invite) => invite.nonce)).toEqual([
      ticket.invite.nonce,
    ]);
    // Ben made invites while he owned it; now that he does not, the door keeps them from him.
    const benDoor = await readDoor(coreFor(world, BEN).core, world.id);
    expect(benDoor.ok && benDoor.value.invites).toEqual([]);
  });
});

describe("previewing an invite by a co-owner", () => {
  /** A core whose network answers with `world`'s history, as the service would. */
  function previewCore(world: World): HostCore {
    vi.mocked(fetchHistory).mockResolvedValue(
      ok({ genesis: world.genesis, entries: world.entries, now: world.now }),
    );
    return {
      deps: {
        key: async () => ok({ author: key(VISITOR) }),
        instancesDir: join(root, "instances"),
        cartridgesDir: join(root, "cartridges"),
      },
      hub: { want: () => {}, ready: async () => true, send: () => ok(undefined), unwant: () => {} },
      worlds: new Map(),
      nowIso: () => day(1),
    } as unknown as HostCore;
  }

  it("refuses a path that does not start at the world's maker, like join (4)", async () => {
    const { world } = sharedWorld();
    const ticket = world.invite({ by: ANN });
    const real = ownerPath(world.now, key(ANN)) ?? [];
    expect(real).toHaveLength(1);
    // Ben signs an addition of Ann himself: a valid path, rooted at someone who never made it.
    const forged = [world.event("owner.add", { key: key(ANN) }, BEN)];
    for (const path of [forged, []]) {
      const link = inviteLink(ticket.invite, ticket.secret, path);
      expect(await previewInvite(previewCore(world), link)).toMatchObject({
        ok: false,
        error: { code: "join-invalid" },
      });
    }
    const good = await previewInvite(
      previewCore(world),
      inviteLink(ticket.invite, ticket.secret, real),
    );
    expect(good).toMatchObject({ ok: true, value: { world: world.id, owner: key(OWNER) } });
  });
});

describe("the light chain, switched off", () => {
  it("answers not-configured without reading the log or building a client (5)", async () => {
    const touched: string[] = [];
    const core = {
      get histories(): string {
        touched.push("histories");
        return root;
      },
    };
    const world = new World().id;
    const address = `0x${"ab".repeat(20)}`;
    const envs = [
      {},
      { rpcUrl: "https://rpc.example" },
      { address },
      { rpcUrl: "ws://rpc.example", address },
      { rpcUrl: "https://rpc.example", address: "0x1234" },
    ];
    for (const env of envs) {
      expect(await readWorldProvenance(core, world, () => provenanceReader(env))).toMatchObject({
        ok: false,
        error: { code: "provenance-not-configured" },
      });
    }
    // The IPC's own default reads main's env: empty there too.
    vi.stubEnv("UNMAPPED_PROVENANCE_RPC_URL", "");
    vi.stubEnv("UNMAPPED_PROVENANCE_ADDRESS", "");
    vi.stubEnv("UNMAPPED_PROVENANCE_CHAIN_ID", "");
    expect(await readWorldProvenance(core, world)).toMatchObject({
      ok: false,
      error: { code: "provenance-not-configured" },
    });
    expect(touched).toEqual([]);
    // The control: once configured, the log is what it reads first (none here, so it stops).
    expect(
      await readWorldProvenance(core, world, () =>
        provenanceReader({ rpcUrl: "https://rpc.example", address }),
      ),
    ).toMatchObject({ ok: false, error: { code: "history-missing" } });
    expect(touched).toEqual(["histories"]);
  });
});
