// A joined world's land on the phone (rev 6 phase 4, D7): the one land view (`LandView2D`, in the
// 16-bit look) over the stores `showWorldLand` fills from the world's own fold, walked with the
// docked touch pad through the one action map. While it is up the session's screen is "play", so the
// pad's stick walks and Y opens the world (the land's notes key); a tap on the ground walks there,
// as a click does on the desktop.
//
// Where the player stands is kept per world on this device every few seconds, when the page is
// hidden and on leaving (`PhoneDevice.keepPosition`), and the next visit starts there. Other members
// are drawn from the service's presence while it answers (./usePhonePresence).

import { samplePlayer } from "@renderer/engine/playerProbe";
import { LandView2D } from "@renderer/engine2d";
import { hideWorldLand, showWorldLand } from "@renderer/history/showWorldLand";
import { errorLine, useT } from "@renderer/i18n";
import { useEngineStore, useSessionStore } from "@renderer/state";
import { Surface, space, Text } from "@renderer/ui";
import type { AppError } from "@shared/result";
import { type JSX, useEffect, useLayoutEffect, useState } from "react";
import type { PhoneDevice, PhoneLand } from "./phoneDevice";
import { usePhonePresence } from "./usePhonePresence";
import type { SharedWorldView } from "./useSharedWorld";

/** How often where the player stands is kept while walking. */
const KEEP_MS = 3000;

/** Keeps where the player stands in this world; the last failure to keep it, else null. */
function useKeptPosition(
  device: PhoneDevice,
  worldId: string,
  sceneId: string | null,
): AppError | null {
  const [failed, setFailed] = useState<AppError | null>(null);
  useEffect(() => {
    if (sceneId === null) return;
    let kept = "";
    const keep = (): void => {
      const at = samplePlayer();
      if (at === null || at.sceneId !== sceneId) return;
      const key = `${at.x.toFixed(2)},${at.z.toFixed(2)},${at.yaw.toFixed(2)}`;
      if (key === kept) return;
      kept = key;
      void device.keepPosition(worldId, at).then((done) => {
        setFailed(done.ok ? null : done.error);
      });
    };
    const hidden = (): void => {
      if (document.visibilityState === "hidden") keep();
    };
    const timer = setInterval(keep, KEEP_MS);
    window.addEventListener("pagehide", keep);
    document.addEventListener("visibilitychange", hidden);
    return () => {
      clearInterval(timer);
      window.removeEventListener("pagehide", keep);
      document.removeEventListener("visibilitychange", hidden);
      keep();
    };
  }, [device, worldId, sceneId]);
  return failed;
}

function LandBar({ view, unkept }: { view: SharedWorldView; unkept: AppError | null }) {
  const t = useT();
  const { now, status } = view;
  // A removed key writes nothing, whatever the link: "what you write waits here" would be untrue.
  const removed = status.role === "removed";
  const link = removed ? t("mobile.role_removed") : t(`mobile.link_${status.link}`);
  const tone = removed
    ? "danger"
    : status.link === "online"
      ? "success"
      : status.link === "connecting"
        ? "muted"
        : "danger";
  return (
    <Surface
      variant="overlay"
      padding="sm"
      style={{
        position: "absolute",
        top: space.sm,
        left: space.sm,
        right: space.sm,
        gap: space.xs,
        pointerEvents: "none",
      }}
    >
      <Text variant="label" as="h1">
        {now.genesis.body.name}
      </Text>
      <Text variant="caption" tone={tone}>
        {`${link} · ${t("mobile.syncLine", {
          n: status.head.n,
          pending: status.pending,
          refused: status.refused,
        })}`}
      </Text>
      <Text variant="caption" tone="dim">
        {t("mobile.landHint")}
      </Text>
      {unkept === null ? null : (
        <Text variant="caption" tone="danger">
          {t("mobile.positionUnkept", { reason: errorLine(unkept) })}
        </Text>
      )}
    </Surface>
  );
}

export function LandScreen({
  worldId,
  land,
  view,
  device,
}: {
  worldId: string;
  land: PhoneLand;
  view: SharedWorldView;
  device: PhoneDevice;
}): JSX.Element {
  const [shown, setShown] = useState(false);
  const { now, status } = view;

  // Before the land view mounts (it reads the seed and where to stand as it first renders), and on
  // every fold change after.
  useLayoutEffect(() => {
    const { seed, cartridge } = now.genesis.body;
    showWorldLand(worldId, now, land.graph, { seed, cartridge }, land);
    setShown(true);
  }, [worldId, now, land]);
  useEffect(() => () => hideWorldLand(), []);

  useEffect(() => {
    useSessionStore.getState().setScreen("play");
    // The plan's look for the proof: the 16-bit canvas needs no WebGL on a phone.
    useEngineStore.getState().setLandLook("pixel");
    return () => useSessionStore.getState().setScreen("worlds");
  }, []);

  const unkept = useKeptPosition(device, worldId, land.graph.contract?.sceneId ?? null);
  usePhonePresence({ worldId, online: status.link === "online", now, me: status.me });

  return (
    <div style={{ position: "fixed", inset: 0, overflow: "hidden" }}>
      {shown ? <LandView2D rawGraph={land.graph} gameplayRules={land.rules} /> : null}
      <LandBar view={view} unkept={unkept} />
    </div>
  );
}
