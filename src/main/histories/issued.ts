// The invites this device made for a world (rev 6 phase 3, D8, WP8), so the owner can revoke one
// days later: an invite that nobody has used yet appears nowhere in the history (only its link
// knows it), and `invite.revoke` needs its nonce.
//
//   <userData>/histories/<worldId>/issued-invites.jsonl   one line per invite made, only grows
//
// A line holds the nonce, expiry, uses and when it was made, never the invite's one-time secret: the
// link is shown once, when made, and anyone who could read this file could otherwise join as the
// owner's friend. What the history says about each (uses, revocation) is read from the fold.

import { appendFile } from "node:fs/promises";
import { join } from "node:path";
import { ISO_TIME, NONCE, timeMs } from "@shared/history/ids";
import type { Invite, WorldNow } from "@shared/history/types";
import { fail, ok, type Result, toError } from "@shared/result";
import type { IssuedInvite, IssuedInviteState } from "@shared/worldApi";
import { z } from "zod";
import { jsonl, jsonlLines, locked, readTextOrNull } from "./fsx";

export const ISSUED_FILE = "issued-invites.jsonl";

const issuedLineSchema = z.strictObject({
  v: z.literal(1),
  nonce: z.string().regex(NONCE),
  exp: z.string().regex(ISO_TIME),
  uses: z.number().int().min(1).max(20),
  at: z.string().regex(ISO_TIME),
});

export type IssuedLine = z.infer<typeof issuedLineSchema>;

/** The line kept for `invite`: exactly these fields, whatever else the invite carries. */
export function issuedLineOf(
  invite: Pick<Invite, "nonce" | "exp" | "uses">,
  at: string,
): IssuedLine {
  return { v: 1, nonce: invite.nonce, exp: invite.exp, uses: invite.uses, at };
}

export function recordIssued(dir: string, line: IssuedLine): Promise<void> {
  return locked(`issued:${dir}`, () => appendFile(join(dir, ISSUED_FILE), jsonl([line]), "utf8"));
}

/**
 * Every invite recorded, oldest first. Like refused.jsonl, a line that does not read (a crash can
 * tear the last one) is left out; the file itself is never rewritten.
 */
export async function readIssued(dir: string): Promise<Result<IssuedLine[]>> {
  let text: string | null;
  try {
    text = await readTextOrNull(join(dir, ISSUED_FILE));
  } catch (error) {
    return fail(toError(error, "world-invites-unreadable"));
  }
  const lines: IssuedLine[] = [];
  const seen = new Set<string>();
  for (const line of jsonlLines(text ?? "")) {
    let raw: unknown;
    try {
      raw = JSON.parse(line);
    } catch {
      continue;
    }
    const parsed = issuedLineSchema.safeParse(raw);
    if (!parsed.success || seen.has(parsed.data.nonce)) continue;
    seen.add(parsed.data.nonce);
    lines.push(parsed.data);
  }
  return ok(lines);
}

/** Each recorded invite as the world's history counts it at `rt`, newest first. */
export function issuedInvites(
  lines: readonly IssuedLine[],
  now: Pick<WorldNow, "invites">,
  rt: string,
): IssuedInvite[] {
  const at = timeMs(rt);
  return lines
    .map((line) => {
      const seen = now.invites[line.nonce];
      const used = seen?.uses ?? 0;
      const state: IssuedInviteState =
        seen?.revoked != null
          ? "revoked"
          : used >= line.uses
            ? "used-up"
            : timeMs(line.exp) <= at
              ? "expired"
              : "open";
      return { nonce: line.nonce, exp: line.exp, uses: line.uses, used, state, at: line.at };
    })
    .reverse();
}
