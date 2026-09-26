// Accounts on the gateway (rev 6 phase 4, D1): records of device keys, kept in the append-only
// `<data>/accounts.jsonl` and folded into memory at start. No password, no email, no world id.
//
//   sign-in   a device signs "unmapped-gateway:v1\n" + nonce + "\n" + gatewayKey over a nonce from
//             `challenge()` (single use, five minutes). An unknown key makes an account holding just
//             that key, unless it asked `create: false` (a pairing device polling for approval).
//   tokens    "ugk_" + 256 random bits, stored only as their sha256; one per device (a new sign-in
//             replaces the old token), revocable, dead after 90 idle days. The CLI issues tokens
//             with no device for .env use; they are never handed to the app over HTTP.
//   pairing   a new device asks for an 8-character code with a request signed by its key; a device
//             already in the account looks the code up (the pending key and its fingerprint, to
//             compare with the new device's screen) and approves it by signing "add" for that exact
//             key. Looking up never spends a code; approving does. Codes are single use and last ten
//             minutes; they live in memory only (a restart drops them).
//   removal   the same statement with "remove"; the removed device's tokens stop at once, and adding
//             the key again never brings them back. The last key of an account cannot be removed.
//
// Ages use `clock.now()` (the ledger clock, which the test clock moves); challenges and codes use
// `clock.real()`, which never jumps.

import { randomBytes } from "node:crypto";
import {
  ACCOUNT_ID,
  type AccountKey,
  type AccountView,
  CHALLENGE_TTL_MS,
  GATEWAY_TOKEN,
  keyFingerprint,
  normalisePairingCode,
  PAIRING_ALPHABET,
  PAIRING_TTL_MS,
  TOKEN_ID,
  TOKEN_IDLE_DAYS,
  verifyKeyChange,
  verifyPairing,
  verifySignIn,
} from "@shared/account";
import { AUTHOR_KEY, base32, DAY_MS, SIGNATURE, sha256Bytes, sha256Hex } from "@shared/history/ids";
import { type AppError, err, ok, type Result } from "@shared/result";
import { z } from "zod";
import { type GatewayClock, isoAt } from "./clock";
import { type JsonlFile, parseLines } from "./jsonl";

const IDLE_MS = TOKEN_IDLE_DAYS * DAY_MS;
/** The idle clock is written at most this often per token (an hour of precision). */
const SEEN_EVERY_MS = 3_600_000;
/** Outstanding challenges and pairing codes, each; beyond it the oldest are dropped. */
const PENDING_MAX = 10_000;

const key = z.string().regex(AUTHOR_KEY);
const account = z.string().regex(ACCOUNT_ID);
const at = z.string().max(40);
const tokenId = z.string().regex(TOKEN_ID);

const lineSchema = z.discriminatedUnion("t", [
  z.strictObject({ t: z.literal("account"), at, account, key }),
  z.strictObject({
    t: z.enum(["key.add", "key.remove"]),
    at,
    account,
    key,
    by: key,
    sig: z.string().regex(SIGNATURE),
  }),
  z.strictObject({
    t: z.literal("token"),
    at,
    account,
    tokenId,
    hash: z.string().regex(/^[a-f0-9]{64}$/),
    device: key.nullable(),
    label: z.string().max(60),
  }),
  z.strictObject({
    t: z.literal("token.revoke"),
    at,
    tokenId,
    reason: z.enum(["signed-out", "replaced", "operator"]),
  }),
  z.strictObject({ t: z.literal("token.seen"), at, tokenId }),
]);

type Line = z.output<typeof lineSchema>;

interface TokenState {
  tokenId: string;
  hash: string;
  account: string;
  device: string | null;
  label: string;
  seenMs: number;
  persistedSeenMs: number;
  revoked: boolean;
}

/** Who a valid token speaks for. */
export interface TokenAuth {
  account: string;
  tokenId: string;
  device: string | null;
}

export interface SignedIn {
  account: string;
  token: string;
  tokenId: string;
  created: boolean;
  idleDays: number;
}

/** A refusal with the HTTP status it answers. */
export interface Refusal {
  ok: false;
  error: AppError & { resetsAt?: string };
  status?: number;
}

export function refuse(status: number, code: string, message: string, hint?: string): Refusal {
  return {
    ok: false,
    error: hint === undefined ? { code, message } : { code, message, hint },
    status,
  };
}

export function tokenIdOf(token: string): string {
  return `t${base32(sha256Bytes(token)).slice(0, 16)}`;
}

function newToken(): string {
  return `ugk_${base32(randomBytes(32))}`;
}

function newCode(): string {
  // 32 letters: every byte's low five bits pick one uniformly.
  return Array.from(randomBytes(8), (byte) => PAIRING_ALPHABET[byte & 31]).join("");
}

