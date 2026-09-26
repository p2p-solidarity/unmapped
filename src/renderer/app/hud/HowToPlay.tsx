// How to play, in three or four short lines with big key caps: walk, E to talk / open / go in,
// follow the arrow to the next chapter (a world with a story), and play with friends (open land).
// Shown the first time Play opens on this device; "Got it" keeps it closed (a per-device preference
// in localStorage, Rule 2) and the dock's How to play button opens it again. It is a layer
// (`data-layer`) the pad and the keyboard reach: its button has the focus, and Escape (a pad's B)
// closes it instead of leaving Play.

import { useT } from "@renderer/i18n";
import { useInputDevice } from "@renderer/input";
import { topLayer } from "@renderer/input/focus";
import { useSessionStore } from "@renderer/state";
import { Button, colors, font, radius, Surface, space, Text, zIndex } from "@renderer/ui";
import { padGlyphs } from "@shared/input";
import { type JSX, type ReactNode, useEffect, useRef } from "react";

const SEEN_KEY = "unwritten.play.howToPlaySeen";

/** Whether this device has closed the card before (storage that cannot be read: not yet). */
export function howToPlaySeen(): boolean {
  try {
    return localStorage.getItem(SEEN_KEY) === "1";
  } catch {
    return false;
  }
}

function markSeen(): void {
  try {
    localStorage.setItem(SEEN_KEY, "1");
  } catch {
    // A preference that cannot be stored only lasts for this session.
  }
}

function Key({ label }: { label: string }): JSX.Element {
  return (
    <kbd
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        minWidth: 36,
        height: 36,
        padding: `0 ${space.sm}px`,
        fontFamily: font.mono,
        fontSize: font.size.bodyLarge,
        fontWeight: font.weight.bold,
        color: colors.accentInk,
        background: colors.accent,
        borderRadius: radius.md,
      }}
    >
      {label}
    </kbd>
  );
}

function Row({ keys, children }: { keys: readonly string[]; children: ReactNode }): JSX.Element {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: space.md, flexWrap: "wrap" }}>
      <div style={{ display: "flex", gap: space.xs }}>
        {keys.map((key) => (
          <Key key={key} label={key} />
        ))}
      </div>
      <Text variant="bodyLarge">{children}</Text>
    </div>
  );
}

export function HowToPlay({
  story,
  openLand,
  onClose,
}: {
  /** The world has a story: the arrow leads to its next chapter. */
  story: boolean;
  /** Open land: friends can come here (the door, F12). */
  openLand: boolean;
  onClose(): void;
}): JSX.Element {
  const t = useT();
  const pad = useInputDevice() !== "keys";
  const root = useRef<HTMLDivElement | null>(null);
  const close = useRef(onClose);
  close.current = onClose;
  const interact = pad ? padGlyphs(["E"]) : ["E"];

  const done = (): void => {
    markSeen();
    close.current();
  };

  // The keyboard starts on "Got it" (the pad finds it by `g-autofocus`).
  useEffect(() => {
    root.current?.querySelector<HTMLButtonElement>("button")?.focus({ preventScroll: true });
  }, []);

  // Escape (and a pad's B) closes this card rather than leaving Play — unless another layer is on
  // top of it (the console, a dialogue), whose own Escape comes first.
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key !== "Escape" && event.code !== "Escape") return;
      if (useSessionStore.getState().consoleOpen) return;
      if (root.current === null || topLayer() !== root.current) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      markSeen();
      close.current();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);

  return (
    <div
      ref={root}
      data-layer="how-to-play"
      role="dialog"
      aria-label={t("hud.helpTitle")}
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: zIndex.overlay,
        pointerEvents: "none",
      }}
    >
      <Surface
        variant="card"
        padding="lg"
        style={{
          width: "min(480px, 92%)",
          pointerEvents: "auto",
          display: "flex",
          flexDirection: "column",
          gap: space.md,
        }}
      >
        <Text variant="title" as="h2">
          {t("hud.helpTitle")}
        </Text>
        <Row keys={pad ? ["LS"] : ["W", "A", "S", "D"]}>{t("hud.helpWalk")}</Row>
        <Row keys={interact}>{t("hud.helpInteract")}</Row>
        {story ? <Row keys={["➜"]}>{t("hud.helpArrow")}</Row> : null}
        {!openLand ? null : pad ? (
          <Row keys={interact}>{t("hud.helpFriendsPad", { key: interact[0] ?? "A" })}</Row>
        ) : (
          <div style={{ display: "flex", alignItems: "center", gap: space.md, flexWrap: "wrap" }}>
            <Row keys={["F12"]}>{t("hud.helpFriends")}</Row>
            <Row keys={["Enter"]}>{t("hud.helpChat")}</Row>
          </div>
        )}
        <Button variant="primary" className="g-autofocus" hotkey="Esc" onClick={done}>
          {t("hud.helpOk")}
        </Button>
      </Surface>
    </div>
  );
}
