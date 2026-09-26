// One row of My worlds: a world's name, its one main button, and 更多 — everything else about the
// world (inviting friends, its ENS name, files, versions, drafts) is folded inside until asked for.
// The fold is the row's own state (Rule 4); `WorldRowShell` is only the layout.

import { errorLine, useT } from "@renderer/i18n";
import { useSessionStore } from "@renderer/state";
import { Button, Surface, Text } from "@renderer/ui";
import { type JSX, type ReactNode, useState } from "react";
import { type RemixDraft, WorldMore } from "../title/CartridgesPanel";
import type { WorldRow } from "./rows";
import { playWorld } from "./startWorld";

/** What every row shares with the panel: one busy flag, and the one remix form that may be open. */
export interface RowContext {
  busy: boolean;
  setBusy(busy: boolean): void;
  remix: RemixDraft | null;
  setRemix(remix: RemixDraft | null): void;
}

/** 更多 ▾ / 收起 ▴: opens or closes what a row (or the list) folds away. */
export function MoreButton({
  open,
  onToggle,
  label,
}: {
  open: boolean;
  onToggle(): void;
  label?: string;
}): JSX.Element {
  const t = useT();
  return (
    <Button variant="ghost" onClick={onToggle}>
      {open ? `${t("library.less")} ▴` : `${label ?? t("library.more")} ▾`}
    </Button>
  );
}

export function WorldRowShell({
  name,
  action,
  below,
  children,
}: {
  name: ReactNode;
  /** The row's one main button. */
  action: ReactNode;
  /** Shown under the row whether or not 更多 is open (an error the main button met). */
  below?: ReactNode;
  /** What 更多 shows; rendered only while it is open. */
  children: () => ReactNode;
}): JSX.Element {
  const [open, setOpen] = useState(false);
  return (
    <div className="world-row">
      <div className="world-row__head">
        <Text variant="title" as="h3" style={{ flex: 1, minWidth: 0 }}>
          {name}
        </Text>
        <div className="world-row__actions">
          {action}
          <MoreButton open={open} onToggle={() => setOpen(!open)} />
        </div>
      </div>
      {below}
      {open ? (
        <Surface variant="inset" padding="md">
          {children()}
        </Surface>
      ) : null}
    </div>
  );
}

/** A world installed here that has no save yet: its name and 開始 (a fresh start of it). */
export function UnplayedRow({
  row,
  name,
  context,
}: {
  row: Extract<WorldRow, { kind: "world" }>;
  name: string;
  context: RowContext;
}): JSX.Element {
  const t = useT();
  const { busy, setBusy } = context;
  const start = (): void => {
    if (row.playable === null) return;
    setBusy(true);
    void playWorld(row.playable).then((result) => {
      setBusy(false);
      if (!result.ok) useSessionStore.getState().toast("danger", errorLine(result.error));
    });
  };
  return (
    <WorldRowShell
      name={name}
      action={
        <Button variant="secondary" disabled={busy || row.playable === null} onClick={start}>
          {t("title.start")}
        </Button>
      }
      below={
        row.playable === null ? (
          <Text variant="caption" tone="dim">
            {t("library.needsUpdate")}
          </Text>
        ) : null
      }
    >
      {() => <WorldMore group={row.group} plays={row.playable} {...context} />}
    </WorldRowShell>
  );
}
