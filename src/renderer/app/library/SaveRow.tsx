// A world the player has played (a save) in My worlds: its name (its ENS name first) and 繼續. Its
// 更多 holds the rest: when it was last played and where it lives, 邀請朋友 (open the world, then
// its door to friends), 匯出 .world, 備份, 升級 to a newer version, its ENS name, and — on the
// newest save of its world — what that world offers (./rows `head`, title/CartridgesPanel).

import { errorLine, formatDateTime, formatNumber, useT } from "@renderer/i18n";
import { openMyDoor } from "@renderer/net/continentActions";
import { useSessionStore } from "@renderer/state";
import { Button } from "@renderer/ui";
import {
  type CartridgeManifest,
  compareCartridgeVersions,
  type InstanceMeta,
} from "@shared/cartridge";
import type { JSX } from "react";
import { SaveEnsBlock } from "../market/EnsNames";
import { WorldMore } from "../title/CartridgesPanel";
import { isCancelled } from "../title/useLibrary";
import { openInstance } from "../useInstanceLoader";
import { bringWorld, inviteLine } from "./bring";
import { isCompatible, type WorldRow } from "./rows";
import { rememberSaveName } from "./saveNames";
import { type Badges, DetailBadge } from "./WorldBadges";
import { type RowContext, WorldRowShell } from "./WorldRow";

/** The newest compatible revision of the save's world that is newer than its pin. */
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

interface SaveRowProps {
  row: Extract<WorldRow, { kind: "save" }>;
  name: string;
  cartridges: CartridgeManifest[];
  badges: Badges;
  context: RowContext;
  refresh(): Promise<void>;
}

export function SaveRow(props: SaveRowProps): JSX.Element {
  const { row, name, cartridges, badges, context, refresh } = props;
  const t = useT();
  const { save } = row;
  const { busy, setBusy } = context;
  const badge = badges.status === "ready" ? badges.value.get(save.instanceId) : undefined;
  const upgradeTarget = upgradeFor(save, cartridges);
  const toast = (tone: "info" | "success" | "danger", text: string): void =>
    useSessionStore.getState().toast(tone, text);

  const invite = (): void => {
    if (busy) return;
    setBusy(true);
    // A world shared through a world service invites with a link from its door, not a join code.
    if (badge !== undefined && badge.kind !== "local") {
      void openInstance(save.instanceId).then(() => {
        setBusy(false);
        toast("info", t("library.inviteShared"));
      });
      return;
    }
    void bringWorld(save.instanceId, openMyDoor, inviteLine).then((done) => {
      setBusy(false);
      if (!done.ok) toast("danger", errorLine(done.error));
    });
  };

  const exportWorld = (worldId: string): void => {
    setBusy(true);
    void window.seed.bundle.export(worldId).then((result) => {
      setBusy(false);
      if (!result.ok) return toast("danger", errorLine(result.error));
      if (result.value === null) return;
      const size = formatNumber(Math.ceil(result.value.bytes / 1024));
      toast("success", t("bundle.exported", { file: result.value.fileName, size }));
    });
  };

  const backup = (): void => {
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

  const upgrade = (target: CartridgeManifest): void => {
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
    <WorldRowShell
      name={name}
      action={
        <Button
          variant="secondary"
          disabled={busy}
          onClick={() => void openInstance(save.instanceId)}
        >
          {t("common.resume")}
        </Button>
      }
    >
      {() => (
        <>
          <span className="g-meta">
            {t("library.lastPlayed", { date: formatDateTime(save.updatedAt) })}
          </span>
          <DetailBadge badges={badges} instanceId={save.instanceId} />
          <div className="row-actions">
            <Button variant="secondary" disabled={busy} onClick={invite}>
              {t("library.inviteFriends")}
            </Button>
            {badge === undefined ? null : (
              <Button variant="ghost" disabled={busy} onClick={() => exportWorld(badge.worldId)}>
                {t("bundle.export")}
              </Button>
            )}
            <Button variant="ghost" disabled={busy} onClick={backup}>
              {t("title.backupSave")}
            </Button>
            {upgradeTarget === null ? null : (
              <Button variant="ghost" disabled={busy} onClick={() => upgrade(upgradeTarget)}>
                {t("title.upgradeTo", { version: upgradeTarget.version })}
              </Button>
            )}
          </div>
          <SaveEnsBlock
            instanceId={save.instanceId}
            onName={(found) => rememberSaveName(save.instanceId, found)}
          />
          {row.head && row.group !== null ? (
            <WorldMore group={row.group} plays={null} {...context} />
          ) : null}
        </>
      )}
    </WorldRowShell>
  );
}
