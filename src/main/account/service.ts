// The account on the generation gateway, from main (rev 6 phase 4, D1). An account is the
// gateway's record of device keys; this device joins it by signing the gateway's challenge with its
// device key (./signer), and keeps the account token main gets back like any key: encrypted with the
// OS keychain, provider `hosted`, bound to the configured gateway (`writeKeyRecord`). The renderer
// only ever learns "signed in", public keys, fingerprints and quotas (Rule 6); a token for `.env`
// comes only from `bun run gateway -- token <account>`, never from this app.
//
//   sign in    challenge → sign "unmapped-gateway:v1…" → POST /v1/auth/token → save the token
//   pairing    a second device never signs in (that would make a second account; accounts never
//              merge): it asks POST /v1/account/pairing for a code, shows it beside its key's
//              fingerprint, and polls /v1/auth/token with `create: false` until a device in the
//              account approves it (a signed `add` for exactly this key) or the code expires
//   devices    add / remove statements signed by this device's key; removing this device stops
//              its token at once, so the saved one is dropped too
//   quota      GET /v1/quota after every hosted call, broadcast as `account:quota`
//
// Nothing on the walking path waits for any of it.

import {
  accountViewSchema,
  challengeResponseSchema,
  type KeyChange,
  keyFingerprint,
  normalisePairingCode,
  PAIRING_TTL_MS,
  pairingLookupSchema,
  pairingResponseSchema,
  signInResponseSchema,
} from "@shared/account";
import {
  type AccountStatus,
  GATEWAY_IPC,
  type PairingLookup,
  type PairingView,
  type QuotaView,
} from "@shared/gatewayApi";
import { AUTHOR_KEY } from "@shared/history/ids";
import { quotaStatusSchema } from "@shared/quota";
import { err, fail, ok, type Result } from "@shared/result";
import { z } from "zod";
import type { MainContext } from "../context";
import { gatewayNotConfigured, gatewaySetting } from "../inference/config";
import {
  clearKeyRecord,
  readKeyRecord,
  resolveProviderKey,
  writeKeyRecord,
} from "../inference/keyStore";
import type { EnvLike } from "../inference/keys";
import { forgetRefusedToken } from "./deadToken";
import { type GatewayResult, gatewayJson, needsSignIn } from "./gatewayHttp";
import { hostedUsage } from "./hostedUsage";
import { type AccountSigner, DeviceSigner } from "./signer";

const POLL_MS = 5_000;
const LABEL = `UNMAPPED · ${process.platform}`;
const revokedSchema = z.object({ revoked: z.string() });

interface Pairing extends PairingView {
  base: string;
  /** Real time it stops polling: the code's own expiry, and never more than its ten minutes. */
  until: number;
}

type Token = { key: string; source: "saved" | "env" };

