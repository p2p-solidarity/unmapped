// The engine's stock rules.oui: every Phase A gameplay kit configured once, plus the default key
// bindings. New cartridges and legacy migrations start from this program; a cartridge may replace
// it, but never with code (plan §四: kits are engine-owned, cartridges only tune them).

export const DEFAULT_RULES_SOURCE = [
  'root = Rules("tps_exploration@1", "grounded", [tps, fps, side, topdown, forward, back, left, right, sprint, jump, interact, flashlight, inspect])',
  'tps = Kit("tps_exploration@1", 4, 7, 6.4, 15, 2, 55, 0.0022, 9)',
  'fps = Kit("fps_puzzle@1", 3.5, 5, 0, 15, 3, 70, 0.0022, 0)',
  'side = Kit("platformer_2_5d@1", 4.5, 7, 7, 17, 2, 50, 0.0022, 12)',
  'topdown = Kit("topdown_puzzle@1", 4, 5, 0, 15, 2.5, 48, 0.0022, 14)',
  'forward = Bind("move_forward", ["KeyW", "ArrowUp"])',
  'back = Bind("move_backward", ["KeyS", "ArrowDown"])',
  'left = Bind("move_left", ["KeyA", "ArrowLeft"])',
  'right = Bind("move_right", ["KeyD", "ArrowRight"])',
  'sprint = Bind("sprint", ["ShiftLeft", "ShiftRight"])',
  'jump = Bind("jump", ["Space"])',
  'interact = Bind("interact", ["KeyE"])',
  'flashlight = Bind("flashlight", ["KeyF"])',
  'inspect = Bind("inspect", ["MouseLeft"])',
].join("\n");
