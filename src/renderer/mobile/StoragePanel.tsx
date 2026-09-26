// What this browser keeps and whether it promised to keep it (rev 6 phase 4, D7's storage risk,
// stated to the player): `navigator.storage.estimate()` and `persisted()`, read when shown (the
// shell re-mounts it by key when the world's status changes). A browser that answers neither says
// so (Rule 2).

import { formatNumber, useT } from "@renderer/i18n";
import { Surface, Text } from "@renderer/ui";
import { type JSX, useEffect, useState } from "react";

interface Kept {
  used: number | null;
  quota: number | null;
  persisted: boolean | null;
}

async function readKept(): Promise<Kept> {
  const storage = navigator.storage;
  const estimate = await storage?.estimate?.().catch(() => null);
  const persisted = await storage?.persisted?.().catch(() => null);
  return {
    used: estimate?.usage ?? null,
    quota: estimate?.quota ?? null,
    persisted: persisted ?? null,
  };
}

function size(bytes: number): string {
  const mib = bytes / (1024 * 1024);
  return mib >= 1
    ? `${formatNumber(Math.round(mib * 10) / 10)} MiB`
    : `${formatNumber(Math.ceil(bytes / 1024))} KiB`;
}

export function StoragePanel(): JSX.Element {
  const t = useT();
  const [kept, setKept] = useState<Kept | null>(null);

  useEffect(() => {
    let live = true;
    void readKept().then((next) => {
      if (live) setKept(next);
    });
    return () => {
      live = false;
    };
  }, []);

  return (
    <Surface variant="outlined" padding="md">
      <Text variant="label" tone="accent" as="h3">
        {t("mobile.storageTitle")}
      </Text>
      {kept === null ? null : (
        <>
          <Text variant="caption" tone="muted">
            {kept.used === null || kept.quota === null
              ? t("mobile.storageUnknown")
              : t("mobile.storageUse", { used: size(kept.used), quota: size(kept.quota) })}
          </Text>
          {kept.persisted === null ? null : (
            <Text variant="caption" tone={kept.persisted ? "success" : "muted"}>
              {kept.persisted ? t("mobile.storageSafe") : t("mobile.storageUnsafe")}
            </Text>
          )}
        </>
      )}
      <Text variant="caption" tone="dim">
        {t("mobile.storageRisk")}
      </Text>
    </Surface>
  );
}
