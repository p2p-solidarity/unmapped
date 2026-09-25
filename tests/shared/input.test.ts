// The pad reads a cartridge's bindings and a worn stick the way the keyboard would. Only failures the
// gamepad E2E (built-in world, default bindings, a clean virtual pad) cannot reach are here:
//
// 1. A cartridge that rebinds an action gets the pad pressing the default key instead of its own, so
//    the pad does something other than the keyboard in that world.
// 2. A cartridge that binds an action to nothing gets it back from the pad (the pad re-enables what
//    the cartridge removed).
// 3. A stick reporting garbage (NaN from a flaky driver) or resting just inside the dead zone walks
//    the player on its own.

import { padControls, playCodes } from "@shared/input";
import { describe, expect, it } from "vitest";

describe("pad → keys in play", () => {
  it("presses the key the cartridge binds, not the default (1)", () => {
    const codes = playCodes(new Set(["a", "up"]), {
      interact: ["KeyF"],
      move_forward: ["ArrowUp"],
    });
    expect([...codes].sort()).toEqual(["ArrowUp", "KeyF"]);
  });

  it("never presses an action the cartridge bound to nothing (2)", () => {
    const codes = playCodes(new Set(["x", "a"]), { fire: [] });
    expect([...codes]).toEqual(["KeyE"]);
  });

  it("holds nothing for a stick at rest, drifting, or reporting NaN (3)", () => {
    const at = (x: number, y: number) => padControls({ buttons: [], axes: [x, y, 0, 0] });
    expect([...at(0.2, -0.15)]).toEqual([]);
    expect([...at(Number.NaN, -1)]).toEqual([]);
    expect([...at(0.05, -0.9)]).toEqual(["up"]);
  });
});
