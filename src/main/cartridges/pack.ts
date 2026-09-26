// A `.cartridge` is a content-only zip of one immutable revision: manifest.json, rules.oui and
// scenes/<id>.oui — never a save (plan §一: sharing a cartridge never carries progress). Packing
// is here (the reproducible zip, main's blobs/zip); reading one back is pure and shared with the
// world service and bundle checks (@shared/cartridgePack, rev 6 phase 4). The OS dialogs live in
// ./ipc.ts.

import { BIBLE_FILES, type CartridgeRevision, dialogueFile } from "@shared/cartridge";
import { MANIFEST_FILE, RULES_FILE } from "@shared/cartridgePack";
import { err, type Result } from "@shared/result";
import { STORY_FILE, storyText } from "@shared/story";
import { strToU8 } from "fflate";
import { reproducibleZip } from "../blobs/zip";

export { CARTRIDGE_PACK_LIMITS, unpackCartridge } from "@shared/cartridgePack";

export function packCartridge(revision: CartridgeRevision): Result<Uint8Array> {
  const entries: Record<string, Uint8Array> = {
    [MANIFEST_FILE]: strToU8(`${JSON.stringify(revision.manifest, null, 2)}\n`),
    [RULES_FILE]: strToU8(revision.rules),
  };
  const sceneIds =
    revision.manifest.formatVersion === 1
      ? revision.manifest.scenes.map((scene) => scene.id)
      : revision.manifest.definition.scenePlan.orderedSceneIds;
  for (const sceneId of sceneIds) {
    const source = revision.scenes[sceneId];
    if (source === undefined) {
      return err("cartridge-scenes-mismatch", `Scene ${sceneId} has no source to pack.`);
    }
    entries[`scenes/${sceneId}.oui`] = strToU8(source);
  }
  for (const [key, source] of Object.entries(revision.dialogues)) {
    entries[dialogueFile(key)] = strToU8(source);
  }
  for (const [path, bytes] of Object.entries(revision.assets)) entries[`assets/${path}`] = bytes;
  if (revision.bible !== null) {
    entries[BIBLE_FILES.core] = strToU8(revision.bible.core);
    entries[BIBLE_FILES.style] = strToU8(revision.bible.style);
  }
  if (revision.story !== null && revision.story !== undefined) {
    entries[STORY_FILE] = strToU8(storyText(revision.story));
  }
  // Reproducible (D10): the same revision zips to the same bytes, so it is one blob everywhere.
  return reproducibleZip(entries);
}
