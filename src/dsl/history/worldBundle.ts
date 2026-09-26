// Verifying a `.world` offline (rev 6 phase 4, D5). Pure: main (export and import), the world
// service (`import`) and `bun scripts/verify-world.ts <file>` all run exactly this. It lives in dsl
// because check 3 needs `entryVerdict`, which parses the programs events carry (Rule 8).
//
// `readWorldBundle` opens the archive: every limit — the file, the entry count, the log (≤ 80 MiB),
// each blob (≤ 32 MiB) and all of them (≤ 256 MiB), world.json and signature.json — is checked from
// the central directory before a byte is inflated, and a name the format does not know is refused
// there too. `verifyWorldBundle` then runs D5's seven checks over the files and returns a report:
//
//   1. sizes, every listed hash, nothing unlisted, the order of the list, and the exporter's
//      signature over world.json;
//   2. `verifyLog`: the chain, the ownership pass, then P3 D2's receipt schedule; world.json's head
//      and services must be the log's own;
//   3. `entryVerdict` for every entry under the world's pinned physics, then the fold: every entry
//      it skips is listed (one from a newer build is only counted);
//   4. every `beat` recomputed with `computeBeat` over the fold before it;
//   5. the genesis pack: unpacked (pre-inflate limits), its cartridge id, version and content hash
//      equal the genesis's, and it is the latest `pack` event's blob when there is one;
//   6. every work pack a place or chapter names: present, `checkContent`, `workContentHash`, and
//      exactly the announced revision;
//   7. the physics version (and the world protocol) this build supports, and a world.json protocol
//      no lower than the fold needs (`protocolFor`). A higher one is accepted: every file written
//      before the writer recorded `protocolFor` states 2, and overstating only turns older readers
//      away, while understating would let one fold a co-owned world apart.
//
// Nothing is trusted from world.json but what the log and the blobs prove: its head, services and
// physics are compared with theirs (its protocol from below), never used in their place.

import { type ArchiveEntry, readArchiveDirectory, unzipWithin } from "@shared/archive";
import { canonicalJson } from "@shared/canonical";
import type { ContentHash } from "@shared/cartridge";
import { unpackCartridge } from "@shared/cartridgePack";
import { hashOrder } from "@shared/hashOrder";
import { computeBeat } from "@shared/history/beat";
import { readEvent } from "@shared/history/event";
import { emptyNow, foldEntries, NEWER_CODES, openGenesis } from "@shared/history/fold";
import { contentHash } from "@shared/history/ids";
import { type LogCheck, readLogLine, verifyLog } from "@shared/history/log";
import { verifyText } from "@shared/history/sign";
import type { GenesisEvent, LogEntry, VerdictEntry, WorldNow } from "@shared/history/types";
import { checkPhysics } from "@shared/physics";
import { err, ok, type Result } from "@shared/result";
import { readWorkPack } from "@shared/workPack";
import type { WorkRef } from "@shared/works";
import {
  BUNDLE_ARCHIVE_LIMITS,
  BUNDLE_BLOB_ENTRY,
  BUNDLE_FILES,
  BUNDLE_LIMITS,
  type BundleCheck,
  type BundleProblem,
  type BundleService,
  bundleSignatureSchema,
  bundleSignText,
  type WorldBundleManifest,
  type WorldBundleReport,
  worldBundleManifestSchema,
} from "@shared/worldBundle";
import { protocolFor, WORLD_PROTOCOL } from "@shared/worldProtocol";
import { strFromU8 } from "fflate";
import { entryVerdict } from "./verdict";

const ARCHIVE_CODES = {
  directory: "bundle-archive-invalid",
  unreadable: "bundle-archive-invalid",
  tooLarge: "bundle-too-large",
};

const TOO_LARGE_HINT =
  "A .world holds at most an 80 MiB history and 256 MiB of packs (32 MiB each).";

/** The limit one entry of the archive has, by its name; null for a name the format does not know. */
function entryLimit(name: string): number | null {
  if (name === BUNDLE_FILES.manifest) return BUNDLE_LIMITS.manifestBytes;
  if (name === BUNDLE_FILES.signature) return BUNDLE_LIMITS.signatureBytes;
  if (name === BUNDLE_FILES.log) return BUNDLE_LIMITS.logBytes;
  return BUNDLE_BLOB_ENTRY.test(name) ? BUNDLE_LIMITS.blobBytes : null;
}

