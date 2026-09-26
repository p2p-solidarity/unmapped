// Mutable authoring copies (`work-drafts/<draftId>/`). Every generation, edit, repair and asset
// swap becomes a candidate snapshot; only a candidate that passed the player check may become
// `head`, and only if `head` is still the version it was built on (compare-and-set). A cancelled
// or late result therefore never overwrites the playable version.

import { randomBytes } from "node:crypto";
import { readdir, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import type { LicenceFile } from "@shared/images";
import { err, ok, type Result } from "@shared/result";
import { checkWorkText } from "@shared/workEdits";
import {
  CANDIDATE_ID,
  type CandidateKind,
  type CandidateMetrics,
  DRAFT_ID,
  type DraftCandidate,
  WORK_CODE_FILES,
  WORK_ID,
  WORK_LIMITS,
  type WorkCodeFile,
  type WorkDraft,
  type WorkManifest,
  type WorkRef,
  type WorkText,
} from "@shared/works";
import { z } from "zod";
import {
  checkContent,
  locked,
  publishRevision,
  readContent,
  type WorkContent,
  type WorkDirs,
  writeContent,
  writeJsonAtomic,
} from "./store";

const DRAFT = "draft.json";

const candidateSchema = z.object({
  id: z.string().regex(CANDIDATE_ID),
  parent: z.string().regex(CANDIDATE_ID).nullable(),
  kind: z.enum(["generate", "edit", "repair", "asset", "import"]),
  request: z.string(),
  summary: z.string(),
  status: z.enum(["pending", "playable", "failed", "stale", "cancelled"]),
  error: z.string().nullable(),
  changed: z.array(z.enum(WORK_CODE_FILES)),
  metrics: z
    .object({
      model: z.string().nullable(),
      elapsedMs: z.number().min(0),
      promptTokens: z.number().int().nullable(),
      completionTokens: z.number().int().nullable(),
    })
    .nullable(),
  createdAt: z.string(),
  settledAt: z.string().nullable(),
});

const draftSchema = z.object({
  formatVersion: z.literal(1),
  draftId: z.string().regex(DRAFT_ID),
  workId: z.string().regex(WORK_ID),
  title: z.string().max(200),
  head: z.string().regex(CANDIDATE_ID).nullable(),
  candidates: z.array(candidateSchema).max(WORK_LIMITS.candidatesPerDraft),
  published: z.array(
    z.object({ workId: z.string(), version: z.string(), contentHash: z.string() }),
  ),
  createdAt: z.string(),
  updatedAt: z.string(),
});

function draftDir(dirs: WorkDirs, draftId: string): string {
  return join(dirs.draftsDir, draftId);
}

function candidateDir(dirs: WorkDirs, draftId: string, candidateId: string): string {
  return join(dirs.draftsDir, draftId, "candidates", candidateId);
}

export async function readDraft(dirs: WorkDirs, draftId: string): Promise<Result<WorkDraft>> {
  if (!DRAFT_ID.test(draftId)) return err("draft-invalid", "Bad draft id.");
  try {
    const raw = JSON.parse(await readFile(join(draftDir(dirs, draftId), DRAFT), "utf8"));
    const parsed = draftSchema.safeParse(raw);
    if (!parsed.success) return err("draft-invalid", `${draftId}: draft.json is malformed.`);
    return ok(parsed.data as WorkDraft);
  } catch {
    return err("draft-missing", `Draft ${draftId} does not exist.`);
  }
}

async function saveDraft(dirs: WorkDirs, draft: WorkDraft): Promise<void> {
  await writeJsonAtomic(join(draftDir(dirs, draft.draftId), DRAFT), draft);
}

export async function listDrafts(dirs: WorkDirs): Promise<Result<WorkDraft[]>> {
  const ids = await readdir(dirs.draftsDir).catch(() => [] as string[]);
  const drafts: WorkDraft[] = [];
  for (const id of ids.filter((value) => DRAFT_ID.test(value))) {
    const draft = await readDraft(dirs, id);
    if (draft.ok) drafts.push(draft.value);
  }
  drafts.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return ok(drafts);
}

export async function createDraft(
  dirs: WorkDirs,
  title: string,
  now = new Date(),
): Promise<Result<WorkDraft>> {
  const stamp = now.toISOString();
  const draft: WorkDraft = {
    formatVersion: 1,
    draftId: `d-${randomBytes(8).toString("hex")}`,
    workId: `w-${randomBytes(4).toString("hex")}`,
    title: title.trim().slice(0, 200) || "Untitled world",
    head: null,
    candidates: [],
    published: [],
    createdAt: stamp,
    updatedAt: stamp,
  };
  await saveDraft(dirs, draft);
  return ok(draft);
}

export async function readCandidate(
  dirs: WorkDirs,
  draftId: string,
  candidateId: string,
): Promise<Result<WorkContent>> {
  if (!DRAFT_ID.test(draftId) || !CANDIDATE_ID.test(candidateId)) {
    return err("draft-invalid", "Bad draft or candidate id.");
  }
  return readContent(candidateDir(dirs, draftId, candidateId));
}

export interface WriteCandidateInput {
  draftId: string;
  parent: string | null;
  kind: CandidateKind;
  request: string;
  summary: string;
  text: WorkText;
  changed: WorkCodeFile[];
  metrics: CandidateMetrics | null;
  /** New or replaced images for this candidate; everything else is copied from `parent`. */
  images?: Record<string, Uint8Array>;
}

export function writeCandidate(
  dirs: WorkDirs,
  input: WriteCandidateInput,
  now = new Date(),
): Promise<Result<{ draft: WorkDraft; candidate: DraftCandidate }>> {
  return locked(`draft:${input.draftId}`, async () => {
    const current = await readDraft(dirs, input.draftId);
    if (!current.ok) return current;
    const draft = current.value;
    if (draft.candidates.length >= WORK_LIMITS.candidatesPerDraft) {
      return err("draft-full", "This draft has too many attempts; publish or start a new one.");
    }
    const problems = checkWorkText(input.text);
    if (problems.length > 0) return err("work-invalid", problems.join("\n"));
    let images: Record<string, Uint8Array> = {};
    if (input.parent !== null) {
      if (!draft.candidates.some((candidate) => candidate.id === input.parent)) {
        return err("draft-invalid", `Candidate ${input.parent} is not part of this draft.`);
      }
      const parent = await readCandidate(dirs, input.draftId, input.parent);
      if (!parent.ok) return parent;
      images = parent.value.images;
    }
    const content: WorkContent = { text: input.text, images: { ...images, ...input.images } };
    const valid = checkContent(content);
    if (!valid.ok) return valid;
    const id = `c${String(draft.candidates.length + 1).padStart(3, "0")}`;
    const dir = candidateDir(dirs, input.draftId, id);
    try {
      await rm(dir, { recursive: true, force: true });
      await writeContent(dir, content);
    } catch (error) {
      return err("draft-write-failed", error instanceof Error ? error.message : String(error));
    }
    const stamp = now.toISOString();
    const candidate: DraftCandidate = {
      id,
      parent: input.parent,
      kind: input.kind,
      request: input.request.slice(0, WORK_LIMITS.requestChars),
      summary: input.summary.slice(0, WORK_LIMITS.summaryChars),
      status: "pending",
      error: null,
      changed: input.changed,
      metrics: input.metrics,
      createdAt: stamp,
      settledAt: null,
    };
    const next: WorkDraft = {
      ...draft,
      candidates: [...draft.candidates, candidate],
      updatedAt: stamp,
    };
    await saveDraft(dirs, next);
    return ok({ draft: next, candidate });
  });
}

export interface SettleCandidateInput {
  draftId: string;
  candidateId: string;
  outcome: "playable" | "failed" | "cancelled";
  error: string | null;
  /** The head this attempt started from; a playable result only lands if it is still head. */
  expectedHead: string | null;
}

export function settleCandidate(
  dirs: WorkDirs,
  input: SettleCandidateInput,
  now = new Date(),
): Promise<Result<WorkDraft>> {
  return locked(`draft:${input.draftId}`, async () => {
    const current = await readDraft(dirs, input.draftId);
    if (!current.ok) return current;
    const draft = current.value;
    const index = draft.candidates.findIndex((candidate) => candidate.id === input.candidateId);
    const candidate = draft.candidates[index];
    if (candidate === undefined) return err("draft-invalid", "Unknown candidate.");
    if (candidate.status !== "pending") {
      return err("candidate-settled", `Candidate ${candidate.id} is already ${candidate.status}.`);
    }
    const stale = input.outcome === "playable" && draft.head !== input.expectedHead;
    const status = stale ? "stale" : input.outcome;
    const settled: DraftCandidate = {
      ...candidate,
      status,
      error: stale
        ? "Another version became current while this one was being made."
        : (input.error?.slice(0, 4_000) ?? null),
      settledAt: now.toISOString(),
    };
    const candidates = [...draft.candidates];
    candidates[index] = settled;
    const next: WorkDraft = {
      ...draft,
      candidates,
      head: status === "playable" ? candidate.id : draft.head,
      updatedAt: now.toISOString(),
    };
    await saveDraft(dirs, next);
    if (stale) {
      return err(
        "draft-stale",
        "The draft moved on while this version was being made; it was kept but not made current.",
      );
    }
    return ok(next);
  });
}

/** Makes an earlier playable candidate current again. Nothing is deleted. */
export function revertDraft(
  dirs: WorkDirs,
  draftId: string,
  candidateId: string,
  now = new Date(),
): Promise<Result<WorkDraft>> {
  return locked(`draft:${draftId}`, async () => {
    const current = await readDraft(dirs, draftId);
    if (!current.ok) return current;
    const target = current.value.candidates.find((candidate) => candidate.id === candidateId);
    if (target?.status !== "playable") {
      return err("draft-invalid", "Only a version that passed the check can be restored.");
    }
    const next = { ...current.value, head: candidateId, updatedAt: now.toISOString() };
    await saveDraft(dirs, next);
    return ok(next);
  });
}

/**
 * Names the licence of every picture of the revision about to be published, or refuses it
 * (rev 6 phase 4, D4: main/images/workLicences.ts). Runs inside the draft's lock, on exactly the
 * content that is published.
 */
export type WorkLicensing = (
  content: WorkContent,
  parent: WorkRef | null,
) => Promise<Result<LicenceFile | null>>;

/** Publishes `head` as the next immutable revision of the draft's world. */
export function publishDraft(
  dirs: WorkDirs,
  draftId: string,
  now = new Date(),
  licensing?: WorkLicensing,
): Promise<Result<{ draft: WorkDraft; manifest: WorkManifest }>> {
  return locked(`draft:${draftId}`, async () => {
    const current = await readDraft(dirs, draftId);
    if (!current.ok) return current;
    const draft = current.value;
    if (draft.head === null) return err("draft-empty", "Nothing playable to publish yet.");
    const head = draft.candidates.find((candidate) => candidate.id === draft.head);
    const content = await readCandidate(dirs, draftId, draft.head);
    if (!content.ok) return content;
    const parent = draft.published.at(-1) ?? null;
    const licences = licensing === undefined ? ok(null) : await licensing(content.value, parent);
    if (!licences.ok) return licences;
    const published = await publishRevision(dirs, {
      workId: draft.workId,
      title: draft.title,
      description: head?.summary ?? "",
      content: content.value,
      parent,
      draftId,
      now,
      licences: licences.value,
    });
    if (!published.ok) return published;
    const ref = {
      workId: published.value.workId,
      version: published.value.version,
      contentHash: published.value.contentHash,
    };
    const next: WorkDraft = {
      ...draft,
      published: [...draft.published, ref],
      updatedAt: now.toISOString(),
    };
    await saveDraft(dirs, next);
    return ok({ draft: next, manifest: published.value });
  });
}
