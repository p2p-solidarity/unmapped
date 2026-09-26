// An AI world (`interactive-web@1`) as a phase-2 device keeps it once it was made in the workshop,
// published and played: the draft (`work-drafts/<draftId>/`), the immutable revision
// (`works/<workId>/1.0.0/`) and the journey pinned to it (`work-plays/<playId>/play.json`). The
// bytes follow phase 2's main/works/{drafts,store}.ts (commit 7cebb2f): JSON written as
// `JSON.stringify(value, null, 2)` plus a newline, an empty `assets/` beside the three text files,
// and the content hash over `{ manifest: core, files }` with files in `Intl.Collator("en")` order.
// The candidate is an `import`: the files are hand-written, so no model and no metrics.

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Writer } from "./files";
import type { Seeded } from "./seeded";

export interface FixtureWork {
  /** Folder of main.js, style.css and assets.json under tests/fixtures/legacy-land/. */
  files: string;
  title: string;
  request: string;
  summary: string;
  draftCreatedAt: string;
  candidateCreatedAt: string;
  settledAt: string;
  publishedAt: string;
  play: {
    title: string;
    states: unknown[];
    carry: unknown;
    completions: { world: number; summary: string; at: string }[];
    createdAt: string;
    updatedAt: string;
  };
}

export interface WorkRef {
  workId: string;
  version: string;
  contentHash: string;
}

export interface InstalledWork {
  ref: WorkRef;
  draftId: string;
  playId: string;
}

const CODE_FILES = ["main.js", "style.css", "assets.json"] as const;
const VERSION = "1.0.0";
const COLLATOR = new Intl.Collator("en");

const json = (value: unknown): string => `${JSON.stringify(value, null, 2)}\n`;
const hash = (bytes: string | Uint8Array): string =>
  `sha256:${createHash("sha256").update(bytes).digest("hex")}`;

/** Phase 2's `canonicalJson`: keys sorted at every depth, no whitespace. */
function canonical(value: unknown): string {
  const sort = (item: unknown): unknown => {
    if (Array.isArray(item)) return item.map(sort);
    if (typeof item !== "object" || item === null) return item;
    const record = item as Record<string, unknown>;
    return Object.fromEntries(
      Object.keys(record)
        .sort()
        .map((key) => [key, sort(record[key])]),
    );
  };
  return JSON.stringify(sort(value));
}

async function writeContent(writer: Writer, dir: string, text: Record<string, string>) {
  await writer.dir(join(dir, "assets"));
  for (const file of CODE_FILES) await writer.file(join(dir, file), text[file] ?? "");
}

export async function installWork(
  writer: Writer,
  fixtureDir: string,
  name: string,
  work: FixtureWork,
  ids: Seeded,
): Promise<InstalledWork> {
  const workId = `w-${ids.hex(`work:${name}`, 4)}`;
  const draftId = `d-${ids.hex(`draft:${name}`, 8)}`;
  const playId = `p-${ids.hex(`play:${name}`, 8)}`;
  const text: Record<string, string> = {};
  for (const file of CODE_FILES) {
    text[file] = await readFile(join(fixtureDir, work.files, file), "utf8");
  }

  const core = {
    format: "interactive-web",
    formatVersion: 1,
    hostApi: 1,
    workId,
    version: VERSION,
    title: work.title.slice(0, 120) || workId,
    description: work.summary.slice(0, 500),
    createdAt: work.publishedAt,
    lineage: { kind: "new", parent: null, draftId },
  };
  const files = CODE_FILES.map((path) => ({
    path,
    bytes: Buffer.byteLength(text[path] ?? "", "utf8"),
    contentHash: hash(text[path] ?? ""),
  }));
  const sorted = [...files].sort((a, b) => COLLATOR.compare(a.path, b.path));
  const contentHash = hash(canonical({ manifest: core, files: sorted }));
  const ref: WorkRef = { workId, version: VERSION, contentHash };

  const revision = join("works", workId, VERSION);
  await writer.claim(join("works", workId));
  await writeContent(writer, revision, text);
  await writer.file(join(revision, "work.json"), json({ ...core, files, contentHash }));

  const draftDir = join("work-drafts", draftId);
  await writer.claim(draftDir);
  await writeContent(writer, join(draftDir, "candidates", "c001"), text);
  const candidate = {
    id: "c001",
    parent: null,
    kind: "import",
    request: work.request,
    summary: work.summary,
    status: "playable",
    error: null,
    changed: [...CODE_FILES],
    metrics: null,
    createdAt: work.candidateCreatedAt,
    settledAt: work.settledAt,
  };
  const draft = {
    formatVersion: 1,
    draftId,
    workId,
    title: work.title,
    head: "c001",
    candidates: [candidate],
    published: [ref],
    createdAt: work.draftCreatedAt,
    updatedAt: work.publishedAt,
  };
  await writer.file(join(draftDir, "draft.json"), json(draft));

  const play = {
    formatVersion: 1,
    playId,
    title: work.play.title,
    worlds: [ref],
    current: 0,
    states: work.play.states,
    carry: work.play.carry,
    completions: work.play.completions,
    createdAt: work.play.createdAt,
    updatedAt: work.play.updatedAt,
  };
  await writer.claim(join("work-plays", playId));
  await writer.file(join("work-plays", playId, "play.json"), json(play));
  return { ref, draftId, playId };
}
