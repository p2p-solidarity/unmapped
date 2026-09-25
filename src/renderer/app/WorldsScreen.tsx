// Title screen: moving key art, the logo and one vertical menu. Picking CARTRIDGES / SYSTEM /
// ARCHIVE slides a panel in on the right; Esc closes it back to the menu.

import worldForgeArt from "@renderer/assets/generated/world-forge.png";
import { RoomPanel } from "@renderer/net";
import { useSessionStore } from "@renderer/state";
import { Button } from "@renderer/ui";
import { useState } from "react";
import { GameShell } from "./shell/GameShell";
import { cycle, useKeys } from "./shell/useKeys";
import { ArchivePanel } from "./title/ArchivePanel";
import { CartridgesPanel } from "./title/CartridgesPanel";
import { SystemPanel } from "./title/SystemPanel";
import { useLibrary } from "./title/useLibrary";
import { openInstance } from "./useInstanceLoader";

type PanelId = "join" | "cartridges" | "system" | "archive";

interface MenuItem {
  id: "continue" | "new" | "create" | PanelId;
  label: string;
  disabled: boolean;
}

export function WorldsScreen() {
  const setScreen = useSessionStore((state) => state.setScreen);
  const { data, refresh } = useLibrary();
  const [cursor, setCursor] = useState(0);
  const [panel, setPanel] = useState<PanelId | null>(null);

  const library = data.status === "ready" ? data.value : null;
  const latest = library?.instances[0] ?? null;

  const items: MenuItem[] = [
    { id: "continue", label: "Continue", disabled: latest === null },
    { id: "new", label: "New Game", disabled: false },
    { id: "create", label: "Create a game", disabled: false },
    { id: "join", label: "Join", disabled: false },
    { id: "cartridges", label: "Cartridges", disabled: false },
    { id: "system", label: "System", disabled: false },
  ];
  if (library !== null && library.legacy.length > 0) {
    items.push({ id: "archive", label: "Archive", disabled: false });
  }

  // Never rest on a disabled row (e.g. Continue before the first save exists).
  const current = items[cursor]?.disabled ? items.findIndex((item) => !item.disabled) : cursor;

  const activate = (item: MenuItem | undefined): void => {
    if (item === undefined || item.disabled) return;
    if (item.id === "continue") {
      if (latest !== null) void openInstance(latest.instanceId);
      return;
    }
    if (item.id === "new") setScreen("seed");
    else if (item.id === "create") setScreen("remix");
    else setPanel(item.id);
  };

  const move = (delta: number): void => {
    setCursor(() => {
      let next = current;
      for (let step = 0; step < items.length; step += 1) {
        next = cycle(next, delta, items.length);
        if (!items[next]?.disabled) return next;
      }
      return current;
    });
  };

  useKeys(
    {
      ArrowUp: () => move(-1),
      KeyW: () => move(-1),
      ArrowDown: () => move(1),
      KeyS: () => move(1),
      Enter: () => activate(items[current]),
      Space: () => activate(items[current]),
    },
    panel === null,
  );
  useKeys({ Escape: () => setPanel(null) }, panel === "join");

  const closePanel = (): void => setPanel(null);

  return (
    <GameShell
      art={worldForgeArt}
      hints={
        panel === null
          ? [
              { keys: ["↑", "↓"], label: "Select" },
              { keys: ["Enter"], label: "Confirm", onPress: () => activate(items[current]) },
            ]
          : [{ keys: ["Esc"], label: "Back", onPress: closePanel }]
      }
    >
      <div className="title">
        <div className="title__left">
          <h1 className="title__logo">
            Unwritten
            <br />
            Land
          </h1>
          <nav className="title__menu" aria-label="Main menu">
            {items.map((item, index) => (
              <Button
                key={item.id}
                variant="menu"
                active={panel === null ? current === index : panel === item.id}
                disabled={item.disabled}
                onMouseEnter={() => {
                  if (panel === null && !item.disabled) setCursor(index);
                }}
                onClick={() => {
                  setCursor(index);
                  activate(item);
                }}
              >
                {item.label}
              </Button>
            ))}
          </nav>
        </div>

        {panel === null ? null : (
          <section className="title__panel g-enter" key={panel}>
            {panel === "cartridges" ? (
              <CartridgesPanel data={data} refresh={refresh} onClose={closePanel} />
            ) : null}
            {panel === "system" ? <SystemPanel onClose={closePanel} /> : null}
            {panel === "join" ? <RoomPanel /> : null}
            {panel === "archive" ? (
              <ArchivePanel data={data} refresh={refresh} onClose={closePanel} />
            ) : null}
          </section>
        )}
      </div>
    </GameShell>
  );
}
