// The world service's log (rev 6 phase 3, WP4: D2 attach, D4 snapshots, D10 storage, D13 beats).
// Only what E2E cannot reach: signatures, receipts and chains over many entries, a log changed on
// disk, crashes. What this file guards, written before the code:
//   1. Attach re-receipts wrongly: entries 1..k change n, rt or chain; a receipt does not verify
//      under the D2 schedule (s1 = k + 1 installs the service key, which covers 1..s1 and after);
//      rt(k + 1) goes before rt(k); a later submit is not receipted with the same key.
//   2. Attach takes what it must refuse: an upload not starting at the genesis, from a key that is
//      not the genesis author, with a broken chain or a receipt already on it, an rt(k) more than
//      300 s ahead (`attach-rt-future`), a sequencer naming another key, a world already held
//      (unless it is the very same log and sequencer again: a retry must not be stuck forever).
//   3. A restart trusts its disk: a tampered event, receipt or chain is served instead of refused;
//      a torn last line (a crash mid-append) loses the world instead of being set aside; a refold
//      from a snapshot differs from a refold from scratch.
//   4. The service key is regenerated over an unreadable key file (every world would stop verifying).
//   5. A beat the service writes differs from `computeBeat` (every client would skip it), or a
//      beat that changes nothing is written anyway.

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { computeBeat } from "@shared/history/beat";
import { DAY_MS } from "@shared/history/ids";
import { receiptKeyAt, verifyLog } from "@shared/history/log";
import { verifyReceipt } from "@shared/history/sign";
import { describe, expect, it } from "vitest";
import { beatPass } from "../../src/service/beats";
import { KEY_FILE, loadServiceKey } from "../../src/service/keyFile";
import {
  ANN,
  at,
  attach,
  Client,
  headOf,
  LocalWorld,
  makeService,
  noteBody,
  OWNER,
  sign,
  tempDir,
  witnessBody,
} from "./support";

/** A local world with a few entries, attached by its owner; returns the owner's client. */
function attached(per = 2) {
  const service = makeService();
  const world = new LocalWorld();
  world.write("profile", { name: "Mira" }, OWNER, at(0, 1));
  world.write("witness", witnessBody(3, 0, "Reed Ford"), OWNER, at(1));
  world.write("note", noteBody(), OWNER, at(2));
  const owner = new Client(service.hub, OWNER);
  attach(owner, world, per);
  return { ...service, world, owner };
}

