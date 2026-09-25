// Reproducible packs (rev 6 phase 3, D10): the same revision always zips to the same bytes, so
// identical revisions share one blob and one content hash on every machine. Two things make fflate
// vary: the entry order (object insertion order) and the DOS mtime, which it writes from the
// *local-time* fields of a Date (`getFullYear()` …). So entries go in `hashOrder` of their paths,
// and every entry carries a Date built from local fields — 1980-01-01 00:00:00 in whatever zone
// the machine is in, which encodes to the same DOS bytes everywhere (a UTC instant would not, and
// before 1980 locally it would not encode at all).

import { hashOrder } from "@shared/hashOrder";
import { err, fail, ok, type Result, toError } from "@shared/result";
import { type Zippable, zipSync } from "fflate";

/** The deflate level every pack uses; changing it changes every pack's bytes. */
export const PACK_ZIP_LEVEL = 6;

/** 1980-01-01 00:00:00 in local time: the first instant a ZIP (DOS) timestamp can hold. */
export function zipEpoch(): Date {
  return new Date(1980, 0, 1, 0, 0, 0, 0);
}

/**
 * Zips `entries` reproducibly. Paths must not be array-index-like ("12"): JavaScript objects list
 * those first whatever their insertion order, which would break the pinned order.
 */
export function reproducibleZip(entries: Record<string, Uint8Array>): Result<Uint8Array> {
  const paths = Object.keys(entries).sort(hashOrder);
  const zippable: Zippable = {};
  for (const path of paths) {
    if (/^(?:0|[1-9]\d*)$/.test(path)) {
      return err("pack-entry-invalid", `A pack entry cannot be named ${path}.`);
    }
    const bytes = entries[path];
    if (bytes === undefined) continue;
    zippable[path] = [bytes, { mtime: zipEpoch(), level: PACK_ZIP_LEVEL }];
  }
  try {
    return ok(zipSync(zippable, { mtime: zipEpoch(), level: PACK_ZIP_LEVEL }));
  } catch (error) {
    return fail(toError(error, "pack-failed"));
  }
}
