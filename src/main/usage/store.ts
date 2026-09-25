// The usage ledger (`<userData>/usage.jsonl`, @shared/usage): main appends one line per model call
// as it settles, and derives a world's total by reading the file back. Appends are serialised so
// two calls finishing together never interleave a line. A failed append is reported on stdout and
// never fails the call it describes — the player already has the answer they paid for.

import { appendFile, readFile } from "node:fs/promises";
import { join } from "node:path";
import { ok, type Result, toError } from "@shared/result";
import {
  parseUsageLines,
  summarizeUsage,
  type UsageLine,
  type UsageScope,
  type UsageSummary,
} from "@shared/usage";

export const USAGE_FILE = "usage.jsonl";

let queue: Promise<unknown> = Promise.resolve();

export function usagePath(userData: string): string {
  return join(userData, USAGE_FILE);
}

export function appendUsage(userData: string, line: UsageLine): Promise<Result<void>> {
  const write = async (): Promise<Result<void>> => {
    try {
      await appendFile(usagePath(userData), `${JSON.stringify(line)}\n`, "utf8");
      return ok(undefined);
    } catch (error) {
      const failure = toError(error, "usage-write-failed");
      process.stdout.write(`[usage] not recorded · ${failure.message}\n`);
      return { ok: false, error: failure };
    }
  };
  const next = queue.then(write, write);
  queue = next;
  return next;
}

export async function readUsageSummary(
  userData: string,
  scope: UsageScope,
): Promise<Result<UsageSummary>> {
  await queue;
  let text = "";
  try {
    text = await readFile(usagePath(userData), "utf8");
  } catch (error) {
    // No ledger yet: nothing has been spent, which is a real zero, not a placeholder.
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      return { ok: false, error: toError(error, "usage-read-failed") };
    }
  }
  const { lines, skipped } = parseUsageLines(text);
  return ok(summarizeUsage(lines, scope, skipped));
}
