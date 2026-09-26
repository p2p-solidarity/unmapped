// The `.world` file (rev 6 phase 4, D5): a shared world with no personal state, so that with our
// servers off someone else can verify it offline, import it into any world service, and visit it.
// This module is the format's contract (pure, shared by main, the service, `verifyWorldBundle` and
// the renderer): the file layout, its limits, `world.json`'s schema, the exporter's signature, the
// verification report, the `bundle:*` IPC and the move link.
//
// A `.world` is a zip holding:
//   world.json           { format, worldId, head, protocol, physicsVersion, genesisPack, files,
//                          exportedAt, exportedBy, services } — `files` lists every other entry
//                          but signature.json, in `hashOrder` of path (never the machine's locale)
//   history/log.jsonl    the sequenced entries only, in P3's exact line format
//   blobs/<sha256 hex>   the genesis pack, and every work pack a place or chapter names
//   signature.json       { v: 1, key, sig }: the exporter (a device key, or a service key) over
//                        "unmapped-world:v1\n" + sha256 hex of canonicalJson(world.json). It says
//                        who exported the file; trust comes from the chain, receipts and hashes.
// save.json, the world.json pin, progress.json, the outbox and snapshot.json stay out: they belong
// to a `.spire-backup` or are derived.

import { z } from "zod";
import type { ArchiveLimits } from "./archive";
import { canonicalJson } from "./canonical";
import type { CartridgeRef, ContentHash } from "./cartridge";
import { isServiceUrl } from "./history/bodies";
import {
  AUTHOR_KEY,
  CHAIN,
  CONTENT_HASH,
  EVENT_ID,
  ISO_TIME,
  SIGNATURE,
  sha256Hex,
} from "./history/ids";
import type { Head } from "./history/types";
import { err, ok, type Result } from "./result";
import type { WorldStatus } from "./worldApi";

export const WORLD_BUNDLE_FORMAT = "unmapped.world/1";
export const WORLD_BUNDLE_EXTENSION = "world";

export const BUNDLE_FILES = {
  manifest: "world.json",
  signature: "signature.json",
  log: "history/log.jsonl",
} as const;

/** `blobs/<64 hex>`: a blob's entry is named by its own sha256. */
export const BUNDLE_BLOB_ENTRY = /^blobs\/([a-f0-9]{64})$/;

const KiB = 1024;
const MiB = 1024 * KiB;

/**
 * The log: P3's 64 MiB of member and owner events, 8 MiB of visitor events, and 8 MiB for owner
 * kinds and receipts after `world-full`. Blobs: P3 D9's (≤ 32 MiB each, ≤ 256 MiB together).
 */
export const BUNDLE_LIMITS = {
  logBytes: 80 * MiB,
  blobBytes: 32 * MiB,
  blobsBytes: 256 * MiB,
  blobs: 1024,
  manifestBytes: 1 * MiB,
  signatureBytes: 4 * KiB,
} as const;

/** The archive as a whole, checked from its central directory before anything is inflated. */
export const BUNDLE_ARCHIVE_LIMITS: ArchiveLimits = {
  archiveBytes:
    BUNDLE_LIMITS.logBytes + BUNDLE_LIMITS.blobsBytes + BUNDLE_LIMITS.manifestBytes + 8 * MiB,
  entries: BUNDLE_LIMITS.blobs + 3,
  entryBytes: BUNDLE_LIMITS.logBytes,
  totalBytes:
    BUNDLE_LIMITS.logBytes +
    BUNDLE_LIMITS.blobsBytes +
    BUNDLE_LIMITS.manifestBytes +
    BUNDLE_LIMITS.signatureBytes,
};

export const bundleBlobPath = (hash: ContentHash | string): string =>
  `blobs/${hash.slice("sha256:".length)}`;

export interface BundleFile {
  path: string;
  bytes: number;
  sha256: ContentHash;
}

/** A service the world was sequenced by, from the entry whose `sequencer` installed its key. */
export interface BundleService {
  url: string;
  key: string;
  from: number;
}

export interface WorldBundleManifest {
  format: typeof WORLD_BUNDLE_FORMAT;
  worldId: string;
  head: Head;
  protocol: number;
  physicsVersion: number;
  /** The cartridge pack: the latest `pack` event's blob, or the exporter's pack of a built-in. */
  genesisPack: ContentHash | null;
  files: BundleFile[];
  exportedAt: string;
  exportedBy: string;
  services: BundleService[];
}

export interface BundleSignature {
  v: 1;
  key: string;
  sig: string;
}

const hash = z.custom<ContentHash>((v) => typeof v === "string" && CONTENT_HASH.test(v));
const count = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);

export const worldBundleManifestSchema: z.ZodType<WorldBundleManifest> = z.strictObject({
  format: z.literal(WORLD_BUNDLE_FORMAT),
  worldId: z.string().regex(EVENT_ID),
  head: z.strictObject({ n: count.min(1), chain: z.string().regex(CHAIN) }),
  protocol: z.number().int().min(1).max(1000),
  physicsVersion: z.number().int().min(1).max(1000),
  genesisPack: hash.nullable(),
  files: z
    .array(
      z.strictObject({
        path: z.string().min(1).max(80),
        bytes: count,
        sha256: hash,
      }),
    )
    .max(BUNDLE_LIMITS.blobs + 1),
  exportedAt: z.string().regex(ISO_TIME),
  exportedBy: z.string().regex(AUTHOR_KEY),
  services: z
    .array(
      z.strictObject({
        url: z.string().min(1).max(200),
        key: z.string().regex(AUTHOR_KEY),
        from: count.min(1),
      }),
    )
    .max(256),
});

