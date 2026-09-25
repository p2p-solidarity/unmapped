// Where each kind of system-prompt section sits. Built-ins own 100..300 and 700..900; mods may
// only register inside MOD_MIN..MOD_MAX, so no mod can shadow the persona or the output format.

export const ORDER = {
  PERSONA: 100,
  WORLD_RULES: 200,
  DSL_SPEC: 300,
  MOD_MIN: 400,
  MOD_MAX: 600,
  CONTEXT: 700,
  EXAMPLES: 800,
  OUTPUT: 900,
} as const;

export type OrderName = keyof typeof ORDER;
