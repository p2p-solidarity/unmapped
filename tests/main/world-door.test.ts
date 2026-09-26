// The world's door on this device (rev 6 phase 3, D8, WP8) — isolated only where E2E cannot see the
// failure: what reaches the network before a link is trusted, what lands on disk, what a damaged
// file hides, and which service addresses an untrusted page may hand main.
//
// Failure modes guarded here (each test names one):
// 1. A malformed or tampered invite link reaches the network: preview (and join) must refuse it
//    before a socket is wanted or the device key is touched.
// 2. An invite whose owner signature does not verify reaches the network: preview and join must
//    refuse it before connecting to the service the link names.
// 3. The invite's one-time secret lands on this device's disk when the invite is remembered for
//    revoking; anyone who could read userData could then join as the owner's friend.
// 4. A torn or foreign line in issued-invites.jsonl hides the owner's other invites, so they can no
//    longer be revoked; a repeated line counts one invite twice.
// 5. A plain `ws://` address on another host (or one with credentials) is accepted as a world
//    service, by the device's list or by the IPC schema that guards `attach` and `probe`.
// 6. A key the owner removed keeps writing through IPC: its copy ends before its own
//    `member.remove`, so only the service's `access-removed` says so, and main still signs and
//    queues the renderer's drafts (the renderer is untrusted), its status still says it writes
//    (or says so again once a re-open resets the link), and what it queued before waits in the
//    outbox for good instead of being listed as refused.

import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { appendDraft } from "@main/histories/commit";
import { HostCore } from "@main/histories/core";
import { issueInvite, previewInvite } from "@main/histories/door";
import { DSL_HISTORY } from "@main/histories/dslSeam";
import { worldIpcSchemas } from "@main/histories/ipcSchemas";
import { ISSUED_FILE, readIssued } from "@main/histories/issued";
import { joinWorld } from "@main/histories/join";
import type { LoadedWorld } from "@main/histories/loaded";
import { readRefused } from "@main/histories/logStore";
import { onFrame } from "@main/histories/syncWorld";
import type { DeviceKey } from "@main/identity/deviceKey";
import { normalizeServiceUrl, parseServiceList } from "@renderer/net/worldServices";
import { inviteLink } from "@shared/history/access";
import { base32, base64Url, sha256Bytes } from "@shared/history/ids";
import { authorKeyFor, signEvent, signInvite } from "@shared/history/sign";
import type { UnsignedEventOf, UnsignedInvite } from "@shared/history/types";
import { ok } from "@shared/result";
import type { WorldEntriesEvent, WorldStatus } from "@shared/worldApi";
import type { FromService } from "@shared/worldProtocol";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { BEN, day, key, note, pending, World } from "../fixtures/history";

const secret = (name: string) => sha256Bytes(`world-door-test:${name}`);
const OWNER = secret("owner");
const INVITE = secret("invite");
const WORLD = `h${base32(sha256Bytes("world-door-test:world"))}`;

const unsigned: UnsignedInvite = {
  v: 1,
  world: WORLD,
  svc: "wss://worlds.example",
  by: authorKeyFor(OWNER),
  key: authorKeyFor(INVITE),
  nonce: "abcdefghijklmnop",
  exp: "2026-10-01T00:00:00.000Z",
  uses: 2,
};
const LINK = inviteLink(signInvite(unsigned, OWNER), INVITE);

/** A core whose network and key blow up when touched, so "refused first" is observable. */
function untouchable(): { core: HostCore; touched: string[] } {
  const touched: string[] = [];
  const trap = (what: string) => () => {
    touched.push(what);
    throw new Error(`touched ${what}`);
  };
  const core = {
    deps: { key: trap("key") },
    hub: { want: trap("hub.want"), ready: trap("hub.ready"), send: trap("hub.send") },
    nowIso: () => "2026-09-27T09:00:00.000Z",
  } as unknown as HostCore;
  return { core, touched };
}