describe("attach (1, 2)", () => {
  it("keeps 1..k byte for byte and receipts 1..s1 under the service key", () => {
    const { hub, world, owner } = attached();
    const k = world.entries.length;
    expect(owner.codes()).toEqual([]);
    expect(owner.last("opened")).toMatchObject({ world: world.id, role: "owner" });
    const log = owner.entries(world.id);
    expect(log).toHaveLength(k + 1);
    for (const [index, local] of world.entries.entries()) {
      const served = log[index];
      expect(served).toMatchObject({ n: local.n, rt: local.rt, chain: local.chain });
      expect(served?.event).toEqual(local.event);
    }
    const s1 = log[k];
    expect(s1?.event.kind).toBe("sequencer");
    expect(Date.parse(s1?.rt ?? "") >= Date.parse(log[k - 1]?.rt ?? "")).toBe(true);
    const checked = verifyLog(world.id, log);
    expect(checked.ok).toBe(true);
    if (!checked.ok) return;
    expect(checked.value.schedule).toEqual([{ n: k + 1, id: s1?.event.id, key: hub.key.key }]);
    expect(receiptKeyAt(checked.value.schedule, 1)).toBe(hub.key.key);
    for (const entry of log) {
      expect(verifyReceipt(hub.key.key, entry.chain, entry.rsig ?? "")).toBe(true);
    }

    owner.clear();
    owner.submit(world.id, sign(world.id, "profile", { name: "Mira K" }, OWNER, k + 1));
    const next = owner.entries(world.id);
    expect(next.map((entry) => entry.n)).toEqual([k + 2]);
    expect(verifyLog(world.id, [...log, ...next]).ok).toBe(true);
  });

  it("refuses uploads it must not take", () => {
    const { hub } = makeService();
    const world = new LocalWorld();
    world.write("profile", { name: "Mira" }, OWNER, at(0, 1));
    const refusal = (client: Client) => client.last("refused")?.error.code;

    const stranger = new Client(hub, ANN);
    attach(stranger, world);
    expect(refusal(stranger)).toBe("attach-not-owner");

    const owner = new Client(hub, OWNER);
    owner.send({ t: "attach", world: world.id, entries: world.entries.slice(1), last: false });
    expect(refusal(owner)).toBe("attach-no-genesis");

    const [genesis, profile] = world.entries;
    if (genesis === undefined || profile === undefined) throw new Error("no entries");
    const broken = { ...profile, chain: `sha256:${"0".repeat(64)}` };
    owner.send({ t: "attach", world: world.id, entries: [genesis, broken], last: false });
    expect(refusal(owner)).toBe("entry-chain-broken");

    owner.send({
      t: "attach",
      world: world.id,
      entries: [genesis, { ...profile, rsig: "A".repeat(86) }],
      last: false,
    });
    expect(refusal(owner)).toBe("entry-rsig-unexpected");

    attach(owner, world, 64, world.sequencer(stranger.key));
    expect(refusal(owner)).toBe("attach-sequencer-key");

    const ahead = new LocalWorld({ name: "Ahead" });
    ahead.write(
      "profile",
      { name: "Mira" },
      OWNER,
      new Date(hub.clock.now() + 301_000).toISOString(),
    );
    attach(owner, ahead);
    expect(refusal(owner)).toBe("attach-rt-future");
    expect(hub.worlds.size).toBe(0);

    attach(owner, world);
    expect(owner.last("opened")?.world).toBe(world.id);
    const head = headOf(hub, world.id);
    expect(head).toBe(world.entries.length + 1);

    // A retry after a lost answer: the same log and sequencer get the same answer, nothing more.
    const retry = new Client(hub, OWNER);
    attach(retry, world, 1);
    expect(retry.codes()).toEqual([]);
    expect(retry.last("opened")?.role).toBe("owner");
    expect(retry.entries(world.id)).toEqual(owner.entries(world.id));
    const elsewhere = { url: "wss://elsewhere.example", key: hub.key.key };
    attach(retry, world, 64, sign(world.id, "sequencer", elsewhere, OWNER, world.now.head.n));
    expect(refusal(retry)).toBe("attach-world-exists");
    attach(stranger, world);
    expect(refusal(stranger)).toBe("attach-world-exists");
    expect(headOf(hub, world.id)).toBe(head);
  });
});

