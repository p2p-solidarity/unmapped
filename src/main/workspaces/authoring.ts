import { mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { emptyDraft } from "@shared/game-definition";
import { err, fail, ok, type Result, toError } from "@shared/result";
import {
  type AuthoringSnapshot,
  type CreateAuthoringInput,
  emptyGallery,
} from "@shared/scene-gallery";

const AUTHORING_ROOT = ".authoring";
const META_FILE = "authoring.json";
const DEFINITION_FILE = "definition.json";
const GALLERY_FILE = "gallery.json";

function authoringDir(workspacesDir: string, workspaceId: string): string {
  return join(workspacesDir, AUTHORING_ROOT, workspaceId);
}

function validWorkspaceId(id: string): boolean {
  return /^[a-z0-9][a-z0-9-]{0,95}$/.test(id);
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

function stringify(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function looksLikeSnapshot(value: unknown): value is AuthoringSnapshot {
  if (typeof value !== "object" || value === null) return false;
  const snapshot = value as Partial<AuthoringSnapshot>;
  return (
    snapshot.formatVersion === 1 &&
    typeof snapshot.workspaceId === "string" &&
    typeof snapshot.updatedAt === "string" &&
    typeof snapshot.draft === "object" &&
    snapshot.draft !== null &&
    typeof snapshot.gallery === "object" &&
    snapshot.gallery !== null &&
    Array.isArray(snapshot.gallery.slots) &&
    (snapshot.narrative === null || typeof snapshot.narrative === "object")
  );
}

/**
 * Fills in fields added after a draft was written. A Create draft is the player's own work in
 * progress, so a build that learned a new field must keep reading it rather than refusing it —
 * but the field has to exist before any prompt or panel reads it.
 */
function normalise(snapshot: AuthoringSnapshot): AuthoringSnapshot {
  return {
    ...snapshot,
    draft: { ...snapshot.draft, brief: snapshot.draft.brief ?? "" },
    gallery: {
      ...snapshot.gallery,
      slots: snapshot.gallery.slots.map((slot) => ({
        ...slot,
        candidates: slot.candidates.map((candidate) => ({
          ...candidate,
          dialogues: candidate.dialogues ?? {},
        })),
      })),
    },
  };
}

function newWorkspaceId(now: Date): string {
  return `create-${now.getTime().toString(36)}-${crypto.randomUUID().slice(0, 8)}`;
}

export async function createAuthoring(
  workspacesDir: string,
  input: CreateAuthoringInput,
  now: Date = new Date(),
): Promise<Result<AuthoringSnapshot>> {
  const workspaceId = newWorkspaceId(now);
  const updatedAt = now.toISOString();
  const draft = emptyDraft(updatedAt);
  draft.name = input.name.trim();
  draft.author = input.author.trim();
  // Left empty on purpose: the id is derived from the title the author types, so the library
  // reads as a shelf of games rather than a list of workspace ids.
  draft.cartridgeId = "";
  return writeAuthoring(workspacesDir, {
    formatVersion: 1,
    workspaceId,
    draft,
    gallery: emptyGallery(),
    narrative: null,
    updatedAt,
  });
}

export async function readAuthoring(
  workspacesDir: string,
  workspaceId: string,
): Promise<Result<AuthoringSnapshot>> {
  if (!validWorkspaceId(workspaceId))
    return err("authoring-id-invalid", "Invalid authoring workspace id.");
  const dir = authoringDir(workspacesDir, workspaceId);
  try {
    const [metaRaw, draftRaw, galleryRaw] = await Promise.all([
      readFile(join(dir, META_FILE), "utf8"),
      readFile(join(dir, DEFINITION_FILE), "utf8"),
      readFile(join(dir, GALLERY_FILE), "utf8"),
    ]);
    const meta = JSON.parse(metaRaw) as Record<string, unknown>;
    const snapshot: unknown = {
      formatVersion: meta.formatVersion,
      workspaceId: meta.workspaceId,
      updatedAt: meta.updatedAt,
      narrative: meta.narrative ?? null,
      draft: JSON.parse(draftRaw),
      gallery: JSON.parse(galleryRaw),
    };
    if (!looksLikeSnapshot(snapshot) || snapshot.workspaceId !== workspaceId) {
      return err("authoring-invalid", "Authoring workspace files are invalid or mismatched.");
    }
    return ok(normalise(snapshot));
  } catch (error) {
    return fail(toError(error, "authoring-read-failed"));
  }
}

export async function writeAuthoring(
  workspacesDir: string,
  snapshot: AuthoringSnapshot,
): Promise<Result<AuthoringSnapshot>> {
  if (!validWorkspaceId(snapshot.workspaceId) || !looksLikeSnapshot(snapshot)) {
    return err("authoring-invalid", "Authoring workspace data is invalid.");
  }
  const destination = authoringDir(workspacesDir, snapshot.workspaceId);
  const staging = `${destination}.staging-${process.pid}-${Date.now()}`;
  const previous = `${destination}.previous-${process.pid}-${Date.now()}`;
  const stored = { ...normalise(snapshot), updatedAt: new Date().toISOString() };
  try {
    await mkdir(join(workspacesDir, AUTHORING_ROOT), { recursive: true });
    await mkdir(staging, { recursive: true });
    await Promise.all([
      writeFile(
        join(staging, META_FILE),
        stringify({
          formatVersion: stored.formatVersion,
          workspaceId: stored.workspaceId,
          narrative: stored.narrative,
          updatedAt: stored.updatedAt,
        }),
        "utf8",
      ),
      writeFile(join(staging, DEFINITION_FILE), stringify(stored.draft), "utf8"),
      writeFile(join(staging, GALLERY_FILE), stringify(stored.gallery), "utf8"),
    ]);
    if (await exists(destination)) await rename(destination, previous);
    await rename(staging, destination);
    await rm(previous, { recursive: true, force: true });
    return ok(stored);
  } catch (error) {
    if (!(await exists(destination)) && (await exists(previous)))
      await rename(previous, destination).catch(() => undefined);
    await rm(staging, { recursive: true, force: true }).catch(() => undefined);
    return fail(toError(error, "authoring-write-failed"));
  }
}
