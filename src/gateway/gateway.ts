// Opens a gateway over its data dir (rev 6 phase 4): the upstreams and costs checked and every
// start-up refusal decided first, then the lock, its key and the stores folded into memory — all
// before a port is bound, and nothing written for a start that is refused.
// Runtime-neutral (web `Request` / `Response`), so tests drive it in vitest and `main.ts` serves it
// with Bun.
//
//   <data>/gateway.lock       one process per data dir (lock.ts)
//   <data>/gateway-key.json   the key every sign-in signs for (keyFile.ts)
//   <data>/admin-secret       what the CLI shows a running gateway on loopback
//   <data>/keys.json          upstream and billing keys saved with `set-key` (secrets.ts)
//   <data>/upstreams.json     what is served, with licences (upstreams.ts)
//   <data>/costs.json         dated cost records (costs.ts)
//   <data>/accounts.jsonl     accounts, device keys, hashed tokens (accounts.ts)
//   <data>/ledger.jsonl       holds, settles, releases, grants, entitlements (ledger.ts)

import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { err, ok, type Result } from "@shared/result";
import { Accounts } from "./accounts";
import type { BillingProvider } from "./billing/provider";
import { StripeProvider } from "./billing/stripe";
import { type GatewayClock, isoAt, SystemClock } from "./clock";
import type { GatewayLimits } from "./config";
import { webOrigins } from "./config";
import { costFor, loadCosts } from "./costs";
import { type Client, handleHttp } from "./http";
import { JsonlFile } from "./jsonl";
import { loadAdminSecret, loadGatewayKey } from "./keyFile";
import { Ledger } from "./ledger";
import { takeLock } from "./lock";
import { type Fetch, RateCap } from "./meter";
import { type EnvLike, readSavedKeys } from "./secrets";
import { type BillingKeys, checkStartup } from "./startup";
import type { GatewayState } from "./state";
import { loadUpstreams } from "./upstreams";
import type { Verifier } from "./verifier";

export const ACCOUNTS_FILE = "accounts.jsonl";
export const LEDGER_FILE = "ledger.jsonl";

export interface Stores {
  gatewayKey: string;
  accounts: Accounts;
  ledger: Ledger;
  /** Gives the data dir back. */
  release(): void;
  warnings: string[];
  created: boolean;
}

/** The lock, the key and both stores: all the CLI needs when no gateway is running. */
export function openStores(
  data: string,
  clock: GatewayClock,
  listen: { host: string; port: number } = { host: "cli", port: 0 },
): Result<Stores> {
  try {
    mkdirSync(data, { recursive: true, mode: 0o700 });
  } catch (error) {
    return err("gateway-data", `Could not create ${data}: ${String(error)}`);
  }
  const lock = takeLock(data, {
    pid: process.pid,
    host: listen.host,
    port: listen.port,
    startedAt: isoAt(Date.now()),
  });
  if (!lock.ok) return lock;
  const fail = <T>(result: Result<T>): Result<never> => {
    lock.value();
    return result as Result<never>;
  };
  const key = loadGatewayKey(data);
  if (!key.ok) return fail(key);
  const accounts = new Accounts(
    new JsonlFile(join(data, ACCOUNTS_FILE)),
    clock,
    key.value.value.key,
  );
  const loadedAccounts = accounts.load();
  if (!loadedAccounts.ok) return fail(loadedAccounts);
  const ledger = new Ledger(new JsonlFile(join(data, LEDGER_FILE)), clock);
  const loadedLedger = ledger.load();
  if (!loadedLedger.ok) return fail(loadedLedger);
  const warnings = [key.value.warning].filter((line): line is string => line !== null);
  for (const [file, torn] of [
    [ACCOUNTS_FILE, loadedAccounts.value.torn],
    [LEDGER_FILE, loadedLedger.value.torn],
  ] as const) {
    if (torn > 0) warnings.push(`${file}: a torn last line (${torn} bytes) was set aside.`);
  }
  return ok({
    gatewayKey: key.value.value.key,
    accounts,
    ledger,
    release: lock.value,
    warnings,
    created: key.value.created,
  });
}

