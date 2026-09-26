// An append-only JSONL file (rev 6 phase 4, D2 "the ledger"): one process per data dir, every line
// fsynced before anyone is told about it. An append that fails is cut back to the old length, so a
// half-written line never stays behind a later one. A last line with no newline was torn by a crash
// before it was acknowledged: its bytes are kept beside the file (`<name>.torn-<ms>`) and cut from
// it. Nothing else is ever changed or deleted. Synchronous node:fs (Bun implements it).

import { randomBytes } from "node:crypto";
import {
  closeSync,
  existsSync,
  fstatSync,
  fsyncSync,
  ftruncateSync,
  openSync,
  readFileSync,
  renameSync,
  truncateSync,
  writeFileSync,
} from "node:fs";
import { err, ok, type Result } from "@shared/result";

export function storageError(what: string, error: unknown): Result<never> {
  const detail = error instanceof Error ? error.message : String(error);
  return err("gateway-storage", `Could not ${what}: ${detail}`, "Check the gateway's data disk.");
}

/** Writes a whole file aside, fsyncs it, then renames it into place. */
export function writeDurably(path: string, data: string, mode = 0o644): void {
  const temp = `${path}.tmp-${process.pid}-${randomBytes(4).toString("hex")}`;
  const fd = openSync(temp, "wx", mode);
  try {
    writeFileSync(fd, data);
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  renameSync(temp, path);
}

export interface JsonlRead {
  lines: string[];
  /** Bytes of a torn last line moved aside, or 0. */
  torn: number;
}

export class JsonlFile {
  constructor(readonly path: string) {}

  read(): Result<JsonlRead> {
    if (!existsSync(this.path)) return ok({ lines: [], torn: 0 });
    let bytes: Buffer;
    try {
      bytes = readFileSync(this.path);
    } catch (error) {
      return storageError(`read ${this.path}`, error);
    }
    // Work on bytes: a damaged UTF-8 sequence must not move where the file is cut.
    const end = bytes.lastIndexOf(0x0a) + 1;
    const torn = bytes.length - end;
    if (torn > 0) {
      try {
        writeDurably(`${this.path}.torn-${Date.now()}`, bytes.subarray(end).toString("latin1"));
        truncateSync(this.path, end);
      } catch (error) {
        return storageError(`set aside the torn end of ${this.path}`, error);
      }
    }
    const text = bytes.subarray(0, end).toString("utf8");
    return ok({ lines: text === "" ? [] : text.slice(0, -1).split("\n"), torn });
  }

  append(value: unknown): Result<void> {
    const line = JSON.stringify(value);
    let fd: number;
    try {
      fd = openSync(this.path, "a", 0o600);
    } catch (error) {
      return storageError(`open ${this.path}`, error);
    }
    let size = 0;
    try {
      size = fstatSync(fd).size;
      writeFileSync(fd, `${line}\n`);
      fsyncSync(fd);
      return ok(undefined);
    } catch (error) {
      try {
        ftruncateSync(fd, size);
        fsyncSync(fd);
      } catch {}
      return storageError(`append to ${this.path}`, error);
    } finally {
      closeSync(fd);
    }
  }
}

/**
 * Parses every line with `parse`; the first line that does not parse stops the load with its
 * number. A money ledger with a bad line in the middle is damaged, never guessed at.
 */
export function parseLines<T>(
  file: string,
  lines: readonly string[],
  parse: (raw: unknown) => T | null,
): Result<T[]> {
  const out: T[] = [];
  for (const [index, line] of lines.entries()) {
    let raw: unknown;
    try {
      raw = JSON.parse(line);
    } catch {
      raw = undefined;
    }
    const value = raw === undefined ? null : parse(raw);
    if (value === null) {
      return err(
        "gateway-ledger-damaged",
        `${file} line ${index + 1} is not a line this gateway writes.`,
        "Restore the file from a backup, or move the damaged line aside by hand; the gateway " +
          "never guesses at a ledger.",
      );
    }
    out.push(value);
  }
  return ok(out);
}