describe("restart (3, 4)", () => {
  it("re-verifies the log and folds the same from a snapshot as from scratch", () => {
    const first = attached();
    const { world, owner, dir } = first;
    owner.submit(
      world.id,
      sign(world.id, "note", noteBody("again"), OWNER, headOf(first.hub, world.id)),
    );
    const before = first.hub.worlds.get(world.id);
    first.hub.shutdown();

    const again = makeService({ dir });
    const reloaded = again.hub.worlds.get(world.id);
    expect(reloaded?.head).toEqual(before?.head);
    expect(JSON.stringify(reloaded?.now)).toBe(JSON.stringify(before?.now));
    expect(reloaded?.snapshotN).toBe(before?.head.n);

    writeFileSync(join(dir, "worlds", world.id, "snapshot.json"), "{}");
    const scratch = makeService({ dir });
    expect(JSON.stringify(scratch.hub.worlds.get(world.id)?.now)).toBe(JSON.stringify(before?.now));
    expect(JSON.stringify(scratch.hub.worlds.get(world.id)?.state.usage)).toBe(
      JSON.stringify(before?.state.usage),
    );
  });

  it("refuses a tampered log and sets aside a torn last line", () => {
    const { world, dir } = attached();
    const path = join(dir, "worlds", world.id, "log.jsonl");
    const good = readFileSync(path, "utf8");

    writeFileSync(path, good.replace("Reed Ford", "Reed Fort"));
    const tampered = makeService({ dir });
    expect(tampered.hub.worlds.has(world.id)).toBe(false);
    expect(tampered.hub.broken.get(world.id)?.code).toBe("world-log-invalid");
    const reader = new Client(tampered.hub, OWNER);
    reader.open(world.id);
    expect(reader.last("refused")?.error.code).toBe("world-log-invalid");
    attach(reader, world);
    expect(reader.last("refused")?.error.code).toBe("world-log-invalid");

    const lines = good.trimEnd().split("\n");
    const entry = JSON.parse(lines[2] ?? "{}");
    entry.rsig = JSON.parse(lines[1] ?? "{}").rsig;
    lines[2] = JSON.stringify(entry);
    writeFileSync(path, `${lines.join("\n")}\n`);
    expect(makeService({ dir }).hub.broken.get(world.id)?.code).toBe("world-log-invalid");

    writeFileSync(path, `${good}{"n":99,"rt":"2026-10`);
    const torn = makeService({ dir });
    expect(torn.hub.worlds.get(world.id)?.head.n).toBe(world.entries.length + 1);
    expect(readFileSync(path, "utf8")).toBe(good);
  });

  it("never makes a new key over an unreadable key file", () => {
    const dir = tempDir();
    const made = loadServiceKey(dir);
    expect(made.ok && made.value.created).toBe(true);
    const path = join(dir, KEY_FILE);
    const again = loadServiceKey(dir);
    expect(again.ok && again.value.key.key).toBe(made.ok ? made.value.key.key : "");
    writeFileSync(path, "{ not json");
    expect(loadServiceKey(dir)).toMatchObject({
      ok: false,
      error: { code: "service-key-unreadable" },
    });
    expect(readFileSync(path, "utf8")).toBe("{ not json");
    writeFileSync(path, JSON.stringify({ v: 1, key: "k".padEnd(53, "a"), secret: "AAAA" }));
    expect(loadServiceKey(dir)).toMatchObject({
      ok: false,
      error: { code: "service-key-unreadable" },
    });
  });
});

describe("beats (5)", () => {
  it("writes the beat computeBeat gives, and none that changes nothing", () => {
    const { hub, clock, world, owner } = attached();
    clock.ms += 6 * 60 * 60 * 1000;
    const due = hub.worlds.get(world.id)?.now;
    if (due === undefined) throw new Error("no world");
    const expected = computeBeat(due, new Date(clock.ms).toISOString());
    owner.clear();
    const [report] = beatPass(hub);
    expect(report?.n).toBe(due.head.n + 1);
    const [entry] = owner.entries(world.id);
    expect(entry?.event.kind).toBe("beat");
    expect(entry?.event.author).toBe(hub.key.key);
    expect(expected.ok && entry?.event.body).toEqual(expected.ok ? expected.value.body : null);
    const folded = hub.worlds.get(world.id)?.now;
    expect(folded?.beats).toHaveLength(1);
    expect(folded?.ignored.filter((one) => !one.pending)).toEqual([]);

    clock.ms += 60_000;
    expect(beatPass(hub)).toEqual([]);
    clock.ms += 6 * 60 * 60 * 1000;
    const quietOrNot = beatPass(hub);
    expect(quietOrNot).toHaveLength(1);

    clock.ms += 90 * DAY_MS;
    const [fog] = beatPass(hub);
    expect(fog?.n).not.toBeNull();
    expect(hub.worlds.get(world.id)?.now.chunks["3,0"]?.fogged).toBe(true);
  });

  it("stays silent on a world where nothing would change", () => {
    const { hub, clock } = makeService();
    const world = new LocalWorld();
    const owner = new Client(hub, OWNER);
    attach(owner, world);
    // Ten days after the genesis the season has turned once: that beat changes something.
    clock.ms += 6 * 60 * 60 * 1000;
    expect(beatPass(hub)[0]?.n).toBe(headOf(hub, world.id));
    const head = headOf(hub, world.id);
    clock.ms += 6 * 60 * 60 * 1000;
    expect(beatPass(hub)).toEqual([{ world: world.id, n: null, skipped: "quiet" }]);
    clock.ms += 60 * 60 * 1000;
    expect(beatPass(hub)).toEqual([]);
    expect(headOf(hub, world.id)).toBe(head);
    clock.ms += 7 * DAY_MS;
    expect(beatPass(hub)[0]?.n).toBe(head + 1);
  });
});
