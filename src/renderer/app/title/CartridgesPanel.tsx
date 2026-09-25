// Cartridges sub-menu: saved runs, published cartridges and draft workspaces in one list.
// ↑↓ picks, Enter plays / resumes / opens, R starts a remix of the selected cartridge.

import { useSessionStore } from "@renderer/state";
import { Button, StatePanel, Text, TextField } from "@renderer/ui";
import {
  type CartridgeManifest,
  compareCartridgeVersions,
  ENGINE_API_VERSION,
  type InstanceMeta,
  SAVE_SCHEMA_VERSION,
  type WorkspaceMeta,
} from "@shared/cartridge";
import type { Loadable } from "@shared/result";
import { useState } from "react";
import { cycle, useKeys } from "../shell/useKeys";
import { hydrateInstance, openInstance } from "../useInstanceLoader";
import type { LibraryData } from "./useLibrary";

type Entry =
  | { kind: "save"; key: string; instance: InstanceMeta }
  | { kind: "cartridge"; key: string; manifest: CartridgeManifest }
  | { kind: "draft"; key: string; workspace: WorkspaceMeta };

interface RemixDraft {
  source: CartridgeManifest;
  targetCartridgeId: string;
  name: string;
  author: string;
}

function entries(library: LibraryData): Entry[] {
  return [
    ...library.instances.map((instance) => ({
      kind: "save" as const,
      key: "save:" + instance.instanceId,
      instance,
    })),
    ...library.cartridges.map((manifest) => ({
      kind: "cartridge" as const,
      key: "cart:" + manifest.cartridgeId + "@" + manifest.version,
      manifest,
    })),
    ...library.workspaces.map((workspace) => ({
      kind: "draft" as const,
      key: "draft:" + workspace.workspaceId,
      workspace,
    })),
  ];
}

const KIND_LABEL: Record<Entry["kind"], string> = {
  save: "Save",
  cartridge: "Cartridge",
  draft: "Draft",
};

function entryTitle(entry: Entry): string {
  if (entry.kind === "save") return entry.instance.name;
  if (entry.kind === "cartridge") return entry.manifest.name;
  return entry.workspace.name;
}

function compatibilityLabel(manifest: CartridgeManifest): string {
  if (manifest.engineApiVersion > ENGINE_API_VERSION) {
    return `incompatible · needs engine ${manifest.engineApiVersion}`;
  }
  if (manifest.saveSchemaVersion !== SAVE_SCHEMA_VERSION) {
    return `incompatible · needs save schema ${manifest.saveSchemaVersion}`;
  }
  return `compatible · ${(manifest.formatVersion === 1 ? manifest.requiredKits : manifest.definition.capabilityProfile.contexts.map((context) => context.contextId)).join(", ")}`;
}

function isCompatible(manifest: CartridgeManifest): boolean {
  return (
    manifest.engineApiVersion <= ENGINE_API_VERSION &&
    manifest.saveSchemaVersion === SAVE_SCHEMA_VERSION
  );
}

interface CartridgesPanelProps {
  data: Loadable<LibraryData>;
  refresh(): Promise<void>;
  onClose(): void;
}

