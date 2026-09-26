// A save's fingerprint, for its ENS name (`<save>.<cartridge>.<root>.eth`, LineageRegistry.recordSave).
// The hash covers exactly what a `.spire-backup` carries of the save — save.json's state, the karma
// log and the witnessed land — as sorted-key canonical JSON, and nothing about where or when it was
// written (instance id, save id, folder, `updatedAt`, which a restore sets to the restore time). So
// the same save restored on another machine hashes the same, and the name can say "this backup is
// the run I recorded". Content never goes on chain; only this hash, the revision the save is pinned
// to, and one line of progress built from real state.

import type { CartridgeRef, ContentHash } from "@shared/cartridge";
import { hashText } from "@shared/content-hash";
import type { Result } from "@shared/result";
import { ok } from "@shared/result";
import { canonicalJson } from "../cartridges/integrity";
import { landEntries } from "./backupLand";
import { readLand } from "./land";
import { readInstance } from "./store";

export interface SaveFingerprint {
  /** The instance's display name, the default label for its ENS name. */
  name: string;
  pin: CartridgeRef;
  saveHash: ContentHash;
  /** e.g. "2 chapters cleared · 14 deeds"; English, since it is stored on chain for anyone. */
  progress: string;
}

export async function saveFingerprint(
  instancesDir: string,
  instanceId: string,
  cartridgesDir?: string,
): Promise<Result<SaveFingerprint>> {
  const instance = await readInstance(instancesDir, instanceId, cartridgesDir);
  if (!instance.ok) return instance;
  const land = await readLand(instancesDir, instanceId, cartridgesDir);
  if (!land.ok) return land;
  const { meta, save, karma } = instance.value;
  const { updatedAt: _written, ...state } = save;
  const saveHash = await hashText(
    canonicalJson({ save: state, karma, land: landEntries(land.value) }),
  );
  const cleared = Object.values(save.land?.episodes ?? {}).filter((e) => e.cleared).length;
  const chapters = cleared === 1 ? "1 chapter cleared" : `${cleared} chapters cleared`;
  const deeds = karma.length === 1 ? "1 deed" : `${karma.length} deeds`;
  return ok({
    name: meta.name,
    pin: meta.cartridge,
    saveHash,
    progress: `${chapters} · ${deeds}`,
  });
}
