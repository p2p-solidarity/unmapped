// The on-screen gamepad of a phone (rev 6 phase 4, D7): a stick on the left and round buttons on
// the right, drawn with tokens only and at least HIT_TARGET wide. It writes the touch pad state
// (input/touch.ts), which the one poller reads as a standard-mapping pad; this component never
// decides what a control does. `data-nav-skip` keeps the pad's own parts out of focus navigation,
// and every pointer-down is prevented so touching the pad never moves focus off the list. It is
// hidden from assistive technology: everything it does is reachable through the page's own controls.

import {
  mountTouchPad,
  releaseTouchStick,
  setTouchButton,
  setTouchStick,
  stickAxes,
  type TouchButton,
} from "@renderer/input/touch";
import { colors, font, HIT_TARGET, space, surfaces, zIndex } from "@renderer/ui";
import { PAD_GLYPH } from "@shared/input";
import { type JSX, type PointerEvent, useEffect, useRef, useState } from "react";

/** Stick travel radius (px) and knob size: the knob stays a comfortable thumb target. */
const STICK = HIT_TARGET * 1.4;
const KNOB = HIT_TARGET + space.md;
const BUTTON = HIT_TARGET + space.lg;

function Stick(): JSX.Element {
  const [knob, setKnob] = useState<[number, number]>([0, 0]);
  const centre = useRef<[number, number] | null>(null);

  const move = (event: PointerEvent<HTMLDivElement>): void => {
    const at = centre.current;
    if (at === null) return;
    const [x, y] = stickAxes(event.clientX - at[0], event.clientY - at[1], STICK);
    setTouchStick(x, y);
    setKnob([x * STICK, y * STICK]);
  };
  const release = (): void => {
    centre.current = null;
    releaseTouchStick();
    setKnob([0, 0]);
  };

  return (
    <div
      data-touch="stick"
      onPointerDown={(event) => {
        event.preventDefault();
        event.currentTarget.setPointerCapture(event.pointerId);
        const box = event.currentTarget.getBoundingClientRect();
        centre.current = [box.left + box.width / 2, box.top + box.height / 2];
        move(event);
      }}
      onPointerMove={move}
      onPointerUp={release}
      onPointerCancel={release}
      style={{
        position: "relative",
        width: STICK * 2,
        height: STICK * 2,
        borderRadius: "50%",
        border: `1px solid ${colors.surfaceBorder}`,
        background: surfaces.windowSoft,
        touchAction: "none",
      }}
    >
      <div
        style={{
          position: "absolute",
          left: STICK - KNOB / 2 + knob[0],
          top: STICK - KNOB / 2 + knob[1],
          width: KNOB,
          height: KNOB,
          borderRadius: "50%",
          background: colors.accentSoft,
          border: `2px solid ${colors.accent}`,
          pointerEvents: "none",
        }}
      />
    </div>
  );
}

function PadButton({ button }: { button: TouchButton }): JSX.Element {
  const [down, setDown] = useState(false);
  const press = (on: boolean) => {
    setTouchButton(button, on);
    setDown(on);
  };
  return (
    <div
      data-touch={button}
      onPointerDown={(event) => {
        event.preventDefault();
        event.currentTarget.setPointerCapture(event.pointerId);
        press(true);
      }}
      onPointerUp={() => press(false)}
      onPointerCancel={() => press(false)}
      style={{
        width: BUTTON,
        height: BUTTON,
        borderRadius: "50%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        border: `2px solid ${down ? colors.accent : colors.surfaceBorder}`,
        background: down ? colors.accentSoft : surfaces.windowSoft,
        color: colors.text,
        fontFamily: font.family,
        fontSize: font.size.title,
        fontWeight: font.weight.bold,
        touchAction: "none",
        userSelect: "none",
      }}
    >
      {PAD_GLYPH[button]}
    </div>
  );
}

/** The pad, docked at the bottom of the screen. `buttons`: the ones the screen has a use for. */
export function TouchPad({ buttons }: { buttons: readonly TouchButton[] }): JSX.Element {
  useEffect(() => mountTouchPad(), []);
  return (
    <div
      data-nav-skip
      aria-hidden="true"
      style={{
        position: "fixed",
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: zIndex.hud,
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "space-between",
        padding: space.lg,
        pointerEvents: "none",
      }}
    >
      <div style={{ pointerEvents: "auto" }}>
        <Stick />
      </div>
      <div style={{ display: "flex", gap: space.md, pointerEvents: "auto" }}>
        {buttons.map((button) => (
          <PadButton key={button} button={button} />
        ))}
      </div>
    </div>
  );
}

/** Height the docked pad covers, so a scrolling screen can leave room under its last row. */
export const TOUCH_PAD_HEIGHT = STICK * 2 + space.lg * 2;
