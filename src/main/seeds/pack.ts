// A `.seed` is a zip of the five world dotfiles with `meta.json` at the zip root (Rule 9). Pure
// fflate + fs logic: no electron, no dialogs — those live in `./ipc.ts`.

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { err, fail, ok, type Result, toError } from "@shared/result";
import { WORLD_FILE_NAMES, WORLD_FILES, type WorldFile } from "@shared/world";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { parseGenesisText, parseMetaText, validateFileContent } from "../worlds/schemas";

export type SeedFiles = Record<WorldFile, string>;

const ZIP_LEVEL = 6;
const INCOMPLETE_HINT =
  "A .seed must contain exactly meta.json, genesis.json, world.oui, karma.jsonl and inventory.json at its root.";

export async function packWorld(worldDir: string): Promise<Result<Uint8Array>> {
  const entries: Record<string, Uint8Array> = {};
  for (const file of WORLD_FILE_NAMES) {
    try {
      entries[file] = strToU8(await readFile(join(worldDir, file), "utf8"));
    } catch (error) {
      return err(
        "seed-incomplete",
        `Missing ${file}`,
        `${INCOMPLETE_HINT} (${toError(error).message})`,
      );
    }
  }
  try {
    return ok(zipSync(entries, { level: ZIP_LEVEL }));
  } catch (error) {
    return fail(toError(error, "seed-pack-failed"));
  }
}

/** Rejects any archive that is not exactly the five known files — no nested dirs, no extras. */
export function unpackSeed(bytes: Uint8Array): Result<{ files: SeedFiles }> {
  let unzipped: Record<string, Uint8Array>;
  try {
    unzipped = unzipSync(bytes);
  } catch (error) {
    return err(
      "seed-unreadable",
      "That file is not a readable .seed archive",
      `Export it again from UNMAPPED. (${toError(error).message})`,
    );
  }

  const known = new Set<string>(WORLD_FILE_NAMES);
  const extra = Object.keys(unzipped).filter((name) => !name.endsWith("/") && !known.has(name));
  if (extra.length > 0) {
    return err(
      "seed-unknown-file",
      `Unexpected entries in the seed: ${extra.join(", ")}`,
      INCOMPLETE_HINT,
    );
  }

  const files = {} as SeedFiles;
  for (const file of WORLD_FILE_NAMES) {
    const raw = unzipped[file];
    if (raw === undefined) return err("seed-incomplete", `Missing ${file}`, INCOMPLETE_HINT);
    files[file] = strFromU8(raw);
  }

  const meta = parseMetaText(files[WORLD_FILES.meta]);
  if (!meta.ok) return meta;
  const genesis = parseGenesisText(files[WORLD_FILES.genesis]);
  if (!genesis.ok) return genesis;
  if (files[WORLD_FILES.scene].trim().length === 0) {
    return err("seed-invalid", `${WORLD_FILES.scene} is empty`, INCOMPLETE_HINT);
  }
  for (const file of WORLD_FILE_NAMES) {
    const valid = validateFileContent(file, files[file]);
    if (!valid.ok) return valid;
  }
  return ok({ files });
}
