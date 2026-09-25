// Worlds → Cartridges: published cartridges and draft workspaces in one list (saves have their own
// section). A row's focus selects it, pressing the selected row plays / opens it, R starts a remix
// of the selected cartridge. A cartridge also shows its ENS name, and a name can be followed back
// to the revision it points at. Import / export of .cartridge files live here.

import { errorLine, type StringKey, type Translate, useT } from "@renderer/i18n";
import { useSessionStore } from "@renderer/state";
import { Button, StatePanel, Text, TextField } from "@renderer/ui";
import {
  type CartridgeLineage,
  type CartridgeManifest,
  ENGINE_API_VERSION,
  SAVE_SCHEMA_VERSION,
  type WorkspaceMeta,
} from "@shared/cartridge";
import { type JSX, useRef, useState } from "react";
import { AUTOFOCUS, useArrowFocus } from "../library/focus";
import type { SectionProps } from "../library/sections";
import { useKeys } from "../shell/useKeys";
import { hydrateInstance } from "../useInstanceLoader";
import { CartridgeNameLine, OpenByEnsName, useEnsNames } from "./CartridgeName";
import { isCancelled, type LibraryData } from "./useLibrary";

type Entry =
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
    ...library.cartridges.map((manifest) => ({
      kind: "cartridge" as const,
      key: `cart:${manifest.cartridgeId}@${manifest.version}`,
      manifest,
    })),
    ...library.workspaces.map((workspace) => ({
      kind: "draft" as const,
      key: `draft:${workspace.workspaceId}`,
      workspace,
    })),
  ];
}

const KIND_LABEL: Record<Entry["kind"], StringKey> = {
  cartridge: "title.kindCartridge",
  draft: "title.kindDraft",
};

const LINEAGE_LABEL: Record<CartridgeLineage["kind"], StringKey> = {
  revision: "title.lineageRevision",
  remix: "title.lineageRemix",
  "legacy-import": "title.lineageLegacyImport",
};

/** How a revision (or a workspace's mode) relates to its parent, in the UI language. */
export function lineageLabel(kind: CartridgeLineage["kind"], t: Translate): string {
  return t(LINEAGE_LABEL[kind]);
}

function entryTitle(entry: Entry): string {
  if (entry.kind === "cartridge") return entry.manifest.name;
  return entry.workspace.name;
}

function compatibilityLabel(manifest: CartridgeManifest, t: Translate): string {
  if (manifest.engineApiVersion > ENGINE_API_VERSION) {
    return t("title.needsEngine", { version: manifest.engineApiVersion });
  }
  if (manifest.saveSchemaVersion !== SAVE_SCHEMA_VERSION) {
    return t("title.needsSaveSchema", { version: manifest.saveSchemaVersion });
  }
  const kits =
    manifest.formatVersion === 1
      ? manifest.requiredKits
      : manifest.definition.capabilityProfile.contexts.map((context) => context.contextId);
  return t("title.compatible", { kits: kits.join(", ") });
}

export function isCompatible(manifest: CartridgeManifest): boolean {
  return (
    manifest.engineApiVersion <= ENGINE_API_VERSION &&
    manifest.saveSchemaVersion === SAVE_SCHEMA_VERSION
  );
}

