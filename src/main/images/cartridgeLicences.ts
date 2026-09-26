// Picture licences of a published cartridge (rev 6 phase 4, D4). When the renderer publishes a
// revision (Create's Build, the Forge), main — never the renderer — names every picture's licence in
// a hashed `assets/licences.json`: a picture whose bytes the lineage parent already held is
// inherited (with the parent's licence); otherwise it carries the licence this device recorded when
// it drew it (a Create look candidate's record), else `unknown`. The manifest format does not
// change: the file is one more hashed asset. A renderer-sent licences.json is replaced.
//
// With commercial mode on, a revision that adds or changes a picture whose licence is not
// commercial is refused ("redraw these"); inherited pictures are listed in the audit, not refused.
// A picture it adds or changes must also be one: an empty or undecodable file is refused first
// (./pictureBytes.ts), whatever the mode.
// Installs, migrations and mod revisions publish in main without this step: they carry exact
// revisions (or their base's assets, licences.json included) unchanged.

import type {
  CartridgeManifest,
  CartridgeRef,
  ContentHash,
  PublishCartridgeInput,
} from "@shared/cartridge";
import {
  LICENCES_FILE,
  type LicenceAudit,
  type LicenceFile,
  licenceAudit,
  licencePictures,
  parseLicenceFile,
} from "@shared/images";
import { licenceTable, UNKNOWN_LICENCE } from "@shared/licence";
import { ok, type Result } from "@shared/result";
import { canonicalJson, sha256 } from "../cartridges/integrity";
import { publishCartridgeRevision, readCartridgeRevision } from "../cartridges/store";
import { readLookLicences } from "../workspaces/createLooks";
import { logAudit, refuseRedraw } from "./audit";
import { commercialMode, type EnvLike } from "./commercial";
import { checkPublishedPicture } from "./pictureBytes";

export interface CartridgeLicenceDirs {
  cartridgesDir: string;
  workspacesDir: string;
}

function decode(bytes: Uint8Array | undefined): LicenceFile | null {
  return bytes === undefined ? null : parseLicenceFile(new TextDecoder().decode(bytes));
}

/**
 * Every picture of a revision (all assets but licences.json) with its licence from that
 * revision's own file; an entry whose hash is not the picture's counts for nothing (`unknown`).
 */
export function revisionLicences(assets: Record<string, Uint8Array>): LicenceFile {
  const stored = decode(assets[LICENCES_FILE]);
  const out: LicenceFile = { v: 1, pictures: {} };
  for (const [path, bytes] of Object.entries(assets)) {
    if (path === LICENCES_FILE) continue;
    const hash = sha256(bytes);
    const entry = stored?.pictures[path];
    out.pictures[path] =
      entry !== undefined && entry.sha256 === hash
        ? entry
        : { sha256: hash, licence: UNKNOWN_LICENCE, inherited: false };
  }
  return out;
}

async function parentLicences(
  cartridgesDir: string,
  parent: CartridgeRef | null,
): Promise<Map<ContentHash, string> | null> {
  if (parent === null) return null;
  const revision = await readCartridgeRevision(cartridgesDir, parent.cartridgeId, parent.version);
  if (!revision.ok || revision.value.manifest.contentHash !== parent.contentHash) return null;
  const file = revisionLicences(revision.value.assets);
  return new Map(Object.values(file.pictures).map((one) => [one.sha256, one.licence]));
}

/** The input as it will be published: its pictures' licences named, or refused. */
export async function licenseCartridge(
  dirs: CartridgeLicenceDirs,
  input: PublishCartridgeInput,
  env?: EnvLike,
): Promise<Result<PublishCartridgeInput>> {
  const { [LICENCES_FILE]: _sent, ...pictures } = input.assets ?? {};
  if (Object.keys(pictures).length === 0) {
    return ok(input.assets === undefined ? input : { ...input, assets: {} });
  }
  const hashes = Object.fromEntries(
    Object.entries(pictures).map(([path, bytes]) => [path, sha256(bytes)]),
  );
  const what = `cartridge ${input.manifest.cartridgeId}@${input.manifest.version}`;
  const parent = await parentLicences(dirs.cartridgesDir, input.manifest.lineage?.parent ?? null);
  // An added or changed picture must decode; one kept byte for byte from the parent is the parent's
  // (listed like its licence), never a reason to refuse this revision.
  for (const [path, bytes] of Object.entries(pictures)) {
    if (parent?.has(hashes[path] as ContentHash) === true) continue;
    const checked = checkPublishedPicture(path, bytes);
    if (checked.ok) continue;
    process.stdout.write(`[licence] ${what} · ${path} · refused · ${checked.error.code}\n`);
    return checked;
  }
  const file = licencePictures(hashes, parent, await readLookLicences(dirs.workspacesDir));
  const audit = licenceAudit(file, licenceTable(), await commercialMode(env));
  logAudit(what, audit);
  if (audit.blocked.length > 0) return refuseRedraw(audit.blocked, audit.commercial);
  const encoded = new TextEncoder().encode(`${canonicalJson(file)}\n`);
  return ok({ ...input, assets: { ...pictures, [LICENCES_FILE]: encoded } });
}

/** `cartridges:publish`: the licence step, then the ordinary publish. */
export async function publishLicensedCartridge(
  dirs: CartridgeLicenceDirs,
  input: PublishCartridgeInput,
): Promise<Result<CartridgeManifest>> {
  const licensed = await licenseCartridge(dirs, input);
  if (!licensed.ok) return licensed;
  return publishCartridgeRevision(dirs.cartridgesDir, licensed.value);
}

/** The licence audit of a published cartridge revision, as commercial mode would read it now. */
export async function cartridgeAudit(
  cartridgesDir: string,
  cartridgeId: string,
  version: string,
  env?: EnvLike,
): Promise<Result<LicenceAudit>> {
  const revision = await readCartridgeRevision(cartridgesDir, cartridgeId, version);
  if (!revision.ok) return revision;
  const file = revisionLicences(revision.value.assets);
  // A published revision is already out: nothing in it is "added" any more, only listed.
  const audit = licenceAudit(file, licenceTable(), await commercialMode(env));
  return ok({ ...audit, blocked: [] });
}
