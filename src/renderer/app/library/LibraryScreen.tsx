// Title → Worlds: the one library screen. The sections on the left (./sections: My worlds, Join a
// world, the market, and the legacy archive when there is one); the chosen section's panel on the
// right. The screen opens with the first panel's main button focused (My worlds: 開始 on a new
// adventure), and pressing a section opens it and moves focus into its panel; Esc (or ← Title)
// goes back to the title. Everything comes from useLibrary's one Loadable.

import { useT } from "@renderer/i18n";
import { useSessionStore } from "@renderer/state";
import { Button } from "@renderer/ui";
import { type JSX, useEffect, useRef, useState } from "react";
import { GameShell } from "../shell/GameShell";
import { useLibrary } from "../title/useLibrary";
import { focusFirst, useArrowFocus, useInitialFocus } from "./focus";
import { SECTIONS } from "./sections";
import "./library.css";

export function LibraryScreen(): JSX.Element {
  const t = useT();
  const setScreen = useSessionStore((state) => state.setScreen);
  const { data, refresh } = useLibrary();
  const [sectionId, setSectionId] = useState(SECTIONS[0]?.id ?? "");
  /**
   * Bumped when a section is pressed, so its panel takes the focus once it has rendered. It starts
   * at 1: the first panel's main button has the focus when the screen opens (the nav holds it until
   * that button exists).
   */
  const [entered, setEntered] = useState(1);
  const navRef = useRef<HTMLElement>(null);
  const panelRef = useRef<HTMLElement>(null);

  const library = data.status === "ready" ? data.value : null;
  const shown = SECTIONS.filter(
    (section) => section.when === undefined || (library !== null && section.when(library)),
  );
  const current = shown.find((section) => section.id === sectionId) ?? shown[0];

  const back = (): void => setScreen("worlds");

  useInitialFocus(navRef, true);
  useArrowFocus(navRef, { claimIdle: true });
  useEffect(() => {
    if (entered === 0) return;
    const panel = panelRef.current;
    if (focusFirst(panel) || panel === null) return;
    // A panel still loading (New game waits for the built-in world) has nothing to focus yet: the
    // first control that appears takes focus, unless the player moved it elsewhere meanwhile.
    const from = document.activeElement;
    const observer = new MutationObserver(() => {
      if (document.activeElement !== from || focusFirst(panel)) observer.disconnect();
    });
    observer.observe(panel, { childList: true, subtree: true });
    const timer = window.setTimeout(() => observer.disconnect(), 10_000);
    return () => {
      observer.disconnect();
      window.clearTimeout(timer);
    };
  }, [entered]);

  const open = (id: string): void => {
    setSectionId(id);
    setEntered((count) => count + 1);
  };

  return (
    <GameShell
      hints={[
        { keys: ["↑", "↓"], label: t("title.hintSelect") },
        { keys: ["Esc"], label: t("common.back"), onPress: back },
      ]}
    >
      <div className="library">
        <div className="library__side">
          <div>
            <Button variant="ghost" onClick={back}>
              {t("library.backToTitle")}
            </Button>
          </div>
          <h1 className="library__heading">{t("library.heading")}</h1>
          <nav ref={navRef} className="library__nav" aria-label={t("library.sections")}>
            {shown.map((section) => (
              <Button
                key={section.id}
                variant="menu"
                active={section.id === current?.id}
                onClick={() => open(section.id)}
              >
                <span>{t(section.label)}</span>
                {section.count === undefined || library === null ? null : (
                  <span className="library__count">{section.count(library)}</span>
                )}
              </Button>
            ))}
          </nav>
        </div>
        {current === undefined ? null : (
          <section
            ref={panelRef}
            key={current.id}
            className="title__panel library__panel g-scroll g-enter"
            aria-label={t(current.label)}
          >
            <current.Panel data={data} refresh={refresh} onClose={back} />
          </section>
        )}
      </div>
    </GameShell>
  );
}