function trim<T>(map: Map<string, T>): void {
  while (map.size >= PENDING_MAX) {
    const oldest = map.keys().next().value;
    if (oldest === undefined) return;
    map.delete(oldest);
  }
}

export class Accounts {
  private readonly accounts = new Map<string, AccountKey[]>();
  private readonly owners = new Map<string, string>();
  private readonly tokens = new Map<string, TokenState>();
  private readonly byId = new Map<string, TokenState>();
  private readonly challenges = new Map<string, number>();
  private readonly codes = new Map<string, { key: string; expires: number }>();

  constructor(
    private readonly file: JsonlFile,
    private readonly clock: GatewayClock,
    readonly gatewayKey: string,
  ) {}

  load(): Result<{ accounts: number; tokens: number; torn: number }> {
    const read = this.file.read();
    if (!read.ok) return read;
    const lines = parseLines("accounts.jsonl", read.value.lines, (raw) => {
      const parsed = lineSchema.safeParse(raw);
      return parsed.success ? parsed.data : null;
    });
    if (!lines.ok) return lines;
    for (const [index, line] of lines.value.entries()) {
      if (!this.apply(line)) {
        return err(
          "gateway-ledger-damaged",
          `accounts.jsonl line ${index + 1} (${line.t}) does not follow from the lines before it.`,
          "Restore the file from a backup; the gateway never guesses at an account.",
        );
      }
    }
    return ok({ accounts: this.accounts.size, tokens: this.tokens.size, torn: read.value.torn });
  }

  /** Folds one line; false when it cannot follow from the state (a damaged file). */
  private apply(line: Line): boolean {
    const ms = Date.parse(line.at);
    switch (line.t) {
      case "account": {
        if (this.accounts.has(line.account) || this.owners.has(line.key)) return false;
        this.accounts.set(line.account, [{ key: line.key, addedAt: line.at, addedBy: null }]);
        this.owners.set(line.key, line.account);
        return true;
      }
      case "key.add": {
        const keys = this.accounts.get(line.account);
        if (keys === undefined || this.owners.has(line.key)) return false;
        if (!keys.some((entry) => entry.key === line.by)) return false;
        keys.push({ key: line.key, addedAt: line.at, addedBy: line.by });
        this.owners.set(line.key, line.account);
        return true;
      }
      case "key.remove": {
        const keys = this.accounts.get(line.account);
        if (keys === undefined || this.owners.get(line.key) !== line.account || keys.length < 2) {
          return false;
        }
        this.accounts.set(
          line.account,
          keys.filter((entry) => entry.key !== line.key),
        );
        this.owners.delete(line.key);
        for (const token of this.tokens.values()) {
          if (token.account === line.account && token.device === line.key) token.revoked = true;
        }
        return true;
      }
      case "token": {
        const keys = this.accounts.get(line.account);
        if (keys === undefined || this.byId.has(line.tokenId) || this.tokens.has(line.hash)) {
          return false;
        }
        if (line.device !== null && this.owners.get(line.device) !== line.account) return false;
        const token: TokenState = {
          tokenId: line.tokenId,
          hash: line.hash,
          account: line.account,
          device: line.device,
          label: line.label,
          seenMs: ms,
          persistedSeenMs: ms,
          revoked: false,
        };
        this.tokens.set(line.hash, token);
        this.byId.set(line.tokenId, token);
        return true;
      }
      case "token.revoke": {
        const token = this.byId.get(line.tokenId);
        if (token === undefined) return false;
        token.revoked = true;
        return true;
      }
      case "token.seen": {
        const token = this.byId.get(line.tokenId);
        if (token === undefined || !Number.isFinite(ms)) return false;
        token.seenMs = Math.max(token.seenMs, ms);
        token.persistedSeenMs = Math.max(token.persistedSeenMs, ms);
        return true;
      }
    }
  }

  /** Appends a line, then folds it: nothing is true in memory that is not on disk. */
  private write(line: Line): Result<void> {
    const appended = this.file.append(line);
    if (!appended.ok) return appended;
    if (!this.apply(line)) {
      return err("gateway-internal", `The ${line.t} line did not fold after it was written.`);
    }
    return ok(undefined);
  }

  has(accountId: string): boolean {
    return this.accounts.has(accountId);
  }

  accountOf(deviceKey: string): string | null {
    return this.owners.get(deviceKey) ?? null;
  }

  view(accountId: string, device: string | null): AccountView | null {
    const keys = this.accounts.get(accountId);
    return keys === undefined ? null : { id: accountId, keys: keys.map((k) => ({ ...k })), device };
  }

