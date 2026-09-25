// The one gamepad poller (plan rev6-phase2 D4): a rAF read of navigator.getGamepads(), started once
// by App. Every frame it decides where the pad's input goes:
//
// - play: the Play screen with the controls free (not `engineStore.inputLocked`) and no layer open
//   over the land. Held controls hold the keys their actions are bound to in the engine's held set
//   (`setPadKeys`) and fresh presses go down the key-down path (`pressPadKey`), so LandView2D, the
//   place views and the 3D player read the pad as keys. Start sends Escape (what Esc does in Play).
// - menu: anywhere else, or while a layer is open. The pad moves focus spatially in the top-most
//   layer (focus.ts), A clicks, B and Start send Escape; a held direction repeats.
//
// A control still held when the mode flips is ignored until it is released, so the A that picked a
// dialogue choice never also talks to whoever stands there, and the B that closed a panel never jumps.
// Per-frame state lives in this closure, never in a store (Rule 4).

import { useEngineStore, useSessionStore, useWorldStore } from "@renderer/state";
import {
  freshPresses,
  MENU_LAYOUT,
  PAD_DEAD_ZONE,
  PAD_MENU_DEAD_ZONE,
  type PadControl,
  type PadSnapshot,
  PLAY_LAYOUT,
  padActive,
  padControls,
  playCode,
  playCodes,
  repeatDue,
} from "@shared/input";
import { useEffect } from "react";
import { pressPadKey, setPadKeys } from "../engine/useKeys";
import { inputDevice, setInputDevice, watchKeyboardAndMouse } from "./device";
import {
  clickFocused,
  ensureFocus,
  focusScope,
  frameFocused,
  moveFocus,
  pressEscape,
  topLayer,
} from "./focus";
import type { Direction } from "./spatial";

type Mode = "play" | "menu";

const NONE: ReadonlySet<string> = new Set();
const DIRECTIONS: Readonly<Partial<Record<PadControl, Direction>>> = {
  up: "up",
  down: "down",
  left: "left",
  right: "right",
};

/** The first connected pad, preferring one in the standard mapping; null when there is none. */
function readPad(): PadSnapshot | null {
  const pads = [...(navigator.getGamepads?.() ?? [])].filter(
    (pad): pad is Gamepad => pad?.connected === true,
  );
  const pad = pads.find((one) => one.mapping === "standard") ?? pads[0];
  if (pad === undefined) return null;
  return {
    buttons: pad.buttons.map((button) => Math.max(button.value, button.pressed ? 1 : 0)),
    axes: pad.axes,
  };
}

function currentMode(): Mode {
  if (useSessionStore.getState().screen !== "play") return "menu";
  if (useEngineStore.getState().inputLocked) return "menu";
  return topLayer() === null ? "play" : "menu";
}

/** The bindings of whatever is being played: a place's own rules, else the world's. */
function bindings() {
  const place = useSessionStore.getState().place;
  return (place?.rules ?? useWorldStore.getState().gameplayRules)?.bindings;
}

function play(live: ReadonlySet<PadControl>, fresh: readonly PadControl[]): void {
  const bound = bindings();
  setPadKeys(playCodes(live, bound));
  for (const control of fresh) {
    const input = PLAY_LAYOUT[control];
    if (input.kind === "menu") {
      pressEscape();
      continue;
    }
    const code = playCode(input, bound);
    if (code !== null) pressPadKey(code);
  }
}

export function startGamepadPoller(): () => void {
  let frame = 0;
  let mode: Mode | null = null;
  let previous = new Set<PadControl>();
  const latched = new Set<PadControl>();
  const heldSince = new Map<PadControl, number>();
  const firedAt = new Map<PadControl, number>();

  const menu = (live: ReadonlySet<PadControl>, fresh: readonly PadControl[], now: number): void => {
    if (frameFocused()) {
      if (fresh.includes("start")) pressEscape();
      return;
    }
    for (const control of [...heldSince.keys()]) {
      if (!live.has(control)) {
        heldSince.delete(control);
        firedAt.delete(control);
      }
    }
    for (const control of live) {
      const direction = DIRECTIONS[control];
      if (direction === undefined) continue;
      if (fresh.includes(control)) {
        heldSince.set(control, now);
        firedAt.set(control, now);
        moveFocus(direction);
      } else if (
        repeatDue(now - (heldSince.get(control) ?? now), now - (firedAt.get(control) ?? now))
      ) {
        firedAt.set(control, now);
        moveFocus(direction);
      }
    }
    for (const control of fresh) {
      const action = MENU_LAYOUT[control];
      if (action === "confirm") clickFocused();
      else if (action === "back" || action === "menu") pressEscape();
    }
  };

  const tick = (now: number): void => {
    frame = requestAnimationFrame(tick);
    const snapshot = readPad();
    if (snapshot === null) {
      if (previous.size > 0 || mode === "play") setPadKeys(NONE);
      previous = new Set();
      mode = null;
      return;
    }
    if (padActive(snapshot)) setInputDevice("pad");
    const next = currentMode();
    const held = padControls(snapshot, next === "play" ? PAD_DEAD_ZONE : PAD_MENU_DEAD_ZONE);
    if (next !== mode) {
      if (mode === "play") setPadKeys(NONE);
      // A pad that just appeared is no flip: browsers reveal a pad on its first press, and that
      // press is the player's first input, so it counts.
      const appeared = mode === null;
      mode = next;
      latched.clear();
      if (!appeared) for (const control of held) latched.add(control);
      heldSince.clear();
      firedAt.clear();
    }
    for (const control of [...latched]) if (!held.has(control)) latched.delete(control);
    const live = new Set([...held].filter((control) => !latched.has(control)));
    const fresh = freshPresses(previous, live);
    previous = live;
    if (mode === "play") {
      play(live, fresh);
      return;
    }
    menu(live, fresh, now);
    // A pad user always has something focused in a layer (and in the menus), so A works at once.
    const session = useSessionStore.getState();
    if (inputDevice() === "pad" && (session.screen !== "play" || topLayer() !== null)) {
      ensureFocus(focusScope());
    }
  };

  frame = requestAnimationFrame(tick);
  return () => {
    cancelAnimationFrame(frame);
    setPadKeys(NONE);
  };
}

/** Mounted once by App: the poller, and the keyboard / mouse watch that switches hints back. */
export function useGamepad(): void {
  useEffect(() => {
    const stopWatch = watchKeyboardAndMouse();
    const stopPoll = startGamepadPoller();
    return () => {
      stopPoll();
      stopWatch();
    };
  }, []);
}
