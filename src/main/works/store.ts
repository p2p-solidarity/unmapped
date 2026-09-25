// Immutable world revisions (`works/<workId>/<version>/`) and journeys pinned to them
// (`work-plays/<playId>/play.json`). The same ownership split as cartridges and instances (Rule 9):
// published content is never rewritten, and progress only ever names an exact content hash.

import { randomBytes } from "node:crypto";
import { mkdir, readdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { CartridgeFileIntegrity, ContentHash } from "@shared/cartridge";
import { compareCartridgeVersions } from "@shared/cartridge";
import { err, ok, type Result } from "@shared/result";
import {
  assetMapSchema,
  type Json,
  jsonBytes,
  jsonSchema,
  PLAY_ID,
  type PlayChange,
  WORK_ASSET_FILE,
  WORK_FORMAT,
  WORK_FORMAT_VERSION,
  WORK_HOST_API,
  WORK_ID,
  WORK_LIMITS,
  type WorkManifest,
  type WorkManifestCore,
  type WorkPlay,
  type WorkRef,
  type WorkText,
} from "@shared/works";
import { z } from "zod";
import { canonicalJson, sha256 } from "../cartridges/integrity";

const MANIFEST = "work.json";
const PLAY = "play.json";
const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

export interface WorkDirs {
  worksDir: string;
  playsDir: string;
  draftsDir: string;
}

/** A world's files as stored: the three text files plus its own images. */
export interface WorkContent {
  text: WorkText;
  images: Record<string, Uint8Array>;
}

export interface WorkRevision {
  manifest: WorkManifest;
  content: WorkContent;
}

const queues = new Map<string, Promise<unknown>>();

/**
 * One read-modify-write per key at a time. A world saves often and completes once; without this a
 * save that read the file before the completion was written puts the old completions back.
 */
export function locked<T>(key: string, run: () => Promise<T>): Promise<T> {
  const previous = queues.get(key) ?? Promise.resolve();
  const next = previous.then(run, run);
  queues.set(
    key,
    next.catch(() => undefined),
  );
  return next;
}

/** Atomic JSON write: a crash leaves the old file or the new one, never half of either. */
export async function writeJsonAtomic(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const staged = `${path}.${randomBytes(6).toString("hex")}.tmp`;
  await writeFile(staged, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(staged, path);
}

function fileEntry(path: string, bytes: Uint8Array | string): CartridgeFileIntegrity {
  const data = typeof bytes === "string" ? new TextEncoder().encode(bytes) : bytes;
  return { path, bytes: data.length, contentHash: sha256(data) };
}

export function contentFiles(content: WorkContent): Array<[string, Uint8Array | string]> {
  return [
    ["main.js", content.text.main],
    ["style.css", content.text.style],
    ["assets.json", content.text.assets],
    ...Object.entries(content.images),
  ];
}

export function workContentHash(
  core: WorkManifestCore,
  files: CartridgeFileIntegrity[],
): ContentHash {
  const sorted = [...files].sort((a, b) => a.path.localeCompare(b.path));
  return sha256(canonicalJson({ manifest: core, files: sorted }));
}

/** Every rule a stored world must satisfy, applied again on every read (files can be edited). */
export function checkContent(content: WorkContent): Result<void> {
  for (const [path, bytes] of contentFiles(content)) {
    const size = typeof bytes === "string" ? new TextEncoder().encode(bytes).length : bytes.length;
    const limit = typeof bytes === "string" ? WORK_LIMITS.codeBytes : WORK_LIMITS.assetBytes;
    if (size > limit) return err("work-too-large", `${path} is ${size} bytes (limit ${limit}).`);
  }
  const images = Object.entries(content.images);
  if (images.length > WORK_LIMITS.assetCount) return err("work-too-large", "Too many images.");
  const total = images.reduce((sum, [, bytes]) => sum + bytes.length, 0);
  if (total > WORK_LIMITS.totalAssetBytes) return err("work-too-large", "Images exceed 6 MB.");
  for (const [path] of images) {
    if (!WORK_ASSET_FILE.test(path))
      return err("work-invalid", `${path} is not an allowed image path.`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(content.text.assets);
  } catch {
    return err("work-invalid", "assets.json is not valid JSON.");
  }
  const assets = assetMapSchema.safeParse(parsed);
  if (!assets.success) return err("work-invalid", "assets.json does not match the asset map.");
  for (const entry of Object.values(assets.data)) {
    if (entry.src?.startsWith("assets/") && content.images[entry.src] === undefined) {
      return err("work-invalid", `assets.json points at ${entry.src}, which is not in this world.`);
    }
  }
  return ok(undefined);
}

export async function readContent(dir: string): Promise<Result<WorkContent>> {
  try {
    const [main, style, assets] = await Promise.all(
      ["main.js", "style.css", "assets.json"].map((name) => readFile(join(dir, name), "utf8")),
    );
    const images: Record<string, Uint8Array> = {};
    const assetDir = join(dir, "assets");
    const names = await readdir(assetDir).catch(() => [] as string[]);
    for (const name of names) {
      const path = `assets/${name}`;
      if (!WORK_ASSET_FILE.test(path)) continue;
      images[path] = new Uint8Array(await readFile(join(assetDir, name)));
    }
    const content = {
      text: { main: main ?? "", style: style ?? "", assets: assets ?? "{}" },
      images,
    };
    const checked = checkContent(content);
    return checked.ok ? ok(content) : checked;
  } catch (error) {
    return err("work-unreadable", error instanceof Error ? error.message : String(error));
  }
}

export async function writeContent(dir: string, content: WorkContent): Promise<void> {
  await mkdir(join(dir, "assets"), { recursive: true });
  for (const [path, bytes] of contentFiles(content)) await writeFile(join(dir, path), bytes);
}

const refSchema = z.object({
  workId: z.string().regex(WORK_ID),
  version: z.string().regex(SEMVER),
  contentHash: z.string().regex(/^sha256:[a-f0-9]{64}$/),
});

const manifestSchema = z.object({
  format: z.literal(WORK_FORMAT),
  formatVersion: z.literal(WORK_FORMAT_VERSION),
  hostApi: z.literal(WORK_HOST_API),
  workId: z.string().regex(WORK_ID),
  version: z.string().regex(SEMVER),
  title: z.string().min(1).max(120),
  description: z.string().max(WORK_LIMITS.summaryChars),
  createdAt: z.string(),
  lineage: z.object({
    kind: z.enum(["new", "revision"]),
    parent: refSchema.nullable(),
    draftId: z.string().nullable(),
  }),
  files: z.array(
    z.object({
      path: z.string(),
      bytes: z.number().int().min(0),
      contentHash: z.string().regex(/^sha256:[a-f0-9]{64}$/),
    }),
  ),
  contentHash: z.string().regex(/^sha256:[a-f0-9]{64}$/),
});

export async function readRevision(
  dirs: WorkDirs,
  workId: string,
  version: string,
): Promise<Result<WorkRevision>> {
  if (!WORK_ID.test(workId) || !SEMVER.test(version))
    return err("work-invalid", "Bad work id or version.");
  const dir = join(dirs.worksDir, workId, version);
  let raw: unknown;
  try {
    raw = JSON.parse(await readFile(join(dir, MANIFEST), "utf8"));
  } catch {
    return err("work-missing", `World ${workId}@${version} is not installed.`);
  }
  const parsed = manifestSchema.safeParse(raw);
  if (!parsed.success) return err("work-invalid", `${workId}@${version}: work.json is malformed.`);
  const manifest = parsed.data as WorkManifest;
  const content = await readContent(dir);
  if (!content.ok) return content;
  const files = contentFiles(content.value).map(([path, bytes]) => fileEntry(path, bytes));
  const { files: _files, contentHash: _hash, ...core } = manifest;
  if (workContentHash(core, files) !== manifest.contentHash) {
    return err(
      "work-tampered",
      `${workId}@${version} no longer matches its content hash.`,
      "The published files were changed on disk; publish a new version instead.",
    );
  }
  return ok({ manifest, content: content.value });
}

export async function listRevisions(dirs: WorkDirs): Promise<Result<WorkManifest[]>> {
  const out: WorkManifest[] = [];
  const ids = await readdir(dirs.worksDir).catch(() => [] as string[]);
  for (const workId of ids.filter((id) => WORK_ID.test(id))) {
    const versions = await readdir(join(dirs.worksDir, workId)).catch(() => [] as string[]);
    for (const version of versions.filter((v) => SEMVER.test(v))) {
      const revision = await readRevision(dirs, workId, version);
      if (revision.ok) out.push(revision.value.manifest);
    }
  }
  out.sort(
    (a, b) => a.workId.localeCompare(b.workId) || compareCartridgeVersions(b.version, a.version),
  );
  return ok(out);
}

export interface PublishWorkInput {
  workId: string;
  title: string;
  description: string;
  content: WorkContent;
  parent: WorkRef | null;
  draftId: string | null;
  now?: Date;
}

/** Next free patch version of `workId`; 1.0.0 for a new world. */
async function nextVersion(dirs: WorkDirs, workId: string): Promise<string> {
  const versions = (await readdir(join(dirs.worksDir, workId)).catch(() => [] as string[])).filter(
    (v) => SEMVER.test(v),
  );
  if (versions.length === 0) return "1.0.0";
  versions.sort(compareCartridgeVersions);
  const [major, minor, patch] = (versions.at(-1) ?? "1.0.0").split(".").map(Number);
  return `${major}.${minor}.${(patch ?? 0) + 1}`;
}

export async function publishRevision(
  dirs: WorkDirs,
  input: PublishWorkInput,
): Promise<Result<WorkManifest>> {
  if (!WORK_ID.test(input.workId)) return err("work-invalid", "Bad work id.");
  const checked = checkContent(input.content);
  if (!checked.ok) return checked;
  const version = await nextVersion(dirs, input.workId);
  const core: WorkManifestCore = {
    format: WORK_FORMAT,
    formatVersion: WORK_FORMAT_VERSION,
    hostApi: WORK_HOST_API,
    workId: input.workId,
    version,
    title: input.title.slice(0, 120) || input.workId,
    description: input.description.slice(0, WORK_LIMITS.summaryChars),
    createdAt: (input.now ?? new Date()).toISOString(),
    lineage: {
      kind: input.parent === null ? "new" : "revision",
      parent: input.parent,
      draftId: input.draftId,
    },
  };
  const files = contentFiles(input.content).map(([path, bytes]) => fileEntry(path, bytes));
  const manifest: WorkManifest = { ...core, files, contentHash: workContentHash(core, files) };
  const destination = join(dirs.worksDir, input.workId, version);
  const staging = `${destination}.${randomBytes(6).toString("hex")}.staging`;
  try {
    await writeContent(staging, input.content);
    await writeFile(join(staging, MANIFEST), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
    await rename(staging, destination);
  } catch (error) {
    await rm(staging, { recursive: true, force: true });
    return err("work-publish-failed", error instanceof Error ? error.message : String(error));
  }
  return ok(manifest);
}

const playSchema = z.object({
  formatVersion: z.literal(1),
  playId: z.string().regex(PLAY_ID),
  title: z.string().max(200),
  worlds: z.array(refSchema).min(1).max(WORK_LIMITS.worldsPerPlay),
  current: z.number().int().min(0),
  states: z.array(jsonSchema.nullable()),
  carry: jsonSchema.nullable(),
  completions: z.array(
    z.object({ world: z.number().int().min(0), summary: z.string(), at: z.string() }),
  ),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export async function readPlay(dirs: WorkDirs, playId: string): Promise<Result<WorkPlay>> {
  if (!PLAY_ID.test(playId)) return err("play-invalid", "Bad play id.");
  try {
    const raw = JSON.parse(await readFile(join(dirs.playsDir, playId, PLAY), "utf8"));
    const parsed = playSchema.safeParse(raw);
    if (!parsed.success) return err("play-invalid", `${playId}: play.json is malformed.`);
    const play = parsed.data as WorkPlay;
    if (play.states.length !== play.worlds.length || play.current >= play.worlds.length) {
      return err("play-invalid", `${playId}: world index and states disagree.`);
    }
    return ok(play);
  } catch {
    return err("play-missing", `Play ${playId} does not exist.`);
  }
}

export async function listPlays(dirs: WorkDirs): Promise<Result<WorkPlay[]>> {
  const ids = await readdir(dirs.playsDir).catch(() => [] as string[]);
  const plays: WorkPlay[] = [];
  for (const id of ids.filter((value) => PLAY_ID.test(value))) {
    const play = await readPlay(dirs, id);
    if (play.ok) plays.push(play.value);
  }
  plays.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return ok(plays);
}

/** A journey pins exact revisions; each must be installed and still match its hash. */
export async function createPlay(
  dirs: WorkDirs,
  input: { title: string; worlds: WorkRef[]; carry?: Json | null },
  now = new Date(),
): Promise<Result<WorkPlay>> {
  const carryBytes = jsonBytes(input.carry ?? null);
  if (carryBytes === null || carryBytes > WORK_LIMITS.carryBytes) {
    return err("carry-too-large", `Starting carry is ${carryBytes ?? "?"} bytes.`);
  }
  for (const ref of input.worlds) {
    const revision = await readRevision(dirs, ref.workId, ref.version);
    if (!revision.ok) return revision;
    if (revision.value.manifest.contentHash !== ref.contentHash) {
      return err("work-mismatch", `${ref.workId}@${ref.version} has a different content hash.`);
    }
  }
  const stamp = now.toISOString();
  const play: WorkPlay = {
    formatVersion: 1,
    playId: `p-${randomBytes(8).toString("hex")}`,
    title: input.title.slice(0, 200),
    worlds: input.worlds,
    current: 0,
    states: input.worlds.map(() => null),
    carry: input.carry ?? null,
    completions: [],
    createdAt: stamp,
    updatedAt: stamp,
  };
  await writeJsonAtomic(join(dirs.playsDir, play.playId, PLAY), play);
  return ok(play);
}

/** Every mutation of a play goes through here: bounds, sizes and the world index are checked. */
export function changePlay(
  dirs: WorkDirs,
  playId: string,
  change: PlayChange,
  now = new Date(),
): Promise<Result<WorkPlay>> {
  return locked(`play:${playId}`, () => applyPlayChange(dirs, playId, change, now));
}

async function applyPlayChange(
  dirs: WorkDirs,
  playId: string,
  change: PlayChange,
  now: Date,
): Promise<Result<WorkPlay>> {
  const current = await readPlay(dirs, playId);
  if (!current.ok) return current;
  const play = current.value;
  if (change.world < 0 || change.world >= play.worlds.length) {
    return err("play-invalid", `World ${change.world} is not part of this journey.`);
  }
  const states = [...play.states];
  let { carry, current: index, completions } = play;
  if (change.kind === "save") {
    const bytes = jsonBytes(change.state);
    if (bytes === null || bytes > WORK_LIMITS.stateBytes) {
      return err(
        "state-too-large",
        `Saved state is ${bytes ?? "?"} bytes (limit ${WORK_LIMITS.stateBytes}).`,
      );
    }
    states[change.world] = change.state;
  } else if (change.kind === "complete") {
    const bytes = jsonBytes(change.carry);
    if (bytes === null || bytes > WORK_LIMITS.carryBytes) {
      return err(
        "carry-too-large",
        `Carry is ${bytes ?? "?"} bytes (limit ${WORK_LIMITS.carryBytes}).`,
      );
    }
    carry = change.carry;
    completions = [
      ...completions,
      {
        world: change.world,
        summary: change.summary.slice(0, WORK_LIMITS.summaryChars),
        at: now.toISOString(),
      },
    ];
  } else if (change.kind === "restart") {
    states[change.world] = null;
  } else {
    index = change.world;
  }
  const next: WorkPlay = {
    ...play,
    states,
    carry,
    current: index,
    completions,
    updatedAt: now.toISOString(),
  };
  await writeJsonAtomic(join(dirs.playsDir, playId, PLAY), next);
  return ok(next);
}
