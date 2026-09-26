// Bringing a `.world` into this app (rev 6 phase 4, D5: Worlds → Import world). P3's `world.join`
// path, from a file instead of a service:
//
//   0. read the file (its size first) and verify it offline — every problem refuses the import;
//      physics this build does not reproduce is `physics-newer`, said first and plainly;
//   1. store and install the genesis pack (`installCartridgePack`) and every work pack (a received
//      work never replaces a local one with another hash, and is listed in received-works.json);
//   2. write the log by the backup rule (`restoreHistory`): installed when absent, kept or extended
//      when one is a chain prefix of the other; otherwise both kept, `world-history-diverged`;
//   3. a save pinned to the genesis revision, its seed, its language and its physics — or the save
//      of this world already here (a `.spire-backup` restored first brings save.json, the pin and
//      progress.json; the file only brings the history and packs), then the world.json pin and an
//      empty progress.json;
//   4. `world.ensure`: a never-attached world this device does not own is adopted there (a new
//      world id, no owner changes carried); an attached one is read-only here until an invite,
//      unless this device owns it.
//
// The save's physics is the world's (world.json and its genesis agree, or the file is refused), never
// this build's current one: `createInstance` stamps the build's version, so a world on another
// version this build still reproduces is refused (`import-physics-pin`) rather than pinned wrongly.

import { mkdir, readFile, stat } from "node:fs/promises";
import { basename } from "node:path";
import { bundleWorks, type OpenedWorldBundle, verifyWorldFile } from "@dsl/history/worldBundle";
import type { CartridgeManifest } from "@shared/cartridge";
import type { GenesisEvent } from "@shared/history/types";
import { LANGUAGE_TAG_PATTERN } from "@shared/language";
import { checkPhysics, PHYSICS_VERSION } from "@shared/physics";
import { err, ok, type Result } from "@shared/result";
import { SEED_PATTERN } from "@shared/seedCode";
import type { WorldEnsured } from "@shared/worldApi";
import {
  BUNDLE_ARCHIVE_LIMITS,
  type BundleImported,
  type WorldBundleManifest,
  type WorldBundleReport,
} from "@shared/worldBundle";
import { emptyWorldProgress } from "@shared/worldProgress";
import { putBlob } from "../blobs/store";
import { installCartridgePack } from "../cartridges/install";
import { restoreHistory } from "../histories/backupHistory";
import type { HostCore } from "../histories/core";
import { locked } from "../histories/fsx";
import { addReceivedWork } from "../histories/logStore";
import { worldDir } from "../histories/paths";
import {
  mergeProgress,
  readProgress,
  readWorldPin,
  writeProgress,
  writeWorldPin,
} from "../histories/pin";
import { saveDir } from "../instances/paths";
import { createInstance, listInstances } from "../instances/store";
import { installWorkPack, type WorkPackRef } from "../works/pack";

export interface ImportPlan {
  physicsVersion: number;
  seed: string | undefined;
  language: string | undefined;
}

/**
 * What the new save is made with, from the file alone: the world's physics (world.json and the
 * genesis must agree, and this build must reproduce it), its seed and its language. A build whose
 * new saves are stamped with another physics than the world's is refused, never pinned to its own.
 */
export function importPlan(
  genesis: GenesisEvent,
  manifest: Pick<WorldBundleManifest, "physicsVersion">,
  buildPhysics: number = PHYSICS_VERSION,
): Result<ImportPlan> {
  const physics = genesis.body.physicsVersion;
  if (manifest.physicsVersion !== physics) {
    return err(
      "bundle-physics-mismatch",
      "The file's world.json and its genesis name other physics.",
    );
  }
  const supported = checkPhysics(physics);
  if (!supported.ok) return supported;
  if (buildPhysics !== physics) {
    return err(
      "import-physics-pin",
      `This world keeps physics ${physics}; a new save here would be made on ${buildPhysics}.`,
      "Import it with a build made for that physics.",
    );
  }
  const { body } = genesis;
  const seed = body.seed === body.cartridge.cartridgeId ? undefined : body.seed;
  if (seed !== undefined && !SEED_PATTERN.test(seed)) {
    return err("bundle-invalid", "The world's seed does not read.");
  }
  const language = body.language === "und" ? undefined : body.language;
  if (language !== undefined && !LANGUAGE_TAG_PATTERN.test(language)) {
    return err("bundle-invalid", "The world's language does not read.");
  }
  return ok({ physicsVersion: physics, seed, language });
}

/** A `.world` from disk, its size checked before it is read, verified offline. */
export async function readWorldFile(
  path: string,
): Promise<
  Result<{ fileName: string; report: WorldBundleReport; opened: OpenedWorldBundle | null }>
> {
  try {
    const size = (await stat(path)).size;
    if (size > BUNDLE_ARCHIVE_LIMITS.archiveBytes) {
      return err(
        "bundle-too-large",
        `The file is ${Math.ceil(size / (1024 * 1024))} MiB, larger than any .world may be.`,
        "A .world holds at most an 80 MiB history and 256 MiB of packs.",
      );
    }
    const bytes = new Uint8Array(await readFile(path));
    return ok({ fileName: basename(path), ...verifyWorldFile(bytes) });
  } catch (error) {
    return err(
      "bundle-unreadable",
      `The file cannot be read: ${String(error)}`,
      "Choose it again.",
    );
  }
}

function refusal(report: WorldBundleReport): Result<never> {
  const first = report.problems[0];
  return err(
    "bundle-invalid",
    `The file does not verify (${report.problems.length}): ${first?.code ?? "?"} — ${first?.message ?? ""}`,
    "Nothing was imported. Ask for a fresh export of the world.",
  );
}

