// Keyboard state in a ref (never in React state — Rule 4). Movement is polled from the ref in
// useFrame; edge-triggered keys (E, C) arrive through the onPress callback. All input is dropped
// while `engineStore.inputLocked` is true, and the held set is cleared the moment it flips on.
//
// The gamepad is a second source of the same keys (@shared/input): renderer/input's poller holds
// the key each pad action is bound to (`setPadKeys`) and sends its fresh presses down the same
// onPress path as a key-down (`pressPadKey`), so no consumer knows a pad exists.

import { useEngineStore } from "@renderer/state";
import type { GameplayRules, InputAction, InputCode } from "@shared/gameplay";
import { DEFAULT_BINDINGS } from "@shared/input";
import { type RefObject, useEffect, useRef } from "react";

const FORWARD = new Set<string>(DEFAULT_BINDINGS.move_forward);
const BACKWARD = new Set<string>(DEFAULT_BINDINGS.move_backward);
const LEFT = new Set<string>(DEFAULT_BINDINGS.move_left);
const RIGHT = new Set<string>(DEFAULT_BINDINGS.move_right);
const SPRINT = new Set<string>(DEFAULT_BINDINGS.sprint);

/** Keys we swallow so the surrounding app chrome never scrolls under the canvas. */
const SWALLOWED = new Set([...FORWARD, ...BACKWARD, ...LEFT, ...RIGHT, "Space", "KeyE", "KeyF"]);

/** Keys the pad holds right now; empty unless the poller is driving play. */
const padHeld = new Set<string>();
/** Every mounted useKeys' onPress, so a pad press reaches all of them like a key-down. */
const pressers = new Set<RefObject<(code: string) => void>>();

/** A key-down set that also answers for the keys the pad holds. Only `has` is shared. */
class HeldKeys extends Set<string> {
  override has(code: string): boolean {
    return super.has(code) || padHeld.has(code);
  }
}

/** The poller's held keys for this frame (replaces the previous frame's). */
export function setPadKeys(codes: ReadonlySet<string>): void {
  if (useEngineStore.getState().inputLocked) {
    padHeld.clear();
    return;
  }
  padHeld.clear();
  for (const code of codes) padHeld.add(code);
}

/** A fresh pad press, delivered to every useKeys exactly as a key-down of `code` would be. */
export function pressPadKey(code: string): void {
  if (useEngineStore.getState().inputLocked) return;
  for (const press of pressers) press.current(code);
}

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
 * Returns the live set; read it inside useFrame, never during render. Keys the gamepad holds
 * count as held (`has`), and its fresh presses arrive through `onPress` too.
 */
export function useKeys(onPress: (code: string) => void): RefObject<Set<string>> {
  const held = useRef<Set<string>>(new HeldKeys());
  const press = useRef(onPress);

  useEffect(() => {
    press.current = onPress;
  }, [onPress]);

  useEffect(() => {
    const keys = held.current;
    pressers.add(press);

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
      if (state.inputLocked && !previous.inputLocked) {
        keys.clear();
        padHeld.clear();
      }
    });

    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
      pressers.delete(press);
      unsubscribe();
      keys.clear();
    };
  }, []);

  return held;
}
