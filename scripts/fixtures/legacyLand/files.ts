// Writing into the target userData: never over an existing file, every write remembered with its
// sha256 (for the manifest), and everything this run created removed again if it fails halfway.

import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join, sep } from "node:path";

export const sha256Hex = (bytes: string | Uint8Array): string =>
  createHash("sha256").update(bytes).digest("hex");

/** A path under userData the way the manifest names it: relative, with forward slashes. */
export const posix = (path: string): string => path.split(sep).join("/");

export async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

export class Writer {
  readonly hashes = new Map<string, string>();
  private readonly created: string[] = [];

  constructor(readonly root: string) {}

  /** Claims a directory this run makes (refusing one that already exists), for the rollback. */
  async claim(path: string): Promise<void> {
    const full = join(this.root, path);
    if (await exists(full)) {
      throw new Error(`${posix(path)} already exists in ${this.root}; use a fresh userData.`);
    }
    await mkdir(full, { recursive: true });
    this.created.push(full);
  }

  async dir(path: string): Promise<void> {
    await mkdir(join(this.root, path), { recursive: true });
  }

  async file(path: string, content: string | Uint8Array): Promise<void> {
    const full = join(this.root, path);
    if (await exists(full))
      throw new Error(`${posix(path)} already exists; nothing is overwritten.`);
    await mkdir(dirname(full), { recursive: true });
    await writeFile(full, content);
    this.hashes.set(posix(path), sha256Hex(content));
  }

  /** Records the hash of every file under `path` that something else wrote (the cartridge). */
  async record(path: string): Promise<void> {
    const full = join(this.root, path);
    for (const entry of await readdir(full, { withFileTypes: true })) {
      const child = join(path, entry.name);
      if (entry.isDirectory()) await this.record(child);
      else this.hashes.set(posix(child), sha256Hex(await readFile(join(this.root, child))));
    }
  }

  async rollback(): Promise<void> {
    for (const path of this.created.reverse()) await rm(path, { recursive: true, force: true });
  }

  /** Every recorded file, code-unit sorted. */
  manifest(): Record<string, string> {
    const paths = [...this.hashes.keys()].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
    return Object.fromEntries(paths.map((path) => [path, this.hashes.get(path) ?? ""]));
  }
}
