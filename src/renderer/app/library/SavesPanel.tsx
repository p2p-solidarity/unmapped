// Every save on this machine, newest first: resume it, back it up to a .spire-backup, upgrade it to
// a newer compatible revision of its cartridge, or restore one from a backup. A row's focus selects
// it; pressing the selected row resumes it.

import { errorLine, formatDateTime, useT } from "@renderer/i18n";
import { useSessionStore } from "@renderer/state";
import { Button, StatePanel, Text } from "@renderer/ui";
import {
  type CartridgeManifest,
  compareCartridgeVersions,
  type InstanceMeta,
} from "@shared/cartridge";
import { type JSX, useRef, useState } from "react";
import { useKeys } from "../shell/useKeys";
import { isCompatible } from "../title/CartridgesPanel";
import { isCancelled } from "../title/useLibrary";
import { openInstance } from "../useInstanceLoader";
import { AUTOFOCUS, useArrowFocus } from "./focus";
import type { SectionProps } from "./sections";

/** The newest compatible revision of the save's cartridge that is newer than its pin. */
function upgradeFor(save: InstanceMeta, cartridges: CartridgeManifest[]): CartridgeManifest | null {
  return (
    cartridges
      .filter(
        (manifest) =>
          manifest.cartridgeId === save.cartridge.cartridgeId &&
          isCompatible(manifest) &&
          compareCartridgeVersions(manifest.version, save.cartridge.version) > 0,
      )
      .sort((a, b) => compareCartridgeVersions(b.version, a.version))[0] ?? null
  );
}

export function SavesPanel({ data, refresh, onClose }: SectionProps): JSX.Element {
  const t = useT();
  const toast = useSessionStore((state) => state.toast);
  const [cursor, setCursor] = useState(0);
  const [busy, setBusy] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  const library = data.status === "ready" ? data.value : null;
  const saves = library?.instances ?? [];
  const selected = saves[Math.min(cursor, saves.length - 1)];
  const upgradeTarget =
    selected === undefined || library === null ? null : upgradeFor(selected, library.cartridges);

  useKeys({ Escape: onClose });
  useArrowFocus(listRef);

  const resume = (save: InstanceMeta): void => {
    if (!busy) void openInstance(save.instanceId);
  };

  const backup = (save: InstanceMeta): void => {
    setBusy(true);
    void window.seed.instances.exportBackup(save.instanceId).then((result) => {
      setBusy(false);
      if (!result.ok) {
        if (!isCancelled(result.error.code)) toast("danger", errorLine(result.error));
        return;
      }
      toast("success", t("title.exportedTo", { path: result.value.path }));
    });
  };

  const restore = (): void => {
    setBusy(true);
    void window.seed.instances.importBackup().then(async (result) => {
      setBusy(false);
      if (!result.ok) {
        if (!isCancelled(result.error.code)) toast("danger", errorLine(result.error));
        return;
      }
      toast("success", t("title.restored", { name: result.value.instance.meta.name }));
      await refresh();
    });
  };

  const upgrade = (save: InstanceMeta, target: CartridgeManifest): void => {
    setBusy(true);
    void window.seed.instances
      .upgrade({ instanceId: save.instanceId, version: target.version })
      .then(async (result) => {
        setBusy(false);
        if (!result.ok) return toast("danger", errorLine(result.error));
        toast(
          "success",
          t("title.upgraded", { version: result.value.instance.meta.cartridge.version }),
        );
        await refresh();
      });
  };

  return (
    <>
      <h2 className="g-heading">{t("library.sectionSaves")}</h2>
      {library !== null && library.oldSaves.length > 0 ? (
        <Text variant="caption" tone="dim">
          {t("title.oldSaves", { n: library.oldSaves.length, names: library.oldSaves.join(", ") })}
        </Text>
      ) : null}
      <StatePanel state={data} loadingText={t("library.readingSaves")}>
        {() =>
          saves.length === 0 ? (
            <Text tone="dim">{t("library.noSaves")}</Text>
          ) : (
            <div className="carts g-scroll" ref={listRef}>
              {saves.map((save, index) => (
                <Button
                  key={save.instanceId}
                  className={index === 0 ? `cart-row ${AUTOFOCUS}` : "cart-row"}
                  variant="tile"
                  active={save.instanceId === selected?.instanceId}
                  onFocus={() => setCursor(index)}
                  onMouseEnter={() => setCursor(index)}
                  onClick={() =>
                    save.instanceId === selected?.instanceId ? resume(save) : setCursor(index)
                  }
                >
                  <strong>{save.name}</strong>
                  <span className="g-meta">{formatDateTime(save.updatedAt)}</span>
                </Button>
              ))}
            </div>
          )
        }
      </StatePanel>

      {selected === undefined ? null : (
        <div className="detail" key={selected.instanceId}>
          <span className="g-meta">
            {`${selected.cartridge.cartridgeId}@${selected.cartridge.version} · ${formatDateTime(selected.updatedAt)}`}
          </span>
          <div className="row-actions">
            <Button variant="primary" disabled={busy} onClick={() => resume(selected)}>
              {t("common.resume")}
            </Button>
            <Button variant="ghost" disabled={busy} onClick={() => backup(selected)}>
              {t("title.backupSave")}
            </Button>
            {upgradeTarget === null ? null : (
              <Button disabled={busy} onClick={() => upgrade(selected, upgradeTarget)}>
                {t("title.upgradeTo", { version: upgradeTarget.version })}
              </Button>
            )}
          </div>
        </div>
      )}
      <div className="row-actions">
        <Button variant="ghost" disabled={busy} onClick={restore}>
          {t("title.restoreBackup")}
        </Button>
      </div>
    </>
  );
}
