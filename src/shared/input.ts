// One action map for the keyboard and the gamepad (plan rev6-phase2 D4). Pure data and pure
// functions, so the layout is read the same way by the renderer's poller and by tests.
//
// The pad is the W3C "standard" mapping. What each control does depends on where the player is:
//
//   control          on the land / in a place (play)            in a menu or over a layer
//   left stick, ✚    move_forward/backward/left/right           nav_up/down/left/right (focus)
//   A (0)            interact (talk, open, use a gate or door)   confirm (click the focused element)
//   B (1)            jump (a place's climb; fires when armed)    back (Escape)
//   X (2)            fire                                        —
//   Y (3)            notes (the land's N key)                    —
//   LB (4)           emote (the land's T key: the emote wheel)   —
//   RB (5)           sprint                                      —
//   Start (9)        menu (Escape: the same as Esc in Play)      menu (Escape)
//
// Y is the notes action because the HUD offers exactly that key on the land (the dock's "N Notes");
// the home door is a place on the land, so A opens it like any other target. In play a control
// stands for a *gameplay action*, and the poller holds (and presses) the first key that action is
// bound to — the cartridge's binding, else DEFAULT_BINDINGS — so every keyboard consumer reads the
// pad without knowing it exists.

import type { GameplayRules, InputAction, InputCode } from "./gameplay";

export const MENU_ACTIONS = [
  "nav_up",
  "nav_down",
  "nav_left",
  "nav_right",
  "confirm",
  "back",
  "menu",
] as const;
export type MenuAction = (typeof MENU_ACTIONS)[number];

/** Button indices of the W3C standard gamepad mapping. */
export const PAD_BUTTON = {
  a: 0,
  b: 1,
  x: 2,
  y: 3,
  lb: 4,
  rb: 5,
  lt: 6,
  rt: 7,
  select: 8,
  start: 9,
  ls: 10,
  rs: 11,
  up: 12,
  down: 13,
  left: 14,
  right: 15,
} as const;

/** Axes of the standard mapping: left stick x/y, right stick x/y (-1 = left / up). */
export const PAD_AXIS = { lx: 0, ly: 1, rx: 2, ry: 3 } as const;

/** Stick travel (0..1) ignored as rest: a worn stick must never walk or scroll on its own. */
export const PAD_DEAD_ZONE = 0.3;
/** Menus want a firmer push before focus moves. */
export const PAD_MENU_DEAD_ZONE = 0.5;
/** An analog button (a trigger) counts as pressed past this. */
export const PAD_PRESS = 0.5;
/** Past the dead zone, a direction counts when the stick leans within 67.5° of it (8-way). */
const LEAN = Math.sin(Math.PI / 8);

/** Held menu navigation repeats after this long, then every `PAD_REPEAT_MS`. */
export const PAD_REPEAT_DELAY_MS = 380;
export const PAD_REPEAT_MS = 110;

/** The pad as the poller reads it: button values 0..1 and axes -1..1. */
export interface PadSnapshot {
  buttons: readonly number[];
  axes: readonly number[];
}

const CONTROLS = ["a", "b", "x", "y", "lb", "rb", "start", "up", "down", "left", "right"] as const;

/** A control of the pad; the four directions merge the D-pad with the left stick. */
export type PadControl = (typeof CONTROLS)[number];

/**
 * The keys the engine falls back to when a cartridge binds nothing (the same lists its consumers
 * use: engine/useKeys, LandView2D, Player, CombatControl, PhysGun, FpsKitFeatures).
 */
export const DEFAULT_BINDINGS: Readonly<Record<InputAction, readonly InputCode[]>> = {
  move_forward: ["KeyW", "ArrowUp"],
  move_backward: ["KeyS", "ArrowDown"],
  move_left: ["KeyA", "ArrowLeft"],
  move_right: ["KeyD", "ArrowRight"],
  sprint: ["ShiftLeft", "ShiftRight"],
  jump: ["Space"],
  interact: ["KeyE"],
  grab: ["KeyG"],
  flashlight: ["KeyF"],
  inspect: ["MouseLeft"],
  fire: ["MouseLeft"],
  end_turn: ["KeyR"],
  pause: ["KeyP"],
};

/** The land's notes key: not a cartridge action, so no cartridge can rebind it. */
export const NOTES_CODE = "KeyN";

/**
 * The land's emote key (rev 6 phase 3, D17): opens the emote wheel. Not a cartridge action either;
 * G is taken by `grab`, so the wheel is T on the keyboard and LB on the pad.
 */
export const EMOTE_CODE = "KeyT";

/** What a control means in play: a gameplay action, the notes key, or the menu (Escape). */
export type PlayInput =
  | { kind: "action"; action: InputAction }
  | { kind: "code"; code: string }
  | { kind: "menu" };