export class AccountService {
  private readonly signer: DeviceSigner;
  /** The gateway refused this device's token on the last call. */
  private ended = false;
  private pairing: Pairing | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly ctx: MainContext,
    private readonly env: EnvLike = process.env,
  ) {
    this.signer = new DeviceSigner(ctx.userData);
  }

  private base(): Result<string> {
    const setting = gatewaySetting(this.env);
    if (!setting.ok) return setting;
    return setting.value === null ? fail(gatewayNotConfigured()) : ok(setting.value);
  }

  /** The token a call sends: the one this device saved, else UNMAPPED_GATEWAY_KEY. */
  private async token(): Promise<Token | null> {
    const resolved = await resolveProviderKey("hosted", this.env);
    return resolved.ok ? resolved.value : null;
  }

  private changed(): void {
    this.ctx.broadcast(GATEWAY_IPC.changed, null);
  }

  /**
   * A 401 on a token: delete exactly that saved record (never one from .env, never a newer one) so
   * UNMAPPED_GATEWAY_KEY is used next, and say "signed out".
   */
  async forgetDeadToken(refused: Token): Promise<void> {
    this.ended = true;
    const cleared = await forgetRefusedToken(refused, {
      read: () => readKeyRecord("hosted"),
      clear: () => clearKeyRecord("hosted"),
    });
    process.stdout.write(
      `[account] token refused · ${refused.source}${cleared ? " · saved token cleared" : ""}\n`,
    );
    this.changed();
  }

  private pairingView(): PairingView | null {
    if (this.pairing === null) return null;
    const { code, expiresAt, key, fingerprint } = this.pairing;
    return { code, expiresAt, key, fingerprint };
  }

  async status(): Promise<Result<AccountStatus>> {
    const base = this.base();
    if (!base.ok) return base;
    const signer = await this.signer.get();
    if (!signer.ok) return signer;
    const me = signer.value.key;
    const device = { key: me, fingerprint: keyFingerprint(me) };
    const token = await this.token();
    const signedOut = (): Result<AccountStatus> =>
      ok({
        gateway: base.value,
        device,
        pairing: this.pairingView(),
        session: { state: "signed-out", ended: this.ended },
      });
    if (token === null) return signedOut();
    const view = await gatewayJson(
      base.value,
      { method: "GET", path: "/account", token: token.key },
      accountViewSchema,
    );
    if (!view.ok) {
      if (view.status !== 401) return fail(view.error);
      await this.forgetDeadToken(token);
      return signedOut();
    }
    this.ended = false;
    return ok({
      gateway: base.value,
      device,
      pairing: this.pairingView(),
      session: {
        state: "signed-in",
        source: token.source,
        account: view.value.id,
        devices: view.value.keys.map((entry) => ({
          ...entry,
          fingerprint: keyFingerprint(entry.key),
          thisDevice: entry.key === me,
        })),
      },
    });
  }

  /** Challenge, sign, exchange for a token and save it. `create: false` never makes an account. */
  private async exchange(
    base: string,
    signer: AccountSigner,
    create: boolean,
  ): Promise<GatewayResult<void>> {
    const challenge = await gatewayJson(
      base,
      { method: "POST", path: "/auth/challenge" },
      challengeResponseSchema,
    );
    if (!challenge.ok) return challenge;
    const { nonce, gatewayKey } = challenge.value;
    const body = {
      key: signer.key,
      nonce,
      sig: signer.signIn(nonce, gatewayKey),
      label: LABEL,
      ...(create ? {} : { create: false }),
    };
    const signed = await gatewayJson(
      base,
      { method: "POST", path: "/auth/token", body },
      signInResponseSchema,
    );
    if (!signed.ok) return signed;
    const written = await writeKeyRecord({
      v: 1,
      provider: "hosted",
      baseUrl: base,
      key: signed.value.token,
    });
    if (!written.ok) return { ok: false, status: null, error: written.error };
    this.ended = false;
    process.stdout.write(
      `[account] signed in · ${signed.value.account}${signed.value.created ? " (new account)" : ""}\n`,
    );
    this.changed();
    void this.refreshQuota();
    return { ok: true, value: undefined };
  }

  async signIn(): Promise<Result<AccountStatus>> {
    const base = this.base();
    if (!base.ok) return base;
    const signer = await this.signer.get();
    if (!signer.ok) return signer;
    this.stopPairing();
    const done = await this.exchange(base.value, signer.value, true);
    return done.ok ? this.status() : fail(done.error);
  }

  /** Revokes the saved token on the gateway, then forgets it. A token from .env stays in .env. */
  async signOut(): Promise<Result<AccountStatus>> {
    const base = this.base();
    if (!base.ok) return base;
    const saved = await readKeyRecord("hosted");
    if (saved.ok && saved.value !== null) {
      const revoked = await gatewayJson(
        base.value,
        { method: "POST", path: "/auth/revoke", token: saved.value.key },
        revokedSchema,
      );
      // Unreachable: keep the token, so signing out again can still revoke it. A 401 means the
      // gateway already refuses it; there is nothing left to revoke.
      if (!revoked.ok && revoked.status !== 401) return fail(revoked.error);
    }
    const cleared = await clearKeyRecord("hosted");
    if (!cleared.ok) return cleared;
    this.ended = false;
    this.changed();
    return this.status();
  }

  async requestPairing(): Promise<Result<AccountStatus>> {
    const base = this.base();
    if (!base.ok) return base;
    const signer = await this.signer.get();
    if (!signer.ok) return signer;
    this.stopPairing();
    const challenge = await gatewayJson(
      base.value,
      { method: "POST", path: "/auth/challenge" },
      challengeResponseSchema,
    );
    if (!challenge.ok) return fail(challenge.error);
    const { nonce, gatewayKey } = challenge.value;
    const body = { key: signer.value.key, nonce, sig: signer.value.pairing(nonce, gatewayKey) };
    const asked = await gatewayJson(
      base.value,
      { method: "POST", path: "/account/pairing", body },
      pairingResponseSchema,
    );
    if (!asked.ok) return fail(asked.error);
    const expires = Date.parse(asked.value.expiresAt);
    const cap = Date.now() + PAIRING_TTL_MS;
    this.pairing = {
      ...asked.value,
      key: signer.value.key,
      fingerprint: keyFingerprint(signer.value.key),
      base: base.value,
      until: Number.isFinite(expires) ? Math.min(expires, cap) : cap,
    };
    this.schedulePoll();
    this.changed();
    return this.status();
  }

  private schedulePoll(): void {
    this.timer = setTimeout(() => void this.poll(), POLL_MS);
    (this.timer as { unref?: () => void }).unref?.();
  }

  /** Until approved or expired: approved → the token is saved; not yet → `account-unknown-key`. */
  private async poll(): Promise<void> {
    const pairing = this.pairing;
    this.timer = null;
    if (pairing === null) return;
    if (Date.now() >= pairing.until) {
      this.pairing = null;
      process.stdout.write("[account] pairing code expired\n");
      this.changed();
      return;
    }
    const signer = await this.signer.get();
    const done = signer.ok ? await this.exchange(pairing.base, signer.value, false) : null;
    if (this.pairing !== pairing) return; // cancelled, or replaced, while this poll ran
    if (done?.ok === true) {
      this.pairing = null;
      process.stdout.write("[account] pairing approved\n");
      this.changed();
      return;
    }
    // Not approved yet, the gateway busy or unreachable: ask again at the next beat.
    this.schedulePoll();
  }

  private stopPairing(): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
    this.pairing = null;
  }

  async cancelPairing(): Promise<Result<AccountStatus>> {
    this.stopPairing();
    this.changed();
    return this.status();
  }

  /** A signed add / remove statement for `key`, sent with this device's (or .env's) token. */
  private async changeKey(
    action: KeyChange,
    key: string,
    code: string | null,
  ): Promise<Result<AccountStatus>> {
    const base = this.base();
    if (!base.ok) return base;
    const signer = await this.signer.get();
    if (!signer.ok) return signer;
    const token = await this.token();
    if (token === null) return needsSignIn();
    const view = await gatewayJson(
      base.value,
      { method: "GET", path: "/account", token: token.key },
      accountViewSchema,
    );
    if (!view.ok) {
      if (view.status === 401) await this.forgetDeadToken(token);
      return fail(view.error);
    }
    const by = signer.value.key;
    const sig = signer.value.keyChange(action, view.value.id, key);
    const body =
      action === "add" ? { action, key, by, sig, code: code ?? "" } : { action, key, by, sig };
    const changed = await gatewayJson(
      base.value,
      { method: "POST", path: "/account/keys", token: token.key, body },
      accountViewSchema,
    );
    if (!changed.ok) return fail(changed.error);
    process.stdout.write(`[account] device ${action} · ${keyFingerprint(key)}\n`);
    // Removing this device stops its tokens at once: the saved one is dead, so it goes too.
    if (action === "remove" && key === by) await this.forgetDeadToken(token);
    this.changed();
    return this.status();
  }

  /** The key behind a code another device shows, for this device to compare before approving. */
  async lookupPairing(typed: string): Promise<Result<PairingLookup>> {
    const code = normalisePairingCode(typed);
    if (code === null) return this.invalidCode();
    const base = this.base();
    if (!base.ok) return base;
    const token = await this.token();
    if (token === null) return needsSignIn();
    const found = await gatewayJson(
      base.value,
      { method: "GET", path: `/account/pairing/${code}`, token: token.key },
      pairingLookupSchema,
    );
    if (found.ok) return found;
    if (found.status === 401) await this.forgetDeadToken(token);
    return fail(found.error);
  }

  private invalidCode(): Result<never> {
    return err(
      "pairing-code-invalid",
      "A pairing code is 8 letters and digits.",
      "Type the code the new device shows (dashes and spaces do not matter).",
    );
  }

  async approvePairing(code: string, typedKey: string): Promise<Result<AccountStatus>> {
    const key = typedKey.trim();
    const normal = normalisePairingCode(code);
    if (normal === null) return this.invalidCode();
    if (!AUTHOR_KEY.test(key)) {
      return err(
        "pairing-key-invalid",
        "That is not a device key.",
        "Copy the whole key the new device shows under its code.",
      );
    }
    return this.changeKey("add", key, normal);
  }

  async removeDevice(key: string): Promise<Result<AccountStatus>> {
    return this.changeKey("remove", key, null);
  }

  async quota(): Promise<Result<QuotaView>> {
    const base = this.base();
    if (!base.ok) return base;
    const token = await this.token();
    if (token === null) return needsSignIn();
    const read = await gatewayJson(
      base.value,
      { method: "GET", path: "/quota", token: token.key },
      quotaStatusSchema,
    );
    if (!read.ok) {
      if (read.status === 401) {
        await this.forgetDeadToken(token);
        return needsSignIn();
      }
      return fail(read.error);
    }
    const device = await hostedUsage(this.ctx.userData, read.value.period);
    if (!device.ok) return device;
    return ok({ quota: read.value, device: device.value });
  }

  async refreshQuota(): Promise<void> {
    const view = await this.quota();
    if (view.ok) this.ctx.broadcast(GATEWAY_IPC.quotaChanged, view.value);
  }

  dispose(): void {
    this.stopPairing();
  }
}

const services = new WeakMap<MainContext, AccountService>();

/** One account service per main context: the account IPC and the chat route share it. */
export function accountService(ctx: MainContext): AccountService {
  let service = services.get(ctx);
  if (service === undefined) {
    service = new AccountService(ctx);
    services.set(ctx, service);
  }
  return service;
}
