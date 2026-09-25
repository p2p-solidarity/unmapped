// A published world's look picture (rev 6 phase 2, D2), main only: the PNG Create published as
// `assets/look.png` (LOOK_PICTURE_ASSET), read through the revision reader so its bytes are proven
// against the content hash first. Every later picture of the world passes it to the ImageProvider as
// its reference (`generate(prompt, signal, { reference })`). A revision without one is `null`.

import { join } from "node:path";
import { LOOK_PICTURE_ASSET } from "@shared/cartridge";
import { LOOK_PICTURE_MAX_BYTES } from "@shared/createDraft";
import { err, ok, type Result } from "@shared/result";
import { isPng } from "../workspaces/createLooks";
import { readCartridgeRevision } from "./store";

/**
 * The revision's look picture, or null when it has none. `cartridgesDir` defaults to the app's
 * `<userData>/cartridges` (tests pass their own).
 */
export async function readLookPicture(
  cartridgeId: string,
  version: string,
  cartridgesDir?: string,
): Promise<Result<Uint8Array | null>> {
  const dir =
    cartridgesDir ?? join((await import("electron")).app.getPath("userData"), "cartridges");
  const revision = await readCartridgeRevision(dir, cartridgeId, version);
  if (!revision.ok) return revision;
  const bytes = revision.value.assets[LOOK_PICTURE_ASSET];
  if (bytes === undefined) return ok(null);
  if (!isPng(bytes) || bytes.byteLength > LOOK_PICTURE_MAX_BYTES) {
    return err(
      "cartridge-look-invalid",
      `${cartridgeId}@${version} has a look picture that is not a PNG within 4 MB.`,
      "Its pictures are drawn without a reference.",
    );
  }
  return ok(new Uint8Array(bytes));
}
