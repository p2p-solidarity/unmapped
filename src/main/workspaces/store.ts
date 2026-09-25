import { mkdir, readdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { parseRules, parseScene } from "@dsl/index";
import { assetsForScene } from "@shared/assets";
import type {
  CartridgeManifest,
  CartridgeRef,
  CartridgeRevision,
  CreateWorkspaceOptions,
  WorkspaceMeta,
  WorkspaceRecord,
} from "@shared/cartridge";
import { WORKSPACE_FORMAT_VERSION } from "@shared/cartridge";
import { err, fail, ok, type Result, toError } from "@shared/result";
import { manifestCore, sha256 } from "../cartridges/integrity";
import { isCartridgeId, isCartridgeVersion, isSceneId } from "../cartridges/paths";
import { publishCartridgeRevision } from "../cartridges/store";
import { isWorkspaceId, workspaceDir, workspaceScenePath } from "./paths";
import { workspaceMetaSchema } from "./schemas";
import { validateWorkspace } from "./validation";

const WORKSPACE_FILE = "workspace.json";
const RULES_FILE = "rules.oui";

function refOf(revision: CartridgeRevision): CartridgeRef {
  const { cartridgeId, version, contentHash } = revision.manifest;
  return { cartridgeId, version, contentHash };
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

function normaliseSource(source: string): string {
  return `${source.replace(/\r\n?/g, "\n").replace(/\n*$/, "")}\n`;
}

function workspaceId(targetCartridgeId: string, now: Date): string {
  return `${targetCartridgeId}-${now.getTime().toString(36)}`;
}

export async function createWorkspaceFromRevision(
  workspacesDir: string,
  revision: CartridgeRevision,
  options: CreateWorkspaceOptions,
): Promise<Result<WorkspaceRecord>> {
  if (!isCartridgeId(options.targetCartridgeId)) {
    return err("workspace-cartridge-id-invalid", "The target cartridge id is invalid.");
  }
  if (
    (options.mode === "revision" && options.targetCartridgeId !== revision.manifest.cartridgeId) ||
    (options.mode === "remix" && options.targetCartridgeId === revision.manifest.cartridgeId)
  ) {
    return err(
      "workspace-mode-invalid",
      "A revision keeps its cartridge id; a remix must use a new cartridge id.",
    );
  }
  const now = options.now ?? new Date();
  const id = workspaceId(options.targetCartridgeId, now);
  const at = now.toISOString();
  const source = revision.manifest;
  const sourceCore = manifestCore(source);
  const sceneIds =
    source.formatVersion === 1
      ? source.scenes.map((scene) => scene.id)
      : source.definition.scenePlan.orderedSceneIds;
  const sceneTitles = new Map(
    source.formatVersion === 1
      ? source.scenes.map((scene) => [scene.id, scene.title])
      : source.definition.narrative.scenes.map((scene) => [scene.sceneId, scene.title]),
  );
  const meta: WorkspaceMeta = {
    formatVersion: WORKSPACE_FORMAT_VERSION,
    workspaceId: id,
    mode: options.mode,
    targetCartridgeId: options.targetCartridgeId,
    base: refOf(revision),
    name: options.name.trim(),
    description: source.description,
    author: options.author.trim(),
    engineApiVersion: source.engineApiVersion,
    saveSchemaVersion: source.saveSchemaVersion,
    sourceManifest: sourceCore,
    entrySceneId:
      source.formatVersion === 1 ? source.entrySceneId : source.definition.scenePlan.entrySceneId,
    ...(source.formatVersion === 1
      ? { story: source.story, requiredKits: source.requiredKits, genesis: source.genesis }
      : {}),
    scenes: sceneIds.map((sceneId) => ({
      id: sceneId,
      title: sceneTitles.get(sceneId) ?? sceneId,
    })),
    createdAt: at,
    updatedAt: at,
  };
  const parsedMeta = workspaceMetaSchema.safeParse(meta);
  if (!parsedMeta.success) {
    return err("workspace-invalid", parsedMeta.error.issues[0]?.message ?? "Invalid workspace");
  }
  const destination = workspaceDir(workspacesDir, id);
  const staging = join(workspacesDir, `.staging-${id}-${process.pid}-${Date.now()}`);
  try {
    await mkdir(workspacesDir, { recursive: true });
    if (await exists(destination))
      return err("workspace-exists", `Workspace ${id} already exists.`);
    await mkdir(join(staging, "scenes"), { recursive: true });
    await writeFile(join(staging, WORKSPACE_FILE), `${JSON.stringify(meta, null, 2)}\n`, "utf8");
    await writeFile(join(staging, RULES_FILE), revision.rules, "utf8");
    for (const [sceneId, scene] of Object.entries(revision.scenes)) {
      await writeFile(workspaceScenePath(staging, sceneId), scene, "utf8");
    }
    for (const [path, bytes] of Object.entries(revision.assets)) {
      const target = join(staging, "assets", path);
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, bytes);
    }
    await rename(staging, destination);
    return ok({
      meta,
      rules: revision.rules,
      scenes: { ...revision.scenes },
      assets: { ...revision.assets },
    });
  } catch (error) {
    await rm(staging, { recursive: true, force: true }).catch(() => undefined);
    return fail(toError(error, "workspace-create-failed"));
  }
}

export async function readWorkspace(
  workspacesDir: string,
  id: string,
): Promise<Result<WorkspaceRecord>> {
  if (!isWorkspaceId(id)) return err("workspace-id-invalid", `Invalid workspace id: ${id}`);
  try {
    const dir = workspaceDir(workspacesDir, id);
    const raw: unknown = JSON.parse(await readFile(join(dir, WORKSPACE_FILE), "utf8"));
    const parsed = workspaceMetaSchema.safeParse(raw);
    if (!parsed.success)
      return err("workspace-invalid", parsed.error.issues[0]?.message ?? "Invalid workspace");
    const meta = parsed.data;
    if (meta.workspaceId !== id)
      return err("workspace-identity-mismatch", "Workspace id does not match its directory.");
    const rules = await readFile(join(dir, RULES_FILE), "utf8");
    const scenes: Record<string, string> = {};
    for (const scene of meta.scenes)
      scenes[scene.id] = await readFile(workspaceScenePath(dir, scene.id), "utf8");
    const assets: Record<string, Uint8Array> = {};
    const assetsDir = join(dir, "assets");
    if (await exists(assetsDir)) {
      async function visit(path: string, prefix: string): Promise<void> {
        for (const entry of await readdir(path, { withFileTypes: true })) {
          const relative = `${prefix}${entry.name}`;
          if (entry.isDirectory()) await visit(join(path, entry.name), `${relative}/`);
          else if (entry.isFile()) assets[relative] = await readFile(join(path, entry.name));
        }
      }
      await visit(assetsDir, "");
    }
    return ok({ meta, rules, scenes, assets });
  } catch (error) {
    return fail(toError(error, "workspace-read-failed"));
  }
}

export async function writeWorkspaceScene(
  workspacesDir: string,
  id: string,
  sceneId: string,
  source: string,
  now: Date = new Date(),
): Promise<Result<WorkspaceMeta>> {
  if (!isSceneId(sceneId)) return err("workspace-scene-invalid", `Invalid scene id: ${sceneId}`);
  const workspace = await readWorkspace(workspacesDir, id);
  if (!workspace.ok) return workspace;
  if (!workspace.value.meta.scenes.some((scene) => scene.id === sceneId)) {
    return err("workspace-scene-unknown", `Scene ${sceneId} is not declared by this workspace.`);
  }
  const normalized = normaliseSource(source);
  const scene = parseScene(normalized);
  if (!scene.ok || scene.value.contract?.sceneId !== sceneId) {
    return err(
      "workspace-scene-invalid",
      scene.ok ? `Contract must use scene id ${sceneId}.` : scene.error.message,
      scene.ok ? "Keep stable scene ids when editing a workspace." : scene.error.hint,
    );
  }
  let sourceManifest = workspace.value.meta.sourceManifest;
  if (sourceManifest?.formatVersion === 2) {
    const selected = sourceManifest.definition.scenes.find((scene) => scene.sceneId === sceneId);
    if (selected === undefined) {
      return err("workspace-scene-unknown", `Scene ${sceneId} is absent from the v2 definition.`);
    }
    sourceManifest = structuredClone(sourceManifest);
    const nextSelected = sourceManifest.definition.scenes.find(
      (scene) => scene.sceneId === sceneId,
    );
    if (nextSelected !== undefined) {
      nextSelected.sourceHash = sha256(normalized);
      nextSelected.assets = assetsForScene(scene.value);
    }
  }
  const meta = { ...workspace.value.meta, sourceManifest, updatedAt: now.toISOString() };
  try {
    const dir = workspaceDir(workspacesDir, id);
    await writeFile(workspaceScenePath(dir, sceneId), normalized, "utf8");
    await writeFile(join(dir, WORKSPACE_FILE), `${JSON.stringify(meta, null, 2)}\n`, "utf8");
    return ok(meta);
  } catch (error) {
    return fail(toError(error, "workspace-write-failed"));
  }
}

export async function writeWorkspaceRules(
  workspacesDir: string,
  id: string,
  source: string,
  now: Date = new Date(),
): Promise<Result<WorkspaceMeta>> {
  const workspace = await readWorkspace(workspacesDir, id);
  if (!workspace.ok) return workspace;
  const normalized = normaliseSource(source);
  const rules = parseRules(normalized);
  if (!rules.ok) return rules;
  const configured = new Set(rules.value.kits.map((kit) => kit.id));
  if ((workspace.value.meta.requiredKits ?? []).some((kit) => !configured.has(kit))) {
    return err(
      "workspace-kit-missing",
      "rules.oui must configure every kit required by this workspace.",
    );
  }
  const meta = { ...workspace.value.meta, updatedAt: now.toISOString() };
  try {
    const dir = workspaceDir(workspacesDir, id);
    await writeFile(join(dir, RULES_FILE), normalized, "utf8");
    await writeFile(join(dir, WORKSPACE_FILE), `${JSON.stringify(meta, null, 2)}\n`, "utf8");
    return ok(meta);
  } catch (error) {
    return fail(toError(error, "workspace-write-failed"));
  }
}

export async function publishWorkspace(
  workspacesDir: string,
  cartridgesDir: string,
  id: string,
  version: string,
): Promise<Result<CartridgeManifest>> {
  if (!isCartridgeVersion(version)) return err("cartridge-version-invalid", "Use strict SemVer.");
  const workspace = await readWorkspace(workspacesDir, id);
  if (!workspace.ok) return workspace;
  const preview = validateWorkspace(workspace.value);
  if (!preview.valid) {
    const messages = preview.checks.flatMap((check) => check.messages);
    return err(
      "workspace-validation-failed",
      messages[0] ?? "The workspace is not valid for publishing.",
      "Run Validate & Preview and fix every failed check before publishing.",
    );
  }
  const { meta, rules, scenes, assets } = workspace.value;
  if (meta.sourceManifest?.formatVersion === 2) {
    const source = meta.sourceManifest;
    const definition = structuredClone(source.definition);
    definition.gameId = meta.targetCartridgeId;
    definition.title = meta.name;
    definition.description = meta.description;
    definition.author = meta.author;
    definition.provenance = {
      ...definition.provenance,
      source: meta.mode === "remix" ? "remix" : definition.provenance.source,
      parent: meta.base,
    };
    return publishCartridgeRevision(cartridgesDir, {
      manifest: {
        ...source,
        cartridgeId: meta.targetCartridgeId,
        version,
        name: meta.name,
        description: meta.description,
        author: meta.author,
        createdAt: meta.updatedAt,
        definition,
        lineage: { kind: meta.mode, parent: meta.base },
      },
      rules,
      scenes,
      assets,
    });
  }
  if (meta.story === undefined || meta.requiredKits === undefined || meta.genesis === undefined) {
    return err(
      "workspace-source-invalid",
      "The legacy workspace is missing its source definition.",
    );
  }
  return publishCartridgeRevision(cartridgesDir, {
    manifest: {
      formatVersion: 1,
      cartridgeId: meta.targetCartridgeId,
      version,
      name: meta.name,
      description: meta.description,
      author: meta.author,
      // Publishing the same untouched workspace twice must be idempotent. Its last edit timestamp
      // is stable until content changes, unlike the wall clock when Publish is clicked.
      createdAt: meta.updatedAt,
      engineApiVersion: meta.engineApiVersion,
      saveSchemaVersion: meta.saveSchemaVersion,
      entrySceneId: meta.entrySceneId,
      story: meta.story,
      scenes: meta.scenes,
      requiredKits: meta.requiredKits,
      genesis: meta.genesis,
      lineage: { kind: meta.mode, parent: meta.base },
    },
    rules,
    scenes,
    assets,
  });
}

export async function listWorkspaces(workspacesDir: string): Promise<Result<WorkspaceMeta[]>> {
  if (!(await exists(workspacesDir))) return ok([]);
  try {
    const metas: WorkspaceMeta[] = [];
    const entries = await readdir(workspacesDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory() || !isWorkspaceId(entry.name)) continue;
      const workspace = await readWorkspace(workspacesDir, entry.name);
      if (!workspace.ok) return workspace;
      metas.push(workspace.value.meta);
    }
    metas.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    return ok(metas);
  } catch (error) {
    return fail(toError(error, "workspace-list-failed"));
  }
}
