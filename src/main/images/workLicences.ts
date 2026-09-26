// Picture licences of AI worlds (rev 6 phase 4, D4). While a world is a draft, every picture main
// draws or the player picks gets a record beside the draft (`work-drafts/<draftId>/pictures/
// <hex>.json`, ./drawn.ts). Publishing names each picture's licence in a main-owned
// `licences.json` beside the revision's content: outside `contentFiles` (works/store.ts), never
// written by the model, and carried with the content in a work pack (the bundle package's
// works/pack.ts). A revision published before phase 4 has none: its pictures are `unknown`.
//
// With commercial mode on, publishing refuses a revision that adds or changes a picture whose
// licence is not commercial ("redraw these"); pictures inherited unchanged from the parent
// revision are listed in the audit, never refused.

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { ContentHash } from "@shared/cartridge";
import {
  LICENCES_FILE,
  type LicenceAudit,
  type LicenceFile,
  licenceAudit,
  licencePictures,
  parseLicenceFile,
} from "@shared/images";
import { licenceTable, UNKNOWN_LICENCE } from "@shared/licence";
import { err, ok, type Result } from "@shared/result";
import { DRAFT_ID, type WorkRef } from "@shared/works";
import { sha256 } from "../cartridges/integrity";
import type { WorkLicensing } from "../works/drafts";
import { readRevision, type WorkDirs } from "../works/store";
import { logAudit, refuseRedraw } from "./audit";
import { commercialMode, type EnvLike } from "./commercial";
import { drawnRecord, type PictureOrigin, readDrawnRecords, writeDrawnRecord } from "./drawn";

function picturesDir(dirs: WorkDirs, draftId: string): string {
  return join(dirs.draftsDir, draftId, "pictures");
}

/** Records who made a picture that is about to go into a draft candidate. */
export async function recordWorkPicture(
  dirs: WorkDirs,
  draftId: string,
  png: Uint8Array,
  origin: PictureOrigin,
): Promise<Result<void>> {
  if (!DRAFT_ID.test(draftId)) return err("draft-invalid", "Bad draft id.");
  const record = drawnRecord(png, origin);
  try {
    await writeDrawnRecord(
      picturesDir(dirs, draftId),
      record.sha256.slice("sha256:".length),
      record,
    );
    return ok(undefined);
  } catch (error) {
    return err(
      "draft-write-failed",
      `The picture's licence record could not be written: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

function hashes(images: Record<string, Uint8Array>): Record<string, ContentHash> {
  return Object.fromEntries(Object.entries(images).map(([path, bytes]) => [path, sha256(bytes)]));
}

/**
 * A published revision's licences.json, checked against its pictures: an entry whose hash is not
 * the picture's (an edited file) counts for nothing, so that picture reads as `unknown`.
 */
export async function readWorkLicences(
  dirs: WorkDirs,
  workId: string,
  version: string,
): Promise<Result<LicenceFile>> {
  const revision = await readRevision(dirs, workId, version);
  if (!revision.ok) return revision;
  const text = await readFile(join(dirs.worksDir, workId, version, LICENCES_FILE), "utf8").catch(
    () => "",
  );
  const stored = parseLicenceFile(text);
  const pictures = hashes(revision.value.content.images);
  const out: LicenceFile = { v: 1, pictures: {} };
  for (const [path, hash] of Object.entries(pictures)) {
    const entry = stored?.pictures[path];
    out.pictures[path] =
      entry !== undefined && entry.sha256 === hash
        ? entry
        : { sha256: hash, licence: UNKNOWN_LICENCE, inherited: false };
  }
  return ok(out);
}

/** The parent revision's pictures as hash → licence; null when it cannot be read (nothing inherits). */
async function parentLicences(
  dirs: WorkDirs,
  parent: WorkRef | null,
): Promise<Map<ContentHash, string> | null> {
  if (parent === null) return null;
  const file = await readWorkLicences(dirs, parent.workId, parent.version);
  if (!file.ok) return null;
  return new Map(Object.values(file.value.pictures).map((one) => [one.sha256, one.licence]));
}

/** The publish-time step for `publishDraft`: names every picture's licence, or refuses. */
export function workLicensing(dirs: WorkDirs, draftId: string, env?: EnvLike): WorkLicensing {
  return async (content, parent) => {
    const known = await readDrawnRecords(picturesDir(dirs, draftId));
    const file = licencePictures(hashes(content.images), await parentLicences(dirs, parent), known);
    const audit = licenceAudit(file, licenceTable(), await commercialMode(env));
    logAudit(`work ${draftId}`, audit);
    if (audit.blocked.length > 0) return refuseRedraw(audit.blocked, audit.commercial);
    return ok(file);
  };
}

/** The licence audit of a published AI-world revision, as commercial mode would read it now. */
export async function workAudit(
  dirs: WorkDirs,
  workId: string,
  version: string,
  env?: EnvLike,
): Promise<Result<LicenceAudit>> {
  const file = await readWorkLicences(dirs, workId, version);
  if (!file.ok) return file;
  // A published revision is already out: nothing in it is "added" any more, only listed.
  const audit = licenceAudit(file.value, licenceTable(), await commercialMode(env));
  return ok({ ...audit, blocked: [] });
}