export const bundleSignatureSchema: z.ZodType<BundleSignature> = z.strictObject({
  v: z.literal(1),
  key: z.string().regex(AUTHOR_KEY),
  sig: z.string().regex(SIGNATURE),
});

/** What the exporter signs: its own purpose line, then the hash of the canonical world.json. */
export function bundleSignText(manifest: WorldBundleManifest): string {
  return `unmapped-world:v1\n${sha256Hex(canonicalJson(manifest))}`;
}

// ── The verification report ─────────────────────────────────────────────────────────────────

/**
 * The seven checks of D5, in order: 1 sizes, listed hashes, nothing unlisted (and the signature);
 * 2 the chain, ownership and receipts; 3 verdicts and the fold; 4 beats; 5 the genesis pack;
 * 6 the work packs; 7 physics (and protocol) this build supports.
 */
export type BundleCheck = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export interface BundleProblem {
  check: BundleCheck;
  code: string;
  message: string;
  /** The log entry it is about, when it is about one. */
  n?: number;
  /** The file it is about, when it is about one. */
  path?: string;
}

export interface BundleIgnored {
  n: number;
  kind: string | null;
  code: string;
}

/** What a `.world` holds and how it verified: a report, never a bare yes or no. */
export interface WorldBundleReport {
  worldId: string | null;
  name: string | null;
  cartridge: CartridgeRef | null;
  head: Head | null;
  physicsVersion: number | null;
  protocol: number | null;
  exportedAt: string | null;
  exportedBy: string | null;
  signature: "valid" | "invalid" | "missing";
  entries: number;
  /** Every key that wrote an entry, in code-unit order. */
  authors: string[];
  /** Who owns the world at its head (the ownership pass of `verifyLog`). */
  owners: string[];
  /** The services the receipt schedule names, oldest first; empty for a never-attached world. */
  services: BundleService[];
  beats: { total: number; mismatched: number[] };
  /** Entries the fold skipped, with why (entries from a newer build included). */
  ignored: BundleIgnored[];
  /** Of those, from a newer build (kept and skipped, D18; not a problem). */
  newer: number;
  works: number;
  blobs: number;
  bytes: number;
  problems: BundleProblem[];
}

export function bundleOk(report: WorldBundleReport): boolean {
  return report.problems.length === 0;
}

// ── The move link (members follow a rehosted world) ─────────────────────────────────────────

const MOVE_LINK = /^unmapped:\/\/world\?w=(h[a-z2-7]{52})&svc=([^&\s]+)$/;

export function moveLink(worldId: string, svc: string): string {
  return `unmapped://world?w=${worldId}&svc=${encodeURIComponent(svc)}`;
}

export function isMoveLink(text: string): boolean {
  return text.trim().startsWith("unmapped://world?");
}

/** A pasted move link: the world id and the service it moved to (wss://, or ws:// on loopback). */
export function readMoveLink(text: string): Result<{ world: string; svc: string }> {
  const match = MOVE_LINK.exec(text.trim());
  let svc = "";
  try {
    svc = decodeURIComponent(match?.[2] ?? "");
  } catch {
    svc = "";
  }
  if (match?.[1] === undefined || !isServiceUrl(svc)) {
    return err(
      "move-link-invalid",
      "That is not a move link.",
      "Paste the whole unmapped://world?… link the world's owner sent.",
    );
  }
  return ok({ world: match[1], svc });
}

// ── IPC (`window.seed.bundle.*`, main/bundles/ipc.ts) ────────────────────────────────────────

export const BUNDLE_IPC = {
  list: "bundle:list",
  export: "bundle:export",
  inspect: "bundle:inspect",
  import: "bundle:import",
  move: "bundle:move",
} as const;

/** A world whose history this device holds, as the export list shows it. */
export interface BundleWorld {
  worldId: string;
  name: string;
  head: number;
  /** Attached to a service (else sequenced on its owner's device). */
  attached: boolean;
  url: string | null;
  owner: boolean;
}

export interface BundleExported {
  /** The file name the player chose (never a path: the renderer never names files). */
  fileName: string;
  bytes: number;
  report: WorldBundleReport;
}

export interface BundleInspected {
  /** Names the file main read, for `import`; valid until the next inspect. */
  token: string;
  fileName: string;
  report: WorldBundleReport;
}

export interface BundleImported {
  /** The world the save plays now (a new id when a never-attached world was adopted here). */
  worldId: string;
  instanceId: string;
  adoptedFrom: string | null;
  /** How the file's history met this device's: installed, same, kept (ours longer), extended. */
  history: "installed" | "same" | "kept" | "extended";
  /** A save of this world already here (a restored `.spire-backup`) was used instead of a new one. */
  reused: boolean;
}

export interface WorldMoved {
  worldId: string;
  url: string;
  /** Entries the new service had that this device did not. */
  added: number;
  status: WorldStatus;
}

export interface BundleApi {
  /** The worlds this device holds a history of. */
  list(): Promise<Result<BundleWorld[]>>;
  /** Writes a signed `.world` where the player chooses; null when the dialog was cancelled. */
  export(worldId: string): Promise<Result<BundleExported | null>>;
  /** Reads a `.world` the player picks and verifies it offline; null when cancelled. */
  inspect(): Promise<Result<BundleInspected | null>>;
  /** Brings the inspected world onto this device: packs, history, a save pinned to it. */
  import(token: string, name: string): Promise<Result<BundleImported>>;
  /** Follows a move link: switches the world to the service it moved to, never merging. */
  move(link: string): Promise<Result<WorldMoved>>;
}
