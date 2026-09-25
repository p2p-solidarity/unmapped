// The legacy source files of a migration (rev 6 phase 3, D6), read from disk for the plan and for
// the digest that world.json pins: every file under `chunks/<cx>_<cz>/` (path relative to
// `chunks/`), `lore.jsonl` and `notes.jsonl` as bytes. The digest itself is WP2's pure
// `sourceDigest` (src/dsl), so the one a plan pins and the one recomputed on every open are the
// same function of the same bytes. Read-only: nothing here writes a source file.

import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { sameSource, sourceDigest } from "@dsl/history/migrateSource";
import type { SaveState } from "@shared/cartridge";
import type { LandRecord } from "@shared/land";
import { fail, ok, type Result, toError } from "@shared/result";
import type { LegacySources, SourceDigest } from "./dslSeam";

const CHUNK_DIR = /^-?\d{1,5}_-?\d{1,5}$/;

async function filesUnder(dir: string, prefix: string, out: string[]): Promise<void> {
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    const path = `${prefix}/${entry.name}`;
    if (entry.isDirectory()) await filesUnder(join(dir, entry.name), path, out);
    else if (entry.isFile()) out.push(path);
  }
}

async function bytesOrNull(path: string): Promise<Uint8Array | null> {
  try {
    return new Uint8Array(await readFile(path));
  } catch (error) {
    if ((error as NodeJS.ErrnoException | null)?.code === "ENOENT") return null;
    throw error;
  }
}

export async function readLegacySources(saveDir: string): Promise<Result<LegacySources>> {
  try {
    const chunksDir = join(saveDir, "chunks");
    const names = (await readdir(chunksDir, { withFileTypes: true }).catch(() => []))
      .filter((entry) => entry.isDirectory() && CHUNK_DIR.test(entry.name))
      .map((entry) => entry.name);
    const paths: string[] = [];
    for (const name of names) await filesUnder(join(chunksDir, name), name, paths);
    paths.sort();
    const chunkFiles: LegacySources["chunkFiles"][number][] = [];
    for (const path of paths) {
      chunkFiles.push({
        path,
        bytes: new Uint8Array(await readFile(join(chunksDir, ...path.split("/")))),
      });
    }
    return ok({
      chunkFiles,
      lore: await bytesOrNull(join(saveDir, "lore.jsonl")),
      notes: await bytesOrNull(join(saveDir, "notes.jsonl")),
    });
  } catch (error) {
    return fail(toError(error, "migration-source-unreadable"));
  }
}

export function digestOf(save: SaveState, land: LandRecord, sources: LegacySources): SourceDigest {
  return sourceDigest({ save, land, sources });
}

export function sameDigest(a: SourceDigest, b: SourceDigest): boolean {
  return sameSource(a, b);
}
