// Where each world lives, for Worlds → My worlds (rev 6 phase 3, WP8): only on this device, shared
// with friends, or joined from its owner — never which service (badgeText in land/worldDoor). Read
// from main (`world.badges`: the saves' world pins and the histories they name, never a migration)
// each time the library loads; a world's 更多 shows every state. The badge also names the world's
// id (匯出 .world) and tells Join a world which worlds can walk over to a friend's.

import { useT } from "@renderer/i18n";
import { ErrorBlock, Text } from "@renderer/ui";
import { errored, idle, type Loadable, loading, ready } from "@shared/result";
import type { WorldBadge } from "@shared/worldApi";
import { type JSX, useEffect, useState } from "react";
import { badgeText, shortKey } from "../land/worldDoor";
import type { LibraryData } from "../title/useLibrary";

export type Badges = Loadable<ReadonlyMap<string, WorldBadge>>;

/** Every save's badge by instance id, read again whenever the library itself is read again. */
export function useWorldBadges(data: Loadable<LibraryData>): Badges {
  const [badges, setBadges] = useState<Badges>(idle());
  const library = data.status === "ready" ? data.value : null;
  useEffect(() => {
    if (library === null) return;
    let alive = true;
    setBadges(loading());
    void window.seed.world.badges().then((result) => {
      if (!alive) return;
      setBadges(
        result.ok
          ? ready(new Map(result.value.map((badge) => [badge.instanceId, badge])))
          : errored(result.error),
      );
    });
    return () => {
      alive = false;
    };
  }, [library]);
  return badges;
}

function useBadgeLine(): (badge: WorldBadge) => string {
  const t = useT();
  return (badge) => badgeText(t, badge.kind, badge.url, badge.ownerName ?? shortKey(badge.owner));
}

/** In a world's 更多: loading, the error, the line, or that it has no history yet. */
export function DetailBadge({
  badges,
  instanceId,
}: {
  badges: Badges;
  instanceId: string;
}): JSX.Element | null {
  const t = useT();
  const line = useBadgeLine();
  if (badges.status === "idle") return null;
  if (badges.status === "loading") {
    return (
      <Text variant="caption" tone="muted">
        {t("common.loading")}
      </Text>
    );
  }
  if (badges.status === "error") return <ErrorBlock error={badges.error} />;
  const badge = badges.value.get(instanceId);
  return (
    <Text variant="caption" tone={badge === undefined ? "dim" : "muted"}>
      {badge === undefined ? t("world.badgeNone") : line(badge)}
    </Text>
  );
}
