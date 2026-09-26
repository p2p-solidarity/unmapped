// `window.seed.gateway.*` (rev 6 phase 4, D1–D3): where the next chat goes, the account on the
// generation gateway, and its plans — as a renderer may know them. Tokens, device keys and provider
// keys never cross (Rule 6): the renderer sees "signed in", public device keys and fingerprints,
// quotas and plans as the gateway and its billing provider report them (Rule 2). Every payload is
// zod-checked in main (src/main/account/ipc.ts, src/main/billing/ipc.ts).

import type { AccountKey } from "./account";
import type { PlansResponse } from "./billing";
import type { RouteView } from "./llm";
import type { QuotaStatus } from "./quota";
import type { Result } from "./result";

export const GATEWAY_IPC = {
  route: "gateway:route",
  account: "account:status",
  signIn: "account:sign-in",
  signOut: "account:sign-out",
  requestPairing: "account:request-pairing",
  cancelPairing: "account:cancel-pairing",
  lookupPairing: "account:lookup-pairing",
  approvePairing: "account:approve-pairing",
  removeDevice: "account:remove-device",
  quota: "account:read-quota",
  /** Broadcast: something about the account changed; read `account()` again. */
  changed: "account:changed",
  /** Broadcast: a `QuotaView`, re-read after every hosted call. */
  quotaChanged: "account:quota",
  plans: "billing:plans",
  checkout: "billing:checkout",
  portal: "billing:portal",
} as const;

/** One device key of the account, with the fingerprint both screens show while pairing. */
export interface AccountDeviceView extends AccountKey {
  fingerprint: string;
  /** The key of this computer. */
  thisDevice: boolean;
}

export type AccountSession =
  | {
      state: "signed-out";
      /** The gateway refused this device's token on the last call (revoked, expired, unknown). */
      ended: boolean;
    }
  | {
      state: "signed-in";
      /** `saved`: this device signed in; `env`: UNMAPPED_GATEWAY_KEY from .env (made by the CLI). */
      source: "saved" | "env";
      account: string;
      devices: AccountDeviceView[];
      /**
       * This computer's key is one of `devices`, so the gateway accepts the add / remove statements
       * main signs with it. False for a `.env` token of an account this key is not (or no longer)
       * in: approving a code or removing a device is refused, so neither is offered.
       */
      canChangeDevices: boolean;
    };

/** A pairing this device asked for: the code to type on a device already in the account. */
export interface PairingView {
  code: string;
  expiresAt: string;
  /** This device's key and its fingerprint, to compare on the approving device. */
  key: string;
  fingerprint: string;
}

export interface AccountStatus {
  /** The configured gateway's base URL. */
  gateway: string;
  /** This computer's device key (public) and its fingerprint. */
  device: { key: string; fingerprint: string };
  session: AccountSession;
  pairing: PairingView | null;
}

/** The device waiting behind a pairing code, as the gateway names it (public key + fingerprint). */
export interface PairingLookup {
  key: string;
  fingerprint: string;
  expiresAt: string;
}

/** Hosted calls this computer made in the quota's period, from its own usage ledger. */
export interface HostedUsage {
  calls: number;
  input: number;
  output: number;
  /** Calls whose tokens the gateway did not report: unknown, never counted as zero. */
  unreported: number;
}

export interface QuotaView {
  quota: QuotaStatus;
  device: HostedUsage;
}

export interface GatewayApi {
  /** Where the next chat goes and which model runs there; never a key. */
  route(): Promise<Result<RouteView>>;
  /** `gateway-not-configured` when this build has no gateway. */
  account(): Promise<Result<AccountStatus>>;
  /** Signs this device's key over the gateway's challenge; a key in no account makes one. */
  signIn(): Promise<Result<AccountStatus>>;
  signOut(): Promise<Result<AccountStatus>>;
  /** Asks for a code to join an existing account; main waits for its approval by itself. */
  requestPairing(): Promise<Result<AccountStatus>>;
  cancelPairing(): Promise<Result<AccountStatus>>;
  /** On a device in the account: which device asked for `code` (it is not spent by looking). */
  lookupPairing(code: string): Promise<Result<PairingLookup>>;
  /** On a device in the account: approves another device's code for exactly `key`. */
  approvePairing(code: string, key: string): Promise<Result<AccountStatus>>;
  removeDevice(key: string): Promise<Result<AccountStatus>>;
  quota(): Promise<Result<QuotaView>>;
  onChanged(listener: () => void): () => void;
  onQuota(listener: (quota: QuotaView) => void): () => void;
  /** The billing provider's plans as it names and prices them, or `billing-not-configured`. */
  plans(): Promise<Result<PlansResponse>>;
  /** Opens the provider's checkout for `plan` in the system browser. */
  checkout(plan: string): Promise<Result<void>>;
  /** Opens the provider's customer portal in the system browser. */
  portal(): Promise<Result<void>>;
}
