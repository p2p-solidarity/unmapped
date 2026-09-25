// Keyboard state in a ref (never in React state — Rule 4). Movement is polled from the ref in
// useFrame; edge-triggered keys (E, C) arrive through the onPress callback. All input is dropped
// while `engineStore.inputLocked` is true, and the held set is cleared the moment it flips on.

import { useEngineStore } from "@renderer/state";
import type { GameplayRules, InputAction, InputCode } from "@shared/gameplay";
import { type RefObject, useEffect, useRef } from "react";

const FORWARD = new Set(["KeyW", "ArrowUp"]);
const BACKWARD = new Set(["KeyS", "ArrowDown"]);
const LEFT = new Set(["KeyA", "ArrowLeft"]);
const RIGHT = new Set(["KeyD", "ArrowRight"]);
const SPRINT = new Set(["ShiftLeft", "ShiftRight"]);

/** Keys we swallow so the surrounding app chrome never scrolls under the canvas. */
const SWALLOWED = new Set([...FORWARD, ...BACKWARD, ...LEFT, ...RIGHT, "Space", "KeyE", "KeyF"]);

export interface MoveAxis {
  /** +1 = away from the camera. */
  forward: number;
  /** +1 = camera-right. */
  strafe: number;
}

export function isActionPressed(
  held: ReadonlySet<string>,
  bindings: GameplayRules["bindings"] | undefined,
  action: InputAction,
  fallback: ReadonlySet<string>,
): boolean {
  const configured = bindings?.[action];
  const codes: readonly string[] = configured === undefined ? [...fallback] : configured;
  return codes.some((code) => held.has(code));
}

export function matchesAction(
  code: string,
  bindings: GameplayRules["bindings"] | undefined,
  action: InputAction,
  fallback: readonly InputCode[],
): boolean {
  return (bindings?.[action] ?? fallback).includes(code as InputCode);
}

/** Normalised so diagonals are not faster than the cardinals. */
export function moveAxis(
  held: ReadonlySet<string>,
  bindings?: GameplayRules["bindings"],
): MoveAxis {
  const forward =
    Number(isActionPressed(held, bindings, "move_forward", FORWARD)) -
    Number(isActionPressed(held, bindings, "move_backward", BACKWARD));
  const strafe =
    Number(isActionPressed(held, bindings, "move_right", RIGHT)) -
    Number(isActionPressed(held, bindings, "move_left", LEFT));
  const length = Math.hypot(forward, strafe);
  if (length > 1) return { forward: forward / length, strafe: strafe / length };
  return { forward, strafe };
}

export function isSprinting(
  held: ReadonlySet<string>,
  bindings?: GameplayRules["bindings"],
): boolean {
  return isActionPressed(held, bindings, "sprint", SPRINT);
}

/**
 * Tracks held keys and reports fresh key-downs (auto-repeat suppressed) to `onPress`.
 * Returns the live set; read it inside useFrame, never during render.
 */
export function useKeys(onPress: (code: string) => void): RefObject<Set<string>> {
  const held = useRef<Set<string>>(new Set());
  const press = useRef(onPress);

  useEffect(() => {
    press.current = onPress;
  }, [onPress]);

  useEffect(() => {
    const keys = held.current;

    const onKeyDown = (event: KeyboardEvent): void => {
      if (useEngineStore.getState().inputLocked) return;
      if (SWALLOWED.has(event.code)) event.preventDefault();
      if (event.repeat) {
        keys.add(event.code);
        return;
      }
      keys.add(event.code);
      press.current(event.code);
    };

    const onKeyUp = (event: KeyboardEvent): void => {
      keys.delete(event.code);
    };

    const onBlur = (): void => {
      keys.clear();
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    const unsubscribe = useEngineStore.subscribe((state, previous) => {
      if (state.inputLocked && !previous.inputLocked) keys.clear();
    });

    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
      unsubscribe();
      keys.clear();
    };
  }, []);

  return held;
}