export function CartridgesPanel({ data, refresh, onClose }: CartridgesPanelProps) {
  const toast = useSessionStore((state) => state.toast);
  const openWorkspace = useSessionStore((state) => state.openWorkspace);
  const [cursor, setCursor] = useState(0);
  const [remix, setRemix] = useState<RemixDraft | null>(null);
  const [busy, setBusy] = useState(false);

  const list = data.status === "ready" ? entries(data.value) : [];
  const selected = list[Math.min(cursor, list.length - 1)];
  const library = data.status === "ready" ? data.value : null;
  const matchingRuns =
    selected?.kind === "cartridge" && library !== null
      ? library.instances.filter(
          (instance) => instance.cartridge.contentHash === selected.manifest.contentHash,
        )
      : [];
  const upgradeTarget =
    selected?.kind === "save" && library !== null
      ? (library.cartridges
          .filter(
            (manifest) =>
              manifest.cartridgeId === selected.instance.cartridge.cartridgeId &&
              isCompatible(manifest) &&
              compareCartridgeVersions(manifest.version, selected.instance.cartridge.version) > 0,
          )
          .sort((a, b) => compareCartridgeVersions(b.version, a.version))[0] ?? null)
      : null;

  const newRun = (manifest: CartridgeManifest): void => {
    setBusy(true);
    void (async () => {
      const result = await window.seed.instances.create({
        cartridgeId: manifest.cartridgeId,
        version: manifest.version,
        name: manifest.name + " run",
      });
      setBusy(false);
      if (!result.ok) return toast("danger", result.error.message);
      const hydrated = hydrateInstance(result.value);
      if (!hydrated.ok) return toast("danger", hydrated.error.message);
      useSessionStore.getState().setScreen("play");
    })();
  };

  const confirm = (entry: Entry | undefined): void => {
    if (entry === undefined || busy) return;
    if (entry.kind === "save") void openInstance(entry.instance.instanceId);
    else if (entry.kind === "cartridge") newRun(entry.manifest);
    else openWorkspace(entry.workspace.workspaceId);
  };

  const startRemix = (entry: Entry | undefined): void => {
    if (entry?.kind !== "cartridge") return;
    setRemix({
      source: entry.manifest,
      targetCartridgeId: entry.manifest.cartridgeId + "-remix",
      name: entry.manifest.name + " Remix",
      author: "",
    });
  };

  const createRemix = (): void => {
    if (remix === null) return;
    setBusy(true);
    void (async () => {
      const result = await window.seed.workspaces.create({
        sourceCartridgeId: remix.source.cartridgeId,
        sourceVersion: remix.source.version,
        mode: "remix",
        targetCartridgeId: remix.targetCartridgeId,
        name: remix.name,
        author: remix.author,
      });
      setBusy(false);
      if (!result.ok) return toast("danger", result.error.message);
      openWorkspace(result.value.meta.workspaceId);
    })();
  };

  const exportSelected = (): void => {
    if (selected === undefined) return;
    setBusy(true);
    void (async () => {
      const result =
        selected.kind === "cartridge"
          ? await window.seed.cartridges.exportPack(
              selected.manifest.cartridgeId,
              selected.manifest.version,
            )
          : selected.kind === "save"
            ? await window.seed.instances.exportBackup(selected.instance.instanceId)
            : null;
      setBusy(false);
      if (result === null) return;
      if (!result.ok) {
        if (result.error.code !== "cancelled") toast("danger", result.error.message);
        return;
      }
      toast("success", `Exported to ${result.value.path}`);
    })();
  };

  const importCartridge = (): void => {
    setBusy(true);
    void window.seed.cartridges.importPack().then(async (result) => {
      setBusy(false);
      if (!result.ok) {
        if (result.error.code !== "cancelled") toast("danger", result.error.message);
        return;
      }
      toast("success", `Imported ${result.value.cartridgeId}@${result.value.version}`);
      await refresh();
    });
  };

  const importBackup = (): void => {
    setBusy(true);
    void window.seed.instances.importBackup().then(async (result) => {
      setBusy(false);
      if (!result.ok) {
        if (result.error.code !== "cancelled") toast("danger", result.error.message);
        return;
      }
      toast("success", `Restored ${result.value.instance.meta.name}`);
      await refresh();
    });
  };

  const upgrade = (): void => {
    if (selected?.kind !== "save" || upgradeTarget === null) return;
    setBusy(true);
    void window.seed.instances
      .upgrade({ instanceId: selected.instance.instanceId, version: upgradeTarget.version })
      .then(async (result) => {
        setBusy(false);
        if (!result.ok) return toast("danger", result.error.message);
        toast("success", `Upgraded to ${result.value.instance.meta.cartridge.version}`);
        await refresh();
      });
  };

  useKeys({
    Escape: () => (remix === null ? onClose() : setRemix(null)),
    ...(remix === null
      ? {
          ArrowUp: () => setCursor((index) => cycle(index, -1, list.length)),
          ArrowDown: () => setCursor((index) => cycle(index, 1, list.length)),
          Enter: () => confirm(selected),
          KeyR: () => startRemix(selected),
        }
      : {}),
  });

  return (
    <>
      <h2 className="g-heading">Cartridges</h2>
      {library !== null && library.oldSaves.length > 0 ? (
        <Text variant="caption" tone="dim">
          {`${library.oldSaves.length} saves from an older build can't be opened by this build and were left untouched: ${library.oldSaves.join(", ")}`}
        </Text>
      ) : null}
      <StatePanel state={data} loadingText="Reading cartridges…">
        {() =>
          list.length === 0 ? (
            <Text tone="dim">No cartridges yet.</Text>
          ) : (
            <div className="carts g-scroll">
              {list.map((entry, index) => (
                <Button
                  key={entry.key}
                  className="cart-row"
                  variant="tile"
                  active={entry.key === selected?.key}
                  onMouseEnter={() => setCursor(index)}
                  onClick={() => (entry.key === selected?.key ? confirm(entry) : setCursor(index))}
                >
                  <strong>{entryTitle(entry)}</strong>
                  <span className="g-meta">{KIND_LABEL[entry.kind]}</span>
                </Button>
              ))}
            </div>
          )
        }
      </StatePanel>

      {selected === undefined ? null : (
        <div className="detail" key={selected.key}>
          {selected.kind === "cartridge" ? (
            <>
              <Text tone="muted">{selected.manifest.description}</Text>
              <div className="route">
                {(selected.manifest.formatVersion === 1
                  ? selected.manifest.story.scenes
                  : selected.manifest.definition.narrative.scenes.map((scene) => ({
                      id: scene.sceneId,
                      title: scene.title,
                    }))
                ).map((scene) => (
                  <span key={scene.id}>{scene.title}</span>
                ))}
              </div>
              <span className="g-meta">
                {selected.manifest.author} · {selected.manifest.cartridgeId}@
                {selected.manifest.version}
              </span>
              <span className="g-meta">{compatibilityLabel(selected.manifest)}</span>
              <span className="g-meta">
                {selected.manifest.lineage?.parent == null
                  ? "original revision"
                  : `${selected.manifest.lineage.kind} of ${selected.manifest.lineage.parent.cartridgeId}@${selected.manifest.lineage.parent.version}`}
              </span>
              <span className="g-meta">
                {matchingRuns.length === 0
                  ? "No runs for this exact revision"
                  : `${matchingRuns.length} run${matchingRuns.length === 1 ? "" : "s"}: ${matchingRuns.map((run) => run.name).join(", ")}`}
              </span>
            </>
          ) : null}
          {selected.kind === "save" ? (
            <span className="g-meta">
              {selected.instance.cartridge.cartridgeId}@{selected.instance.cartridge.version} ·{" "}
              {new Date(selected.instance.updatedAt).toLocaleString()}
            </span>
          ) : null}
          {selected.kind === "draft" ? (
            <span className="g-meta">
              {selected.workspace.mode} → {selected.workspace.targetCartridgeId}
            </span>
          ) : null}

          {remix === null ? (
            <div className="row-actions">
              <Button
                variant="primary"
                disabled={
                  busy || (selected.kind === "cartridge" && !isCompatible(selected.manifest))
                }
                hotkey="⏎"
                onClick={() => confirm(selected)}
              >
                {selected.kind === "save"
                  ? "Resume"
                  : selected.kind === "cartridge"
                    ? "Play"
                    : "Edit"}
              </Button>
              {selected.kind === "cartridge" ? (
                <Button disabled={busy} hotkey="R" onClick={() => startRemix(selected)}>
                  Remix
                </Button>
              ) : null}
              {selected.kind !== "draft" ? (
                <Button variant="ghost" disabled={busy} onClick={exportSelected}>
                  {selected.kind === "cartridge" ? "Export .cartridge" : "Backup save"}
                </Button>
              ) : null}
              {selected.kind === "save" && upgradeTarget !== null ? (
                <Button disabled={busy} onClick={upgrade}>
                  Upgrade to {upgradeTarget.version}
                </Button>
              ) : null}
            </div>
          ) : (
            <div className="form-grid">
              <TextField
                label="New ID"
                mono
                value={remix.targetCartridgeId}
                onChange={(event) => setRemix({ ...remix, targetCartridgeId: event.target.value })}
              />
              <TextField
                label="Title"
                value={remix.name}
                onChange={(event) => setRemix({ ...remix, name: event.target.value })}
              />
              <TextField
                label="Author"
                autoFocus
                value={remix.author}
                onChange={(event) => setRemix({ ...remix, author: event.target.value })}
              />
              <div className="row-actions">
                <Button
                  variant="primary"
                  disabled={busy || remix.author.trim() === ""}
                  onClick={createRemix}
                >
                  Create
                </Button>
                <Button variant="ghost" onClick={() => setRemix(null)}>
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
      <div className="row-actions">
        <Button variant="ghost" disabled={busy} onClick={importCartridge}>
          Import .cartridge
        </Button>
        <Button variant="ghost" disabled={busy} onClick={importBackup}>
          Restore backup
        </Button>
      </div>
    </>
  );
}
