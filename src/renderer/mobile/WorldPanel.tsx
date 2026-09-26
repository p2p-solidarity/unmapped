// One joined world on a phone (rev 6 phase 4, D7): its genesis name and maker, the link and the
// outbox, anything the world refused (listed until dismissed, Rule 2), the note composer, and the
// lists of what its history holds. Everything is read through `window.seed.world` and folded by
// `useSharedWorld`.

import { errorLine, useT } from "@renderer/i18n";
import { Button, ErrorBlock, StatePanel, Surface, space, Text } from "@renderer/ui";
import type { JSX } from "react";
import { NoteComposer } from "./NoteComposer";
import { StoragePanel } from "./StoragePanel";
import { type SharedWorldView, useSharedWorld } from "./useSharedWorld";
import { WorldLists } from "./WorldLists";

function Header({ view }: { view: SharedWorldView }): JSX.Element {
  const t = useT();
  const { now, status } = view;
  const owner = now.names[now.owner] ?? t("mobile.someone");
  return (
    <Surface variant="card" padding="md">
      <Text variant="titleLarge" as="h1">
        {now.genesis.body.name}
      </Text>
      <Text variant="caption" tone="muted">
        {t("mobile.madeBy", { name: owner })}
        {" · "}
        {t(`mobile.role_${status.role}`)}
      </Text>
      <Text
        variant="label"
        tone={
          status.link === "online" ? "success" : status.link === "connecting" ? "muted" : "danger"
        }
      >
        {t(`mobile.link_${status.link}`)}
      </Text>
      <Text variant="caption" tone="dim" mono>
        {t("mobile.syncLine", {
          n: status.head.n,
          pending: status.pending,
          refused: status.refused,
        })}
      </Text>
      {status.newer > 0 ? (
        <Text variant="caption" tone="dim">
          {t("mobile.newer", { n: status.newer })}
        </Text>
      ) : null}
      {status.head.n === 0 ? (
        <Text variant="body" tone="muted">
          {t("mobile.historyMissing")}
        </Text>
      ) : null}
      {status.error === null ? null : <ErrorBlock error={status.error} />}
    </Surface>
  );
}

function Refused({
  worldId,
  view,
}: {
  worldId: string;
  view: SharedWorldView;
}): JSX.Element | null {
  const t = useT();
  if (view.refused.length === 0) return null;
  return (
    <Surface variant="inset" padding="md">
      <Text variant="label" tone="danger" as="h3">
        {t("mobile.refusedTitle")}
      </Text>
      {view.refused.map((one) => (
        <div key={one.event.id} style={{ display: "grid", gap: space.xs }}>
          <Text variant="caption" tone="muted">
            {`${String(one.event.kind)} · ${errorLine(one.error)}`}
          </Text>
          <Button
            variant="secondary"
            onClick={() => void window.seed.world.dismissRefused(worldId, one.event.id)}
          >
            {t("mobile.dismiss")}
          </Button>
        </div>
      ))}
    </Surface>
  );
}

export function WorldPanel({ worldId }: { worldId: string }): JSX.Element {
  const state = useSharedWorld(worldId);
  return (
    <StatePanel state={state}>
      {(view) => (
        <div style={{ display: "grid", gap: space.md }}>
          <Header view={view} />
          <Refused worldId={worldId} view={view} />
          <NoteComposer worldId={worldId} now={view.now} status={view.status} />
          <WorldLists now={view.now} />
          <StoragePanel key={`${view.status.head.n}:${view.status.pending}`} />
        </div>
      )}
    </StatePanel>
  );
}
