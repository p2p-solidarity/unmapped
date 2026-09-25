// Reading a legacy save for its migration (rev 6 phase 3, D6): the instance, its save and karma,
// the pinned cartridge revision, the frozen land (`chunks/`, `lore.jsonl`, `notes.jsonl`) and their
// bytes, and the packs of the cartridge (unless it ships with the app) and of every AI work the
// save points at. Only reads — the packs go into the blob store, never into the save.

import type { ContentHash, ResolvedInstance } from "@shared/cartridge";
import type { LandRecord } from "@shared/land";
import { ok, type Result } from "@shared/result";
import type { WorkRef } from "@shared/works";
import { readLand } from "../instances/land";
import { saveDir } from "../instances/paths";
import { resolveInstance } from "../instances/store";
import type { WorkDirs } from "../works/store";
import { isBuiltIn } from "./builtIn";
import { digestOf, readLegacySources } from "./digest";
import { type MigrationFiles, type SourceDigest, workKey } from "./dslSeam";
import { storeCartridgePack, storeWorkPack } from "./packs";

export interface SourceDirs {
  cartridgesDir: string;
  instancesDir: string;
  blobsDir: string;
  works: WorkDirs;
}

export interface GatheredSource {
  files: MigrationFiles;
  resolved: ResolvedInstance;
  saveDir: string;
}

/** Every AI-work revision a save points at: otherworld places and chapters played as works. */
export function workRefsOf(resolved: ResolvedInstance): WorkRef[] {
  const land = resolved.instance.save.land;
  const refs: WorkRef[] = [];
  for (const place of land?.places ?? []) if (place.kind === "otherworld") refs.push(place.work);
  for (const episode of Object.values(land?.episodes ?? {})) {
    if (episode.work !== null) refs.push(episode.work);
  }
  return refs;
}

/** The instance resolved against its pinned revision, and its active save directory. */
export async function resolveSave(
  dirs: Pick<SourceDirs, "cartridgesDir" | "instancesDir">,
  instanceId: string,
): Promise<Result<{ resolved: ResolvedInstance; saveDir: string }>> {
  const resolved = await resolveInstance(dirs.cartridgesDir, dirs.instancesDir, instanceId);
  if (!resolved.ok) return resolved;
  const { meta } = resolved.value.instance;
  return ok({
    resolved: resolved.value,
    saveDir: saveDir(dirs.instancesDir, instanceId, meta.activeSaveId),
  });
}

async function landOf(dirs: SourceDirs, instanceId: string): Promise<Result<LandRecord>> {
  return readLand(dirs.instancesDir, instanceId, dirs.cartridgesDir);
}

/** The digest of the save's legacy files as they are now (the check on every open). */
export async function currentDigest(
  dirs: SourceDirs,
  instanceId: string,
): Promise<Result<SourceDigest>> {
  const save = await resolveSave(dirs, instanceId);
  if (!save.ok) return save;
  const land = await landOf(dirs, instanceId);
  if (!land.ok) return land;
  const sources = await readLegacySources(save.value.saveDir);
  if (!sources.ok) return sources;
  return ok(digestOf(save.value.resolved.instance.save, land.value, sources.value));
}

export async function gatherSource(
  dirs: SourceDirs,
  instanceId: string,
  owner: string,
  profileName: string,
): Promise<Result<GatheredSource>> {
  const save = await resolveSave(dirs, instanceId);
  if (!save.ok) return save;
  const { resolved } = save.value;
  const land = await landOf(dirs, instanceId);
  if (!land.ok) return land;
  const sources = await readLegacySources(save.value.saveDir);
  if (!sources.ok) return sources;
  const { manifest } = resolved.cartridge;
  let pack: MigrationFiles["cartridge"]["pack"] = null;
  if (!isBuiltIn(manifest)) {
    const stored = await storeCartridgePack(dirs.blobsDir, resolved.cartridge);
    if (!stored.ok) return stored;
    pack = { pack: stored.value.hash, bytes: stored.value.bytes };
  }
  const workPacks: Record<string, { contentHash: ContentHash; pack: ContentHash }> = {};
  for (const ref of workRefsOf(resolved)) {
    const key = workKey(ref);
    if (workPacks[key] !== undefined) continue;
    const made = await storeWorkPack(dirs.blobsDir, dirs.works, ref);
    if (made.ok) workPacks[key] = { contentHash: ref.contentHash, pack: made.value };
  }
  const { meta, save: state, karma } = resolved.instance;
  return ok({
    resolved,
    saveDir: save.value.saveDir,
    files: {
      owner,
      profileName,
      meta,
      save: state,
      karma,
      cartridge: {
        bible: resolved.cartridge.bible,
        story: resolved.cartridge.story ?? null,
        pack,
      },
      workPacks,
      land: land.value,
      sources: sources.value,
    },
  });
}
