// One process per data dir (rev 6 phase 4, D2 "the ledger"): two writers would fork the ledger.
// `<data>/gateway.lock` holds the running gateway's pid and where it listens, so the CLI can hand a
// `grant` or `token` to it instead of writing beside it. A lock whose pid is gone is stale (a crash)
// and is taken over; a live one refuses.

import { closeSync, openSync, readFileSync, unlinkSync, writeSync } from "node:fs";
import { join } from "node:path";
import { err, ok, type Result } from "@shared/result";
import { z } from "zod";

export const LOCK_FILE = "gateway.lock";

const lockSchema = z.strictObject({
  pid: z.number().int().positive(),
  host: z.string().max(200),
  port: z.number().int().min(0).max(65_535),
  startedAt: z.string().max(40),
});

export type LockInfo = z.output<typeof lockSchema>;

export function isAlive(pid: number): boolean {
  if (pid === process.pid) return true;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    // EPERM: the process exists but belongs to someone else.
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}

/** The lock's contents, or null when there is none or it is unreadable. */
export function readLock(dataDir: string): LockInfo | null {
  try {
    const parsed = lockSchema.safeParse(JSON.parse(readFileSync(join(dataDir, LOCK_FILE), "utf8")));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/** Takes the lock, or says who holds it. Returns the function that gives it back. */
export function takeLock(dataDir: string, info: LockInfo): Result<() => void> {
  const path = join(dataDir, LOCK_FILE);
  for (let attempt = 0; attempt < 2; attempt += 1) {
    let fd: number | null = null;
    try {
      fd = openSync(path, "wx", 0o600);
      writeSync(fd, `${JSON.stringify(info)}\n`);
      return ok(() => {
        try {
          if (readLock(dataDir)?.pid === info.pid) unlinkSync(path);
        } catch {}
      });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") {
        return err("gateway-lock", `Could not create ${path}: ${String(error)}`);
      }
      const holder = readLock(dataDir);
      if (holder !== null && isAlive(holder.pid)) {
        return err(
          "gateway-data-locked",
          `Another gateway (pid ${holder.pid}, ${holder.host}:${holder.port}) uses ${dataDir}.`,
          "Stop it first, or give this one another --data. Two writers would fork the ledger.",
        );
      }
      try {
        unlinkSync(path);
      } catch {}
    } finally {
      if (fd !== null) closeSync(fd);
    }
  }
  return err("gateway-lock", `Could not take ${path}.`, "Remove it if no gateway is running.");
}