function checkDirectory(entries: readonly ArchiveEntry[]): Result<void> {
  let blobs = 0;
  let blobBytes = 0;
  for (const entry of entries) {
    const limit = entryLimit(entry.name);
    if (limit === null) {
      return err(
        "bundle-entry-unknown",
        `A .world holds no entry named ${entry.name.slice(0, 120)}.`,
        "Export the world again from UNMAPPED or a world service.",
      );
    }
    if (entry.bytes > limit) {
      return err(
        "bundle-too-large",
        `${entry.name.slice(0, 120)} declares ${entry.bytes} bytes; at most ${limit}.`,
        TOO_LARGE_HINT,
      );
    }
    if (BUNDLE_BLOB_ENTRY.test(entry.name)) {
      blobs += 1;
      blobBytes += entry.bytes;
    }
  }
  if (blobs > BUNDLE_LIMITS.blobs || blobBytes > BUNDLE_LIMITS.blobsBytes) {
    return err("bundle-too-large", "The packs in this .world are over the limit.", TOO_LARGE_HINT);
  }
  return ok(undefined);
}

/**
 * The files of a `.world`, by entry name. Every limit is decided from the central directory first
 * (`readArchiveDirectory`); only then is each entry inflated, to exactly its declared size.
 */
export function readWorldBundle(bytes: Uint8Array): Result<Map<string, Uint8Array>> {
  const directory = readArchiveDirectory(bytes, BUNDLE_ARCHIVE_LIMITS, ARCHIVE_CODES);
  if (!directory.ok) {
    const { code, message } = directory.error;
    return code === ARCHIVE_CODES.tooLarge
      ? err(code, message, TOO_LARGE_HINT)
      : err(code, message, "This file is not a readable .world.");
  }
  const allowed = checkDirectory(directory.value);
  if (!allowed.ok) return allowed;
  const files = unzipWithin(bytes, BUNDLE_ARCHIVE_LIMITS, ARCHIVE_CODES);
  if (!files.ok) return err(files.error.code, files.error.message, "This file is damaged.");
  return ok(new Map(files.value.map((file) => [file.name, file.bytes])));
}

/** What a verified `.world` holds, parsed, for an importer (only when checks 1–2 could run). */
export interface OpenedWorldBundle {
  manifest: WorldBundleManifest;
  genesis: GenesisEvent;
  entries: LogEntry[];
  /** The exact bytes of history/log.jsonl (a service stores them verbatim). */
  logText: string;
  /** Every listed blob, by content hash. */
  blobs: Map<ContentHash, Uint8Array>;
  now: WorldNow;
  check: LogCheck | null;
  report: WorldBundleReport;
}

function emptyReport(): WorldBundleReport {
  return {
    worldId: null,
    name: null,
    cartridge: null,
    head: null,
    physicsVersion: null,
    protocol: null,
    exportedAt: null,
    exportedBy: null,
    signature: "missing",
    entries: 0,
    authors: [],
    owners: [],
    services: [],
    beats: { total: 0, mismatched: [] },
    ignored: [],
    newer: 0,
    works: 0,
    blobs: 0,
    bytes: 0,
    problems: [],
  };
}

type Problems = (
  check: BundleCheck,
  code: string,
  message: string,
  at?: Partial<BundleProblem>,
) => void;

function jsonOf(bytes: Uint8Array | undefined): unknown {
  if (bytes === undefined) return undefined;
  try {
    return JSON.parse(strFromU8(bytes));
  } catch {
    return null;
  }
}

