// The browser proof's shell (rev 6 phase 4, D7): the smallest real client on a phone. It joins a
// shared world from an invite, lists what the world's history holds, leaves notes, and shows the
// link, the outbox and what this browser keeps — through `window.seed.world` only, which the page
// installs before this mounts (src/browser). It mounts the one input poller, so a real pad and the
// on-screen touch pad drive it through the same action map as everywhere else.
//
// The land itself is not drawn here yet: LandView2D reads the desktop's land and session stores,
// which this client does not fill (the plan's note on the shared land stores).

import { useT } from "@renderer/i18n";
import { useGamepad } from "@renderer/input";
import { Button, StatePanel, space, Text } from "@renderer/ui";
import { fromResult, type Loadable, loading } from "@shared/result";
import type { WorldBadge } from "@shared/worldApi";
import { type JSX, useCallback, useEffect, useState } from "react";
import { JoinPanel } from "./JoinPanel";
import type { PhoneDevice } from "./phoneDevice";
import { TOUCH_PAD_HEIGHT, TouchPad } from "./TouchPad";
import { WorldPanel } from "./WorldPanel";
import "./mobile.css";

function Worlds({
  list,
  open,
  onOpen,
}: {
  list: WorldBadge[];
  open: string;
  onOpen: (worldId: string) => void;
}): JSX.Element | null {
  const t = useT();
  if (list.length < 2) return null;
  return (
    <div style={{ display: "grid", gap: space.xs }}>
      <Text variant="caption" tone="dim">
        {t("mobile.worldsTitle")}
      </Text>
      <div style={{ display: "flex", flexWrap: "wrap", gap: space.sm }}>
        {list.map((badge) => (
          <Button
            key={badge.worldId}
            variant="chip"
            active={badge.worldId === open}
            onClick={() => onOpen(badge.worldId)}
          >
            {badge.ownerName ?? badge.worldId.slice(0, 9)}
          </Button>
        ))}
      </div>
    </div>
  );
}

/** `device`: the page's land and position keeper (./phoneDevice); the land view is not mounted yet. */
export function MobileShell(_props: { device: PhoneDevice }): JSX.Element {
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

  return (
    <div
      className="mobile-shell"
      style={{ padding: space.lg, paddingBottom: TOUCH_PAD_HEIGHT + space.lg }}
    >
      <div style={{ maxWidth: 560, margin: "0 auto", display: "grid", gap: space.md }}>
        <StatePanel state={worlds}>
          {(list) =>
            list.length === 0 || joining || open === null ? (
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
            ) : (
              <>
                <Worlds list={list} open={open} onOpen={setOpen} />
                <WorldPanel key={open} worldId={open} />
                <Button variant="secondary" fullWidth onClick={() => setJoining(true)}>
                  {t("mobile.joinAnother")}
                </Button>
              </>
            )
          }
        </StatePanel>
      </div>
      <TouchPad buttons={["a"]} />
    </div>
  );
}