export const PLAY_LAYOUT: Readonly<Record<PadControl, PlayInput>> = {
  up: { kind: "action", action: "move_forward" },
  down: { kind: "action", action: "move_backward" },
  left: { kind: "action", action: "move_left" },
  right: { kind: "action", action: "move_right" },
  a: { kind: "action", action: "interact" },
  b: { kind: "action", action: "jump" },
  x: { kind: "action", action: "fire" },
  y: { kind: "code", code: NOTES_CODE },
  lb: { kind: "code", code: EMOTE_CODE },
  rb: { kind: "action", action: "sprint" },
  start: { kind: "menu" },
};

export const MENU_LAYOUT: Readonly<Partial<Record<PadControl, MenuAction>>> = {
  up: "nav_up",
  down: "nav_down",
  left: "nav_left",
  right: "nav_right",
  a: "confirm",
  b: "back",
  start: "menu",
};

const pressed = (snapshot: PadSnapshot, index: number): boolean =>
  (snapshot.buttons[index] ?? 0) >= PAD_PRESS;

/** The controls a snapshot holds. Stick directions count only past `deadZone` (radial). */
export function padControls(snapshot: PadSnapshot, deadZone = PAD_DEAD_ZONE): Set<PadControl> {
  const held = new Set<PadControl>();
  for (const name of CONTROLS) {
    if (pressed(snapshot, PAD_BUTTON[name])) held.add(name);
  }
  const x = snapshot.axes[PAD_AXIS.lx] ?? 0;
  const y = snapshot.axes[PAD_AXIS.ly] ?? 0;
  const tilt = Math.hypot(x, y);
  if (!Number.isFinite(tilt) || tilt < deadZone) return held;
  if (-y / tilt >= LEAN) held.add("up");
  if (y / tilt >= LEAN) held.add("down");
  if (-x / tilt >= LEAN) held.add("left");
  if (x / tilt >= LEAN) held.add("right");
  return held;
}

/** True when a snapshot shows the player using the pad at all (any button, a stick past rest). */
export function padActive(snapshot: PadSnapshot): boolean {
  if (snapshot.buttons.some((value) => value >= PAD_PRESS)) return true;
  return snapshot.axes.some((value) => Math.abs(value) >= PAD_MENU_DEAD_ZONE);
}

/** Controls held now that were not held before, in a stable order. */
export function freshPresses<T>(previous: ReadonlySet<T>, current: ReadonlySet<T>): T[] {
  return [...current].filter((control) => !previous.has(control));
}

/**
 * The key a play input stands for: the first key the cartridge binds the action to (else the
 * default), the notes key, or null — an action bound to nothing is not pressed by the pad either.
 */
export function playCode(
  input: PlayInput,
  bindings: GameplayRules["bindings"] | undefined,
): string | null {
  if (input.kind === "code") return input.code;
  if (input.kind === "menu") return null;
  return (bindings?.[input.action] ?? DEFAULT_BINDINGS[input.action])[0] ?? null;
}

/** The keys held controls hold in play (what the engine's held set gains from the pad). */
export function playCodes(
  held: ReadonlySet<PadControl>,
  bindings: GameplayRules["bindings"] | undefined,
): Set<string> {
  const codes = new Set<string>();
  for (const control of held) {
    const code = playCode(PLAY_LAYOUT[control], bindings);
    if (code !== null) codes.add(code);
  }
  return codes;
}

/** Whether a held menu direction fires again this frame (auto-repeat after a delay). */
export function repeatDue(heldForMs: number, sinceLastMs: number): boolean {
  return heldForMs >= PAD_REPEAT_DELAY_MS && sinceLastMs >= PAD_REPEAT_MS;
}

/** Glyphs printed on the pad, as hint rows show them. Button names are not translated. */
export const PAD_GLYPH: Readonly<Record<PadControl, string>> = {
  a: "A",
  b: "B",
  x: "X",
  y: "Y",
  lb: "LB",
  rb: "RB",
  start: "Start",
  up: "✚",
  down: "✚",
  left: "✚",
  right: "✚",
};

/**
 * A keyboard hint label → the pad control that does the same thing, for hint rows and button
 * hotkeys. Labels with no pad counterpart (F12, V, the dialogue's 1/2/3 — a choice is picked by
 * focus) are absent, and their hint is hidden while the pad is in use.
 */
const KEY_TO_PAD: Readonly<Record<string, PadControl>> = {
  Esc: "b",
  Escape: "b",
  Enter: "a",
  "⏎": "a",
  "↵": "a",
  E: "a",
  N: "y",
  T: "lb",
  "↑": "up",
  "↓": "down",
  "←": "left",
  "→": "right",
};

/** Pad glyphs for a hint's key labels, de-duplicated; empty when the pad has none of them. */
export function padGlyphs(keys: readonly string[]): string[] {
  const glyphs: string[] = [];
  for (const key of keys) {
    const control = KEY_TO_PAD[key];
    if (control === undefined) continue;
    const glyph = PAD_GLYPH[control];
    if (!glyphs.includes(glyph)) glyphs.push(glyph);
  }
  return glyphs;
}