/** Step 1: the genesis revision (installed) and every work pack; the works newly installed. */
async function installPacks(
  core: HostCore,
  opened: OpenedWorldBundle,
): Promise<Result<{ manifest: CartridgeManifest; received: WorkPackRef[] }>> {
  const ref = opened.genesis.body.cartridge;
  const pack = opened.manifest.genesisPack;
  const bytes = pack === null ? undefined : opened.blobs.get(pack);
  if (bytes === undefined) return err("bundle-invalid", "The file carries no cartridge pack.");
  const stored = await putBlob(core.blobsDir, bytes);
  if (!stored.ok) return stored;
  const manifest = await installCartridgePack(core.deps.cartridgesDir, bytes);
  if (!manifest.ok) return manifest;
  if (manifest.value.contentHash !== ref.contentHash) {
    return err("join-pack-mismatch", "The installed revision does not match the world's genesis.");
  }
  const received: WorkPackRef[] = [];
  for (const work of bundleWorks(opened.now)) {
    const blob = opened.blobs.get(work.pack);
    if (blob === undefined) return err("bundle-invalid", `${work.workId}'s pack is missing.`);
    const put = await putBlob(core.blobsDir, blob);
    if (!put.ok) return put;
    const installed = await installWorkPack(core.deps.works, blob, work);
    if (!installed.ok) return installed;
    if (installed.value.installed) received.push(work);
  }
  return ok({ manifest: manifest.value, received });
}

/** A save of `worldId` already on this device (a restored backup), by its world.json pin. */
async function pinnedSave(core: HostCore, genesis: GenesisEvent): Promise<string | null> {
  const listed = await listInstances(core.deps.instancesDir);
  if (!listed.ok) return null;
  for (const meta of listed.value) {
    if (meta.cartridge.contentHash !== genesis.body.cartridge.contentHash) continue;
    const pin = await readWorldPin(
      saveDir(core.deps.instancesDir, meta.instanceId, meta.activeSaveId),
    );
    if (pin.ok && pin.value?.worldId === genesis.id) return meta.instanceId;
  }
  return null;
}

/** Step 3: the save this world plays in, pinned to its revision and physics. */
async function saveFor(
  core: HostCore,
  opened: OpenedWorldBundle,
  manifest: CartridgeManifest,
  plan: ImportPlan,
): Promise<Result<{ instanceId: string; dir: string; reused: boolean }>> {
  const { instancesDir } = core.deps;
  const existing = await pinnedSave(core, opened.genesis);
  if (existing === null) {
    const name = opened.genesis.body.name;
    const created = await createInstance(
      instancesDir,
      manifest,
      name,
      core.deps.clock(),
      plan.seed,
      plan.language,
    );
    if (!created.ok) return created;
    const { meta } = created.value;
    if (meta.runtimePin.physicsVersion !== plan.physicsVersion) {
      return err("import-physics-pin", "The new save was made on other physics than the world's.");
    }
    const dir = saveDir(instancesDir, meta.instanceId, meta.activeSaveId);
    return ok({ instanceId: meta.instanceId, dir, reused: false });
  }
  const listed = await listInstances(instancesDir);
  const meta = listed.ok ? listed.value.find((one) => one.instanceId === existing) : undefined;
  if (meta === undefined) return err("instance-missing", "The save of this world went away.");
  return ok({
    instanceId: existing,
    dir: saveDir(instancesDir, existing, meta.activeSaveId),
    reused: true,
  });
}

/** Steps 0–4 for the file at `path`; see the header. */
export async function importWorldBundle(
  core: HostCore,
  ensure: (instanceId: string, name: string) => Promise<Result<WorldEnsured>>,
  path: string,
  name: string,
): Promise<Result<BundleImported>> {
  const read = await readWorldFile(path);
  if (!read.ok) return read;
  const { report, opened } = read.value;
  if (opened === null) return refusal(report);
  const plan = importPlan(opened.genesis, opened.manifest);
  if (!plan.ok) return plan;
  if (report.problems.length > 0) return refusal(report);
  const packs = await installPacks(core, opened);
  if (!packs.ok) return packs;
  const world = opened.genesis.id;
  await mkdir(core.histories, { recursive: true });
  const restored = await locked(`world:${world}`, async () => {
    const done = await restoreHistory(
      core.histories,
      {
        pin: { v: 1, worldId: world, migrated: null },
        progress: null,
        entries: opened.entries,
        outbox: [],
      },
      core.deps.clock(),
    );
    core.forget(world);
    return done;
  });
  if (!restored.ok) return restored;
  const outcome = restored.value.outcome;
  if (outcome === "diverged") {
    return err(
      "world-history-diverged",
      "This device already holds another history of this world; both are kept.",
      "The file's copy is kept beside it as restored-<time>.jsonl; nothing was merged.",
    );
  }
  for (const work of packs.value.received) {
    const listed = await locked(`received:${world}`, () =>
      addReceivedWork(worldDir(core.histories, world), work),
    );
    if (!listed.ok) return listed;
  }
  const save = await saveFor(core, opened, packs.value.manifest, plan.value);
  if (!save.ok) return save;
  const progress = await readProgress(save.value.dir, world);
  if (!progress.ok) return progress;
  await writeProgress(save.value.dir, mergeProgress(progress.value, emptyWorldProgress(world)));
  const pin = await readWorldPin(save.value.dir);
  if (!pin.ok) return pin;
  if (pin.value === null)
    await writeWorldPin(save.value.dir, { v: 1, worldId: world, migrated: null });
  const ensured = await ensure(save.value.instanceId, name);
  if (!ensured.ok) return ensured;
  return ok({
    worldId: ensured.value.worldId,
    instanceId: save.value.instanceId,
    adoptedFrom: ensured.value.adoptedFrom,
    history: outcome,
    reused: save.value.reused,
  });
}
