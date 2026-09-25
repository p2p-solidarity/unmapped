// Where a world's shared history lives (rev 6 phase 3, D1 storage owners, added to Rule 9):
//
//   <userData>/histories/<worldId>/log.jsonl          sequenced entries, line n = entry n, append-only
//   <userData>/histories/<worldId>/outbox.jsonl       own events awaiting a receipt (atomic rewrite)
//   <userData>/histories/<worldId>/refused.jsonl      refused own events, never deleted
//   <userData>/histories/<worldId>/link.json          sync state: service URL and pinned key
//   <userData>/histories/<worldId>/snapshot.json      a fold cache (D4)
//   <userData>/histories/<worldId>/received-works.json  AI worlds that arrived with this history
//   <userData>/histories/index.json                   genesis `from.instanceId` of every world
//   <instances>/<instanceId>/saves/<saveId>/world.json + progress.json

import { join } from "node:path";
import { EVENT_ID } from "@shared/history/ids";

export const HISTORIES_DIR = "histories";

export const LOG_FILE = "log.jsonl";
export const OUTBOX_FILE = "outbox.jsonl";
export const REFUSED_FILE = "refused.jsonl";
export const LINK_FILE = "link.json";
export const SNAPSHOT_FILE = "snapshot.json";
export const RECEIVED_WORKS_FILE = "received-works.json";
export const INDEX_FILE = "index.json";
export const WORLD_PIN_FILE = "world.json";
export const PROGRESS_FILE = "progress.json";

export function isWorldId(value: string): boolean {
  return EVENT_ID.test(value);
}

export function historiesDir(userData: string): string {
  return join(userData, HISTORIES_DIR);
}

/** Only ever called with a checked world id (an event id is a safe file name, D2). */
export function worldDir(histories: string, worldId: string): string {
  if (!isWorldId(worldId)) throw new Error(`not a world id: ${worldId.slice(0, 80)}`);
  return join(histories, worldId);
}

/** Where a migration (or an adoption, or a join) builds a history before renaming it into place. */
export function stagingDir(histories: string, label: string): string {
  return join(histories, `.staging-${label}-${process.pid}-${Date.now()}`);
}