  challenge(): { nonce: string; gatewayKey: string; expiresAt: string } {
    const real = this.clock.real();
    for (const [nonce, expires] of this.challenges) {
      if (expires > real) break;
      this.challenges.delete(nonce);
    }
    trim(this.challenges);
    const nonce = base32(randomBytes(20));
    this.challenges.set(nonce, real + CHALLENGE_TTL_MS);
    return {
      nonce,
      gatewayKey: this.gatewayKey,
      expiresAt: isoAt(this.clock.now() + CHALLENGE_TTL_MS),
    };
  }

  /** Spends a nonce: it answers once, signature right or wrong. */
  private takeChallenge(nonce: string): Refusal | null {
    const expires = this.challenges.get(nonce);
    this.challenges.delete(nonce);
    if (expires === undefined || expires <= this.clock.real()) {
      return refuse(
        401,
        "auth-challenge-invalid",
        "That challenge is unknown, already used or expired.",
        "Ask POST /v1/auth/challenge for a new one and sign it within five minutes.",
      );
    }
    return null;
  }

  signIn(request: {
    key: string;
    nonce: string;
    sig: string;
    create?: boolean;
    label?: string;
  }): Result<SignedIn> | Refusal {
    const spent = this.takeChallenge(request.nonce);
    if (spent !== null) return spent;
    if (!verifySignIn(request.key, request.sig, request.nonce, this.gatewayKey)) {
      return refuse(401, "auth-signature-invalid", "The sign-in is not signed by that key.");
    }
    let accountId = this.owners.get(request.key) ?? null;
    const created = accountId === null;
    if (accountId === null) {
      if (request.create === false) {
        return refuse(
          404,
          "account-unknown-key",
          "This device key is in no account yet.",
          "Approve its pairing code on a device already in the account, then sign in again.",
        );
      }
      accountId = `a${base32(randomBytes(16))}`;
      const made = this.write({
        t: "account",
        at: isoAt(this.clock.now()),
        account: accountId,
        key: request.key,
      });
      if (!made.ok) return made;
    }
    for (const token of this.tokens.values()) {
      if (token.account === accountId && token.device === request.key && !token.revoked) {
        const revoked = this.revoke(token.tokenId, "replaced");
        if (!revoked.ok) return revoked;
      }
    }
    const issued = this.issue(accountId, request.key, request.label ?? "device");
    if (!issued.ok) return issued;
    return ok({ account: accountId, ...issued.value, created, idleDays: TOKEN_IDLE_DAYS });
  }

  /** A token for .env use (the CLI); no device, so no sign-in replaces it. */
  issueCliToken(accountId: string, label: string): Result<{ token: string; tokenId: string }> {
    if (!this.accounts.has(accountId)) {
      return err("account-unknown", `No account ${accountId} on this gateway.`);
    }
    return this.issue(accountId, null, label);
  }

  private issue(
    accountId: string,
    device: string | null,
    label: string,
  ): Result<{ token: string; tokenId: string }> {
    const token = newToken();
    const id = tokenIdOf(token);
    const written = this.write({
      t: "token",
      at: isoAt(this.clock.now()),
      account: accountId,
      tokenId: id,
      hash: sha256Hex(token),
      device,
      label: label.slice(0, 60),
    });
    return written.ok ? ok({ token, tokenId: id }) : written;
  }

  revoke(id: string, reason: "signed-out" | "replaced" | "operator"): Result<void> {
    const token = this.byId.get(id);
    if (token === undefined) return err("account-token-unknown", `No token ${id} here.`);
    if (token.revoked) return ok(undefined);
    return this.write({ t: "token.revoke", at: isoAt(this.clock.now()), tokenId: id, reason });
  }

  /** The account an `Authorization: Bearer ugk_…` header speaks for, or a 401. */
  authenticate(header: string | null): Result<TokenAuth> | Refusal {
    const match = /^Bearer\s+(\S+)$/i.exec(header ?? "");
    const token = match?.[1] ?? "";
    const invalid = refuse(
      401,
      "account-token-invalid",
      "The gateway does not know that account token.",
      "Sign in again.",
    );
    if (!GATEWAY_TOKEN.test(token)) return invalid;
    const state = this.tokens.get(sha256Hex(token));
    if (state === undefined) return invalid;
    if (state.revoked) {
      return refuse(
        401,
        "account-token-revoked",
        "That account token was revoked.",
        "Sign in again.",
      );
    }
    const now = this.clock.now();
    if (now - state.seenMs > IDLE_MS) {
      return refuse(
        401,
        "account-token-expired",
        `That account token went unused for more than ${TOKEN_IDLE_DAYS} days.`,
        "Sign in again.",
      );
    }
    state.seenMs = Math.max(state.seenMs, now);
    if (now - state.persistedSeenMs >= SEEN_EVERY_MS) {
      // Best effort: a failed write only makes the idle clock start earlier after a restart.
      const seen = this.file.append({ t: "token.seen", at: isoAt(now), tokenId: state.tokenId });
      if (seen.ok) state.persistedSeenMs = now;
    }
    return ok({ account: state.account, tokenId: state.tokenId, device: state.device });
  }

