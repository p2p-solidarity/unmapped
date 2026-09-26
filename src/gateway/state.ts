// Everything a request handler may touch (rev 6 phase 4), built once by `openGateway`.

import type { BillingProvider } from "./billing/provider";
import type { MeterContext } from "./meter";
import type { Verifier } from "./verifier";

export interface GatewayState extends MeterContext {
  commercial: boolean;
  /** UNMAPPED_GATEWAY_TEST=1. */
  test: boolean;
  /** Test mode: moves `clock.now()`; returns the total offset in days. */
  advance: ((days: number) => number) | null;
  billing: BillingProvider | null;
  verifier: { verifier: Verifier; pepper: string } | null;
  origins: ReadonlySet<string>;
  adminSecret: string;
  authWindows: Map<string, { start: number; count: number }>;
}