let root = "";

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "unmapped-door-"));
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("invite links before the network", () => {
  it("refuses malformed and tampered links without a key or a socket (1)", async () => {
    const [, encoded = ""] = /i=([^&]+)/.exec(LINK) ?? [];
    // The first character carries the invite's opening brace: flipped, it is no JSON at all.
    const flipped = `${encoded.startsWith("e") ? "f" : "e"}${encoded.slice(1)}`;
    const links = [
      "https://example.com/join",
      LINK.replace(/&k=.*$/, ""),
      LINK.replace(encoded, flipped),
      `${LINK.slice(0, -4)}!!!!`,
      // The right invite with another invite's secret: the secret must be the invite's own key.
      inviteLink(signInvite(unsigned, OWNER), secret("someone else")),
    ];
    for (const link of links) {
      const { core, touched } = untouchable();
      expect(await previewInvite(core, link), link).toMatchObject({
        ok: false,
        error: { code: "invite-link-invalid" },
      });
      expect(await joinWorld(core, link, "Bea"), link).toMatchObject({
        ok: false,
        error: { code: "invite-link-invalid" },
      });
      expect(touched, link).toEqual([]);
    }
  });

  it("refuses an invite the owner did not sign, before connecting to its service (2)", async () => {
    // Pointed at another service after signing: the link still reads, the signature does not.
    const moved = { ...signInvite(unsigned, OWNER), svc: "wss://elsewhere.example" };
    const forged = inviteLink(moved, INVITE);
    const { core, touched } = untouchable();
    expect(await previewInvite(core, forged)).toMatchObject({
      ok: false,
      error: { code: "invite-sig-invalid" },
    });
    expect(await joinWorld(core, forged, "Bea")).toMatchObject({
      ok: false,
      error: { code: "invite-sig-invalid" },
    });
    expect(touched).toEqual([]);
  });
});

describe("invites remembered for revoking", () => {
  it("writes the nonce, expiry and uses, never the invite's secret (3)", async () => {
    const dir = join(root, "world");
    await mkdir(dir, { recursive: true });
    const host = {
      core: {
        withWorld: (_id: string, run: (world: { dir: string }) => Promise<unknown>) => run({ dir }),
        nowIso: () => "2026-09-27T09:00:00.000Z",
      },
      invite: async () => ok({ link: LINK, exp: unsigned.exp, uses: unsigned.uses }),
    } as unknown as Parameters<typeof issueInvite>[0];
    const made = await issueInvite(host, WORLD, { uses: 2, days: 4 });
    expect(made).toEqual({ ok: true, value: { link: LINK, exp: unsigned.exp, uses: 2 } });
    const text = await readFile(join(dir, ISSUED_FILE), "utf8");
    expect(JSON.parse(text)).toEqual({
      v: 1,
      nonce: unsigned.nonce,
      exp: unsigned.exp,
      uses: 2,
      at: "2026-09-27T09:00:00.000Z",
    });
    expect(text).not.toContain(base64Url(INVITE));
    expect(text).not.toContain("unmapped://");
  });

  it("keeps every readable invite when a line is torn or foreign, and each once (4)", async () => {
    const dir = join(root, "world");
    const line = (nonce: string) =>
      JSON.stringify({ v: 1, nonce, exp: unsigned.exp, uses: 1, at: "2026-09-27T09:00:00.000Z" });
    await writeIssuedFile(dir, [
      line("aaaaaaaaaaaaaaaa"),
      '{"v":1,"nonce":"bbbb',
      JSON.stringify({ v: 1, nonce: "cccccccccccccccc", exp: unsigned.exp, uses: 1, link: LINK }),
      line("dddddddddddddddd"),
      line("aaaaaaaaaaaaaaaa"),
      '{"v":1,"nonce":"eeeeeeeeeeeeeeee","exp":"2026-10-01T00:00:00.000Z","uses":1,"at":"2026-09',
    ]);
    const read = await readIssued(dir);
    expect(read.ok && read.value.map((one) => one.nonce)).toEqual([
      "aaaaaaaaaaaaaaaa",
      "dddddddddddddddd",
    ]);
  });
});

async function writeIssuedFile(dir: string, lines: string[]): Promise<void> {
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, ISSUED_FILE), `${lines.join("\n")}\n`, "utf8");
}

describe("world service addresses", () => {
  const refused = [
    "ws://example.com:8787",
    "ws://192.168.1.20:8787",
    "ws://user:secret@127.0.0.1:8787",
    "wss://user@worlds.example",
    "http://127.0.0.1:8787",
    "https://worlds.example",
    "worlds.example",
  ];
  const accepted = [
    "ws://127.0.0.1:8787",
    "ws://localhost:8787",
    "ws://[::1]:8787",
    "wss://w.example",
  ];

  it("takes wss:// anywhere and ws:// only on loopback, in the list and in main (5)", () => {
    for (const url of refused) {
      expect(normalizeServiceUrl(url), url).toBeNull();
      expect(worldIpcSchemas.probe.safeParse([url]).success, url).toBe(false);
      expect(worldIpcSchemas.attach.safeParse([WORLD, url]).success, url).toBe(false);
    }
    for (const url of accepted) {
      expect(normalizeServiceUrl(`${url}/`), url).toBe(url);
      expect(worldIpcSchemas.probe.safeParse([url]).success, url).toBe(true);
    }
    expect(parseServiceList(`${accepted.join(",\n")} ws://example.com ${accepted[0]}/`)).toEqual({
      urls: accepted,
      invalid: ["ws://example.com"],
    });
  });
});

