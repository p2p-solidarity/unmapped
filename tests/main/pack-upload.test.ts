// Packs this device announced, uploaded once per service (rev 6 phase 3, D10, D11): an otherworld
// placed while an attached world was offline must reach friends when the link comes back, and a
// reconnect must never send a pack the service already has. Isolated because E2E sees only the
// end state (a friend can open the place), not how many times a 32 MiB pack crossed the wire.
//
// Failure modes guarded here (each test names one):
// 1. A pack the service already confirmed is sent again at the next reconnect.
// 2. A failed upload is forgotten: the next reconnect does not try it again.
// 3. Two reconnects close together send the same pack twice (their passes overlap).
// 4. Packs someone else announced (this device only fetched them) are sent back up from here.
// 5. A place still in the outbox (added offline, not sequenced yet) has its pack left behind.
// 6. The record of one service stops the packs from going to another (a new URL).

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { putBlob } from "@main/blobs/store";
import type { HostCore } from "@main/histories/core";
import type { LoadedWorld } from "@main/histories/loaded";
import { ownPacks, uploadOwnPacks } from "@main/histories/workPacks";
import type { DeviceKey } from "@main/identity/deviceKey";
import type { ContentHash } from "@shared/cartridge";
import { base32, sha256Bytes } from "@shared/history/ids";
import { authorKeyFor, signEvent } from "@shared/history/sign";
import { ok } from "@shared/result";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const SECRET = sha256Bytes("pack-upload-test:me");
const ME = authorKeyFor(SECRET);
const OTHER = authorKeyFor(sha256Bytes("pack-upload-test:other"));
const WORLD = `h${base32(sha256Bytes("pack-upload-test:world"))}`;
const URL_A = "ws://127.0.0.1:8787";
const URL_B = "ws://127.0.0.1:8788";
const CONTENT = `sha256:${"c".repeat(64)}` as ContentHash;

let root = "";
let blobsDir = "";

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "unmapped-packs-"));
  blobsDir = join(root, "blobs");
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

async function blob(text: string): Promise<ContentHash> {
  const stored = await putBlob(blobsDir, new TextEncoder().encode(text));
  if (!stored.ok) throw new Error(stored.error.message);
  return stored.value.hash;
}

const work = (id: string, pack: ContentHash) => ({
  workId: id,
  version: "1.0.0",
  contentHash: CONTENT,
  pack,
});

/** An otherworld place this device wrote while offline: still in the outbox. */
function queuedPlace(pack: ContentHash) {
  const event = signEvent(
    {
      v: 1,
      world: WORLD,
      kind: "place",
      author: ME,
      at: "2026-09-26T10:00:00.000Z",
      seen: 3,
      body: {
        kind: "otherworld",
        title: "The queued door",
        at: { cx: 2, cz: 0 },
        seed: 7,
        work: work("queued", pack),
      },
    },
    SECRET,
  );
  return { event, verdict: { ok: true as const } };
}

interface Packs {
  cartridge: ContentHash;
  mine: ContentHash;
  theirs: ContentHash;
  queued: ContentHash;
}

async function world(): Promise<{ world: LoadedWorld; packs: Packs }> {
  const packs = {
    cartridge: await blob("cartridge pack"),
    mine: await blob("my work pack"),
    theirs: await blob("their work pack, fetched from the service"),
    queued: await blob("a pack placed offline"),
  };
  const now = {
    owner: ME,
    owners: { [ME]: { removed: null } },
    pack: { cartridge: CONTENT, pack: packs.cartridge, bytes: 14 },
    places: [
      { author: ME, body: { kind: "otherworld", work: work("mine", packs.mine) } },
      { author: OTHER, body: { kind: "otherworld", work: work("theirs", packs.theirs) } },
    ],
    chapters: {},
  };
  const loaded = {
    id: WORLD,
    dir: join(root, "histories", WORLD),
    now,
    outbox: [queuedPlace(packs.queued)],
  } as unknown as LoadedWorld;
  return { world: loaded, packs };
}

/** A service that counts PUTs by hash and can refuse the next upload of one. */
function service() {
  const puts: string[] = [];
  const refuse = new Set<string>();
  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    const hex = url.slice(url.lastIndexOf("/") + 1);
    await new Promise((resolve) => setTimeout(resolve, 5));
    if (init?.method !== "PUT") return new Response("", { status: 405 });
    if (refuse.delete(hex)) return new Response('{"error":{"message":"busy"}}', { status: 503 });
    puts.push(hex);
    return new Response("{}", { status: 201 });
  }) as typeof fetch;
  const key = { author: ME, blobAuth: () => "auth" } as unknown as DeviceKey;
  const core = {
    blobsDir,
    deps: { key: async () => ok(key), fetchImpl },
  } as unknown as Pick<HostCore, "blobsDir" | "deps">;
  return { core, puts, refuse };
}

const hex = (hash: ContentHash) => hash.slice("sha256:".length);

describe("packs this device announced", () => {
  it("sends each once, then never again at the next reconnect (1)", async () => {
    const { world: loaded, packs } = await world();
    const { core, puts } = service();
    const first = await uploadOwnPacks(core, loaded, URL_A);
    expect(first.failed).toEqual([]);
    expect(puts.sort()).toEqual([packs.cartridge, packs.mine, packs.queued].map(hex).sort());
    const again = await uploadOwnPacks(core, loaded, URL_A);
    expect(again.sent).toEqual([]);
    expect(puts).toHaveLength(3);
  });

  it("tries a failed upload again at the next reconnect, and only that one (2)", async () => {
    const { world: loaded, packs } = await world();
    const { core, puts, refuse } = service();
    refuse.add(hex(packs.queued));
    const first = await uploadOwnPacks(core, loaded, URL_A);
    expect(first.failed.map((one) => one.hash)).toEqual([packs.queued]);
    expect(puts).not.toContain(hex(packs.queued));
    const second = await uploadOwnPacks(core, loaded, URL_A);
    expect(second.sent).toEqual([packs.queued]);
    expect(puts.filter((one) => one === hex(packs.queued))).toHaveLength(1);
    expect(puts).toHaveLength(3);
  });

  it("sends a pack once when two reconnects come close together (3)", async () => {
    const { world: loaded } = await world();
    const { core, puts } = service();
    await Promise.all([uploadOwnPacks(core, loaded, URL_A), uploadOwnPacks(core, loaded, URL_A)]);
    expect(puts).toHaveLength(3);
    expect(new Set(puts).size).toBe(3);
  });

  it("leaves others' packs on the service and takes the outbox's along (4, 5)", async () => {
    const { world: loaded, packs } = await world();
    const mine = ownPacks(loaded, ME);
    expect(mine).not.toContain(packs.theirs);
    expect(mine).toContain(packs.queued);
    // A device that does not own the world does not upload its cartridge pack either.
    expect(ownPacks(loaded, OTHER)).toEqual([packs.theirs]);
  });

  it("sends every pack to a service it has not confirmed them to (6)", async () => {
    const { world: loaded } = await world();
    const { core, puts } = service();
    await uploadOwnPacks(core, loaded, URL_A);
    const moved = await uploadOwnPacks(core, loaded, URL_B);
    expect(moved.sent).toHaveLength(3);
    expect(puts).toHaveLength(6);
  });
});
