import { mkdir, readdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { parseScene } from "@dsl/index";
import type {
  CartridgeManifest,
  CartridgeRef,
  InstanceMeta,
  InstanceProgressInput,
  InstanceRecord,
  ResolvedInstance,
  SaveState,
} from "@shared/cartridge";
import { INSTANCE_FORMAT_VERSION, SAVE_FORMAT_VERSION } from "@shared/cartridge";
import { endlessTemplate, seedFromText } from "@shared/endless";
import { err, fail, ok, type Result, toError } from "@shared/result";
import { completeScene, transitionScene } from "@shared/sceneTransition";
import { EMPTY_INVENTORY, type SceneGraph } from "@shared/world";
import { deriveRuntimePin, verifyRuntimePin } from "../cartridges/integrity";
import { cartridgeCompatibility, readCartridgeRevision } from "../cartridges/store";
import { parseKarmaText } from "../worlds/schemas";
import { legacyInstanceMetaSchema, upgradeLegacyInstance } from "./legacy";
import { instanceDir, isInstanceId, isSaveId, saveDir } from "./paths";
import { instanceMetaSchema, saveStateSchema } from "./schemas";

const DEFAULT_SAVE_ID = "default";
/**
 * A save written by an older build (instance format 1) that cannot be upgraded on read — its exact
 * cartridge revision is not installed, or it is damaged. Listed separately, never modified.
 */
export const LEGACY_INSTANCE_CODE = "instance-legacy-format";

function slug(value: string): string {
  const cleaned = value
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48)
    .replace(/-+$/g, "");
  return cleaned || "instance";
}

