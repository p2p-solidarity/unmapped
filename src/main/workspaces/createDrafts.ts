// Drafts of Create a game (@shared/createDraft), one directory each beside the Remix workspaces:
// <workspaces>/create.<draftId>/draft.json. The dot keeps the directory name from ever being a
// workspace id, and the Remix listing skips it explicitly too (`isCreateDraftDir`).
//
// A draft is untrusted on the way in and on disk: every save and read is checked against the
// schema, and a file that no longer reads is listed as broken (so it can be deleted) instead of
// breaking the list. A write goes to a temp file renamed over the old one, so a crash leaves the
// previous draft whole; writes to one draft — a delete included — run one at a time, so a save
// queued behind a delete cannot bring the draft back.

import { randomBytes } from "node:crypto";
import { mkdir, readdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  CREATE_DRAFT_FORMAT,
  type CreateDraft,
  type CreateDraftEntry,
  createDraftSchema,
  DRAFT_ID,
  type DraftIdea,
} from "@shared/createDraft";
import { err, fail, ok, type Result, toError } from "@shared/result";

const PREFIX = "create.";
const FILE = "draft.json";

export function isCreateDraftDir(name: string): boolean {
  return name.startsWith(PREFIX);
}

function draftDir(workspacesDir: string, draftId: string): string {
  return join(workspacesDir, `${PREFIX}${draftId}`);
}

const queues = new Map<string, Promise<unknown>>();

/** Runs `work` after every earlier write to the same draft has settled. */
function serialized<T>(key: string, work: () => Promise<T>): Promise<T> {
  const next = (queues.get(key) ?? Promise.resolve()).then(work, work);
  const tail = next.then(
    () => undefined,
    () => undefined,
  );
  queues.set(key, tail);
  void tail.then(() => {
    if (queues.get(key) === tail) queues.delete(key);
  });
  return next;
}

let tempSeq = 0;

async function writeAtomic(path: string, text: string): Promise<void> {
  tempSeq += 1;
  const temp = `${path}.tmp-${process.pid}-${tempSeq}`;
  try {
    await writeFile(temp, text, "utf8");
    await rename(temp, path);
  } catch (error) {
    await rm(temp, { force: true }).catch(() => undefined);
    throw error;
  }
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

function isMissing(error: unknown): boolean {
  return (error as { code?: unknown } | null)?.code === "ENOENT";
}

const RESTART_HINT = "Delete this draft and start a new game.";

function invalid(draftId: string, why: string): Result<never> {
  return err("create-draft-invalid", `The draft ${draftId} does not read: ${why}`, RESTART_HINT);
}

function validate(input: unknown): Result<CreateDraft> {
  const parsed = createDraftSchema.safeParse(input);
  if (parsed.success) return ok(parsed.data);
  const issue = parsed.error.issues[0];
  const where = issue?.path.map(String).join(".") || "draft";
  return invalid(
    typeof (input as { draftId?: unknown } | null)?.draftId === "string"
      ? String((input as { draftId: string }).draftId).slice(0, 40)
      : "?",
    `${where} — ${issue?.message ?? "unexpected shape"}`,
  );
}

const text = (draft: CreateDraft): string => `${JSON.stringify(draft, null, 2)}\n`;

export async function readCreateDraft(
  workspacesDir: string,
  draftId: string,
): Promise<Result<CreateDraft>> {
  if (!DRAFT_ID.test(draftId)) return err("create-draft-id-invalid", "That is not a draft id.");
  let raw: string;
  try {
    raw = await readFile(join(draftDir(workspacesDir, draftId), FILE), "utf8");
  } catch (error) {
    return isMissing(error)
      ? err("create-draft-missing", `The draft ${draftId} is gone.`, RESTART_HINT)
      : fail(toError(error, "create-draft-read-failed"));
  }
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return invalid(draftId, "draft.json is not JSON.");
  }
  const draft = validate(json);
  if (!draft.ok) return draft;
  if (draft.value.draftId !== draftId) {
    return invalid(draftId, `draft.json names another draft (${draft.value.draftId}).`);
  }
  return draft;
}

export async function createCreateDraft(
  workspacesDir: string,
  idea: DraftIdea,
  now = new Date(),
): Promise<Result<CreateDraft>> {
  const at = now.toISOString();
  const draft = validate({
    formatVersion: CREATE_DRAFT_FORMAT,
    draftId: randomBytes(8).toString("hex"),
    step: "idea",
    idea,
    world: null,
    story: null,
    createdAt: at,
    updatedAt: at,
  });
  if (!draft.ok) return draft;
  const dir = draftDir(workspacesDir, draft.value.draftId);
  return serialized(dir, async () => {
    try {
      await mkdir(dir, { recursive: true });
      await writeAtomic(join(dir, FILE), text(draft.value));
      return draft;
    } catch (error) {
      return fail(toError(error, "create-draft-write-failed"));
    }
  });
}

/** Replaces a draft that exists; `updatedAt` is main's clock, whatever the payload says. */
export async function saveCreateDraft(
  workspacesDir: string,
  input: unknown,
  now = new Date(),
): Promise<Result<CreateDraft>> {
  const checked = validate(input);
  if (!checked.ok) return checked;
  const draft: CreateDraft = { ...checked.value, updatedAt: now.toISOString() };
  const dir = draftDir(workspacesDir, draft.draftId);
  return serialized(dir, async () => {
    if (!(await exists(join(dir, FILE)))) {
      return err("create-draft-missing", `The draft ${draft.draftId} is gone.`, RESTART_HINT);
    }
    try {
      await writeAtomic(join(dir, FILE), text(draft));
      return ok(draft);
    } catch (error) {
      return fail(toError(error, "create-draft-write-failed"));
    }
  });
}

export async function removeCreateDraft(
  workspacesDir: string,
  draftId: string,
): Promise<Result<void>> {
  if (!DRAFT_ID.test(draftId)) return err("create-draft-id-invalid", "That is not a draft id.");
  const dir = draftDir(workspacesDir, draftId);
  return serialized(dir, async () => {
    try {
      await rm(dir, { recursive: true, force: true });
      return ok(undefined);
    } catch (error) {
      return fail(toError(error, "create-draft-remove-failed"));
    }
  });
}

/** Every draft, newest first; drafts that no longer read come last, marked broken. */
export async function listCreateDrafts(workspacesDir: string): Promise<Result<CreateDraftEntry[]>> {
  let ids: string[];
  try {
    ids = (await readdir(workspacesDir, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory() && isCreateDraftDir(entry.name))
      .map((entry) => entry.name.slice(PREFIX.length))
      // A directory whose name is not a draft id is not ours to show or delete.
      .filter((id) => DRAFT_ID.test(id));
  } catch (error) {
    return isMissing(error) ? ok([]) : fail(toError(error, "create-draft-list-failed"));
  }
  const entries: CreateDraftEntry[] = [];
  for (const draftId of ids) {
    const read = await readCreateDraft(workspacesDir, draftId);
    entries.push(
      read.ok
        ? {
            draftId,
            broken: false,
            name: read.value.idea.name,
            step: read.value.step,
            chapters: read.value.story?.chapters.length ?? 0,
            updatedAt: read.value.updatedAt,
          }
        : { draftId, broken: true, problem: read.error.message },
    );
  }
  const stamp = (entry: CreateDraftEntry): string => (entry.broken ? "" : entry.updatedAt);
  entries.sort((a, b) => stamp(b).localeCompare(stamp(a)));
  return ok(entries);
}
