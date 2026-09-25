// Which device the player used last: hint rows show pad glyphs after a pad input, and the next
// keyboard or mouse input switches them back. Changes only on a switch, so it is a tiny external
// store (not per-frame state). It also sets `<html data-input>` so the stylesheet can draw the
// focus ring on elements the pad focused (programmatic focus is not `:focus-visible`).

import { useSyncExternalStore } from "react";

export type InputDevice = "keys" | "pad";

let device: InputDevice = "keys";
const listeners = new Set<() => void>();

export function inputDevice(): InputDevice {
  return device;
}

export function setInputDevice(next: InputDevice): void {
  if (next === device) return;
  device = next;
  document.documentElement.dataset.input = next;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useInputDevice(): InputDevice {
  return useSyncExternalStore(subscribe, inputDevice);
}

/**
 * Real keyboard and mouse input switch back to keys. Synthetic events (the pad's own Escape and
 * clicks) are not trusted and never count. Mouse movement does not count either: the browser sends
 * moves of its own when the layout shifts under a resting pointer.
 */
export function watchKeyboardAndMouse(): () => void {
  const back = (event: Event): void => {
    if (event.isTrusted) setInputDevice("keys");
  };
  window.addEventListener("keydown", back, true);
  window.addEventListener("pointerdown", back, true);
  window.addEventListener("wheel", back, { capture: true, passive: true });
  return () => {
    window.removeEventListener("keydown", back, true);
    window.removeEventListener("pointerdown", back, true);
    window.removeEventListener("wheel", back, true);
  };
}
