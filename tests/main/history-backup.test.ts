// Restoring a world's history from a backup (rev 6 phase 3, D6 "Backups") — isolated because it is
// the one place a local log could be replaced, and a wrong choice loses history silently.
//
// Failure modes guarded here (each test names one):
// 1. A backup whose history diverged from this device's overwrites the local log (or merges).
// 2. An older backup (a chain prefix of the local log) replaces a longer local log.
// 3. A newer backup that extends the local log is not taken, or its outbox events are lost.
// 4. A backup whose log was edited (a broken chain) or whose physics this build cannot reproduce
//    is accepted.

import { mkdir, mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readHistoryBackup, restoreHistory } from "@main/histories/backupHistory";
import { appendLog, readOutbox } from "@main/histories/logStore";
import { sha256Bytes } from "@shared/history/ids";
import { logStart, sequenceEvent } from "@shared/history/log";
import { authorKeyFor, signEvent } from "@shared/history/sign";
import type { GenesisEvent, HistoryEvent, LogEntry } from "@shared/history/types";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const SECRET = sha256Bytes("history-backup:owner");
const AUTHOR = authorKeyFor(SECRET);
const AT = "2026-09-27T08:00:00.000Z";
const NOW = new Date("2026-09-28T08:00:00.000Z");

let root = "";

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "unmapped-history-backup-"));
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

function genesis(physicsVersion = 1): GenesisEvent {
  return signEvent(
    {
      v: 1,
      world: "",
      kind: "genesis",
      author: AUTHOR,
      at: AT,
      seen: 0,
      body: {
        name: "Backup",
        cartridge: {
          cartridgeId: "v2-world",
          version: "2.0.0",
          contentHash: `sha256:${"c".repeat(64)}`,
        },
        seed: "v2-world",
        language: "en",
        physicsVersion,
        createdAt: AT,
        access: "friends",
        gates: [],
        from: { instanceId: "backup-1" },
      },
    },
    SECRET,
  );
}

function note(world: string, text: string): HistoryEvent {
  return signEvent(
    {
      v: 1,
      world,
      kind: "note",
      author: AUTHOR,
      at: AT,
      seen: 1,
      body: { coord: { cx: 1, cz: 1, x: 2, z: 3 }, anchors: [], text, contests: null, name: "Ann" },
    },
    SECRET,
  );
}

function sequence(events: HistoryEvent[]): LogEntry[] {
  let cursor = logStart(events[0]?.id ?? "");
  return events.map((event) => {
    const entry = sequenceEvent(cursor, event, AT, null);
    cursor = { n: entry.n, chain: entry.chain, rt: entry.rt };
    return entry;
  });
}

const jsonl = (values: readonly unknown[]) => values.map((v) => `${JSON.stringify(v)}\n`).join("");

function backupOf(entries: LogEntry[], outbox: HistoryEvent[] = [], worldId?: string) {
  const world = worldId ?? entries[0]?.event.id ?? "";
  const read = readHistoryBackup({
    pin: JSON.stringify({ v: 1, worldId: world, migrated: null }),
    log: jsonl(entries),
    ...(outbox.length === 0 ? {} : { outbox: jsonl(outbox) }),
  });
  if (!read.ok || read.value === null) throw new Error(read.ok ? "no history" : read.error.code);
  return read.value;
}

/** This device's own log of `world`. */
async function seed(world: string, entries: LogEntry[]): Promise<void> {
  await mkdir(join(root, world), { recursive: true });
  await appendLog(join(root, world), entries);
}

async function localLog(world: string): Promise<string> {
  return readFile(join(root, world, "log.jsonl"), "utf8");
}

describe("history restore", () => {
  it("keeps both copies when the histories diverged (1)", async () => {
    const first = genesis();
    const mine = sequence([first, note(first.id, "mine")]);
    await seed(first.id, mine);
    const before = await localLog(first.id);
    const restored = await restoreHistory(
      root,
      backupOf(sequence([first, note(first.id, "theirs")])),
      NOW,
    );
    expect(restored.ok && restored.value.outcome).toBe("diverged");
    expect(restored.ok && restored.value.notice?.code).toBe("backup-history-diverged");
    expect(await localLog(first.id)).toBe(before);
    const kept = (await readdir(join(root, first.id))).filter((name) =>
      name.startsWith("restored-"),
    );
    expect(kept).toHaveLength(1);
  });

  it("keeps a longer local log over an older backup (2)", async () => {
    const first = genesis();
    const events = [first, note(first.id, "one"), note(first.id, "two")];
    await seed(first.id, sequence(events));
    const before = await localLog(first.id);
    const restored = await restoreHistory(root, backupOf(sequence(events.slice(0, 2))), NOW);
    expect(restored.ok && restored.value.outcome).toBe("kept");
    expect(await localLog(first.id)).toBe(before);
  });

  it("takes a backup that extends the local log, with its outbox (3)", async () => {
    const first = genesis();
    const events = [first, note(first.id, "one"), note(first.id, "two")];
    await seed(first.id, sequence(events.slice(0, 2)));
    const waiting = note(first.id, "not sent yet");
    const restored = await restoreHistory(root, backupOf(sequence(events), [waiting]), NOW);
    expect(restored.ok && restored.value.outcome).toBe("extended");
    expect((await localLog(first.id)).trim().split("\n")).toHaveLength(3);
    const outbox = await readOutbox(join(root, first.id));
    expect(outbox.ok && outbox.value.map((event) => event.id)).toEqual([waiting.id]);
  });

  it("refuses an edited log and a physics this build cannot reproduce (4)", () => {
    const first = genesis();
    const entries = sequence([first, note(first.id, "one")]);
    const edited = entries.map((entry) =>
      entry.n === 2 ? { ...entry, rt: NOW.toISOString() } : entry,
    );
    const broken = readHistoryBackup({
      pin: JSON.stringify({ v: 1, worldId: first.id, migrated: null }),
      log: jsonl(edited),
    });
    expect(broken.ok ? "ok" : broken.error.code).toBe("backup-history-invalid");
    const newer = genesis(2);
    const future = readHistoryBackup({
      pin: JSON.stringify({ v: 1, worldId: newer.id, migrated: null }),
      log: jsonl(sequence([newer])),
    });
    expect(future.ok ? "ok" : future.error.code).toBe("physics-newer");
  });
});
