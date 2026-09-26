// The browser proof's shell (rev 6 phase 4, D7): the smallest real client on a phone. It joins a
// shared world from an invite, then shows that world's land and lets the player walk it with the
// touch pad, read what its history holds, leave notes where they stand, and see the link, the outbox
// and what this browser keeps — through `window.seed.world` and the page's `PhoneDevice` only, which
// the page hands over before this mounts (src/browser). It mounts the one input poller, so a real pad
// and the on-screen touch pad drive it through the same action map as everywhere else.

import { useT } from "@renderer/i18n";
import { useGamepad } from "@renderer/input";
import { Button, StatePanel, space } from "@renderer/ui";
import { fromResult, type Loadable, loading } from "@shared/result";
import type { WorldBadge } from "@shared/worldApi";
import { type JSX, useCallback, useEffect, useState } from "react";
import { JoinPanel } from "./JoinPanel";
import type { PhoneDevice } from "./phoneDevice";
import { TOUCH_PAD_HEIGHT, TouchPad } from "./TouchPad";
import { WorldScreen } from "./WorldScreen";
import "./mobile.css";

/** `device`: the page's land and position keeper (./phoneDevice). */
export function MobileShell({ device }: { device: PhoneDevice }): JSX.Element {
  useGamepad();
  const t = useT();
  const [worlds, setWorlds] = useState<Loadable<WorldBadge[]>>(loading());
  const [open, setOpen] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);

  const load = useCallback(async (select?: string): Promise<void> => {
    const badges = await window.seed.world.badges();
    setWorlds(fromResult(badges));
    if (select !== undefined) setOpen(select);
    else if (badges.ok) setOpen((current) => current ?? badges.value[0]?.worldId ?? null);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (worlds.status === "ready" && worlds.value.length > 0 && open !== null && !joining) {
    return (
      <WorldScreen
        key={open}
        device={device}
        list={worlds.value}
        worldId={open}
        onOpen={setOpen}
        onJoinAnother={() => setJoining(true)}
      />
    );
  }

  return (
    <div
      className="mobile-shell"
      style={{ padding: space.lg, paddingBottom: TOUCH_PAD_HEIGHT + space.lg }}
    >
      <div style={{ maxWidth: 560, margin: "0 auto", display: "grid", gap: space.md }}>
        <StatePanel state={worlds}>
          {(list) => (
            <>
              <JoinPanel
                onJoined={(worldId) => {
                  setJoining(false);
                  void load(worldId);
                }}
              />
              {list.length > 0 && open !== null ? (
                <Button variant="ghost" onClick={() => setJoining(false)}>
                  {t("common.back")}
                </Button>
              ) : null}
            </>
          )}
        </StatePanel>
      </div>
      <TouchPad buttons={["a"]} />
    </div>
  );
}
