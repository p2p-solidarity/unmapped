// Writing a `.world` (rev 6 phase 4, D5): the one builder main (a member's export, signed with the
// device key) and the world service (`bun run service -- export`, signed with the service key)
// share, so both write the same layout (@shared/worldBundle). Pure: the caller reads the log and
// the blobs and says who signs.
//
// The log goes in verbatim (a service's stored lines, byte for byte) and must verify — chain,
// ownership, receipts — before anything is written: a device never signs a history it cannot prove.
// It may hold 80 MiB (`world-too-large` past that); packs keep P3 D9's blob limits. Entries go in
// with a fixed 1980 mtime; packs are already compressed zips and are stored as they are.
//
// world.json's `protocol` is `protocolFor` the log's own fold — the lowest protocol that folds it as
// this build does, as the service asks of an `open` — never this build's `WORLD_PROTOCOL`: a world
// without co-owners or a chain opt-in stays readable by a protocol-1 build, and a protocol-3 writer
// will not lock protocol-2 readers out of a world that never used protocol 3.

import type { ContentHash } from "@shared/cartridge";
import { hashOrder } from "@shared/hashOrder";
import { emptyNow, foldEntries, openGenesis } from "@shared/history/fold";
import { contentHash, utf8, utf8Length } from "@shared/history/ids";
import { verifyLog } from "@shared/history/log";
import type { LogEntry } from "@shared/history/types";
import { err, ok, type Result } from "@shared/result";
import {
  BUNDLE_FILES,
  BUNDLE_LIMITS,
  type BundleFile,
  type BundleSignature,
  bundleBlobPath,
  WORLD_BUNDLE_FORMAT,
  type WorldBundleManifest,
} from "@shared/worldBundle";
import { protocolFor } from "@shared/worldProtocol";
import { type Zippable, zipSync } from "fflate";
import { verdictEntries } from "./verdict";

export interface BundleBlob {
  hash: ContentHash;
  bytes: Uint8Array;
}

export interface WorldBundleInput {
  entries: readonly LogEntry[];
  /** The log exactly as stored (one JSON line per entry, each ending "\n"); made when absent. */
  logText?: string;
  /** The latest `pack` event's blob, or the exporter's pack of a shipped built-in revision. */
  genesisPack: BundleBlob | null;
  /** Every work pack a place or chapter names. */
  works: readonly BundleBlob[];
  exportedAt: string;
  signer: { key: string; sign(manifest: WorldBundleManifest): string };
}

const MiB = 1024 * 1024;

function tooLarge(message: string): Result<never> {
  return err(
    "world-too-large",
    message,
    "A .world holds at most an 80 MiB history and 256 MiB of packs (32 MiB each).",
  );
}

/** 1980-01-01 00:00:00 local: the first instant a ZIP (DOS) time holds, the same bytes everywhere. */
function zipEpoch(): Date {
  return new Date(1980, 0, 1, 0, 0, 0, 0);
}

export function buildWorldBundle(
  input: WorldBundleInput,
): Result<{ bytes: Uint8Array; manifest: WorldBundleManifest }> {
  const { entries } = input;
  const genesis = openGenesis(entries[0]?.event);
  if (!genesis.ok) return err("bundle-no-genesis", "The history does not start with its world.");
  const worldId = genesis.value.id;
  const logText = input.logText ?? `${entries.map((entry) => JSON.stringify(entry)).join("\n")}\n`;
  if (!logText.endsWith("\n") || logText.slice(0, -1).split("\n").length !== entries.length) {
    return err("bundle-log-invalid", "The history's text is not its entries, one per line.");
  }
  const logBytes = utf8Length(logText);
  if (logBytes > BUNDLE_LIMITS.logBytes) {
    return tooLarge(`This world's history is ${Math.ceil(logBytes / MiB)} MiB; at most 80 MiB.`);
  }
  const verified = verifyLog(worldId, entries);
  if (!verified.ok) return verified;
  const blobs = new Map<ContentHash, Uint8Array>();
  for (const blob of [...(input.genesisPack === null ? [] : [input.genesisPack]), ...input.works]) {
    if (contentHash(blob.bytes) !== blob.hash) {
      return err("blob-tampered", `Pack ${blob.hash.slice(0, 19)}… does not match its hash.`);
    }
    if (blob.bytes.length > BUNDLE_LIMITS.blobBytes) {
      return tooLarge(`Pack ${blob.hash.slice(0, 19)}… is larger than 32 MiB.`);
    }
    blobs.set(blob.hash, blob.bytes);
  }
  const blobBytes = [...blobs.values()].reduce((sum, bytes) => sum + bytes.length, 0);
  if (blobBytes > BUNDLE_LIMITS.blobsBytes || blobs.size > BUNDLE_LIMITS.blobs) {
    return tooLarge("This world's packs are larger than 256 MiB together.");
  }
  const log = utf8(logText);
  const files: BundleFile[] = [
    { path: BUNDLE_FILES.log, bytes: log.length, sha256: contentHash(log) as ContentHash },
    ...[...blobs].map(([hash, bytes]) => ({
      path: bundleBlobPath(hash),
      bytes: bytes.length,
      sha256: hash,
    })),
  ].sort((a, b) => hashOrder(a.path, b.path));
  const last = entries[entries.length - 1];
  if (last === undefined) return err("bundle-no-genesis", "The history is empty.");
  const services = verified.value.schedule.map((step) => {
    const body = entries[step.n - 1]?.event.body as { url?: unknown } | undefined;
    return { url: typeof body?.url === "string" ? body.url : "", key: step.key, from: step.n };
  });
  const manifest: WorldBundleManifest = {
    format: WORLD_BUNDLE_FORMAT,
    worldId,
    head: { n: last.n, chain: last.chain },
    protocol: protocolFor(foldEntries(emptyNow(genesis.value), verdictEntries(entries))),
    physicsVersion: genesis.value.body.physicsVersion,
    genesisPack: input.genesisPack?.hash ?? null,
    files,
    exportedAt: input.exportedAt,
    exportedBy: input.signer.key,
    services,
  };
  const signature: BundleSignature = {
    v: 1,
    key: input.signer.key,
    sig: input.signer.sign(manifest),
  };
  const mtime = zipEpoch();
  const zippable: Zippable = {
    [BUNDLE_FILES.manifest]: [utf8(`${JSON.stringify(manifest, null, 2)}\n`), { mtime, level: 6 }],
    [BUNDLE_FILES.signature]: [utf8(`${JSON.stringify(signature)}\n`), { mtime, level: 6 }],
  };
  for (const file of files) {
    const bytes = file.path === BUNDLE_FILES.log ? log : blobs.get(file.sha256);
    if (bytes === undefined) continue;
    zippable[file.path] = [bytes, { mtime, level: file.path === BUNDLE_FILES.log ? 6 : 0 }];
  }
  try {
    return ok({ bytes: zipSync(zippable, { mtime }), manifest });
  } catch (error) {
    return err("bundle-write-failed", error instanceof Error ? error.message : String(error));
  }
}
