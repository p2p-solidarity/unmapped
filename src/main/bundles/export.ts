// Exporting a `.world` from this device (rev 6 phase 4, D5): any member holding the log may. Main
// reads the sequenced log (never the outbox, the save, the pin or progress), gathers the packs the
// history names from the blob store — the latest `pack` event's cartridge pack or, for a world on a
// shipped built-in revision that has none (never shared yet: ../histories/builtInPack), the pinned
// revision packed here (`packPinnedRevision`, the same bytes its owner announces once it is shared);
// every AI work a place or chapter opens — and signs world.json with
// the device key. A pack missing from the blob store is packed again from the installed revision
// and accepted only when it hashes to what the history announced. The file is verified by the same
// checks an importer runs before it is handed back.

import { readdir } from "node:fs/promises";
import { bundleWorks, verifyWorldFile } from "@dsl/history/worldBundle";
import { type BundleBlob, buildWorldBundle } from "@dsl/history/worldBundleWrite";
import { isOwner } from "@shared/history/owners";
import { err, ok, type Result } from "@shared/result";
import type { BundleWorld, WorldBundleReport } from "@shared/worldBundle";
import { readBlob } from "../blobs/store";
import type { HostCore } from "../histories/core";
import { isLocalOnly, type LoadedWorld } from "../histories/loaded";
import { readLog } from "../histories/logStore";
import { packPinnedRevision, storeWorkPack } from "../histories/packs";
import { isWorldId } from "../histories/paths";

function missing(what: string): Result<never> {
  return err(
    "bundle-blob-missing",
    `${what} is not on this device, so the world cannot be exported whole.`,
    "Open the world online once so everything it names arrives, then export again.",
  );
}

/** The cartridge pack a `.world` carries: the announced blob, or this revision packed here. */
async function genesisPack(core: HostCore, world: LoadedWorld): Promise<Result<BundleBlob>> {
  const announced = world.now.pack?.pack ?? null;
  if (announced !== null) {
    const stored = await readBlob(core.blobsDir, announced);
    if (stored.ok) return ok({ hash: announced, bytes: stored.value });
  }
  const ref = world.genesis.body.cartridge;
  const packed = await packPinnedRevision(core.deps, ref);
  if (!packed.ok) return packed;
  if (packed.value === null) return missing(`The cartridge ${ref.cartridgeId}@${ref.version}`);
  if (announced !== null && packed.value.hash !== announced) {
    return missing(`The cartridge pack the world announced`);
  }
  return ok(packed.value);
}

/** Every work pack the history names, from the blob store or packed again from `works/`. */
async function workPacks(core: HostCore, world: LoadedWorld): Promise<Result<BundleBlob[]>> {
  const out: BundleBlob[] = [];
  for (const work of bundleWorks(world.now)) {
    let stored = await readBlob(core.blobsDir, work.pack);
    if (!stored.ok) {
      const packed = await storeWorkPack(core.blobsDir, core.deps.works, work);
      if (packed.ok && packed.value === work.pack)
        stored = await readBlob(core.blobsDir, work.pack);
    }
    if (!stored.ok) return missing(`The AI world ${work.workId}@${work.version}`);
    out.push({ hash: work.pack, bytes: stored.value });
  }
  return ok(out);
}

export interface ExportedWorld {
  name: string;
  bytes: Uint8Array;
  report: WorldBundleReport;
}

/** A signed `.world` of `worldId` as this device holds it. */
export async function exportWorldBundle(
  core: HostCore,
  worldId: string,
): Promise<Result<ExportedWorld>> {
  const key = await core.deps.key();
  if (!key.ok) return key;
  return core.withWorld(worldId, async (world) => {
    const entries = await readLog(world.dir);
    if (!entries.ok) return entries;
    const cartridge = await genesisPack(core, world);
    if (!cartridge.ok) return cartridge;
    const works = await workPacks(core, world);
    if (!works.ok) return works;
    const built = buildWorldBundle({
      entries: entries.value,
      genesisPack: cartridge.value,
      works: works.value,
      exportedAt: core.nowIso(),
      signer: { key: key.value.author, sign: (manifest) => key.value.signWorldFile(manifest) },
    });
    if (!built.ok) return built;
    const { report } = verifyWorldFile(built.value.bytes);
    return ok({ name: world.genesis.body.name, bytes: built.value.bytes, report });
  });
}

/** The worlds whose history this device holds, for the export list (unreadable ones left out). */
export async function listBundleWorlds(core: HostCore): Promise<Result<BundleWorld[]>> {
  const key = await core.deps.key();
  const me = key.ok ? key.value.author : null;
  let names: string[];
  try {
    names = await readdir(core.histories);
  } catch {
    return ok([]);
  }
  const out: BundleWorld[] = [];
  for (const id of names.filter(isWorldId).sort()) {
    const read = await core.withWorld(id, async (world) =>
      ok<BundleWorld>({
        worldId: world.id,
        name: world.genesis.body.name,
        head: world.now.head.n,
        attached: !isLocalOnly(world),
        url: world.link?.url ?? world.now.sequencer?.url ?? null,
        owner: me !== null && isOwner(world.now, me),
      }),
    );
    if (read.ok) out.push(read.value);
  }
  return ok(out);
}
