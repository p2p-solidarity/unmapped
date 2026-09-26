// What main keeps beside a picture it drew or the player picked (rev 6 phase 4, D4): one small
// record per picture — its hash, its licence, and which provider and model drew it — written the
// moment the picture is stored, before anything is published. Create keeps one per look candidate
// (`looks/<id>.json`, ./../workspaces/createLooks.ts); an AI-world draft one per picture
// (`work-drafts/<draftId>/pictures/<hex>.json`, ./workLicences.ts). Publishing reads them back by
// hash. A record that does not read is no record: the picture is then `unknown`, never guessed.

import { mkdir, readdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { ContentHash } from "@shared/cartridge";
import { pictureLicenceSchema } from "@shared/images";
import { z } from "zod";
import { sha256 } from "../cartridges/integrity";

/** Who made a picture: a provider's licence record, or `player-supplied` with no provider. */
export interface PictureOrigin {
  licence: string;
  provider: string | null;
  model: string | null;
}

const HASH = /^sha256:[a-f0-9]{64}$/;

const drawnRecordSchema = z.strictObject({
  v: z.literal(1),
  sha256: z.custom<ContentHash>((value) => typeof value === "string" && HASH.test(value)),
  licence: pictureLicenceSchema,
  provider: z.string().max(40).nullable(),
  model: z.string().max(200).nullable(),
});
export type DrawnRecord = z.infer<typeof drawnRecordSchema>;

export function drawnRecord(png: Uint8Array, origin: PictureOrigin): DrawnRecord {
  return { v: 1, sha256: sha256(png), ...origin };
}

/** Writes `<dir>/<name>.json` atomically (a crash leaves the old record or the new one). */
export async function writeDrawnRecord(
  dir: string,
  name: string,
  record: DrawnRecord,
): Promise<void> {
  await mkdir(dir, { recursive: true });
  const path = join(dir, `${name}.json`);
  const temp = `${path}.tmp-${process.pid}`;
  try {
    await writeFile(temp, `${JSON.stringify(record)}\n`, "utf8");
    await rename(temp, path);
  } catch (error) {
    await rm(temp, { force: true }).catch(() => undefined);
    throw error;
  }
}

export function parseDrawnRecord(text: string): DrawnRecord | null {
  try {
    const parsed = drawnRecordSchema.safeParse(JSON.parse(text));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/** Every record in `dir` as hash → licence; a missing folder is an empty map. */
export async function readDrawnRecords(
  dir: string,
  into: Map<ContentHash, string> = new Map(),
): Promise<Map<ContentHash, string>> {
  let names: string[];
  try {
    names = await readdir(dir);
  } catch {
    return into;
  }
  for (const name of names) {
    if (!name.endsWith(".json")) continue;
    const record = parseDrawnRecord(await readFile(join(dir, name), "utf8").catch(() => ""));
    if (record !== null) into.set(record.sha256, record.licence);
  }
  return into;
}
