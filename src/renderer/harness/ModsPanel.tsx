// Installed mods, and which of them this world runs. Nothing is ever installed on the player's
// behalf: an empty list is a real, finished state, not a prompt to seed examples (Rule 2). The
// example mod in `mods-examples/` is repo sample content and is never auto-installed.

import { useWorldStore } from "@renderer/state/worldStore";
import { Button, ErrorBlock, StatePanel, Surface, space, Text } from "@renderer/ui";
import type { ModSummary } from "@shared/mods";
import { errored, type Loadable, loading, ready } from "@shared/result";
import { useCallback, useEffect, useState } from "react";
import { persistMeta } from "./persist";

const rowStyle = { display: "flex", flexDirection: "column", gap: space.sm } as const;
const columnStyle = { display: "flex", flexDirection: "column", gap: space.md } as const;
const actionsStyle = { display: "flex", gap: space.md, flexWrap: "wrap" } as const;

export function ModsPanel() {
  const [mods, setMods] = useState<Loadable<ModSummary[]>>(loading());
  const [confirming, setConfirming] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const meta = useWorldStore((state) => state.meta);
  const pinned = useWorldStore((state) => state.origin?.kind === "instance");
  const enabled = meta?.mods ?? [];

  const refresh = useCallback(async () => {
    const listed = await window.seed.mods.list();
    setMods(listed.ok ? ready(listed.value) : errored(listed.error));
  }, []);

  useEffect(() => {
    void refresh();
    // A mod folder edited on disk changes what is installed, so the list follows the watcher.
    return window.seed.mods.onChanged(() => {
      void refresh();
    });
  }, [refresh]);

  const install = useCallback(async () => {
    setBusy(true);
    const installed = await window.seed.mods.install();
    setBusy(false);
    // Cancelling the picker is not a failure worth replacing the list with an error state.
    if (!installed.ok && installed.error.code !== "cancelled") {
      setMods(errored(installed.error));
      return;
    }
    await refresh();
  }, [refresh]);

  const remove = useCallback(
    async (name: string) => {
      setBusy(true);
      const removed = await window.seed.mods.remove(name);
      setConfirming(null);
      setBusy(false);
      if (!removed.ok) {
        setMods(errored(removed.error));
        return;
      }
      await refresh();
    },
    [refresh],
  );

  const toggle = useCallback(async (name: string) => {
    const current = useWorldStore.getState().meta;
    if (current === null || useWorldStore.getState().origin?.kind === "instance") return;
    const next = current.mods.includes(name)
      ? current.mods.filter((mod) => mod !== name)
      : [...current.mods, name];
    setBusy(true);
    const error = await persistMeta({ ...current, mods: next });
    setBusy(false);
    if (error !== null) setMods(errored(error));
  }, []);

  return (
    <Surface variant="card" padding="lg">
      <Text variant="title" as="h2">
        Mods
      </Text>
      <Text variant="caption" tone="muted">
        A mod is prompt text, skills and declarative tools — never code. Enabled mods mount into the
        open world.
      </Text>

      {pinned ? (
        <Text variant="caption" tone="dim">
          This run uses its cartridge’s locked rules. Use Create a mod revision to review and
          publish gameplay changes.
        </Text>
      ) : null}
      <div style={columnStyle}>
        <StatePanel
          state={mods}
          loadingText="Reading the mods folder…"
          idleText="No mods folder yet."
        >
          {(installed) =>
            installed.length === 0 ? (
              <Text variant="body" tone="dim">
                No mods installed. Install a .mod file or a mod folder to add one.
              </Text>
            ) : (
              <div style={columnStyle}>
                {installed.map((mod) => (
                  <ModRow
                    key={mod.name}
                    mod={mod}
                    busy={busy}
                    enabled={enabled.includes(mod.name)}
                    canToggle={meta !== null && !pinned}
                    confirming={confirming === mod.name}
                    onToggle={() => void toggle(mod.name)}
                    onRemove={() => setConfirming(mod.name)}
                    onConfirmRemove={() => void remove(mod.name)}
                    onCancelRemove={() => setConfirming(null)}
                  />
                ))}
              </div>
            )
          }
        </StatePanel>

        {mods.status === "error" ? (
          <Button variant="secondary" onClick={() => void refresh()}>
            Try again
          </Button>
        ) : null}

        <div style={actionsStyle}>
          <Button variant="primary" disabled={busy} onClick={() => void install()}>
            Install…
          </Button>
        </div>

        {meta === null ? (
          <Text variant="caption" tone="dim">
            Open a world to choose which mods it runs.
          </Text>
        ) : null}
      </div>
    </Surface>
  );
}

interface ModRowProps {
  mod: ModSummary;
  busy: boolean;
  enabled: boolean;
  canToggle: boolean;
  confirming: boolean;
  onToggle(): void;
  onRemove(): void;
  onConfirmRemove(): void;
  onCancelRemove(): void;
}

function ModRow({
  mod,
  busy,
  enabled,
  canToggle,
  confirming,
  onToggle,
  onRemove,
  onConfirmRemove,
  onCancelRemove,
}: ModRowProps) {
  return (
    <Surface variant="inset" padding="md">
      <div style={rowStyle}>
        <Text variant="label" tone={enabled ? "accent" : "default"}>
          {`${mod.name} ${mod.version}`}
        </Text>
        <Text variant="body">{mod.description}</Text>
        <Text variant="caption" tone="muted">
          {`${mod.author} · ${mod.sectionCount} prompt ${
            mod.sectionCount === 1 ? "section" : "sections"
          } · ${mod.toolCount} ${mod.toolCount === 1 ? "tool" : "tools"} · ${mod.skillCount} ${
            mod.skillCount === 1 ? "skill" : "skills"
          }`}
        </Text>

        {confirming ? (
          <div style={rowStyle}>
            <ErrorBlock
              error={{
                code: "remove-mod",
                message: `Delete ${mod.name} from your mods folder?`,
                hint: "This removes the files. Worlds that list it will report it missing.",
              }}
            />
            <div style={actionsStyle}>
              <Button variant="destructive" disabled={busy} onClick={onConfirmRemove}>
                Delete it
              </Button>
              <Button variant="ghost" onClick={onCancelRemove}>
                Keep it
              </Button>
            </div>
          </div>
        ) : (
          <div style={actionsStyle}>
            <Button
              variant={enabled ? "primary" : "secondary"}
              disabled={busy || !canToggle}
              onClick={onToggle}
            >
              {enabled ? "Enabled for this world" : "Enable for this world"}
            </Button>
            <Button variant="ghost" disabled={busy} onClick={onRemove}>
              Remove
            </Button>
          </div>
        )}
      </div>
    </Surface>
  );
}
