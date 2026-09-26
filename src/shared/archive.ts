// Reading ZIP archives that arrive from elsewhere (rev 6 phase 4, WP "integrity"): a `.cartridge`,
// a genesis pack from a world's history, a `.world` bundle. Pure (fflate's streaming inflater and
// typed arrays), so main, the world service and `verifyWorldBundle` refuse the same archives.
//
// Everything is decided from the central directory before a byte is inflated: the entry count,
// each entry's declared size and the declared total, duplicate names, and that every entry's data
// lies inside the file. A zip bomb whose directory tells the truth is refused there, having cost
// nothing. One whose directory lies is inflated into a buffer of the declared size only, in small
// steps, and refused as soon as it yields more (or ends with less): memory and time stay bounded
// by what the directory declared, never by what the data would expand to.
//
// ZIP64 is refused outright (a zip64 locator, or the 0xFFFF / 0xFFFFFFFF markers): no pack needs
// it, and a reader that honours a zip64 directory would read another directory than this one.

import { Inflate } from "fflate";
import { err, ok, type Result } from "./result";

const LOCAL_HEADER = 0x04034b50;
const CENTRAL_HEADER = 0x02014b50;
const END_HEADER = 0x06054b50;
const ZIP64_LOCATOR = 0x07064b50;
const END_BYTES = 22;
const MAX_COMMENT_BYTES = 65_535;
/** Compressed bytes fed to the inflater per step: at most ~8 MiB of output before a size check. */
const INFLATE_STEP = 8 * 1024;

function u16(bytes: Uint8Array, offset: number): number {
  return (bytes[offset] ?? 0) | ((bytes[offset + 1] ?? 0) << 8);
}

function u32(bytes: Uint8Array, offset: number): number {
  return (u16(bytes, offset) | (u16(bytes, offset + 2) << 16)) >>> 0;
}

/** The end-of-central-directory record's offset, or -1. */
function endRecord(bytes: Uint8Array): number {
  const start = Math.max(0, bytes.length - END_BYTES - MAX_COMMENT_BYTES);
  for (let offset = bytes.length - END_BYTES; offset >= start; offset -= 1) {
    if (u32(bytes, offset) === END_HEADER) return offset;
  }
  return -1;
}

function zip64(bytes: Uint8Array, end: number): boolean {
  return (
    (end >= 20 && u32(bytes, end - 20) === ZIP64_LOCATOR) ||
    u16(bytes, end + 10) === 0xffff ||
    u32(bytes, end + 16) === 0xffffffff
  );
}

/** Reads central-directory names before fflate collapses duplicate ZIP entries into an object. */
export function validateArchiveEntryNames(bytes: Uint8Array, code: string): Result<void> {
  const end = endRecord(bytes);
  if (end < 0) return err(code, "The ZIP central directory is missing or damaged.");
  if (zip64(bytes, end)) return err(code, "ZIP64 archives are not read here.");
  const count = u16(bytes, end + 10);
  let offset = u32(bytes, end + 16);
  const names = new Set<string>();
  const decoder = new TextDecoder();
  for (let index = 0; index < count; index += 1) {
    if (offset + 46 > end || u32(bytes, offset) !== CENTRAL_HEADER) {
      return err(code, "The ZIP central directory is inconsistent.");
    }
    const nameBytes = u16(bytes, offset + 28);
    const extraBytes = u16(bytes, offset + 30);
    const commentBytes = u16(bytes, offset + 32);
    const next = offset + 46 + nameBytes + extraBytes + commentBytes;
    if (next > end) return err(code, "A ZIP entry name extends past the central directory.");
    const name = decoder.decode(bytes.subarray(offset + 46, offset + 46 + nameBytes));
    if (names.has(name)) return err(code, `The archive contains duplicate entry ${name}.`);
    names.add(name);
    offset = next;
  }
  return ok(undefined);
}

/** What an archive may hold, all checked from the central directory before inflating. */
export interface ArchiveLimits {
  /** The archive file itself. */
  archiveBytes: number;
  /** Entries in the central directory, folders included. */
  entries: number;
  /** One entry, inflated. */
  entryBytes: number;
  /** Every entry inflated together. */
  totalBytes: number;
}

/** The codes an archive is refused with: a damaged directory, bad data, or over a limit. */
export interface ArchiveCodes {
  directory: string;
  unreadable: string;
  tooLarge: string;
}

/** One central-directory entry, as declared. */
export interface ArchiveEntry {
  name: string;
  /** 0 = stored, 8 = deflated; nothing else is read. */
  method: 0 | 8;
  compressedBytes: number;
  bytes: number;
  /** Where its data starts (after the local header). */
  dataOffset: number;
}

function mib(bytes: number): string {
  return `${Math.round((bytes / (1024 * 1024)) * 10) / 10} MiB`;
}

/**
 * Every entry of the central directory, refused before anything is inflated when the archive or
 * the directory is over `limits`, damaged, encrypted, ZIP64, uses another compression, names an
 * entry twice, or points outside the file.
 */
