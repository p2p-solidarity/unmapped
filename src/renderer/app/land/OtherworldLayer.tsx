// The otherworld layer over Play (異界): the sandboxed player of the entrance the player walked into,
// or the workshop writing a new otherworld. Same WorkFrame, sandbox, CSP and frame guard as the AI
// Worlds library (Rule 12) — this layer only frames it. It is a dialog layer (gamepad focus stays
// inside it) and owns Escape while open, so Escape leaves the otherworld, never Play under it.

import { useT } from "@renderer/i18n";
import { useSessionStore } from "@renderer/state";
import { Button, colors, StatePanel, space, Text, zIndex } from "@renderer/ui";
import { PlayerView } from "@renderer/works/PlayerView";
import { WorkshopView } from "@renderer/works/WorkshopView";
import type { WorkManifest } from "@shared/works";
import { type JSX, useCallback, useEffect, useRef, useState } from "react";
import {
  closeOtherworld,
  completeOtherworld,
  type OtherworldLayer as Layer,
  toastPlaced,
  useOtherworldStore,
} from "./OtherworldState";
import { placeOtherworld } from "./places";

function PlayLayer({ layer }: { layer: Extract<Layer, { kind: "play" }> }): JSX.Element {
  const t = useT();
  if (layer.play.status === "ready") {
    return (
      <PlayerView
        playId={layer.play.value}
        onExit={closeOtherworld}
        exitLabel={t("land.otherworldLeave")}
        onComplete={completeOtherworld}
      />
    );
  }
  return (
    <div
      style={{
        padding: space.xl,
        display: "flex",
        flexDirection: "column",
        gap: space.md,
        maxWidth: 640,
      }}
    >
      <Text variant="label" tone="accent">
        {t("land.otherworld")}
      </Text>
      <Text variant="title" as="h2">
        {layer.title}
      </Text>
      <StatePanel state={layer.play} loadingText={t("land.otherworldOpening")}>
        {() => null}
      </StatePanel>
      <Button variant="primary" onClick={closeOtherworld}>
        {t("land.otherworldLeave")}
      </Button>
    </div>
  );
}

function WorkshopLayer({
  layer,
  onBusyChange,
}: {
  layer: Extract<Layer, { kind: "workshop" }>;
  onBusyChange: (busy: boolean) => void;
}): JSX.Element {
  const t = useT();
  // The first version saved here places the entrance and hands the land back.
  const written = useCallback(
    (manifest: WorkManifest) => {
      const now = useOtherworldStore.getState().layer;
      if (now?.kind !== "workshop" || now.draftId !== layer.draftId) return;
      toastPlaced(placeOtherworld(manifest, now.wish));
      closeOtherworld();
    },
    [layer.draftId],
  );
  return (
    <WorkshopView
      draftId={layer.draftId}
      initialRequest={layer.initialRequest}
      onExit={closeOtherworld}
      exitLabel={t("land.otherworldBackToLand")}
      from={layer.from}
      onPublished={written}
      onBusyChange={onBusyChange}
    />
  );
}

export function OtherworldLayer(): JSX.Element | null {
  const t = useT();
  const layer = useOtherworldStore((state) => state.layer);
  const instanceId = useSessionStore(
    (state) => state.activeInstance?.instance.meta.instanceId ?? null,
  );
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(busy);
  busyRef.current = busy;
  const open = layer !== null;

  // Leaving Play, or another save opening, closes the layer and gives the land back.
  // biome-ignore lint/correctness/useExhaustiveDependencies: keyed by the save being played
  useEffect(() => () => closeOtherworld(), [instanceId]);

  useEffect(() => {
    if (!open) {
      setBusy(false);
      return;
    }
    const onKey = (event: KeyboardEvent): void => {
      if (event.key !== "Escape" && event.code !== "Escape") return;
      // The console over this layer keeps its own Escape.
      if (useSessionStore.getState().consoleOpen) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      // A world being written or drawn finishes first; its own back button waits too.
      if (!busyRef.current) closeOtherworld();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open]);

  if (layer === null) return null;
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={layer.kind === "play" ? layer.title : t("land.otherworld")}
      data-layer="otherworld"
      style={{
        position: "absolute",
        inset: 0,
        zIndex: zIndex.overlay,
        background: colors.bg,
        display: "flex",
        flexDirection: "column",
      }}
    >
      {layer.kind === "play" ? (
        <PlayLayer layer={layer} />
      ) : (
        <WorkshopLayer layer={layer} onBusyChange={setBusy} />
      )}
    </div>
  );
}