/** Check 1: the list, the hashes, nothing unlisted, the order, and the signature. */
function checkFiles(
  files: ReadonlyMap<string, Uint8Array>,
  manifest: WorldBundleManifest,
  report: WorldBundleReport,
  problem: Problems,
): Map<ContentHash, Uint8Array> {
  const blobs = new Map<ContentHash, Uint8Array>();
  const listed = new Set<string>();
  let blobBytes = 0;
  for (const file of manifest.files) {
    const at = { path: file.path };
    if (listed.has(file.path)) problem(1, "bundle-file-twice", `${file.path} is listed twice.`, at);
    listed.add(file.path);
    const blob = BUNDLE_BLOB_ENTRY.exec(file.path);
    if (file.path !== BUNDLE_FILES.log && blob === null) {
      problem(1, "bundle-entry-unknown", `world.json lists ${file.path}, not a .world entry.`, at);
      continue;
    }
    const bytes = files.get(file.path);
    if (bytes === undefined) {
      problem(1, "bundle-file-missing", `${file.path} is listed but not in the file.`, at);
      continue;
    }
    const actual = contentHash(bytes) as ContentHash;
    if (bytes.length !== file.bytes || actual !== file.sha256) {
      problem(
        1,
        "bundle-hash-mismatch",
        `${file.path} does not match its listed size and hash.`,
        at,
      );
      continue;
    }
    if (blob !== null) {
      if (`sha256:${blob[1]}` !== actual) {
        problem(1, "bundle-blob-name", `${file.path} is not named by its own hash.`, at);
        continue;
      }
      blobs.set(actual, bytes);
      blobBytes += bytes.length;
      if (bytes.length > BUNDLE_LIMITS.blobBytes) {
        problem(1, "bundle-too-large", `${file.path} is larger than a pack may be.`, at);
      }
    } else if (bytes.length > BUNDLE_LIMITS.logBytes) {
      problem(1, "bundle-too-large", "The history is larger than 80 MiB.", at);
    }
  }
  if (blobBytes > BUNDLE_LIMITS.blobsBytes) {
    problem(1, "bundle-too-large", "The packs together are larger than 256 MiB.");
  }
  for (const name of files.keys()) {
    if (name === BUNDLE_FILES.manifest || name === BUNDLE_FILES.signature) continue;
    if (!listed.has(name)) {
      problem(1, "bundle-file-unlisted", `${name.slice(0, 120)} is in the file but not listed.`, {
        path: name,
      });
    }
  }
  const paths = manifest.files.map((file) => file.path);
  if (canonicalJson(paths) !== canonicalJson([...paths].sort(hashOrder))) {
    problem(1, "bundle-files-order", "world.json's file list is not in hash order.");
  }
  if (!listed.has(BUNDLE_FILES.log)) {
    problem(1, "bundle-log-missing", "world.json does not list history/log.jsonl.");
  }
  const rawSignature = jsonOf(files.get(BUNDLE_FILES.signature));
  const signature = bundleSignatureSchema.safeParse(rawSignature);
  if (rawSignature === undefined) {
    report.signature = "missing";
    problem(1, "bundle-signature-missing", "The file carries no signature.json.");
  } else if (
    signature.success &&
    signature.data.key === manifest.exportedBy &&
    verifyText(signature.data.key, bundleSignText(manifest), signature.data.sig)
  ) {
    report.signature = "valid";
  } else {
    report.signature = "invalid";
    problem(1, "bundle-signature-invalid", "signature.json does not verify for world.json.");
  }
  report.blobs = blobs.size;
  report.bytes = [...files.values()].reduce((sum, bytes) => sum + bytes.length, 0);
  return blobs;
}

/** The log's lines; null (with a problem) when it does not read. */
function readLog(
  bytes: Uint8Array,
  problem: Problems,
): { text: string; entries: LogEntry[] } | null {
  const text = strFromU8(bytes);
  if (text.length === 0 || !text.endsWith("\n")) {
    problem(2, "bundle-log-invalid", "history/log.jsonl is empty or does not end with a newline.");
    return null;
  }
  const entries: LogEntry[] = [];
  for (const [index, line] of text.slice(0, -1).split("\n").entries()) {
    const entry = readLogLine(line);
    if (!entry.ok) {
      problem(2, "bundle-log-invalid", `Log line ${index + 1}: ${entry.error.message}`, {
        n: index + 1,
      });
      return null;
    }
    entries.push(entry.value);
  }
  return { text, entries };
}

/** The services the schedule names, from the `sequencer` entries that installed their keys. */
function servicesOf(check: LogCheck, entries: readonly LogEntry[]): BundleService[] {
  return check.schedule.map((step) => {
    const body = entries[step.n - 1]?.event.body as { url?: unknown } | undefined;
    return { url: typeof body?.url === "string" ? body.url : "", key: step.key, from: step.n };
  });
}

