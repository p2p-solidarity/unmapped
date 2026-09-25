// Title screen: the logo and one vertical menu over the live HD-2D land (App's MenuBackdrop) —
// Continue (the latest save) · Worlds (the library screen) · Create World · Settings. Settings
// slides in on the right as a dialog layer (role="dialog", the menu behind it inert); Esc closes it.
// The menu is driven by DOM focus: ↑/↓ (or a pad) move it, Enter / A presses the focused row.

import { useT } from "@renderer/i18n";
import { useSessionStore } from "@renderer/state";
import { Button } from "@renderer/ui";
import { useEffect, useRef, useState } from "react";
import { focusButton, focusFirst, useArrowFocus, useInitialFocus } from "./library/focus";
import { GameShell } from "./shell/GameShell";
import { SystemPanel } from "./title/SystemPanel";
import { useLibrary } from "./title/useLibrary";
import { openInstance } from "./useInstanceLoader";

interface MenuItem {
  id: "continue" | "library" | "create" | "settings";
  label: string;
  disabled: boolean;
}

/** Row of Settings in the menu, where the focus returns when its dialog closes. */
const SETTINGS_ROW = 3;

export function WorldsScreen() {
  const t = useT();
  const setScreen = useSessionStore((state) => state.setScreen);
  const { data } = useLibrary();
  const [cursor, setCursor] = useState(0);
  const [settings, setSettings] = useState(false);
  const menuRef = useRef<HTMLElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const settingsWasOpen = useRef(false);

  const latest = data.status === "ready" ? (data.value.instances[0] ?? null) : null;

  const items: MenuItem[] = [
    { id: "continue", label: t("title.menuContinue"), disabled: latest === null },
    { id: "library", label: t("title.menuWorlds"), disabled: false },
    { id: "create", label: t("title.menuCreate"), disabled: false },
    { id: "settings", label: t("title.menuSettings"), disabled: false },
  ];

  // Never rest on a disabled row (e.g. Continue before the first save exists).
  const current = items[cursor]?.disabled ? items.findIndex((item) => !item.disabled) : cursor;

  const activate = (item: MenuItem | undefined): void => {
    if (item === undefined || item.disabled) return;
    if (item.id === "continue") {
      if (latest !== null) void openInstance(latest.instanceId);
    } else if (item.id === "library") setScreen("library");
    else if (item.id === "create") setScreen("create");
    else setSettings(true);
  };

  // First focus waits for the saves, which decide whether Continue is the first enabled row.
  useInitialFocus(menuRef, data.status === "ready" || data.status === "error");
  useArrowFocus(menuRef, { enabled: !settings, claimIdle: true });

  // Opening Settings moves focus into its layer; closing it gives the focus back to its row.
  useEffect(() => {
    if (settings) {
      settingsWasOpen.current = true;
      focusFirst(dialogRef.current);
    } else if (settingsWasOpen.current) {
      settingsWasOpen.current = false;
      focusButton(menuRef.current, SETTINGS_ROW);
    }
  }, [settings]);

  const closeSettings = (): void => setSettings(false);

  return (
    <GameShell
      hints={
        settings
          ? [{ keys: ["Esc"], label: t("common.back"), onPress: closeSettings }]
          : [
              { keys: ["↑", "↓"], label: t("title.hintSelect") },
              {
                keys: ["Enter"],
                label: t("title.hintConfirm"),
                onPress: () => activate(items[current]),
              },
            ]
      }
    >
      <div className="title">
        <div className="title__left" inert={settings}>
          <div className="title__crest">
            <h1 className="title__logo">UNMAPPED</h1>
            <div className="title__rule" aria-hidden="true" />
            <p className="title__sub">無界之地</p>
            <p className="title__tagline">{t("common.tagline")}</p>
          </div>
          {/* While the saves load the pad leaves the menu alone, so its first focus is the one
              useInitialFocus gives (Continue once there is a save), not the first row enabled so far. */}
          <nav
            ref={menuRef}
            className="title__menu"
            aria-label={t("title.mainMenu")}
            data-nav-skip={data.status === "idle" || data.status === "loading" ? true : undefined}
          >
            {items.map((item, index) => (
              <Button
                key={item.id}
                variant="menu"
                active={settings ? item.id === "settings" : current === index}
                disabled={item.disabled}
                onFocus={() => setCursor(index)}
                onMouseEnter={() => {
                  if (!settings && !item.disabled) focusButton(menuRef.current, index);
                }}
                onClick={() => activate(item)}
              >
                {item.label}
              </Button>
            ))}
          </nav>
        </div>

        {settings ? (
          <section
            ref={dialogRef}
            className="title__panel g-enter"
            role="dialog"
            aria-modal="true"
            aria-label={t("title.menuSettings")}
          >
            <SystemPanel onClose={closeSettings} />
          </section>
        ) : null}
      </div>
    </GameShell>
  );
}
