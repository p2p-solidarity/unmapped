// Join a world by a join code: your own world walks over to your friend's, so one of My worlds is
// brought along — the newest one kept on this device, shown as "帶著：{name}（更換）". A world shared
// through a world service cannot go (friends join it by invite instead), so it is not offered.
// With no world yet, a new adventure on the built-in world is started first ("一片新的大地").

import { useT } from "@renderer/i18n";
import { Button, space, Text } from "@renderer/ui";
import type { InstanceMeta } from "@shared/cartridge";
import type { JSX } from "react";
import type { Badges } from "./WorldBadges";

/** The saves that may be brought: every one not shared through a world service. */
export function bringable(saves: readonly InstanceMeta[], badges: Badges): InstanceMeta[] {
  if (badges.status !== "ready") return [...saves];
  return saves.filter((save) => {
    const badge = badges.value.get(save.instanceId);
    return badge === undefined || badge.kind === "local";
  });
}

export function BringLine({
  saves,
  chosen,
  names,
  picking,
  busy,
  onPicking,
  onChoose,
}: {
  saves: readonly InstanceMeta[];
  /** The save that goes; null = a new land. */
  chosen: InstanceMeta | null;
  names: ReadonlyMap<string, string>;
  picking: boolean;
  busy: boolean;
  onPicking(picking: boolean): void;
  onChoose(instanceId: string): void;
}): JSX.Element {
  const t = useT();
  const nameOf = (save: InstanceMeta): string => names.get(save.instanceId) ?? save.name;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: space.xs }}>
      <div className="row-actions" style={{ alignItems: "center" }}>
        <Text variant="body" tone="muted">
          {t("library.bringing", {
            name: chosen === null ? t("library.bringNew") : nameOf(chosen),
          })}
        </Text>
        {saves.length > 1 ? (
          <Button variant="ghost" disabled={busy} onClick={() => onPicking(!picking)}>
            {picking ? t("library.less") : t("library.bringChange")}
          </Button>
        ) : null}
      </div>
      {picking ? (
        <>
          <Text variant="caption" tone="dim">
            {t("library.bringPick")}
          </Text>
          <div className="carts">
            {saves.map((save) => (
              <Button
                key={save.instanceId}
                variant="tile"
                active={save.instanceId === chosen?.instanceId}
                disabled={busy}
                onClick={() => {
                  onChoose(save.instanceId);
                  onPicking(false);
                }}
              >
                {nameOf(save)}
              </Button>
            ))}
          </div>
        </>
      ) : null}
      <Text variant="caption" tone="dim">
        {t("library.bringNote")}
      </Text>
    </div>
  );
}
