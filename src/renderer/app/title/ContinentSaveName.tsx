// Worlds → Continent, under the chosen save's door number: when the lineage market is set up and
// that save has an ENS name (Worlds → Saves), say whether friends can walk in by the name too — it
// carries this door number — or that recording the save again puts the door on it. Without a
// market there is nothing to say, so nothing is shown.

import { errorLine, useT } from "@renderer/i18n";
import { storedMarketPasskey } from "@renderer/identity";
import { Text } from "@renderer/ui";
import type { SaveNameView } from "@shared/market";
import { errored, type Loadable, loading, ready, toError } from "@shared/result";
import { type JSX, useEffect, useState } from "react";

export function ContinentSaveName({ instanceId }: { instanceId: string }): JSX.Element | null {
  const t = useT();
  // null: no market configured (or not asked yet), so the line has nothing to report.
  const [view, setView] = useState<Loadable<SaveNameView> | null>(null);

  useEffect(() => {
    let live = true;
    setView(null);
    const read = async (): Promise<void> => {
      const config = await window.seed.market.config();
      if (!live || config.parent === null) return;
      setView(loading());
      const key = storedMarketPasskey()?.key ?? null;
      const result = await window.seed.market.saveName(instanceId, null, key);
      if (live) setView(result.ok ? ready(result.value) : errored(result.error));
    };
    read().catch((cause: unknown) => {
      if (live) setView(errored(toError(cause, "market-unreachable")));
    });
    return () => {
      live = false;
    };
  }, [instanceId]);

  if (view === null || view.status === "idle") return null;
  if (view.status === "loading") {
    return (
      <Text variant="caption" tone="dim">
        {t("continent.nameReading")}
      </Text>
    );
  }
  if (view.status === "error") {
    return (
      <Text variant="caption" tone="dim">
        {errorLine(view.error)}
      </Text>
    );
  }
  const { save, local } = view.value;
  // Only a name that records this save: free is nobody's, taken is someone else's or not a save.
  if (save === null || (save.state !== "current" && save.state !== "outdated")) return null;
  if (save.door === local.door) {
    return (
      <Text variant="caption" tone="muted">
        {t("continent.nameCarriesDoor", { name: save.name })}
      </Text>
    );
  }
  return save.mine ? (
    <Text variant="caption" tone="dim">
      {t("continent.nameNeedsDoor", { name: save.name })}
    </Text>
  ) : null;
}
