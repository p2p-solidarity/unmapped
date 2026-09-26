// What a world (one cartridge id) offers besides playing it, shown inside the 更多 of the one My
// worlds row that stands for it: its ENS name first (and the market), what it is, its versions to
// start from the beginning, its drafts, remixing it, and exporting it as a `.cartridge`. The player
// sees "world" and "version" here, never "cartridge". The remix form's state belongs to the panel,
// whose one Escape handler closes it (library/sections.ts).

import { errorLine, type StringKey, type Translate, useT } from "@renderer/i18n";
import { useSessionStore } from "@renderer/state";
import { Button, Text, TextField } from "@renderer/ui";
import {
  type CartridgeLineage,
  type CartridgeManifest,
  ENGINE_API_VERSION,
  SAVE_SCHEMA_VERSION,
} from "@shared/cartridge";
import type { JSX } from "react";
import { isCompatible, type WorldGroup } from "../library/rows";
import { playWorld } from "../library/startWorld";
import { CartridgeNameLine } from "./CartridgeName";
import { isCancelled } from "./useLibrary";

export interface RemixDraft {
  source: CartridgeManifest;
  targetCartridgeId: string;
  name: string;
  author: string;
}

const LINEAGE_LABEL: Record<CartridgeLineage["kind"], StringKey> = {
  revision: "title.lineageRevision",
  remix: "title.lineageRemix",
  "legacy-import": "title.lineageLegacyImport",
};

/** How a revision (or a workspace's mode) relates to its parent, in the UI language. */
export function lineageLabel(kind: CartridgeLineage["kind"], t: Translate): string {
  return t(LINEAGE_LABEL[kind]);
}

/** Why this app cannot play a revision; null when it can. */
function needsLine(manifest: CartridgeManifest, t: Translate): string | null {
  if (manifest.engineApiVersion > ENGINE_API_VERSION) {
    return t("title.needsEngine", { version: manifest.engineApiVersion });
  }
  if (manifest.saveSchemaVersion !== SAVE_SCHEMA_VERSION) {
    return t("title.needsSaveSchema", { version: manifest.saveSchemaVersion });
  }
  return null;
}

export interface WorldMoreProps {
  group: WorldGroup;
  /** The version the row's own button starts, left out of "start from the beginning". */
  plays: CartridgeManifest | null;
  busy: boolean;
  setBusy(busy: boolean): void;
  remix: RemixDraft | null;
  setRemix(remix: RemixDraft | null): void;
}

