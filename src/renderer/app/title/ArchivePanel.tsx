// Archive sub-menu: legacy seed worlds (pre-cartridge format). Play, export, import, delete.

import { useSessionStore } from "@renderer/state";
import { Button, StatePanel, Text } from "@renderer/ui";
import type { Loadable } from "@shared/result";
import { useState } from "react";
import { useKeys } from "../shell/useKeys";
import { openWorld } from "../useWorldLoader";
import { isCancelled, type LibraryData } from "./useLibrary";

interface ArchivePanelProps {
  data: Loadable<LibraryData>;
  refresh(): Promise<void>;
  onClose(): void;
}

export function ArchivePanel({ data, refresh, onClose }: ArchivePanelProps) {
  const toast = useSessionStore((state) => state.toast);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  useKeys({ Escape: () => (confirmId === null ? onClose() : setConfirmId(null)) });

  const exportSeed = async (id: string): Promise<void> => {
    const result = await window.seed.worlds.exportSeed(id);
    if (!result.ok) {
      if (!isCancelled(result.error.code)) toast("danger", result.error.message);
      return;
    }
    toast("success", `Exported to ${result.value.path}`);
  };

  const remove = async (id: string): Promise<void> => {
    const result = await window.seed.worlds.remove(id);
    setConfirmId(null);
    if (!result.ok) return toast("danger", result.error.message);
    await refresh();
  };

  const importSeed = async (): Promise<void> => {
    const result = await window.seed.worlds.importSeed();
    if (!result.ok) {
      if (!isCancelled(result.error.code)) toast("danger", result.error.message);
      return;
    }
    toast("success", `Imported ${result.value.name}`);
    await refresh();
  };

  const migrate = async (id: string): Promise<void> => {
    const result = await window.seed.worlds.migrate(id);
    if (!result.ok) return toast("danger", result.error.message);
    toast(
      "success",
      `Migrated to ${result.value.cartridge.cartridgeId}@${result.value.cartridge.version}`,
    );
    await refresh();
  };

  return (
    <>
      <h2 className="g-heading">Archive</h2>
      <StatePanel state={data} loadingText="Reading archive…">
        {(library) => (
          <div className="carts g-scroll">
            {library.legacy.map((world) => (
              <div key={world.id} className="detail" style={{ paddingBlock: 12 }}>
                <Text>{world.name}</Text>
                <span className="g-meta">
                  {world.archetype} · floor {world.floor} ·{" "}
                  {new Date(world.updatedAt).toLocaleString()}
                </span>
                <div className="row-actions">
                  <Button onClick={() => void openWorld(world.id)}>Play</Button>
                  <Button variant="ghost" onClick={() => void exportSeed(world.id)}>
                    Export .seed
                  </Button>
                  <Button variant="ghost" onClick={() => void migrate(world.id)}>
                    Migrate
                  </Button>
                  {confirmId === world.id ? (
                    <Button variant="destructive" onClick={() => void remove(world.id)}>
                      Delete forever
                    </Button>
                  ) : (
                    <Button variant="ghost" onClick={() => setConfirmId(world.id)}>
                      Delete
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </StatePanel>
      <div className="row-actions">
        <Button variant="ghost" onClick={() => void importSeed()}>
          Import .seed
        </Button>
      </div>
    </>
  );
}
