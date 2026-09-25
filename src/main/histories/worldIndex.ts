// `histories/index.json` (rev 6 phase 3, D1): which world each genesis says it came from. A cache,
// never the truth — the truth is line 1 of every `log.jsonl` (`genesis.body.from.instanceId`) — so
// it is rebuilt from the logs whenever it is missing or damaged. Keyed by world id, because one
// instance can have more than one world: its migrated one and, after an adoption (D7), the one
// re-signed on this device.

import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { openGenesis } from "@shared/history/fold";
import { EVENT_ID } from "@shared/history/ids";
import { readLogLine } from "@shared/history/log";
import { ok, type Result } from "@shared/result";
import { z } from "zod";
import { locked, readJsonFile, writeJsonAtomic } from "./fsx";
import { INDEX_FILE, isWorldId, LOG_FILE } from "./paths";

export interface IndexEntry {
  instanceId: string;
  /** The genesis author: whose world it is. */
  owner: string;
}

const indexSchema = z.strictObject({
  v: z.literal(1),
  worlds: z.record(
    z.string().regex(EVENT_ID),
    z.strictObject({ instanceId: z.string().min(1).max(96), owner: z.string().min(1).max(60) }),
  ),
});

type WorldIndex = z.infer<typeof indexSchema>;

/** Line 1 of a log, if it is a verified genesis whose id is the directory's name. */
async function genesisEntry(histories: string, worldId: string): Promise<IndexEntry | null> {
  let text: string;
  try {
    text = await readFile(join(histories, worldId, LOG_FILE), "utf8");
  } catch {
    return null;
  }
  const first = text.slice(0, text.indexOf("\n") < 0 ? text.length : text.indexOf("\n"));
  const entry = readLogLine(first);
  if (!entry.ok || entry.value.n !== 1) return null;
  const genesis = openGenesis(entry.value.event);
  if (!genesis.ok || genesis.value.id !== worldId) return null;
  return { instanceId: genesis.value.body.from.instanceId, owner: genesis.value.author };
}

async function rebuild(histories: string): Promise<WorldIndex> {
  const worlds: WorldIndex["worlds"] = {};
  const names = await readdir(histories).catch(() => [] as string[]);
  for (const name of names.filter(isWorldId).sort()) {
    const entry = await genesisEntry(histories, name);
    if (entry !== null) worlds[name] = entry;
  }
  const index: WorldIndex = { v: 1, worlds };
  await writeJsonAtomic(join(histories, INDEX_FILE), index);
  return index;
}

async function load(histories: string): Promise<WorldIndex> {
  const read = await readJsonFile(join(histories, INDEX_FILE), indexSchema, "index-invalid", "");
  return read.ok && read.value !== null ? read.value : rebuild(histories);
}

/** Records a world just renamed into place (its genesis `from.instanceId` and owner). */
export function indexWorld(histories: string, worldId: string, entry: IndexEntry): Promise<void> {
  return locked(`index:${histories}`, async () => {
    const index = await load(histories);
    index.worlds[worldId] = entry;
    await writeJsonAtomic(join(histories, INDEX_FILE), index);
  });
}

/**
 * Worlds whose genesis came from `instanceId` and are owned by `owner`, oldest id order. A stale
 * cache entry whose history is gone is left out (and dropped by the next rebuild).
 */
export function worldsOfInstance(
  histories: string,
  instanceId: string,
  owner: string,
): Promise<Result<string[]>> {
  return locked(`index:${histories}`, async () => {
    let index = await load(histories);
    const listed = () =>
      Object.entries(index.worlds)
        .filter(([, entry]) => entry.instanceId === instanceId && entry.owner === owner)
        .map(([world]) => world)
        .sort();
    const found: string[] = [];
    for (const world of listed()) {
      if ((await genesisEntry(histories, world)) !== null) found.push(world);
    }
    if (found.length === listed().length) return ok(found);
    index = await rebuild(histories);
    return ok(listed());
  });
}
