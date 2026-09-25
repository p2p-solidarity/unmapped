// What arrives with a shared world besides its history (rev 6 phase 3, D10): the cartridge its
// genesis names and the AI works its places and chapters open. Each is fetched as a blob, proved
// against the hash its event announced, unpacked (which proves every file against the manifest),
// required to be exactly the announced revision, and only then installed. A shipped built-in
// revision needs no pack: it comes from this build (`ensureBaseGame`).

import type { CartridgeManifest, ContentHash } from "@shared/cartridge";
import type { GenesisEvent, WorldNow } from "@shared/history/types";
import { err, ok, type Result } from "@shared/result";
import { putBlob, readBlob } from "../blobs/store";
import { installCartridgePack } from "../cartridges/install";
import { unpackCartridge } from "../cartridges/pack";
import { readCartridgeRevision } from "../cartridges/store";
import type { DeviceKey } from "../identity/deviceKey";
import { installWorkPack, type WorkPackRef } from "../works/pack";
import { readRevision } from "../works/store";
import { fetchBlob } from "./blobClient";
import { isBuiltIn } from "./builtIn";
import type { HostCore } from "./core";
import { locked } from "./fsx";
import type { LoadedWorld } from "./loaded";
import { addReceivedWork } from "./logStore";

/** A pack: from this device's blob store when it is there and intact, else from the service. */
async function packBytes(
  core: HostCore,
  url: string,
  world: string,
  hash: ContentHash,
  key: DeviceKey,
): Promise<Result<Uint8Array>> {
  const local = await readBlob(core.blobsDir, hash);
  if (local.ok) return local;
  const fetched = await fetchBlob(url, world, hash, key, core.deps.fetchImpl);
  if (!fetched.ok) return fetched;
  const stored = await putBlob(core.blobsDir, fetched.value);
  return stored.ok ? fetched : stored;
}

/** The genesis's exact cartridge revision, installed (D10); refused if anything differs. */
export async function receiveCartridge(
  core: HostCore,
  input: { genesis: GenesisEvent; now: WorldNow; url: string; key: DeviceKey },
): Promise<Result<CartridgeManifest>> {
  const ref = input.genesis.body.cartridge;
  const installed = async (): Promise<CartridgeManifest | null> => {
    const read = await readCartridgeRevision(core.deps.cartridgesDir, ref.cartridgeId, ref.version);
    return read.ok && read.value.manifest.contentHash === ref.contentHash
      ? read.value.manifest
      : null;
  };
  const present = await installed();
  if (present !== null) return ok(present);
  if (isBuiltIn(ref)) {
    const base = await core.deps.ensureBaseGame();
    if (!base.ok) return base;
    const shipped = await installed();
    return shipped !== null
      ? ok(shipped)
      : err(
          "join-cartridge-missing",
          `This world plays on ${ref.cartridgeId}@${ref.version}, which this build does not ship with that content.`,
          "Update UNMAPPED to the build the world's owner uses.",
        );
  }
  const pack = input.now.pack;
  if (pack === null || pack.cartridge !== ref.contentHash) {
    return err(
      "join-pack-missing",
      "The world's owner has not shared its cartridge pack yet.",
      "Ask the owner to open the world once while online, then join again.",
    );
  }
  const bytes = await packBytes(core, input.url, input.genesis.id, pack.pack, input.key);
  if (!bytes.ok) return bytes;
  const unpacked = unpackCartridge(bytes.value);
  if (!unpacked.ok) return unpacked;
  const manifest = unpacked.value.manifest;
  if (
    manifest.cartridgeId !== ref.cartridgeId ||
    manifest.version !== ref.version ||
    manifest.contentHash !== ref.contentHash
  ) {
    return err(
      "join-pack-mismatch",
      `The pack holds ${manifest.cartridgeId}@${manifest.version}, not the revision this world was made on.`,
      "Ask the world's owner to share it again.",
    );
  }
  const result = await installCartridgePack(core.deps.cartridgesDir, bytes.value);
  if (!result.ok) return result;
  return result.value.contentHash === ref.contentHash
    ? result
    : err("join-pack-mismatch", "The installed revision does not match the world's genesis.");
}

/** Every AI-work revision the world's places and chapters announce. */
export function announcedWorks(now: WorldNow): WorkPackRef[] {
  const refs: WorkPackRef[] = [];
  for (const place of now.places) if (place.body.work !== undefined) refs.push(place.body.work);
  for (const contest of Object.values(now.chapters)) {
    for (const chapter of [contest.live, ...contest.variants]) {
      if (chapter?.body.kind === "work") refs.push(chapter.body.work);
    }
  }
  return refs;
}

/**
 * Fetches and installs every announced work this device lacks; best effort (a missing pack shows
 * as an error when its place is entered). Newly installed ones are listed as received.
 */
export async function receiveWorks(core: HostCore, world: LoadedWorld): Promise<void> {
  const url = world.link?.url;
  const key = await core.deps.key();
  if (url === undefined || !key.ok) return;
  for (const ref of announcedWorks(world.now)) {
    const have = await readRevision(core.deps.works, ref.workId, ref.version);
    if (have.ok && have.value.manifest.contentHash === ref.contentHash) continue;
    const bytes = await packBytes(core, url, world.id, ref.pack, key.value);
    if (!bytes.ok) continue;
    const installed = await installWorkPack(core.deps.works, bytes.value, ref);
    if (installed.ok && installed.value.installed) {
      await locked(`received:${world.id}`, () => addReceivedWork(world.dir, ref));
    }
  }
}
