// Touch as one more gamepad (rev 6 phase 4, D7): the on-screen stick and buttons of a phone
// (mobile/TouchPad.tsx) write a standard-mapping `PadSnapshot`, and the one poller
// (./gamepad.ts `readPad`) merges it with any real pad. So touch goes through the same action map
// as the keyboard and the pad (@shared/input): on the land the stick walks and A interacts, in a
// menu the stick moves focus and A confirms. engine2d never learns touch exists.
//
// Per-frame input, so a module closure (Rule 4), never a store. The snapshot is null while no
// touch pad is on screen, so a desktop without one reads exactly as before.

import { PAD_AXIS, PAD_BUTTON, type PadSnapshot } from "@shared/input";

/** The buttons a touch pad can show, by their printed glyph. */
export const TOUCH_BUTTONS = { a: PAD_BUTTON.a, y: PAD_BUTTON.y } as const;
export type TouchButton = keyof typeof TOUCH_BUTTONS;

const BUTTONS = 17;
const AXES = 4;

const state = { mounted: 0, x: 0, y: 0, held: new Set<number>() };

/** A touch pad appeared on screen; the returned function removes it (and lets go of it). */
export function mountTouchPad(): () => void {
  state.mounted += 1;
  return () => {
    state.mounted = Math.max(0, state.mounted - 1);
    if (state.mounted === 0) {
      state.x = 0;
      state.y = 0;
      state.held.clear();
    }
  };
}

/**
 * The stick's axes for a finger `dx`, `dy` pixels from its centre (screen y grows down, as the
 * standard mapping's does): proportional inside `radius`, clamped to the unit circle outside it.
 */
export function stickAxes(dx: number, dy: number, radius: number): [number, number] {
  if (!(radius > 0) || !Number.isFinite(dx) || !Number.isFinite(dy)) return [0, 0];
  const length = Math.hypot(dx, dy) / radius;
  const scale = length > 1 ? 1 / length : 1;
  return [(dx / radius) * scale, (dy / radius) * scale];
}

export function setTouchStick(x: number, y: number): void {
  state.x = x;
  state.y = y;
}

export function releaseTouchStick(): void {
  state.x = 0;
  state.y = 0;
}

export function setTouchButton(button: TouchButton, down: boolean): void {
  if (down) state.held.add(TOUCH_BUTTONS[button]);
  else state.held.delete(TOUCH_BUTTONS[button]);
}

/** Whether a finger is on the touch pad now (the poller then calls the device "touch"). */
export function touchHeld(): boolean {
  return state.held.size > 0 || state.x !== 0 || state.y !== 0;
}

/** The touch pad as a standard-mapping snapshot, or null when none is on screen. */
export function touchSnapshot(): PadSnapshot | null {
  if (state.mounted === 0) return null;
  const buttons = Array.from({ length: BUTTONS }, (_, index) => (state.held.has(index) ? 1 : 0));
  const axes = Array.from({ length: AXES }, () => 0);
  axes[PAD_AXIS.lx] = state.x;
  axes[PAD_AXIS.ly] = state.y;
  return { buttons, axes };
}

/**
 * Two pads read as one: a button counts when either holds it, and each axis follows whichever
 * leans further. Null only when both are.
 */
export function mergePads(a: PadSnapshot | null, b: PadSnapshot | null): PadSnapshot | null {
  if (a === null) return b;
  if (b === null) return a;
  const buttons = Array.from({ length: Math.max(a.buttons.length, b.buttons.length) }, (_, i) =>
    Math.max(a.buttons[i] ?? 0, b.buttons[i] ?? 0),
  );
  const axes = Array.from({ length: Math.max(a.axes.length, b.axes.length) }, (_, i) => {
    const one = a.axes[i] ?? 0;
    const two = b.axes[i] ?? 0;
    return Math.abs(two) > Math.abs(one) ? two : one;
  });
  return { buttons, axes };
}
