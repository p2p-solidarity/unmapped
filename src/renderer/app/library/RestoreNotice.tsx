// What a restore from a `.spire-backup` has to say besides "restored" (rev 6 phase 3, D6): when
// this device already held another history of the save's world, both were kept and nothing was
// merged; the backup's copy sits aside as `restored-<time>.jsonl` (the exact name is the notice's
// own English line). It stays on screen until it is closed (Rule 2), not a toast that fades.

import { describeError, useT } from "@renderer/i18n";
import { Button, Surface, Text } from "@renderer/ui";
import type { AppError } from "@shared/result";
import { type JSX, useState } from "react";

function RestoreNotice({ notice, onClose }: { notice: AppError; onClose(): void }): JSX.Element {
  const t = useT();
  const { message, hint, detail } = describeError(notice);
  return (
    <Surface variant="inset" padding="md">
      <Text variant="body">{message}</Text>
      {hint === null ? null : (
        <Text variant="caption" tone="muted">
          {hint}
        </Text>
      )}
      {detail === null ? null : (
        <Text variant="caption" tone="dim" mono>
          {detail}
        </Text>
      )}
      <div className="row-actions">
        <Button variant="ghost" onClick={onClose}>
          {t("common.close")}
        </Button>
      </div>
    </Surface>
  );
}

/** `show` the notice an `importBackup` returned (null clears it); render `view` where it happened. */
export function useRestoreNotice(): {
  show(notice: AppError | null): void;
  view: JSX.Element | null;
} {
  const [notice, setNotice] = useState<AppError | null>(null);
  const view =
    notice === null ? null : <RestoreNotice notice={notice} onClose={() => setNotice(null)} />;
  return { show: setNotice, view };
}