export function CartridgesPanel({ data, refresh, onClose }: SectionProps): JSX.Element {
  const t = useT();
  const toast = useSessionStore((state) => state.toast);
  const openWorkspace = useSessionStore((state) => state.openWorkspace);
  const [cursor, setCursor] = useState(0);
  const [remix, setRemix] = useState<RemixDraft | null>(null);
  const [busy, setBusy] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const ens = useEnsNames();

  const list = data.status === "ready" ? entries(data.value) : [];
  const selected = list[Math.min(cursor, list.length - 1)];
  const library = data.status === "ready" ? data.value : null;
  const matchingRuns =
    selected?.kind === "cartridge" && library !== null
      ? library.instances.filter(
          (instance) => instance.cartridge.contentHash === selected.manifest.contentHash,
        )
      : [];

  const newRun = (manifest: CartridgeManifest): void => {
    setBusy(true);
    void (async () => {
      const result = await window.seed.instances.create({
        cartridgeId: manifest.cartridgeId,
        version: manifest.version,
        name: `${manifest.name} run`,
      });
      setBusy(false);
      if (!result.ok) return toast("danger", errorLine(result.error));
      const hydrated = hydrateInstance(result.value);
      if (!hydrated.ok) return toast("danger", errorLine(hydrated.error));
      useSessionStore.getState().setScreen("play");
    })();
  };

  const confirm = (entry: Entry | undefined): void => {
    if (entry === undefined || busy) return;
    if (entry.kind === "cartridge") {
      if (isCompatible(entry.manifest)) newRun(entry.manifest);
    } else openWorkspace(entry.workspace.workspaceId);
  };

  const startRemix = (entry: Entry | undefined): void => {
    if (entry?.kind !== "cartridge") return;
    setRemix({
      source: entry.manifest,
      targetCartridgeId: `${entry.manifest.cartridgeId}-remix`,
      name: `${entry.manifest.name} Remix`,
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
      if (!result.ok) return toast("danger", errorLine(result.error));
      openWorkspace(result.value.meta.workspaceId);
    })();
  };

  const exportCartridge = (manifest: CartridgeManifest): void => {
    setBusy(true);
    void window.seed.cartridges
      .exportPack(manifest.cartridgeId, manifest.version)
      .then((result) => {
        setBusy(false);
        if (!result.ok) {
          if (!isCancelled(result.error.code)) toast("danger", errorLine(result.error));
          return;
        }
        toast("success", t("title.exportedTo", { path: result.value.path }));
      });
  };

  const importCartridge = (): void => {
    setBusy(true);
    void window.seed.cartridges.importPack().then(async (result) => {
      setBusy(false);
      if (!result.ok) {
        if (!isCancelled(result.error.code)) toast("danger", errorLine(result.error));
        return;
      }
      toast(
        "success",
        t("title.imported", { name: `${result.value.cartridgeId}@${result.value.version}` }),
      );
      await refresh();
    });
  };

  useKeys({
    Escape: () => (remix === null ? onClose() : setRemix(null)),
    ...(remix === null ? { KeyR: () => startRemix(selected) } : {}),
  });
  useArrowFocus(listRef, { enabled: remix === null });

  return (
    <>
      <h2 className="g-heading">{t("library.sectionCartridges")}</h2>
      <StatePanel state={data} loadingText={t("title.readingCartridges")}>
        {() =>
          list.length === 0 ? (
            <Text tone="dim">{t("title.noCartridges")}</Text>
          ) : (
            <div className="carts g-scroll" ref={listRef}>
              {list.map((entry, index) => (
                <Button
                  key={entry.key}
                  className={index === 0 ? `cart-row ${AUTOFOCUS}` : "cart-row"}
                  variant="tile"
                  active={entry.key === selected?.key}
                  onFocus={() => setCursor(index)}
                  onMouseEnter={() => setCursor(index)}
                  onClick={() => (entry.key === selected?.key ? confirm(entry) : setCursor(index))}
                >
                  <strong>{entryTitle(entry)}</strong>
                  <span className="g-meta">
                    {entry.kind === "cartridge"
                      ? `${t(KIND_LABEL.cartridge)} · ${entry.manifest.version}`
                      : t(KIND_LABEL.draft)}
                  </span>
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
              <span className="g-meta">{compatibilityLabel(selected.manifest, t)}</span>
              <span className="g-meta">
                {selected.manifest.lineage?.parent == null
                  ? t("title.originalRevision")
                  : t("title.lineageOf", {
                      kind: lineageLabel(selected.manifest.lineage.kind, t),
                      parent: `${selected.manifest.lineage.parent.cartridgeId}@${selected.manifest.lineage.parent.version}`,
                    })}
              </span>
              <span className="g-meta">
                {matchingRuns.length === 0
                  ? t("title.noRuns")
                  : t("title.runs", {
                      n: matchingRuns.length,
                      names: matchingRuns.map((run) => run.name).join(", "),
                    })}
              </span>
              <CartridgeNameLine manifest={selected.manifest} config={ens} />
            </>
          ) : null}
          {selected.kind === "draft" ? (
            <span className="g-meta">
              {lineageLabel(selected.workspace.mode, t)} → {selected.workspace.targetCartridgeId}
            </span>
          ) : null}

          {remix === null ? (
            <div className="row-actions">
              <Button
                variant="primary"
                disabled={
                  busy || (selected.kind === "cartridge" && !isCompatible(selected.manifest))
                }
                onClick={() => confirm(selected)}
              >
                {selected.kind === "cartridge" ? t("common.play") : t("title.edit")}
              </Button>
              {selected.kind === "cartridge" ? (
                <Button disabled={busy} hotkey="R" onClick={() => startRemix(selected)}>
                  {t("title.remix")}
                </Button>
              ) : null}
              {selected.kind === "cartridge" ? (
                <Button
                  variant="ghost"
                  disabled={busy}
                  onClick={() => exportCartridge(selected.manifest)}
                >
                  {t("title.exportCartridge")}
                </Button>
              ) : null}
            </div>
          ) : (
            <div className="form-grid">
              <TextField
                label={t("title.newId")}
                mono
                value={remix.targetCartridgeId}
                onChange={(event) => setRemix({ ...remix, targetCartridgeId: event.target.value })}
              />
              <TextField
                label={t("title.titleField")}
                value={remix.name}
                onChange={(event) => setRemix({ ...remix, name: event.target.value })}
              />
              <TextField
                label={t("title.author")}
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
                  {t("title.create")}
                </Button>
                <Button variant="ghost" onClick={() => setRemix(null)}>
                  {t("common.cancel")}
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
      <div className="row-actions">
        <Button variant="ghost" disabled={busy} onClick={importCartridge}>
          {t("title.importCartridge")}
        </Button>
      </div>
      <OpenByEnsName
        cartridges={library?.cartridges ?? []}
        busy={busy}
        onPlay={newRun}
        onImport={importCartridge}
      />
    </>
  );
}