describe("a key the service removed", () => {
  const SERVICE_URL = "wss://worlds.example";

  /** Ben's device: a member of Mira's shared world, with two events it queued offline. */
  async function bensDevice() {
    const world = new World();
    world.join(BEN, "Ben", day(0, 1));
    const signed: string[] = [];
    const device = {
      author: key(BEN),
      signEvent: (unsigned: Parameters<DeviceKey["signEvent"]>[0]) => {
        signed.push(unsigned.kind);
        return signEvent(unsigned, BEN);
      },
    } as unknown as DeviceKey;
    const sent: { channel: string; payload: unknown }[] = [];
    const core = new HostCore({
      userData: root,
      cartridgesDir: join(root, "cartridges"),
      instancesDir: join(root, "instances"),
      works: { worksDir: "", playsDir: "", draftsDir: "" },
      dsl: DSL_HISTORY,
      key: async () => ok(device),
      clock: () => new Date(day(1)),
      broadcast: (channel, payload) => sent.push({ channel, payload }),
      ensureBaseGame: async () => ok(undefined),
    });
    const dir = join(root, "histories", world.id);
    await mkdir(dir, { recursive: true });
    const queued = ["one", "two"].map((text) => {
      const body = { ...note([]), text, name: "Ben" };
      const unsigned = { v: 1, world: world.id, kind: "note", author: key(BEN), at: day(0, 5) };
      return pending(signEvent({ ...unsigned, seen: 2, body } as UnsignedEventOf<"note">, BEN));
    });
    const loaded = {
      id: world.id,
      dir,
      genesis: world.genesis,
      owner: world.genesis.author,
      ids: new Set(world.entries.map((entry) => entry.event.id)),
      cursor: { n: world.now.head.n, chain: world.now.head.chain, rt: world.now.rt },
      schedule: [],
      base: null,
      tail: world.verdictEntries(),
      now: world.now,
      outbox: queued,
      link: { v: 1, url: SERVICE_URL, key: key(BEN), attachedAt: day(0), diverged: null },
    } as unknown as LoadedWorld;
    core.worlds.set(world.id, loaded);
    // Connecting: nothing is sent (no socket here), so a queued draft stays in the outbox.
    core.setSync(world.id, { url: SERVICE_URL, link: "connecting", error: null });
    return { world, loaded, core, signed, sent };
  }

  it("signs nothing more, reads as removed, and lists what it queued as refused (6)", async () => {
    const { world, loaded, core, signed, sent } = await bensDevice();
    const noteDraft = { kind: "note", body: { ...note([]), name: "Ben" }, seen: world.now.head.n };
    // The control: a member's draft is signed and queued (its third event).
    expect(await appendDraft(core, world.id, noteDraft as never)).toMatchObject({ ok: true });
    expect(signed).toEqual(["note"]);
    expect((await core.status(loaded)).writable).toBe(true);
    expect(loaded.outbox).toHaveLength(3);

    const refusal = {
      t: "refused",
      world: world.id,
      error: { code: "access-removed", message: "The owner removed this key from the world." },
    } as FromService;
    await onFrame(core, SERVICE_URL, refusal);

    const status: WorldStatus = await core.status(loaded);
    expect(status).toMatchObject({ role: "removed", writable: false, pending: 0, refused: 3 });
    expect(loaded.outbox).toEqual([]);
    const refused = await readRefused(loaded.dir);
    expect(refused.ok && refused.value.active.map((one) => one.error.code)).toEqual([
      "access-removed",
      "access-removed",
      "access-removed",
    ]);
    const entries = sent.filter((one) => one.channel === "world:entries");
    const last = entries.at(-1)?.payload as WorldEntriesEvent | undefined;
    expect(last?.pending).toEqual([]);

    // A `read` re-opens a refused world (the link reads "connecting" again): the removal holds.
    core.setSync(world.id, { url: SERVICE_URL, link: "connecting", error: null });
    expect(await core.status(loaded)).toMatchObject({ role: "removed", writable: false });
    // Every kind the renderer may draft, and an owner action, is refused before signing.
    const drafts = [
      noteDraft,
      { kind: "visit", body: { chunks: [{ cx: 0, cz: 0 }] }, seen: world.now.head.n },
      { kind: "profile", body: { name: "Ben" }, seen: world.now.head.n },
    ];
    for (const draft of drafts) {
      expect(await appendDraft(core, world.id, draft as never), draft.kind).toMatchObject({
        ok: false,
        error: { code: "access-removed" },
      });
    }
    const door = await appendDraft(core, world.id, (now) => ({
      kind: "access",
      body: { policy: "public" },
      seen: now.now.head.n,
    }));
    expect(door).toMatchObject({ ok: false, error: { code: "access-removed" } });
    expect(signed).toEqual(["note"]);
    expect(loaded.outbox).toEqual([]);
  });
});
