// The licence audit's two outputs besides the data (rev 6 phase 4, D4): one log line per picture of
// a revision being published (added, inherited or refused, and whether its licence is commercial),
// and the refusal that names the pictures commercial mode wants redrawn.

import type { LicenceAudit } from "@shared/images";
import { err, type Result } from "@shared/result";

export function logAudit(what: string, audit: LicenceAudit): void {
  for (const row of audit.rows) {
    const state = audit.blocked.includes(row.path)
      ? "refused"
      : row.inherited
        ? "inherited"
        : "added";
    process.stdout.write(
      `[licence] ${what} · ${row.path} · ${row.licence} · ${row.commercial ? "commercial" : "non-commercial"} · ${state}\n`,
    );
  }
}

export function refuseRedraw(
  blocked: readonly string[],
  commercial: LicenceAudit["commercial"],
): Result<never> {
  return err(
    "image-licence-redraw",
    `Commercial mode is on (${commercial.source}): redraw these pictures before publishing, their licence does not allow commercial use: ${blocked.join(", ")}.`,
    "Draw them again with an image provider whose licence allows commercial use (Settings → Images), or replace them with your own files.",
  );
}
