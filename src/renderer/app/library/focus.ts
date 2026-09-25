// Menus are driven by DOM focus: a gamepad moves focus spatially and presses the focused control
// (src/renderer/input), the keyboard moves it with ↑/↓ inside one list and Enter presses it (on
// key-down, so a synthetic key-down presses it too). So every row is a real button, a row's "active" look follows its focus, and each
// screen puts its first focus on one sensible control: the one marked AUTOFOCUS (or
// `data-autofocus`, which the pad's own first landing also prefers), else the first enabled one.
// An overlaying panel is a `role="dialog"` layer and the page behind it is `inert`.

import { type RefObject, useEffect, useRef } from "react";
import { isTypingTarget } from "../hotkeys";

/** Class name (Button takes `className`) of the control a panel focuses first. */
export const AUTOFOCUS = "g-autofocus";

const FOCUSABLE = [
  "button:not(:disabled)",
  "input:not(:disabled)",
  "textarea:not(:disabled)",
  "select:not(:disabled)",
  "a[href]",
  '[tabindex]:not([tabindex="-1"])',
].join(", ");

/** Enabled buttons of a container, in document order. */
function buttonsOf(container: HTMLElement): HTMLButtonElement[] {
  return [...container.querySelectorAll<HTMLButtonElement>("button:not(:disabled)")];
}

function nothingFocused(): boolean {
  const active = document.activeElement;
  return active === null || active === document.body;
}

/** Focuses the container's AUTOFOCUS control, else its first focusable one. */
export function focusFirst(container: HTMLElement | null): boolean {
  if (container === null) return false;
  const target =
    container.querySelector<HTMLElement>(
      `.${AUTOFOCUS}:not(:disabled), [data-autofocus]:not(:disabled)`,
    ) ?? container.querySelector<HTMLElement>(FOCUSABLE);
  if (target === null) return false;
  target.focus();
  return true;
}

/** Focuses the index-th button of a container (disabled ones count, so indexes match the list). */
export function focusButton(container: HTMLElement | null, index: number): void {
  const button = container?.querySelectorAll<HTMLButtonElement>("button")[index];
  if (button !== undefined && !button.disabled) button.focus();
}

/**
 * Gives a screen its first focus once `ready` turns true (e.g. when the data that decides which
 * rows are enabled has loaded). Never steals focus the player already placed.
 */
export function useInitialFocus(ref: RefObject<HTMLElement | null>, ready: boolean): void {
  const done = useRef(false);
  useEffect(() => {
    if (!ready || done.current) return;
    done.current = true;
    if (nothingFocused()) focusFirst(ref.current);
  }, [ready, ref]);
}

export interface ArrowFocusOptions {
  enabled?: boolean;
  /** When nothing has focus, the first ↓ / ↑ lands in this list (one list per screen). */
  claimIdle?: boolean;
}

/**
 * ↑/↓ (and W/S) move focus among the container's enabled buttons, wrapping, and Enter presses the
 * focused one, while focus is inside it. Several lists on one screen never fight: only the one
 * holding focus answers.
 */
export function useArrowFocus(
  ref: RefObject<HTMLElement | null>,
  { enabled = true, claimIdle = false }: ArrowFocusOptions = {},
): void {
  useEffect(() => {
    if (!enabled) return;
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
      const container = ref.current;
      if (container === null || isTypingTarget(event.target)) return;
      const buttons = buttonsOf(container);
      const at = buttons.indexOf(document.activeElement as HTMLButtonElement);
      if (event.code === "Enter" || event.code === "NumpadEnter") {
        if (at === -1) return;
        // Pressed here on key-down (once, not on repeats); preventing it keeps the browser from
        // pressing it a second time.
        event.preventDefault();
        if (!event.repeat) buttons[at]?.click();
        return;
      }
      const delta =
        event.code === "ArrowDown" || event.code === "KeyS"
          ? 1
          : event.code === "ArrowUp" || event.code === "KeyW"
            ? -1
            : 0;
      if (delta === 0 || buttons.length === 0) return;
      if (at === -1 && !(claimIdle && nothingFocused())) return;
      event.preventDefault();
      const next =
        at === -1
          ? delta > 0
            ? 0
            : buttons.length - 1
          : (at + delta + buttons.length) % buttons.length;
      buttons[next]?.focus();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [enabled, claimIdle, ref]);
}