function makeInstanceId(name: string, now: Date): string {
  return `${slug(name)}-${now.getTime().toString(36)}`;
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

function refOf(manifest: CartridgeManifest): CartridgeRef {
  return {
    cartridgeId: manifest.cartridgeId,
    version: manifest.version,
    contentHash: manifest.contentHash,
  };
}

export async function createInstance(
  instancesDir: string,
  manifest: CartridgeManifest,
  name: string,
  now: Date = new Date(),
  seed?: string,
): Promise<Result<InstanceRecord>> {
  const compatibility = cartridgeCompatibility(manifest);
  if (!compatibility.ok) return compatibility;
  const instanceId = makeInstanceId(name, now);
  const at = now.toISOString();
  const cartridge = refOf(manifest);
  const pin = deriveRuntimePin(manifest);
  if (!pin.ok) return pin;
  const runtimePin = pin.value;
  const meta: InstanceMeta = {
    formatVersion: INSTANCE_FORMAT_VERSION,
    instanceId,
    name: name.trim(),
    cartridge,
    runtimePin,
    activeSaveId: DEFAULT_SAVE_ID,
    saveSchemaVersion: manifest.saveSchemaVersion,
    createdAt: at,
    updatedAt: at,
  };
  const save: SaveState = {
    formatVersion: SAVE_FORMAT_VERSION,
    instanceId,
    cartridge,
    runtimePin,
    saveSchemaVersion: manifest.saveSchemaVersion,
    currentSceneId:
      manifest.formatVersion === 1
        ? manifest.entrySceneId
        : manifest.definition.scenePlan.entrySceneId,
    flags: {},
    inventory: { items: [...EMPTY_INVENTORY.items], materials: [...EMPTY_INVENTORY.materials] },
    player: null,
    party: null,
    mutation: null,
    completedSceneIds: [],
    ...(seed === undefined ? {} : { seed }),
    updatedAt: at,
  };
  const record: InstanceRecord = { meta, save, karma: [] };
  const destination = instanceDir(instancesDir, instanceId);
  const staging = join(instancesDir, `.staging-${instanceId}-${process.pid}-${Date.now()}`);
  try {
    if (name.trim().length === 0) return err("instance-name-invalid", "Instance name is empty.");
    await mkdir(instancesDir, { recursive: true });
    if (await exists(destination)) {
      return err(
        "instance-exists",
        `Instance ${instanceId} already exists.`,
        "Choose a different name or retry later.",
      );
    }
    await mkdir(join(staging, "saves", DEFAULT_SAVE_ID), { recursive: true });
    await writeFile(join(staging, "instance.json"), `${JSON.stringify(meta, null, 2)}\n`, "utf8");
    await writeFile(
      join(staging, "saves", DEFAULT_SAVE_ID, "save.json"),
      `${JSON.stringify(save, null, 2)}\n`,
      "utf8",
    );
    await writeFile(join(staging, "saves", DEFAULT_SAVE_ID, "karma.jsonl"), "", "utf8");
    await rename(staging, destination);
    return ok(record);
  } catch (error) {
    await rm(staging, { recursive: true, force: true }).catch(() => undefined);
    return fail(toError(error, "instance-create-failed"));
  }
}

function sameRef(a: CartridgeRef, b: CartridgeRef): boolean {
  return (
    a.cartridgeId === b.cartridgeId && a.version === b.version && a.contentHash === b.contentHash
  );
}

/**
 * A format 1 instance read as the current format (legacy.ts), when `cartridgesDir` holds the exact
 * revision it names. Anything else keeps it in the "older build" bucket, untouched on disk.
 */
async function readLegacyInstance(
  instancesDir: string,
  instanceId: string,
  rawMeta: unknown,
  cartridgesDir: string | undefined,
): Promise<Result<{ meta: InstanceMeta; save: SaveState }>> {
  const legacy = (why: string, hint: string): Result<never> =>
    err(
      LEGACY_INSTANCE_CODE,
      `Save ${instanceId} was written by an older build (instance format 1)${why}`,
      `${hint} It is left untouched on disk.`,
    );
  if (cartridgesDir === undefined) return legacy(".", "Open it from the library.");
  const meta = legacyInstanceMetaSchema.safeParse(rawMeta);
  if (!meta.success || meta.data.instanceId !== instanceId || !isSaveId(meta.data.activeSaveId)) {
    return legacy(" and its instance.json is damaged.", "Restore it from a backup.");
  }
  const ref = meta.data.cartridge;
  const cartridge = await readCartridgeRevision(cartridgesDir, ref.cartridgeId, ref.version);
  if (!cartridge.ok || cartridge.value.manifest.contentHash !== ref.contentHash) {
    return legacy(
      ` and its cartridge ${ref.cartridgeId}@${ref.version} is not installed with the same content.`,
      "Import that exact cartridge revision to open it.",
    );
  }
  let rawSave: unknown;
  try {
    const path = join(saveDir(instancesDir, instanceId, meta.data.activeSaveId), "save.json");
    rawSave = JSON.parse(await readFile(path, "utf8"));
  } catch {
    return legacy(" and its save.json cannot be read.", "Restore it from a backup.");
  }
  const upgraded = upgradeLegacyInstance(rawMeta, rawSave, cartridge.value.manifest);
  return upgraded.ok
    ? upgraded
    : legacy(`: ${upgraded.error.message}`, "Restore it from a backup.");
}

/**
 * Reads an instance and its active save. Saves from an older build (format 1) are upgraded in
 * memory when `cartridgesDir` is given; without it they report `LEGACY_INSTANCE_CODE`.
 */
export async function readInstance(
  instancesDir: string,
  instanceId: string,
  cartridgesDir?: string,
): Promise<Result<InstanceRecord>> {
  if (!isInstanceId(instanceId))
    return err("instance-id-invalid", `Invalid instance id: ${instanceId}`);
  try {
    const dir = instanceDir(instancesDir, instanceId);
    const rawMeta: unknown = JSON.parse(await readFile(join(dir, "instance.json"), "utf8"));
    let meta: InstanceMeta;
    let save: SaveState;
    if ((rawMeta as { formatVersion?: unknown } | null)?.formatVersion === 1) {
      const upgraded = await readLegacyInstance(instancesDir, instanceId, rawMeta, cartridgesDir);
      if (!upgraded.ok) return upgraded;
      ({ meta, save } = upgraded.value);
    } else {
      const parsedMeta = instanceMetaSchema.safeParse(rawMeta);
      if (!parsedMeta.success)
        return err(
          "instance-invalid",
          parsedMeta.error.issues[0]?.message ?? "Invalid instance.json",
        );
      meta = parsedMeta.data;
      if (meta.instanceId !== instanceId || !isSaveId(meta.activeSaveId)) {
        return err(
          "instance-identity-mismatch",
          "The instance identity does not match its directory.",
        );
      }
      const rawSave: unknown = JSON.parse(
        await readFile(
          join(saveDir(instancesDir, instanceId, meta.activeSaveId), "save.json"),
          "utf8",
        ),
      );
      const parsedSave = saveStateSchema.safeParse(rawSave);
      if (!parsedSave.success)
        return err("save-invalid", parsedSave.error.issues[0]?.message ?? "Invalid save.json");
      save = parsedSave.data;
    }
    const currentSaveDir = saveDir(instancesDir, instanceId, meta.activeSaveId);
    if (
      save.instanceId !== instanceId ||
      !sameRef(meta.cartridge, save.cartridge) ||
      !sameRef(meta.runtimePin.cartridge, meta.cartridge) ||
      !sameRef(save.runtimePin.cartridge, save.cartridge) ||
      JSON.stringify(meta.runtimePin) !== JSON.stringify(save.runtimePin)
    ) {
      return err(
        "save-identity-mismatch",
        "The save does not belong to this instance and cartridge.",
      );
    }
    const karma = parseKarmaText(await readFile(join(currentSaveDir, "karma.jsonl"), "utf8"));
    if (!karma.ok) return karma;
    return ok({ meta, save, karma: karma.value });
  } catch (error) {
    return fail(toError(error, "instance-read-failed"));
  }
}

export async function resolveInstance(
  cartridgesDir: string,
  instancesDir: string,
  instanceId: string,
): Promise<Result<ResolvedInstance>> {
  const instance = await readInstance(instancesDir, instanceId, cartridgesDir);
  if (!instance.ok) return instance;
  const ref = instance.value.meta.cartridge;
  const cartridge = await readCartridgeRevision(cartridgesDir, ref.cartridgeId, ref.version);
  if (!cartridge.ok) return cartridge;
  const compatibility = cartridgeCompatibility(cartridge.value.manifest);
  if (!compatibility.ok) return compatibility;
  if (cartridge.value.manifest.contentHash !== ref.contentHash) {
    return err(
      "instance-cartridge-mismatch",
      "The installed cartridge does not match the instance pin.",
      "Restore the exact cartridge revision used by this save.",
    );
  }
  const verifiedPin = verifyRuntimePin(cartridge.value.manifest, instance.value.meta.runtimePin);
  if (!verifiedPin.ok) return verifiedPin;
  const verifiedSavePin = verifyRuntimePin(
    cartridge.value.manifest,
    instance.value.save.runtimePin,
  );
  if (!verifiedSavePin.ok) return verifiedSavePin;
  if (instance.value.save.saveSchemaVersion !== cartridge.value.manifest.saveSchemaVersion) {
    return err(
      "save-schema-mismatch",
      "The save schema does not match its cartridge revision.",
      "Restore the exact revision or migrate the save explicitly.",
    );
  }
  return ok({ instance: instance.value, cartridge: cartridge.value });
}

/** Atomically replaces the active save and stamps instance.json with the same `updatedAt`. */
export async function writeInstanceSave(
  instancesDir: string,
  resolved: ResolvedInstance,
  save: SaveState,
): Promise<Result<ResolvedInstance>> {
  const { instance, cartridge } = resolved;
  const meta: InstanceMeta = { ...instance.meta, updatedAt: save.updatedAt };
  const currentSaveDir = saveDir(instancesDir, instance.meta.instanceId, meta.activeSaveId);
  const savePath = join(currentSaveDir, "save.json");
  const metaPath = join(instanceDir(instancesDir, instance.meta.instanceId), "instance.json");
  const suffix = `${process.pid}-${Date.now()}`;
  const stagedSave = `${savePath}.${suffix}.tmp`;
  const stagedMeta = `${metaPath}.${suffix}.tmp`;
  try {
    await writeFile(stagedSave, `${JSON.stringify(save, null, 2)}\n`, "utf8");
    await writeFile(stagedMeta, `${JSON.stringify(meta, null, 2)}\n`, "utf8");
    await rename(stagedSave, savePath);
    await rename(stagedMeta, metaPath);
    return ok({ cartridge, instance: { ...instance, meta, save } });
  } catch (error) {
    await Promise.all([
      rm(stagedSave, { force: true }).catch(() => undefined),
      rm(stagedMeta, { force: true }).catch(() => undefined),
    ]);
    return fail(toError(error, "instance-save-failed"));
  }
}

function pinnedScene(resolved: ResolvedInstance, sceneId: string): Result<SceneGraph> {
  const source = resolved.cartridge.scenes[sceneId];
  if (source === undefined) {
    return err(
      "instance-scene-missing",
      `Scene ${sceneId} is absent from the pinned cartridge.`,
      "Restore the exact cartridge revision used by this instance.",
    );
  }
  const scene = parseScene(source);
  return scene.ok
    ? scene
    : err(
        "instance-scene-invalid",
        scene.error.message,
        "Restore the exact cartridge revision used by this instance.",
      );
}

export async function transitionInstance(
  cartridgesDir: string,
  instancesDir: string,
  instanceId: string,
  targetSceneId: string,
  now: Date = new Date(),
): Promise<Result<ResolvedInstance>> {
  const resolved = await resolveInstance(cartridgesDir, instancesDir, instanceId);
  if (!resolved.ok) return resolved;
  const from = pinnedScene(resolved.value, resolved.value.instance.save.currentSceneId);
  if (!from.ok) return from;
  const target = pinnedScene(resolved.value, targetSceneId);
  if (!target.ok) return target;
  const transitioned = transitionScene(resolved.value.instance.save, from.value, target.value, now);
  if (!transitioned.ok) return transitioned;
  return writeInstanceSave(instancesDir, resolved.value, transitioned.value);
}

/**
 * Takes the stairs below a finished cartridge. The save keeps its authored checkpoint and gains an
 * endless depth; the floor itself is regenerated from that depth, never stored (Rule 9).
 */
export async function descendInstance(
  cartridgesDir: string,
  instancesDir: string,
  instanceId: string,
  now: Date = new Date(),
): Promise<Result<ResolvedInstance>> {
  const resolved = await resolveInstance(cartridgesDir, instancesDir, instanceId);
  if (!resolved.ok) return resolved;
  const { save } = resolved.value.instance;
  if (!save.completedSceneIds.includes(save.currentSceneId)) {
    return err(
      "endless-locked",
      "The depths open only after this cartridge's ending.",
      "Reach the ending gate first.",
    );
  }
  const { manifest } = resolved.value.cartridge;
  const sceneIds =
    manifest.formatVersion === 1
      ? manifest.scenes.map((scene) => scene.id)
      : manifest.definition.scenePlan.orderedSceneIds;
  const scenes = [];
  for (const sceneId of sceneIds) {
    const graph = pinnedScene(resolved.value, sceneId);
    if (!graph.ok) return graph;
    scenes.push({ sceneId, graph: graph.value });
  }
  if (endlessTemplate(scenes) === null) {
    return err(
      "endless-unavailable",
      "This cartridge has no scene you can walk in, so it has no depths below it.",
      "Endless floors continue from a scene whose kit lets the player move.",
    );
  }
  return writeInstanceSave(instancesDir, resolved.value, {
    ...save,
    endless: {
      seed: save.endless?.seed ?? seedFromText(save.instanceId),
      depth: (save.endless?.depth ?? 0) + 1,
    },
    updatedAt: now.toISOString(),
  });
}

/** Ends the cartridge from its terminal scene. The checkpoint stays there, marked completed. */
export async function completeInstance(
  cartridgesDir: string,
  instancesDir: string,
  instanceId: string,
  now: Date = new Date(),
): Promise<Result<ResolvedInstance>> {
  const resolved = await resolveInstance(cartridgesDir, instancesDir, instanceId);
  if (!resolved.ok) return resolved;
  const current = pinnedScene(resolved.value, resolved.value.instance.save.currentSceneId);
  if (!current.ok) return current;
  const completed = completeScene(resolved.value.instance.save, current.value, now);
  if (!completed.ok) return completed;
  return writeInstanceSave(instancesDir, resolved.value, completed.value);
}

/** `cartridgesDir` lets a save from an older build be checkpointed — in the current format. */
export async function checkpointInstance(
  instancesDir: string,
  input: InstanceProgressInput,
  now: Date = new Date(),
  cartridgesDir?: string,
): Promise<Result<InstanceMeta>> {
  const current = await readInstance(instancesDir, input.instanceId, cartridgesDir);
  if (!current.ok) return current;
  if (current.value.meta.updatedAt !== input.expectedUpdatedAt) {
    return err(
      "instance-save-conflict",
      "This save changed after it was loaded.",
      "Reload the instance before saving again.",
    );
  }
  const updatedAt = now.toISOString();
  const save: SaveState = {
    ...current.value.save,
    flags: { ...input.flags },
    inventory: input.inventory,
    mutation: input.mutation,
    ...(input.position === undefined ? {} : { position: input.position }),
    ...(input.land === undefined ? {} : { land: input.land }),
    updatedAt,
  };
  const meta: InstanceMeta = { ...current.value.meta, updatedAt };
  const currentSaveDir = saveDir(instancesDir, input.instanceId, meta.activeSaveId);
  const instancePath = join(instanceDir(instancesDir, input.instanceId), "instance.json");
  const outputs = [
    { path: join(currentSaveDir, "save.json"), content: `${JSON.stringify(save, null, 2)}\n` },
    { path: join(currentSaveDir, "karma.jsonl"), content: serializeKarma(input.karma) },
    { path: instancePath, content: `${JSON.stringify(meta, null, 2)}\n` },
  ];
  const suffix = `${process.pid}-${Date.now()}`;
  try {
    for (const output of outputs) await writeFile(`${output.path}.${suffix}.tmp`, output.content);
    for (const output of outputs) await rename(`${output.path}.${suffix}.tmp`, output.path);
    return ok(meta);
  } catch (error) {
    await Promise.all(
      outputs.map((output) =>
        rm(`${output.path}.${suffix}.tmp`, { force: true }).catch(() => undefined),
      ),
    );
    return fail(toError(error, "instance-checkpoint-failed"));
  }
}

function serializeKarma(entries: InstanceRecord["karma"]): string {
  return entries.length === 0
    ? ""
    : `${entries.map((entry) => JSON.stringify(entry)).join("\n")}\n`;
}

/** With `cartridgesDir`, saves from an older build whose cartridge is installed are listed too. */
export async function listInstances(
  instancesDir: string,
  cartridgesDir?: string,
): Promise<Result<InstanceMeta[]>> {
  if (!(await exists(instancesDir))) return ok([]);
  try {
    const metas: InstanceMeta[] = [];
    const entries = await readdir(instancesDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory() || !isInstanceId(entry.name)) continue;
      const instance = await readInstance(instancesDir, entry.name, cartridgesDir);
      // One old save must not hide every other save: format 1 saves are listed by listLegacyInstances.
      if (!instance.ok && instance.error.code === LEGACY_INSTANCE_CODE) continue;
      if (!instance.ok) return instance;
      metas.push(instance.value.meta);
    }
    metas.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    return ok(metas);
  } catch (error) {
    return fail(toError(error, "instance-list-failed"));
  }
}

/** Ids of saves an older build wrote that this build cannot open (see `LEGACY_INSTANCE_CODE`). */
export async function listLegacyInstances(
  instancesDir: string,
  cartridgesDir?: string,
): Promise<Result<string[]>> {
  if (!(await exists(instancesDir))) return ok([]);
  try {
    const ids: string[] = [];
    for (const entry of await readdir(instancesDir, { withFileTypes: true })) {
      if (!entry.isDirectory() || !isInstanceId(entry.name)) continue;
      const instance = await readInstance(instancesDir, entry.name, cartridgesDir);
      if (!instance.ok && instance.error.code === LEGACY_INSTANCE_CODE) ids.push(entry.name);
    }
    return ok(ids.sort());
  } catch (error) {
    return fail(toError(error, "instance-list-failed"));
  }
}
