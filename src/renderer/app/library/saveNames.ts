// The ENS names of this device's saves, so My worlds and Join a world can show a world's name
// first. A save's name is `<label>.<cartridge's name>.<root>` and counts only when it records this
// save (current, or an earlier checkpoint of it). Read from main (`market.saveName`, public chain
// reads) one save at a time, only when a lineage market is set up, and kept for this session; a
// save's own ENS block (market/EnsNames) tells the store as soon as a name is recorded. Unknown
// yet = not in the map: the row shows the save's own name meanwhile, never a guess (Rule 2).

import { storedMarketPasskey } from "@renderer/identity";
import type { SaveNameView } from "@shared/market";
import { useEffect, useMemo, useSyncExternalStore } from "react";

const names = new Map<string, string | null>();
const listeners = new Set<() => void>();
let version = 0;

function changed(): void {
  version += 1;
  for (const listener of listeners) listener();
}

/** The name that records this save, from a `saveName` view; null when it has none. */
export function recordedSaveName(view: SaveNameView): string | null {
  const save = view.save;
  return save !== null && (save.state === "current" || save.state === "outdated")
    ? save.name
    : null;
}

/** Tells the store what a save's name is now (null: none). */
export function rememberSaveName(instanceId: string, name: string | null): void {
  if (names.get(instanceId) === name && names.has(instanceId)) return;
  names.set(instanceId, name);
  changed();
}

let reading: Promise<void> | null = null;
const wanted = new Set<string>();

async function readMissing(): Promise<void> {
  const config = await window.seed.market.config().catch(() => null);
  if (config?.parent == null) {
    wanted.clear();
    return;
  }
  const key = storedMarketPasskey()?.key ?? null;
  for (const instanceId of [...wanted]) {
    wanted.delete(instanceId);
    if (names.has(instanceId)) continue;
    const view = await window.seed.market.saveName(instanceId, null, key).catch(() => null);
    // A failed read stays unknown (the row keeps the save's own name) and is asked again later.
    if (view?.ok === true) rememberSaveName(instanceId, recordedSaveName(view.value));
  }
}

function request(instanceIds: readonly string[]): void {
  for (const id of instanceIds) if (!names.has(id)) wanted.add(id);
  if (wanted.size === 0 || reading !== null) return;
  reading = readMissing().finally(() => {
    reading = null;
    if (wanted.size > 0) request([]);
  });
}

/** Each save's ENS name once known (null: it has none), read in the background. */
export function useSaveEnsNames(
  instanceIds: readonly string[],
): ReadonlyMap<string, string | null> {
  const seen = useSyncExternalStore(subscribe, () => version);
  const joined = instanceIds.join("|");
  useEffect(() => {
    if (joined !== "") request(joined.split("|"));
  }, [joined]);
  // A copy per change, so memos keyed on it see a new name.
  return useMemo(() => (seen >= 0 ? new Map(names) : names), [seen]);
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
