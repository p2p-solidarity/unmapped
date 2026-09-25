// Main's clock for histories (rev 6 phase 3, D10 test mode): receipt times of a local-only world,
// the `at` of new events and the local beat. `UNMAPPED_TEST_CLOCK_DAYS` shifts it by whole days —
// honored only when `AETHER_TEST_USER_DATA` is set, so a real install can never be told it is
// three months later.

import { DAY_MS } from "@shared/history/ids";

export type Clock = () => Date;

export function worldClock(env: NodeJS.ProcessEnv = process.env): Clock {
  const days = Number(env.UNMAPPED_TEST_CLOCK_DAYS ?? "");
  const testing = (env.AETHER_TEST_USER_DATA ?? "").length > 0;
  const shift = testing && Number.isInteger(days) && days > 0 && days <= 3650 ? days * DAY_MS : 0;
  return () => new Date(Date.now() + shift);
}

/** Strict ISO (`Date#toISOString`) of a time text, or null when it is not a time at all. */
export function strictIso(text: string): string | null {
  const ms = Date.parse(text);
  if (!Number.isFinite(ms)) return null;
  const iso = new Date(ms).toISOString();
  return /^\d{4}-/.test(iso) ? iso : null;
}
