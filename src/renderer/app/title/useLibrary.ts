// Everything the title menu reads from disk: published cartridges, save instances, draft
// workspaces and the legacy world archive — one Loadable so the menu renders honestly.

import type { CartridgeManifest, InstanceMeta, WorkspaceMeta } from "@shared/cartridge";
import { errored, idle, type Loadable, loading, ready } from "@shared/result";
import type { WorldMeta } from "@shared/world";
import { useCallback, useEffect, useState } from "react";

export interface LibraryData {
  cartridges: CartridgeManifest[];
  /** Newest first. */
  instances: InstanceMeta[];
  workspaces: WorkspaceMeta[];
  legacy: WorldMeta[];
}

export function useLibrary(): { data: Loadable<LibraryData>; refresh(): Promise<void> } {
  const [data, setData] = useState<Loadable<LibraryData>>(idle());

  const refresh = useCallback(async () => {
    setData(loading());
    const [cartridges, instances, workspaces, legacy] = await Promise.all([
      window.seed.cartridges.list(),
      window.seed.instances.list(),
      window.seed.workspaces.list(),
      window.seed.worlds.list(),
    ]);
    if (!cartridges.ok) return setData(errored(cartridges.error));
    if (!instances.ok) return setData(errored(instances.error));
    if (!workspaces.ok) return setData(errored(workspaces.error));
    if (!legacy.ok) return setData(errored(legacy.error));
    setData(
      ready({
        cartridges: cartridges.value,
        instances: [...instances.value].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
        workspaces: workspaces.value,
        legacy: legacy.value,
      }),
    );
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { data, refresh };
}

export function isCancelled(code: string): boolean {
  return code === "cancelled" || code === "canceled";
}
