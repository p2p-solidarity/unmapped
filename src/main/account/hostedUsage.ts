// What this computer spent on the gateway in a quota period, read from its own usage ledger
// (`<userData>/usage.jsonl`, @shared/usage): the raw tokens and calls Settings → Account shows next
// to the gateway's credits. Only lines main wrote for provider `hosted` count; a call whose tokens
// the gateway did not report is counted as unreported, never as zero tokens (Rule 2).

import { readFile } from "node:fs/promises";
import type { HostedUsage } from "@shared/gatewayApi";
import { ok, type Result, toError } from "@shared/result";
import { isUsageLink, parseUsageLines } from "@shared/usage";
import { usagePath } from "../usage/store";

/** `period` is the gateway's "YYYY-MM" (UTC); ledger times are ISO, so a prefix selects it. */
export async function hostedUsage(userData: string, period: string): Promise<Result<HostedUsage>> {
  let text = "";
  try {
    text = await readFile(usagePath(userData), "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      return { ok: false, error: toError(error, "usage-read-failed") };
    }
  }
  const totals: HostedUsage = { calls: 0, input: 0, output: 0, unreported: 0 };
  for (const line of parseUsageLines(text).lines) {
    if (isUsageLink(line) || line.provider !== "hosted" || !line.at.startsWith(period)) continue;
    totals.calls += 1;
    totals.input += line.input ?? 0;
    totals.output += line.output ?? 0;
    if (line.input === null && line.output === null) totals.unreported += 1;
  }
  return ok(totals);
}