export function WorldMore(props: WorldMoreProps): JSX.Element | null {
  const { group, plays, busy, setBusy, remix, setRemix } = props;
  const t = useT();
  const toast = useSessionStore((state) => state.toast);
  const openWorkspace = useSessionStore((state) => state.openWorkspace);
  const newest = group.revisions[0];
  if (newest === undefined) return null;
  const others = group.revisions.filter(
    (manifest) => plays === null || manifest.version !== plays.version,
  );
  const remixing = remix !== null && remix.source.cartridgeId === group.cartridgeId;

  const start = (manifest: CartridgeManifest): void => {
    setBusy(true);
    void playWorld(manifest).then((result) => {
      setBusy(false);
      if (!result.ok) toast("danger", errorLine(result.error));
    });
  };

  const exportWorld = (manifest: CartridgeManifest): void => {
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

  const createRemix = (draft: RemixDraft): void => {
    setBusy(true);
    void window.seed.workspaces
      .create({
        sourceCartridgeId: draft.source.cartridgeId,
        sourceVersion: draft.source.version,
        mode: "remix",
        targetCartridgeId: draft.targetCartridgeId,
        name: draft.name,
        author: draft.author,
      })
      .then((result) => {
        setBusy(false);
        if (!result.ok) return toast("danger", errorLine(result.error));
        setRemix(null);
        openWorkspace(result.value.meta.workspaceId);
      });
  };

  const lineage = newest.lineage ?? null;
  const parent = lineage?.parent ?? null;
  return (
    <>
      <CartridgeNameLine manifest={newest} />
      <Text variant="label" tone="muted">
        {t("library.aboutWorld")}
      </Text>
      {newest.description === "" ? null : <Text tone="muted">{newest.description}</Text>}
      <span className="g-meta">
        {`${newest.author} · ${t("library.versionRow", { version: newest.version })}`}
      </span>
      <span className="g-meta">
        {parent === null || lineage === null
          ? t("title.originalRevision")
          : t("title.lineageOf", {
              kind: lineageLabel(lineage.kind, t),
              parent: `${parent.cartridgeId}@${parent.version}`,
            })}
      </span>
      {remixing ? (
        <RemixForm draft={remix} busy={busy} onChange={setRemix} onCreate={createRemix} />
      ) : (
        <div className="row-actions">
          <Button
            variant="ghost"
            disabled={busy}
            onClick={() =>
              setRemix({
                source: newest,
                targetCartridgeId: `${newest.cartridgeId}-remix`,
                name: `${newest.name} Remix`,
                author: "",
              })
            }
          >
            {t("title.remix")}
          </Button>
          <Button variant="ghost" disabled={busy} onClick={() => exportWorld(newest)}>
            {t("title.exportCartridge")}
          </Button>
        </div>
      )}
      {others.length === 0 ? null : (
        <>
          <Text variant="label" tone="muted">
            {t("library.versionsHeading")}
          </Text>
          {others.map((manifest) => {
            const needs = needsLine(manifest, t);
            return (
              <div key={manifest.version} className="world-line">
                <span>{t("library.versionRow", { version: manifest.version })}</span>
                {needs === null ? null : <span className="g-meta">{needs}</span>}
                <Button
                  variant="secondary"
                  disabled={busy || !isCompatible(manifest)}
                  onClick={() => start(manifest)}
                >
                  {t("title.start")}
                </Button>
              </div>
            );
          })}
        </>
      )}
      <DraftLines drafts={group.drafts} busy={busy} />
    </>
  );
}

/** Drafts (authoring copies) of a world: open one to go on editing it. */
export function DraftLines({
  drafts,
  busy,
}: {
  drafts: readonly { workspaceId: string; name: string; mode: CartridgeLineage["kind"] }[];
  busy: boolean;
}): JSX.Element | null {
  const t = useT();
  const openWorkspace = useSessionStore((state) => state.openWorkspace);
  if (drafts.length === 0) return null;
  return (
    <>
      {drafts.map((draft) => (
        <div key={draft.workspaceId} className="world-line">
          <span>{t("library.draftRow", { name: draft.name })}</span>
          <span className="g-meta">{lineageLabel(draft.mode, t)}</span>
          <Button
            variant="secondary"
            disabled={busy}
            onClick={() => openWorkspace(draft.workspaceId)}
          >
            {t("title.edit")}
          </Button>
        </div>
      ))}
    </>
  );
}

function RemixForm({
  draft,
  busy,
  onChange,
  onCreate,
}: {
  draft: RemixDraft;
  busy: boolean;
  onChange(draft: RemixDraft | null): void;
  onCreate(draft: RemixDraft): void;
}): JSX.Element {
  const t = useT();
  return (
    <div className="form-grid">
      <TextField
        label={t("title.newId")}
        mono
        value={draft.targetCartridgeId}
        onChange={(event) => onChange({ ...draft, targetCartridgeId: event.target.value })}
      />
      <TextField
        label={t("title.titleField")}
        value={draft.name}
        onChange={(event) => onChange({ ...draft, name: event.target.value })}
      />
      <TextField
        label={t("title.author")}
        autoFocus
        value={draft.author}
        onChange={(event) => onChange({ ...draft, author: event.target.value })}
      />
      <div className="row-actions">
        <Button
          variant="primary"
          disabled={busy || draft.author.trim() === ""}
          onClick={() => onCreate(draft)}
        >
          {t("title.create")}
        </Button>
        <Button variant="ghost" onClick={() => onChange(null)}>
          {t("common.cancel")}
        </Button>
      </div>
    </div>
  );
}
