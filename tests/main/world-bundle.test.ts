// A `.world` on this device (rev 6 phase 4, D5): the two decisions main makes about someone else's
// history — whether a move link may switch a world to another service, and what physics a save made
// from a file is pinned to. Isolated because the served log is a peer's (untrusted) and a wrong
// switch or pin is silent data loss that E2E would only see much later. What this file guards,
// written before the code:
//   1. A move link switches to a service whose log does not extend this device's (a shorter log,
//      another chain at the same n, an entry that does not chain on), merging two histories.
//   2. A move link switches to a service no owner has moved the world to (a bare mirror), so this
//      device would send its writes to a service that refuses them all.
//   3. A move link that does extend the log and names the service is refused.
//   4. An import pins the build's physics instead of the world's, or accepts a world.json whose
//      physics is not its genesis's, or a world on physics this build does not reproduce.

import { importPlan } from "@main/bundles/import";
import { checkMove, type MoveFrom } from "@main/bundles/move";
import { sequenceEvent, verifyLog, withReceipt } from "@shared/history/log";
import type { LogEntry } from "@shared/history/types";
import { describe, expect, it } from "vitest";
import { at, keyOf, LocalWorld, noteBody, OWNER, secretOf, sign } from "../service/support";

const S1 = secretOf("move:s1");
const S2 = secretOf("move:s2");

function append(
  entries: LogEntry[],
  event: Parameters<typeof sequenceEvent>[1],
  rt: string,
  secret: Uint8Array,
) {
  const last = entries[entries.length - 1];
  if (last === undefined) throw new Error("empty");
  entries.push(sequenceEvent({ n: last.n, chain: last.chain, rt: last.rt }, event, rt, secret));
}

/** A world attached to S1 (entries 1..k re-receipted, then s1), as a member holds it. */
function attachedWorld() {
  const world = new LocalWorld();
  world.write("note", noteBody("first"), OWNER, at(0, 1));
  const entries = world.entries.map((entry) => withReceipt(entry, S1));
  append(entries, world.sequencer(keyOf(S1)), at(1), S1);
  return { world, entries };
}

function fromOf(world: LocalWorld, entries: readonly LogEntry[]): MoveFrom {
  const checked = verifyLog(world.id, entries);
  if (!checked.ok) throw new Error(checked.error.message);
  return {
    world: world.id,
    cursor: checked.value.cursor,
    ownership: checked.value.ownership,
    schedule: checked.value.schedule,
  };
}

/** What S2 serves after a rehost by the owner, and a note written there. */
function rehosted(world: LocalWorld, entries: LogEntry[]): LogEntry[] {
  const served = [...entries];
  append(
    served,
    sign(
      world.id,
      "sequencer",
      { url: "ws://127.0.0.1:8798", key: keyOf(S2) },
      OWNER,
      served.length,
    ),
    at(2),
    S2,
  );
  append(served, sign(world.id, "note", noteBody("on S2"), OWNER, served.length), at(2, 1), S2);
  return served;
}

const servedAfter = (log: readonly LogEntry[], n: number) => {
  const last = log[log.length - 1];
  if (last === undefined) throw new Error("empty");
  return {
    genesis: log[0]?.event.id as string,
    head: { n: last.n, chain: last.chain },
    entries: log.slice(n),
  };
};

describe("checkMove", () => {
  it("follows a service whose log extends this device's and names it (3)", () => {
    const { world, entries } = attachedWorld();
    const served = rehosted(world, entries);
    const moved = checkMove(
      fromOf(world, entries),
      { ...servedAfter(served, entries.length), serviceKey: keyOf(S2) },
      true,
    );
    expect(moved.ok && moved.value.entries.length).toBe(2);
    expect(moved.ok && moved.value.schedule.map((step) => step.key)).toEqual([
      keyOf(S1),
      keyOf(S2),
    ]);
  });

  it("refuses a log that does not extend this device's (1)", () => {
    const { world, entries } = attachedWorld();
    const mine = [...entries];
    append(mine, sign(world.id, "note", noteBody("only here"), OWNER, mine.length), at(1, 5), S1);
    const served = rehosted(world, entries);
    const from = fromOf(world, mine);
    // Longer, but it went another way at this device's last entry.
    const other = checkMove(
      from,
      { ...servedAfter(served, mine.length), serviceKey: keyOf(S2) },
      true,
    );
    expect(other.ok ? null : other.error.code).toBe("history-diverged");
    // Shorter than this device's.
    const shorter = checkMove(
      from,
      { ...servedAfter(entries, entries.length), serviceKey: keyOf(S1) },
      false,
    );
    expect(shorter.ok ? null : shorter.error.code).toBe("history-diverged");
    // Same length, another chain.
    const fork = [...entries];
    append(fork, sign(world.id, "note", noteBody("a fork"), OWNER, fork.length), at(1, 6), S1);
    const same = checkMove(
      from,
      { ...servedAfter(fork, fork.length), serviceKey: keyOf(S1) },
      false,
    );
    expect(same.ok ? null : same.error.code).toBe("history-diverged");
  });

  it("refuses a service no owner has moved the world to (2)", () => {
    const { world, entries } = attachedWorld();
    const mirror = checkMove(
      fromOf(world, entries),
      { ...servedAfter(entries, entries.length), serviceKey: keyOf(S2) },
      true,
    );
    expect(mirror.ok ? null : mirror.error.code).toBe("move-not-rehosted");
  });

  it("refuses a receipt the schedule does not give (1)", () => {
    const { world, entries } = attachedWorld();
    const forged = [...entries];
    append(forged, sign(world.id, "note", noteBody("forged"), OWNER, forged.length), at(2), S2);
    const moved = checkMove(
      fromOf(world, entries),
      { ...servedAfter(forged, entries.length), serviceKey: keyOf(S2) },
      false,
    );
    expect(moved.ok ? null : moved.error.code).toBe("history-diverged");
  });
});

describe("importPlan (4)", () => {
  // The seed is the cartridge id: the save keeps no seed of its own (as `createInstance` takes it).
  const genesis = (physicsVersion: number) =>
    new LocalWorld({ physicsVersion, seed: "salt-orchard" }).genesis;

  it("pins the world's physics, never the build's", () => {
    const plan = importPlan(genesis(1), { physicsVersion: 1 }, 1);
    expect(plan.ok && plan.value.physicsVersion).toBe(1);
    const other = importPlan(genesis(1), { physicsVersion: 1 }, 2);
    expect(other.ok ? null : other.error.code).toBe("import-physics-pin");
  });

  it("refuses physics this build does not reproduce, or a world.json that disagrees", () => {
    const newer = importPlan(genesis(99), { physicsVersion: 99 });
    expect(newer.ok ? null : newer.error.code).toBe("physics-newer");
    const lying = importPlan(genesis(1), { physicsVersion: 2 });
    expect(lying.ok ? null : lying.error.code).toBe("bundle-physics-mismatch");
  });
});
