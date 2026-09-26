// The emote wheel (rev 6 phase 3, D17): six emotes on T (the pad's LB), offered only while someone
// can see this player (a shared world, attached and online). Picking one shows a bubble over this
// player at once and rides the next presence frame to everyone else. The wheel is a layer: the pad
// moves focus around it, A picks, B / Escape / T close it; the keyboard's 1–6 pick directly.

import { type StringKey, useT } from "@renderer/i18n";
import { useEngineStore } from "@renderer/state";
import { Button, Surface, space, Text, zIndex } from "@renderer/ui";
import { EMOTE_CODE } from "@shared/input";
import { EMOTES, type Emote } from "@shared/worldProtocol";
import { type JSX, useCallback, useEffect, useRef, useState } from "react";
import { useKeys } from "../../engine/useKeys";
import { EMOTE_GLYPH } from "../../engine2d/presenceLayer";
import { sendEmote, usePresenceLive } from "../../net/worldPresence";

const LABEL: Readonly<Record<Emote, StringKey>> = {
  wave: "together.emote_wave",
  bow: "together.emote_bow",
  cheer: "together.emote_cheer",
  laugh: "together.emote_laugh",
  heart: "together.emote_heart",
  sit: "together.emote_sit",
};

const DIGITS = ["Digit1", "Digit2", "Digit3", "Digit4", "Digit5", "Digit6"] as const;
const RADIUS = 112;
const SIZE = 320;

/** `blocked` while the stream layer is open: the wheel neither opens nor stays open over it. */
export function EmoteWheel({
  blocked,
  onOpenChange,
}: {
  blocked: boolean;
  onOpenChange: (open: boolean) => void;
}): JSX.Element | null {
  const t = useT();
  const live = usePresenceLive();
  const openLand = useEngineStore((state) => state.chunk !== null);
  const available = live && openLand;
  const [open, setOpen] = useState(false);
  const state = useRef({ available, open, blocked });
  state.current = { available, open, blocked };

  const pick = useCallback((kind: Emote) => {
    sendEmote(kind);
    setOpen(false);
  }, []);

  useKeys(
    useCallback(
      (code: string) => {
        if (!state.current.available) return;
        if (code === EMOTE_CODE) {
          if (state.current.blocked) return;
          setOpen((was) => !was);
          return;
        }
        const at = DIGITS.indexOf(code as (typeof DIGITS)[number]);
        const kind = EMOTES[at];
        if (state.current.open && kind !== undefined) pick(kind);
      },
      [pick],
    ),
  );

  useEffect(() => {
    if (!available || blocked) setOpen(false);
  }, [available, blocked]);
  const shown = open && available;
  useEffect(() => onOpenChange(shown), [shown, onOpenChange]);

  // The wheel owns Escape (and the pad's B) while it is open, so it never leaves Play.
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent): void => {
      if (event.key !== "Escape" && event.code !== "Escape") return;
      event.preventDefault();
      event.stopImmediatePropagation();
      setOpen(false);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open]);

  if (!available) return null;
  if (!open) {
    return (
      <div style={{ position: "absolute", left: space.md, bottom: 112, pointerEvents: "auto" }}>
        <Button variant="chip" hotkey="T" onClick={() => setOpen(!blocked)}>
          {t("together.emoteTitle")}
        </Button>
      </div>
    );
  }
  return (
    <div
      data-layer="emote"
      role="dialog"
      aria-label={t("together.emoteTitle")}
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
      <div style={{ position: "relative", width: SIZE, height: SIZE, pointerEvents: "auto" }}>
        <Surface
          variant="overlay"
          padding="sm"
          style={{
            position: "absolute",
            left: SIZE / 2 - 56,
            top: SIZE / 2 - 22,
            width: 112,
            textAlign: "center",
          }}
        >
          <Text variant="label" tone="muted">
            {t("together.emoteTitle")}
          </Text>
        </Surface>
        {EMOTES.map((kind, at) => {
          const angle = ((at * 60 - 90) * Math.PI) / 180;
          return (
            <div
              key={kind}
              style={{
                position: "absolute",
                left: SIZE / 2 + Math.cos(angle) * RADIUS,
                top: SIZE / 2 + Math.sin(angle) * RADIUS,
                transform: "translate(-50%, -50%)",
              }}
            >
              <Button
                variant="secondary"
                className={at === 0 ? "g-autofocus" : undefined}
                hotkey={String(at + 1)}
                onClick={() => pick(kind)}
              >
                {`${EMOTE_GLYPH[kind]} ${t(LABEL[kind])}`}
              </Button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
