// Offline reachability over scene contracts: which scenes a player can enter from the entry scene
// with only the flags earlier scenes grant. Shared by cartridge publishing and workspace
// validation so the two can never disagree about what "completable offline" means.

import type { SceneContract } from "@shared/gameplay";

/** Scene ids reachable from `entry`; empty when the entry scene itself has prerequisites. */
export function reachableScenes(
  entry: string,
  routes: ReadonlyMap<string, string[]>,
  contracts: ReadonlyMap<string, SceneContract>,
): ReadonlySet<string> {
  const reachable = new Set<string>();
  const flags = new Set<string>();
  const entryContract = contracts.get(entry);
  if (
    entryContract === undefined ||
    entryContract.requiresFlags.length > 0 ||
    entryContract.requiresItems.length > 0
  ) {
    return reachable;
  }
  reachable.add(entry);
  let changed = true;
  while (changed) {
    changed = false;
    for (const id of reachable) {
      for (const flag of contracts.get(id)?.grantsFlags ?? []) {
        if (!flags.has(flag)) {
          flags.add(flag);
          changed = true;
        }
      }
    }
    for (const from of [...reachable]) {
      for (const target of routes.get(from) ?? []) {
        if (reachable.has(target)) continue;
        const contract = contracts.get(target);
        if (
          contract !== undefined &&
          contract.requiresItems.length === 0 &&
          contract.requiresFlags.every((flag) => flags.has(flag))
        ) {
          reachable.add(target);
          changed = true;
        }
      }
    }
  }
  return reachable;
}