/** Checks 3–4: verdicts, the fold in segments, each beat recomputed over the fold before it. */
function foldAndBeats(
  genesis: GenesisEvent,
  entries: readonly LogEntry[],
  report: WorldBundleReport,
  problem: Problems,
): WorldNow {
  let now = emptyNow(genesis);
  let batch: VerdictEntry[] = [];
  const beats: number[] = [];
  for (const entry of entries) {
    const verdict = entryVerdict(entry.event);
    const read = readEvent(entry.event);
    if (verdict.ok && read.ok && read.value.kind === "beat") {
      now = foldEntries(now, batch);
      batch = [];
      beats.push(entry.n);
      const computed = computeBeat(now, read.value.body.at);
      if (!computed.ok || canonicalJson(computed.value.body) !== canonicalJson(read.value.body)) {
        report.beats.mismatched.push(entry.n);
        problem(4, "bundle-beat-mismatch", `The beat at entry ${entry.n} does not recompute.`, {
          n: entry.n,
        });
      }
    }
    batch.push({ entry, verdict });
  }
  now = foldEntries(now, batch);
  report.beats.total = beats.length;
  for (const skipped of now.ignored) {
    if (skipped.pending) continue;
    report.ignored.push({ n: skipped.n, kind: skipped.kind, code: skipped.code });
    if (NEWER_CODES.has(skipped.code)) {
      report.newer += 1;
    } else if (!(skipped.kind === "beat" && report.beats.mismatched.includes(skipped.n))) {
      problem(3, "bundle-entry-ignored", `Entry ${skipped.n} does not fold: ${skipped.code}.`, {
        n: skipped.n,
      });
    }
  }
  return now;
}

/** Every AI-work revision the world's places and chapters announce, once per pack. */
export function bundleWorks(now: WorldNow): Array<WorkRef & { pack: ContentHash }> {
  const refs = new Map<string, WorkRef & { pack: ContentHash }>();
  for (const place of now.places)
    if (place.body.work !== undefined) {
      refs.set(place.body.work.pack, place.body.work);
    }
  for (const contest of Object.values(now.chapters)) {
    for (const chapter of [contest.live, ...contest.variants]) {
      if (chapter?.body.kind === "work") refs.set(chapter.body.work.pack, chapter.body.work);
    }
  }
  return [...refs.values()];
}

/** Checks 5–6: the genesis pack and every work pack, and no blob that nothing names. */
function checkPacks(
  manifest: WorldBundleManifest,
  genesis: GenesisEvent,
  now: WorldNow,
  blobs: ReadonlyMap<ContentHash, Uint8Array>,
  report: WorldBundleReport,
  problem: Problems,
): void {
  const named = new Set<string>();
  const ref = genesis.body.cartridge;
  const pack = manifest.genesisPack;
  if (pack === null) {
    problem(5, "bundle-genesis-pack-missing", "The file carries no cartridge pack.");
  } else {
    named.add(pack);
    const path = `blobs/${pack.slice(7)}`;
    const bytes = blobs.get(pack);
    if (now.pack !== null && now.pack.pack !== pack) {
      problem(5, "bundle-genesis-pack-not-announced", "The cartridge pack is not the world's.", {
        path,
      });
    }
    if (bytes === undefined) {
      problem(5, "bundle-blob-missing", "The cartridge pack is not in the file.", { path });
    } else {
      const unpacked = unpackCartridge(bytes);
      const found = unpacked.ok ? unpacked.value.manifest : null;
      if (!unpacked.ok) {
        problem(5, unpacked.error.code, `The cartridge pack: ${unpacked.error.message}`, { path });
      } else if (
        found === null ||
        found.cartridgeId !== ref.cartridgeId ||
        found.version !== ref.version ||
        found.contentHash !== ref.contentHash
      ) {
        problem(
          5,
          "bundle-genesis-pack-mismatch",
          `The pack holds ${found?.cartridgeId}@${found?.version}, not the revision the genesis names.`,
          { path },
        );
      }
    }
  }
  const works = bundleWorks(now);
  report.works = works.length;
  for (const work of works) {
    named.add(work.pack);
    const path = `blobs/${work.pack.slice(7)}`;
    const bytes = blobs.get(work.pack);
    if (bytes === undefined) {
      problem(
        6,
        "bundle-blob-missing",
        `${work.workId}@${work.version}'s pack is not in the file.`,
        {
          path,
        },
      );
      continue;
    }
    const unpacked = readWorkPack(bytes);
    if (!unpacked.ok) {
      problem(6, unpacked.error.code, `${work.workId}: ${unpacked.error.message}`, { path });
      continue;
    }
    const found = unpacked.value.manifest;
    if (
      found.workId !== work.workId ||
      found.version !== work.version ||
      found.contentHash !== work.contentHash
    ) {
      problem(6, "bundle-work-pack-mismatch", `${work.workId}'s pack holds another revision.`, {
        path,
      });
    }
  }
  for (const hash of blobs.keys()) {
    if (!named.has(hash)) {
      problem(1, "bundle-blob-unreferenced", "The file carries a pack nothing in it names.", {
        path: `blobs/${hash.slice(7)}`,
      });
    }
  }
}

