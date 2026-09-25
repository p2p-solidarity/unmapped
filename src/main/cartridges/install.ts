// Installing a `.cartridge` someone exported: unpack (which proves every file against the manifest's
// hashes), then publish exactly that revision — its bible, story and baked dialogues included, so the
// installed revision has the same content hash as the one exported. Publishing re-validates routes
// and kits and is idempotent for identical bytes; a different revision at the same id/version is
// refused rather than overwritten. No dialogs here: ./ipc.ts owns choosing the file.

import type { CartridgeManifest } from "@shared/cartridge";
import type { Result } from "@shared/result";
import { manifestCore } from "./integrity";
import { unpackCartridge } from "./pack";
import { publishCartridgeRevision } from "./store";

export async function installCartridgePack(
  cartridgesDir: string,
  bytes: Uint8Array,
): Promise<Result<CartridgeManifest>> {
  const unpacked = unpackCartridge(bytes);
  if (!unpacked.ok) return unpacked;
  const revision = unpacked.value;
  return publishCartridgeRevision(cartridgesDir, {
    manifest: manifestCore(revision.manifest),
    rules: revision.rules,
    scenes: revision.scenes,
    dialogues: revision.dialogues,
    assets: revision.assets,
    ...(revision.bible === null ? {} : { bible: revision.bible }),
    ...(revision.story === null || revision.story === undefined ? {} : { story: revision.story }),
  });
}
