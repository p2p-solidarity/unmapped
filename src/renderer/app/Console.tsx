// The developer console (F12 / `). An overlay strip on the right third of the window: the world
// source, the karma ledger, the provider settings and the multiplayer room all in one place.

import { useSessionStore } from "@renderer/state";
import { Button, colors, Surface, space, Text, zIndex } from "@renderer/ui";
import { useState } from "react";
import { InferenceTab } from "./console/InferenceTab";
import { KarmaTab } from "./console/KarmaTab";
import { MultiplayerTab } from "./console/MultiplayerTab";
import { WorldTab } from "./console/WorldTab";

const TABS = ["World", "Karma", "Inference", "Multiplayer"] as const;
type ConsoleTab = (typeof TABS)[number];

function TabBody({ tab }: { tab: ConsoleTab }) {
  switch (tab) {
    case "World":
      return <WorldTab />;
    case "Karma":
      return <KarmaTab />;
    case "Inference":
      return <InferenceTab />;
    case "Multiplayer":
      return <MultiplayerTab />;
  }
}

export function Console() {
  const [tab, setTab] = useState<ConsoleTab>("World");
  const toggleConsole = useSessionStore((state) => state.toggleConsole);

  return (
    <div
      style={{
        position: "absolute",
        top: 0,
        right: 0,
        bottom: 0,
        width: "34%",
        minWidth: 420,
        maxWidth: 720,
        display: "flex",
        zIndex: zIndex.console,
      }}
    >
      <Surface
        variant="overlay"
        padding="md"
        style={{
          flex: 1,
          minHeight: 0,
          borderRadius: 0,
          borderRight: "none",
          borderTop: "none",
          borderBottom: "none",
          gap: space.md,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: space.sm,
          }}
        >
          <Text variant="label" tone="muted">
            CONSOLE
          </Text>
          <Button variant="ghost" hotkey="Esc" onClick={() => toggleConsole(false)}>
            Close
          </Button>
        </div>

        <div
          style={{
            display: "flex",
            gap: space.xs,
            flexWrap: "wrap",
            borderBottom: `1px solid ${colors.surfaceBorder}`,
            paddingBottom: space.sm,
          }}
        >
          {TABS.map((name) => (
            <Button
              key={name}
              variant={tab === name ? "primary" : "ghost"}
              onClick={() => setTab(name)}
              style={{ paddingLeft: space.md, paddingRight: space.md }}
            >
              {name}
            </Button>
          ))}
        </div>

        <div
          style={{
            flex: 1,
            minHeight: 0,
            overflowY: "auto",
            display: "flex",
            flexDirection: "column",
            gap: space.md,
          }}
        >
          <TabBody tab={tab} />
        </div>
      </Surface>
    </div>
  );
}