  /** A new device asks for a code; it shows the code next to its key's fingerprint. */
  requestPairing(request: {
    key: string;
    nonce: string;
    sig: string;
  }): Result<{ code: string; expiresAt: string }> | Refusal {
    const spent = this.takeChallenge(request.nonce);
    if (spent !== null) return spent;
    if (!verifyPairing(request.key, request.sig, request.nonce, this.gatewayKey)) {
      return refuse(
        401,
        "auth-signature-invalid",
        "The pairing request is not signed by that key.",
      );
    }
    if (this.owners.has(request.key)) {
      return refuse(
        409,
        "pairing-key-in-account",
        "This device key already belongs to an account.",
        "Sign in instead; accounts never merge.",
      );
    }
    const real = this.clock.real();
    for (const [code, pending] of this.codes) {
      if (pending.key === request.key || pending.expires <= real) this.codes.delete(code);
    }
    trim(this.codes);
    let code = newCode();
    while (this.codes.has(code)) code = newCode();
    this.codes.set(code, { key: request.key, expires: real + PAIRING_TTL_MS });
    return ok({ code, expiresAt: isoAt(this.clock.now() + PAIRING_TTL_MS) });
  }

  /**
   * The key waiting behind a code, for a signed-in account about to approve it. Unknown, expired
   * and malformed codes all answer the same 404, and nothing is spent: only `changeKey` spends.
   */
  lookupPairing(
    text: string,
  ): Result<{ key: string; fingerprint: string; expiresAt: string }> | Refusal {
    const code = normalisePairingCode(text);
    const pending = code === null ? undefined : this.codes.get(code);
    if (code === null || pending === undefined || pending.expires <= this.clock.real()) {
      if (code !== null && pending !== undefined) this.codes.delete(code);
      return refuse(
        404,
        "pairing-code-unknown",
        "That pairing code is unknown, already used or expired.",
        "Ask the new device for a fresh code (they last ten minutes).",
      );
    }
    const left = pending.expires - this.clock.real();
    return ok({
      key: pending.key,
      fingerprint: keyFingerprint(pending.key),
      expiresAt: isoAt(this.clock.now() + left),
    });
  }

  /** `add` (with the new device's code) or `remove`, signed by `by`, a key in the account. */
  changeKey(
    auth: TokenAuth,
    request:
      | { action: "add"; key: string; by: string; sig: string; code: string }
      | { action: "remove"; key: string; by: string; sig: string },
  ): Result<AccountView> | Refusal {
    const keys = this.accounts.get(auth.account) ?? [];
    if (!keys.some((entry) => entry.key === request.by)) {
      return refuse(403, "account-key-not-member", "The approving key is not in this account.");
    }
    if (!verifyKeyChange(request.by, request.sig, request.action, auth.account, request.key)) {
      return refuse(
        401,
        "account-statement-invalid",
        `The ${request.action} statement is not signed by that key for this account and key.`,
      );
    }
    if (request.action === "add") {
      const code = normalisePairingCode(request.code);
      const pending = code === null ? undefined : this.codes.get(code);
      if (code === null || pending === undefined || pending.expires <= this.clock.real()) {
        if (code !== null) this.codes.delete(code);
        return refuse(
          404,
          "pairing-code-unknown",
          "That pairing code is unknown, already used or expired.",
          "Ask the new device for a fresh code (they last ten minutes).",
        );
      }
      // Spent before anything else can fail: a code is approved at most once.
      this.codes.delete(code);
      if (pending.key !== request.key) {
        return refuse(
          409,
          "pairing-code-other-key",
          "That code was asked for by another device key.",
          "Compare the fingerprints on both screens and ask the new device for a fresh code.",
        );
      }
      if (this.owners.has(request.key)) {
        return refuse(409, "pairing-key-in-account", "That key already belongs to an account.");
      }
    } else {
      if (this.owners.get(request.key) !== auth.account) {
        return refuse(404, "account-key-unknown", "That key is not in this account.");
      }
      if (keys.length < 2) {
        return refuse(
          409,
          "account-last-key",
          "That is the last key of this account.",
          "Pair another device first; with no key left nobody could sign in to it again.",
        );
      }
    }
    const written = this.write({
      t: request.action === "add" ? "key.add" : "key.remove",
      at: isoAt(this.clock.now()),
      account: auth.account,
      key: request.key,
      by: request.by,
      sig: request.sig,
    });
    if (!written.ok) return written;
    return ok(this.view(auth.account, auth.device) as AccountView);
  }
}