export function readArchiveDirectory(
  bytes: Uint8Array,
  limits: ArchiveLimits,
  codes: ArchiveCodes,
): Result<ArchiveEntry[]> {
  if (bytes.length > limits.archiveBytes) {
    return err(
      codes.tooLarge,
      `The archive is ${mib(bytes.length)}; at most ${mib(limits.archiveBytes)}.`,
    );
  }
  const end = endRecord(bytes);
  if (end < 0) return err(codes.directory, "The ZIP central directory is missing or damaged.");
  if (zip64(bytes, end)) return err(codes.directory, "ZIP64 archives are not read here.");
  const count = u16(bytes, end + 10);
  if (u16(bytes, end + 4) !== 0 || u16(bytes, end + 6) !== 0 || u16(bytes, end + 8) !== count) {
    return err(codes.directory, "Split ZIP archives are not read here.");
  }
  if (count > limits.entries) {
    return err(codes.tooLarge, `The archive has ${count} entries; at most ${limits.entries}.`);
  }
  const directory = u32(bytes, end + 16);
  if (directory + u32(bytes, end + 12) > end) {
    return err(codes.directory, "The ZIP central directory is inconsistent.");
  }
  const decoder = new TextDecoder();
  const names = new Set<string>();
  const entries: ArchiveEntry[] = [];
  let total = 0;
  let offset = directory;
  for (let index = 0; index < count; index += 1) {
    if (offset + 46 > end || u32(bytes, offset) !== CENTRAL_HEADER) {
      return err(codes.directory, "The ZIP central directory is inconsistent.");
    }
    const flags = u16(bytes, offset + 8);
    const method = u16(bytes, offset + 10);
    const compressedBytes = u32(bytes, offset + 20);
    const size = u32(bytes, offset + 24);
    const nameBytes = u16(bytes, offset + 28);
    const next = offset + 46 + nameBytes + u16(bytes, offset + 30) + u16(bytes, offset + 32);
    if (next > end) return err(codes.directory, "A ZIP entry extends past the central directory.");
    const name = decoder.decode(bytes.subarray(offset + 46, offset + 46 + nameBytes));
    if (names.has(name)) {
      return err(codes.directory, `The archive contains duplicate entry ${name.slice(0, 120)}.`);
    }
    names.add(name);
    if ((flags & 1) !== 0) return err(codes.directory, "Encrypted ZIP entries are not read here.");
    if (method !== 0 && method !== 8) {
      return err(codes.directory, `ZIP compression method ${method} is not read here.`);
    }
    if (size > limits.entryBytes) {
      return err(
        codes.tooLarge,
        `${name.slice(0, 120)} is ${mib(size)}; at most ${mib(limits.entryBytes)}.`,
      );
    }
    total += size;
    if (total > limits.totalBytes) {
      return err(codes.tooLarge, `The archive holds over ${mib(limits.totalBytes)} of files.`);
    }
    const local = u32(bytes, offset + 42);
    if (local + 30 > directory || u32(bytes, local) !== LOCAL_HEADER) {
      return err(codes.directory, `The ZIP entry ${name.slice(0, 120)} has no local header.`);
    }
    const dataOffset = local + 30 + u16(bytes, local + 26) + u16(bytes, local + 28);
    if (dataOffset + compressedBytes > directory || (method === 0 && compressedBytes !== size)) {
      return err(codes.directory, `The ZIP entry ${name.slice(0, 120)} lies outside the archive.`);
    }
    entries.push({ name, method, compressedBytes, bytes: size, dataOffset });
    offset = next;
  }
  return ok(entries);
}

/** One deflated entry into exactly `size` bytes, or null when it yields more, less, or garbage. */
function inflateExactly(data: Uint8Array, size: number): Uint8Array | null {
  if (data.length === 0) return size === 0 ? new Uint8Array(0) : null;
  const out = new Uint8Array(size);
  let written = 0;
  let over = false;
  const inflater = new Inflate((chunk) => {
    if (over) return;
    if (written + chunk.length > size) {
      over = true;
      return;
    }
    out.set(chunk, written);
    written += chunk.length;
  });
  try {
    for (let at = 0; at < data.length && !over; at += INFLATE_STEP) {
      const stop = Math.min(data.length, at + INFLATE_STEP);
      inflater.push(data.subarray(at, stop), stop === data.length);
    }
  } catch {
    return null;
  }
  return !over && written === size ? out : null;
}

/**
 * Every file of an archive within `limits`, in directory order: the directory is checked first
 * (`readArchiveDirectory`), then each entry inflated to exactly its declared size.
 */
export function unzipWithin(
  bytes: Uint8Array,
  limits: ArchiveLimits,
  codes: ArchiveCodes,
): Result<Array<{ name: string; bytes: Uint8Array }>> {
  const directory = readArchiveDirectory(bytes, limits, codes);
  if (!directory.ok) return directory;
  const files: Array<{ name: string; bytes: Uint8Array }> = [];
  for (const entry of directory.value) {
    const data = bytes.subarray(entry.dataOffset, entry.dataOffset + entry.compressedBytes);
    const inflated = entry.method === 0 ? data.slice() : inflateExactly(data, entry.bytes);
    if (inflated === null) {
      return err(
        codes.unreadable,
        `The ZIP entry ${entry.name.slice(0, 120)} does not inflate to its declared ${entry.bytes} bytes.`,
      );
    }
    files.push({ name: entry.name, bytes: inflated });
  }
  return ok(files);
}
