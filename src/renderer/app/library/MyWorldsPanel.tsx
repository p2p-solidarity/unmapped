// Worlds → My worlds: one list of worlds, each a name and one button (./rows). Row 0 starts a new
// adventure on the built-in world (and has the first focus); every save continues; every installed
// world nobody has played yet starts. The rest of each world is folded behind its 更多, and the
// list's own 更多 at the bottom restores a backup or imports a world. One Escape handler: it closes
// an open remix form first, else leaves for the title.

import { errorLine, useT } from "@renderer/i18n";
import { useSessionStore } from "@renderer/state";
import { Button, StatePanel, Text } from "@renderer/ui";
import type { CartridgeManifest, WorkspaceMeta } from "@shared/cartridge";
import { type AppError, errored, type Loadable, loading, ready } from "@shared/result";
import { type JSX, useEffect, useMemo, useRef, useState } from "react";
import { useKeys } from "../shell/useKeys";
import { DraftLines, type RemixDraft } from "../title/CartridgesPanel";
import { isCancelled } from "../title/useLibrary";
import { useArrowFocus } from "./focus";
import { NewAdventureRow } from "./NewAdventureRow";
import { useRestoreNotice } from "./RestoreNotice";
import { rowNames, worldList } from "./rows";
import { SaveRow } from "./SaveRow";
import { useSaveEnsNames } from "./saveNames";
import type { SectionProps } from "./sections";
import { useWorldBadges } from "./WorldBadges";
import { MoreButton, type RowContext, UnplayedRow } from "./WorldRow";

export function MyWorldsPanel({ data, refresh, onClose }: SectionProps): JSX.Element {
  const t = useT();
  const [game, setGame] = useState<Loadable<CartridgeManifest>>(loading());
  const [busy, setBusy] = useState(false);
  const [remix, setRemix] = useState<RemixDraft | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const badges = useWorldBadges(data);
  // Here, not in ListMore: the library is read again after a restore, and the notice must outlive it.
  const restoreNotice = useRestoreNotice();

  useEffect(() => {
    let alive = true;
    void window.seed.game.base().then((result) => {
      if (alive) setGame(result.ok ? ready(result.value) : errored(result.error));
    });
    return () => {
      alive = false;
    };
  }, []);

  // On a fresh userData the built-in world is installed after the library was read, so the library
  // is read once more; otherwise its other versions and drafts would be missing until next time.
  const reread = useRef(false);
  useEffect(() => {
    if (game.status !== "ready" || data.status !== "ready" || reread.current) return;
    const { cartridgeId, version } = game.value;
    const listed = data.value.cartridges.some(
      (one) => one.cartridgeId === cartridgeId && one.version === version,
    );
    if (listed) return;
    reread.current = true;
    void refresh();
  }, [game, data, refresh]);

  useKeys({ Escape: () => (remix !== null ? setRemix(null) : busy ? undefined : onClose()) });
  useArrowFocus(listRef, { enabled: remix === null });

  const library = data.status === "ready" ? data.value : null;
  const builtInId = game.status === "ready" ? game.value.cartridgeId : null;
  const list = useMemo(
    () => (library === null ? null : worldList(library, builtInId)),
    [library, builtInId],
  );
  const ensNames = useSaveEnsNames(library?.instances.map((save) => save.instanceId) ?? []);
  const names = useMemo(
    () =>
      list === null
        ? new Map<string, string>()
        : rowNames(list.rows, ensNames, (name, n) => t("library.numbered", { name, n })),
    [list, ensNames, t],
  );
  // The list waits for the built-in world too, so row 0 (and its first focus) is there at once.
  const settled = game.status === "ready" || game.status === "error";
  const context: RowContext = { busy, setBusy, remix, setRemix };

  return (
    <>
      <h2 className="g-heading">{t("library.sectionMine")}</h2>
      <Text tone="muted">{t("library.mineIntro")}</Text>
      <StatePanel state={data} loadingText={t("library.readingSaves")}>
        {(value) =>
          list === null || !settled ? (
            <Text tone="dim">{t("title.preparingLand")}</Text>
          ) : (
            <div className="world-list" ref={listRef}>
              <NewAdventureRow game={game} group={list.builtIn} context={context} />
              {list.rows.map((row) =>
                row.kind === "save" ? (
                  <SaveRow
                    key={row.key}
                    row={row}
                    name={names.get(row.key) ?? row.save.name}
                    cartridges={value.cartridges}
                    badges={badges}
                    context={context}
                    refresh={refresh}
                  />
                ) : (
                  <UnplayedRow
                    key={row.key}
                    row={row}
                    name={names.get(row.key) ?? row.newest.name}
                    context={context}
                  />
                ),
              )}
            </div>
          )
        }
      </StatePanel>
      {list === null || !settled ? null : (
        // Only with the list: the screen's first focus must land on row 0, not on this 更多.
        <ListMore
          busy={busy}
          setBusy={setBusy}
          refresh={refresh}
          oldSaves={library?.oldSaves ?? []}
          orphanDrafts={list.orphanDrafts}
          onRestored={restoreNotice.show}
        />
      )}
      {restoreNotice.view}
    </>
  );
}

/** The list's own 更多: restore a backup, import a world, and what has no row of its own. */
function ListMore({
  busy,
  setBusy,
  refresh,
  oldSaves,
  orphanDrafts,
  onRestored,
}: {
  busy: boolean;
  setBusy(busy: boolean): void;
  refresh(): Promise<void>;
  oldSaves: readonly string[];
  orphanDrafts: readonly WorkspaceMeta[];
  /** What a restore has to say besides "restored" (./RestoreNotice). */
  onRestored(notice: AppError | null): void;
}): JSX.Element {
  const t = useT();
  const [open, setOpen] = useState(false);
  const toast = (tone: "success" | "danger", text: string): void =>
    useSessionStore.getState().toast(tone, text);

  const restore = (): void => {
    setBusy(true);
    void window.seed.instances.importBackup().then(async (result) => {
      setBusy(false);
      if (!result.ok) {
        if (!isCancelled(result.error.code)) toast("danger", errorLine(result.error));
        return;
      }
      toast("success", t("title.restored", { name: result.value.instance.meta.name }));
      onRestored(result.value.historyNotice);
      await refresh();
    });
  };

  const importWorld = (): void => {
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

  return (
    <>
      <div className="row-actions">
        <MoreButton open={open} onToggle={() => setOpen(!open)} label={t("library.listMore")} />
      </div>
      {open ? (
        <>
          <div className="row-actions">
            <Button variant="ghost" disabled={busy} onClick={restore}>
              {t("title.restoreBackup")}
            </Button>
            <Button variant="ghost" disabled={busy} onClick={importWorld}>
              {t("title.importCartridge")}
            </Button>
          </div>
          {orphanDrafts.length === 0 ? null : (
            <>
              <Text variant="label" tone="muted">
                {t("library.orphanDrafts")}
              </Text>
              <DraftLines drafts={orphanDrafts} busy={busy} />
            </>
          )}
          {oldSaves.length === 0 ? null : (
            <Text variant="caption" tone="dim">
              {t("title.oldSaves", { n: oldSaves.length, names: oldSaves.join(", ") })}
            </Text>
          )}
        </>
      ) : null}
    </>
  );
}
