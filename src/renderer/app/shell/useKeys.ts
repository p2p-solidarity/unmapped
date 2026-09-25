// Screen-local keyboard bindings keyed by `event.code`. Printable keys are ignored while a text
// field has focus; Escape always fires so the player can back out of a form.

import { useEffect, useRef } from "react";
import { isTypingTarget } from "../hotkeys";

export type KeyMap = Partial<Record<string, () => void>>;

const ALWAYS = new Set(["Escape"]);

export function useKeys(map: KeyMap, enabled = true): void {
  const ref = useRef(map);
  ref.current = map;

  useEffect(() => {
    if (!enabled) return;
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (isTypingTarget(event.target) && !ALWAYS.has(event.code)) return;
      const handler = ref.current[event.code];
      if (handler === undefined) return;
      event.preventDefault();
      handler();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [enabled]);
}

/** Wraps `index + delta` into `[0, length)`. */
export function cycle(index: number, delta: number, length: number): number {
  if (length <= 0) return 0;
  return (((index + delta) % length) + length) % length;
}
