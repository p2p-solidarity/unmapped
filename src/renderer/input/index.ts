// Keyboard + gamepad as one action map (@shared/input). App mounts `useGamepad` once; hint rows read
// `useInputDevice` to show pad glyphs after a pad input; layers mark their root with `data-layer`.

export { type InputDevice, inputDevice, useInputDevice } from "./device";
export { pressEscape } from "./focus";
export { useGamepad } from "./gamepad";
export { padControlsHint } from "./hints";