export interface GatewayOptions {
  data: string;
  env: EnvLike;
  limits: GatewayLimits;
  clock?: GatewayClock & { advance?: (days: number) => number };
  /** For upstream calls (tests pass a fake upstream). */
  fetch?: Fetch;
  /** Builds the billing provider from its keys; default Stripe. */
  billing?: (keys: BillingKeys) => BillingProvider;
  verifier?: { verifier: Verifier; pepper: string } | null;
  log?: (line: string) => void;
  listen?: { host: string; port: number };
}

export interface Gateway {
  state: GatewayState;
  handle(request: Request, client: Client): Promise<Response>;
  /** Releases stale holds (a crash, a stream past its cap); returns how many. */
  sweep(): number;
  close(): void;
  report: {
    gatewayKey: string;
    newKey: boolean;
    released: number;
    served: number;
    warnings: string[];
  };
}

export function openGateway(options: GatewayOptions): Result<Gateway> {
  const clock = options.clock ?? new SystemClock();
  const log = options.log ?? (() => {});
  // Every operator file is read and every start-up refusal decided before anything is written: a
  // refused start leaves the data dir as it found it (no lock, no gateway key, no admin secret).
  const saved = readSavedKeys(options.data);
  const upstreams = loadUpstreams(options.data, saved, options.env);
  if (!upstreams.ok) return upstreams;
  const costs = loadCosts(options.data);
  if (!costs.ok) return costs;
  const decision = checkStartup(options.env, saved, upstreams.value);
  if (!decision.ok) return decision;
  const stores = openStores(options.data, clock, options.listen);
  if (!stores.ok) return stores;
  const { accounts, ledger } = stores.value;
  const fail = <T>(result: Result<T>): Result<never> => {
    stores.value.release();
    return result as Result<never>;
  };
  const admin = loadAdminSecret(options.data, true);
  if (!admin.ok) return fail(admin);
  if (admin.value === null) return fail(err("gateway-internal", "No admin secret was made."));
  const fetchFn: Fetch = options.fetch ?? ((input, init) => fetch(input, init));
  const makeBilling =
    options.billing ??
    ((keys: BillingKeys) => new StripeProvider(keys.secretKey, keys.webhookSecret));
  const billing = decision.value.billing === null ? null : makeBilling(decision.value.billing);

  const warnings = [...stores.value.warnings, ...upstreams.value.warnings];
  if (admin.value.warning !== null) warnings.push(admin.value.warning);
  for (const model of upstreams.value.models) {
    if (costFor(costs.value, model.id, model.upstream.id, clock.now()) === null) {
      warnings.push(`${model.id} has no cost record in force: it is not served until one is.`);
    }
  }
  const state: GatewayState = {
    accounts,
    ledger,
    models: upstreams.value.models,
    costs: costs.value,
    clock,
    limits: options.limits,
    fetch: fetchFn,
    rates: new RateCap(clock, options.limits),
    live: new Set(),
    log,
    commercial: decision.value.commercial,
    test: decision.value.test,
    advance:
      decision.value.test && clock.advance !== undefined
        ? (days) => clock.advance?.(days) ?? 0
        : null,
    billing,
    verifier: options.verifier ?? null,
    origins: webOrigins(options.env),
    adminSecret: admin.value.value,
    authWindows: new Map(),
  };
  const sweep = () => ledger.sweep(options.limits.streamCapMs, state.live);
  const released = sweep();
  let closed = false;
  return ok({
    state,
    handle: (request, client) => handleHttp(state, request, client),
    sweep,
    close() {
      if (closed) return;
      closed = true;
      stores.value.release();
    },
    report: {
      gatewayKey: stores.value.gatewayKey,
      newKey: stores.value.created,
      released,
      served: upstreams.value.models.length,
      warnings,
    },
  });
}