/**
 * D5's seven checks over a `.world`'s files, and what they found. `opened` is null when world.json
 * or the log could not be read at all (the report says why); otherwise it holds the parsed parts.
 */
export function openWorldBundle(files: ReadonlyMap<string, Uint8Array>): {
  report: WorldBundleReport;
  opened: OpenedWorldBundle | null;
} {
  const report = emptyReport();
  const problem: Problems = (check, code, message, at = {}) => {
    report.problems.push({ check, code, message, ...at });
  };
  const parsed = worldBundleManifestSchema.safeParse(jsonOf(files.get(BUNDLE_FILES.manifest)));
  if (!parsed.success) {
    problem(1, "bundle-manifest-invalid", "world.json is missing or does not read.");
    return { report, opened: null };
  }
  const manifest = parsed.data;
  Object.assign(report, {
    worldId: manifest.worldId,
    head: manifest.head,
    physicsVersion: manifest.physicsVersion,
    protocol: manifest.protocol,
    exportedAt: manifest.exportedAt,
    exportedBy: manifest.exportedBy,
  });
  const blobs = checkFiles(files, manifest, report, problem);
  const logBytes = files.get(BUNDLE_FILES.log);
  const log = logBytes === undefined ? null : readLog(logBytes, problem);
  const genesis = log === null ? null : openGenesis(log.entries[0]?.event);
  if (log === null || genesis === null || !genesis.ok || genesis.value.id !== manifest.worldId) {
    if (log !== null) problem(2, "bundle-no-genesis", "The history does not start with its world.");
    return { report, opened: null };
  }
  const { entries } = log;
  report.name = genesis.value.body.name;
  report.cartridge = genesis.value.body.cartridge;
  report.entries = entries.length;
  report.authors = [...new Set(entries.map((entry) => String(entry.event.author)))].sort();
  const last = entries[entries.length - 1];
  if (last?.n !== manifest.head.n || last.chain !== manifest.head.chain) {
    problem(2, "bundle-head-mismatch", "world.json's head is not the history's last entry.");
  }
  const verified = verifyLog(manifest.worldId, entries);
  const check = verified.ok ? verified.value : null;
  if (!verified.ok) {
    problem(2, verified.error.code, verified.error.message);
  } else {
    report.owners = [...verified.value.ownership.owners];
    report.services = servicesOf(verified.value, entries);
    if (canonicalJson(report.services) !== canonicalJson(manifest.services)) {
      problem(2, "bundle-services-mismatch", "world.json's services are not the history's.");
    }
  }
  const physics = genesis.value.body.physicsVersion;
  if (manifest.physicsVersion !== physics) {
    problem(7, "bundle-physics-mismatch", "world.json's physics is not the genesis's.");
  }
  const supported = checkPhysics(physics);
  if (!supported.ok) problem(7, supported.error.code, supported.error.message);
  if (manifest.protocol > WORLD_PROTOCOL) {
    problem(
      7,
      "protocol-newer",
      `This file is world protocol ${manifest.protocol}; this build speaks ${WORLD_PROTOCOL}.`,
    );
  }
  // Verdicts and beats are only defined under physics this build reproduces.
  const now = supported.ok
    ? foldAndBeats(genesis.value, entries, report, problem)
    : emptyNow(genesis.value);
  const needs = protocolFor(now);
  if (supported.ok && manifest.protocol < needs) {
    problem(
      7,
      "bundle-protocol-understated",
      `world.json states world protocol ${manifest.protocol}; its history needs ${needs}.`,
    );
  }
  checkPacks(manifest, genesis.value, now, blobs, report, problem);
  const opened: OpenedWorldBundle = {
    manifest,
    genesis: genesis.value,
    entries,
    logText: log.text,
    blobs,
    now,
    check,
    report,
  };
  return { report, opened };
}

/** D5: the report of a `.world`'s files (see `openWorldBundle` for the parsed parts too). */
export function verifyWorldBundle(files: ReadonlyMap<string, Uint8Array>): WorldBundleReport {
  return openWorldBundle(files).report;
}

/** A `.world` file's bytes, read (pre-inflate limits) and verified; unreadable is check 1. */
export function verifyWorldFile(bytes: Uint8Array): {
  report: WorldBundleReport;
  opened: OpenedWorldBundle | null;
} {
  const files = readWorldBundle(bytes);
  if (files.ok) return openWorldBundle(files.value);
  const report = emptyReport();
  report.bytes = bytes.length;
  report.problems.push({ check: 1, code: files.error.code, message: files.error.message });
  return { report, opened: null };
}
