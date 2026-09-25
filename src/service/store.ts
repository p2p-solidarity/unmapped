// The service's files (rev 6 phase 3, D10). Everything durable is here:
//
//   <data>/service-key.json            ./keyFile
//   <data>/worlds/<worldId>/log.jsonl  line n = entry n, append-only, fsynced per batch
//   <data>/worlds/<worldId>/blobs.txt  "<sha256 hex> <bytes>" per blob this world may serve
//   <data>/worlds/<worldId>/snapshot.json  a fold cache keyed by (n, chain) and FOLD_VERSION
//   <data>/blobs/<sha256 hex>          content-addressed blobs, shared by every world
//
// Synchronous node:fs (Bun implements it), so a batch is on disk before anyone is told about it.
// An append that fails is cut back to the old length, so a half-written batch never stays behind a
// later one. A log whose last line has no newline was torn by a crash before it was acknowledged:
// the torn bytes are kept beside the log (`torn-<ms>.txt`) and cut from it; nothing else is ever
// changed or deleted.

import { createHash, randomBytes } from "node:crypto";
import {
  closeSync,
  existsSync,
  fstatSync,
  fsyncSync,
  ftruncateSync,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
  renameSync,
  statSync,
  truncateSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { EVENT_ID } from "@shared/history/ids";
import { err, ok, type Result } from "@shared/result";

export const BLOB_HASH = /^[a-f0-9]{64}$/;

export interface LogRead {
  lines: string[];
  /** Bytes of a torn last line moved aside, or 0. */
  torn: number;
}

function storageError(what: string, error: unknown): Result<never> {
  const detail = error instanceof Error ? error.message : String(error);
  return err("service-storage", `Could not ${what}: ${detail}`, "Check the service's data disk.");
}

function syncDir(dir: string): void {
  // Makes a rename durable. Some platforms refuse fsync on a directory; the rename still stands.
  try {
    const fd = openSync(dir, "r");
    try {
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
  } catch {}
}

function writeDurably(path: string, data: string | Uint8Array): void {
  const temp = `${path}.tmp-${process.pid}-${randomBytes(4).toString("hex")}`;
  const fd = openSync(temp, "wx", 0o644);
  try {
    writeFileSync(fd, data);
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  renameSync(temp, path);
}

export function sha256File(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export class FileStore {
  constructor(readonly root: string) {}

  private worldDir(world: string): string {
    return join(this.root, "worlds", world);
  }

  private blobDir(): string {
    return join(this.root, "blobs");
  }

  blobPath(hash: string): string {
    return join(this.blobDir(), hash);
  }

  /** Creates the data layout; returns what could not be made. */
  ensure(): Result<void> {
    try {
      mkdirSync(join(this.root, "worlds"), { recursive: true });
      mkdirSync(this.blobDir(), { recursive: true });
      return ok(undefined);
    } catch (error) {
      return storageError(`create ${this.root}`, error);
    }
  }

  /** World directories, and names that are not world ids (reported, never touched). */
  worldIds(): { ids: string[]; strays: string[] } {
    const ids: string[] = [];
    const strays: string[] = [];
    let names: string[] = [];
    try {
      names = readdirSync(join(this.root, "worlds"));
    } catch {
      return { ids, strays };
    }
    for (const name of names.sort()) {
      if (EVENT_ID.test(name) && existsSync(join(this.worldDir(name), "log.jsonl"))) ids.push(name);
      else strays.push(name);
    }
    return { ids, strays };
  }

  readLog(world: string): Result<LogRead> {
    const path = join(this.worldDir(world), "log.jsonl");
    let bytes: Buffer;
    try {
      bytes = readFileSync(path);
    } catch (error) {
      return storageError(`read ${path}`, error);
    }
    // Work on bytes: a damaged UTF-8 sequence must not move where the file is cut.
    const end = bytes.lastIndexOf(0x0a) + 1;
    const torn = bytes.length - end;
    if (torn > 0) {
      try {
        writeDurably(join(this.worldDir(world), `torn-${Date.now()}.txt`), bytes.subarray(end));
        truncateSync(path, end);
      } catch (error) {
        return storageError(`set aside the torn end of ${path}`, error);
      }
    }
    const text = bytes.subarray(0, end).toString("utf8");
    const lines = text === "" ? [] : text.slice(0, -1).split("\n");
    return ok({ lines, torn });
  }

  /** Appends one batch and fsyncs it; on failure the file is cut back to where it was. */
  appendLines(world: string, lines: readonly string[]): Result<void> {
    const path = join(this.worldDir(world), "log.jsonl");
    let fd: number;
    try {
      fd = openSync(path, "a");
    } catch (error) {
      return storageError(`open ${path}`, error);
    }
    let size = 0;
    try {
      size = fstatSync(fd).size;
      writeFileSync(fd, `${lines.join("\n")}\n`);
      fsyncSync(fd);
      return ok(undefined);
    } catch (error) {
      try {
        ftruncateSync(fd, size);
        fsyncSync(fd);
      } catch {}
      return storageError(`append to ${path}`, error);
    } finally {
      closeSync(fd);
    }
  }

  /** A new world's whole log (attach): written aside, fsynced, then renamed into place. */
  createLog(world: string, lines: readonly string[]): Result<void> {
    const dir = this.worldDir(world);
    const path = join(dir, "log.jsonl");
    try {
      if (existsSync(path)) return err("attach-world-exists", "That world is already stored.");
      mkdirSync(dir, { recursive: true });
      writeDurably(path, `${lines.join("\n")}\n`);
      syncDir(dir);
      syncDir(join(this.root, "worlds"));
      return ok(undefined);
    } catch (error) {
      return storageError(`write ${path}`, error);
    }
  }

  readSnapshot(world: string): unknown {
    try {
      return JSON.parse(readFileSync(join(this.worldDir(world), "snapshot.json"), "utf8"));
    } catch {
      return null;
    }
  }

  writeSnapshot(world: string, snapshot: unknown): Result<void> {
    const path = join(this.worldDir(world), "snapshot.json");
    try {
      writeDurably(path, JSON.stringify(snapshot));
      return ok(undefined);
    } catch (error) {
      return storageError(`write ${path}`, error);
    }
  }

  /** The blobs a world may serve, by hash, with their sizes. Malformed lines are reported. */
  readBlobList(world: string): { blobs: Map<string, number>; bad: number } {
    const blobs = new Map<string, number>();
    let bad = 0;
    let text = "";
    try {
      text = readFileSync(join(this.worldDir(world), "blobs.txt"), "utf8");
    } catch {
      return { blobs, bad };
    }
    for (const line of text.split("\n")) {
      if (line === "") continue;
      const [hash = "", size = ""] = line.split(" ");
      if (BLOB_HASH.test(hash) && /^\d{1,12}$/.test(size)) blobs.set(hash, Number(size));
      else bad += 1;
    }
    return { blobs, bad };
  }

  /** Stores a verified blob (once, shared by worlds) and lists it for `world`. */
  addBlob(world: string, hash: string, bytes: Uint8Array): Result<void> {
    const path = this.blobPath(hash);
    try {
      const stored = existsSync(path) && statSync(path).size === bytes.length;
      if (!stored) {
        writeDurably(path, bytes);
        syncDir(this.blobDir());
      }
      const list = join(this.worldDir(world), "blobs.txt");
      const fd = openSync(list, "a");
      try {
        writeFileSync(fd, `${hash} ${bytes.length}\n`);
        fsyncSync(fd);
      } finally {
        closeSync(fd);
      }
      return ok(undefined);
    } catch (error) {
      return storageError(`store blob ${hash}`, error);
    }
  }

  readBlob(hash: string): Result<Uint8Array<ArrayBuffer>> {
    try {
      const bytes = readFileSync(this.blobPath(hash));
      const copy = new Uint8Array(new ArrayBuffer(bytes.length));
      copy.set(bytes);
      return ok(copy);
    } catch (error) {
      return storageError(`read blob ${hash}`, error);
    }
  }
}
