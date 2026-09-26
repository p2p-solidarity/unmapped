// The gateway's accounts (rev 6 phase 4, D1). Only what E2E cannot reach: forged keys, replays and
// time running out. What this file guards, written before the code:
//   1. A forged sign-in is accepted: signed by another key than it names, over another text (the
//      world service's `unmapped-ws:v1`, a pairing request), or for another gateway's key.
//   2. A challenge is used twice (a replayed sign-in), or outlives its five minutes.
//   3. A token is accepted that the gateway never issued (forged, or one character changed), after
//      it was revoked, or after 90 idle days; or a token is stored in clear.
//   4. `create: false` makes an account (a pairing device that polls before approval would own a
//      second account forever: accounts never merge).
//   5. A pairing code is approved twice, after its ten minutes, for another key than asked for it,
//      by a key outside the account, by a statement for another account or action, or for a key
//      that already belongs to an account.
//   6. A removed device's token still works, or comes back to life when the key is added again.
//   7. The last key of an account is removed (nobody could ever sign in to it again).
//   8. A restart forgets an account, a key, a revocation or an idle clock (they live in the file).
//   9. An admin route (the only HTTP answer that carries a token or grants credits) answers anyone
//      but the CLI on this host: another address, a proxied request, or a wrong or missing secret.
//  10. The pairing lookup (code → the pending key, so the approver types only the code) answers
//      without a signed-in account (no token, a forged one), spends the code (so the approval then
//      fails) or answers one already spent, expired, unknown or malformed (or 500s on a bad escape),
//      names another key or fingerprint than the one that asked, or is not rate-limited like the
//      other pairing routes.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  accountViewSchema,
  keyFingerprint,
  pairingLookupSchema,
  pairingResponseSchema,
  signKeyChange,
  signPairing,
  signSignIn,
} from "@shared/account";
import { base32 } from "@shared/history/ids";
import { signWsAuth } from "@shared/history/sign";
import { describe, expect, it } from "vitest";
import { tokenIdOf } from "../../src/gateway/accounts";
import {
  account,
  call,
  DAY_MS,
  type Harness,
  keyOf,
  linesOf,
  nonceOf,
  secretOf,
  signIn,
  start,
} from "./support";

const A = secretOf("device-a");
const B = secretOf("device-b");
const C = secretOf("device-c");

async function tokenCall(h: Harness, token: string) {
  return call(h.gw, "GET", "/v1/account", { token });
}

async function signedIn(h: Harness, secret: Uint8Array, sig: (nonce: string) => string) {
  const nonce = await nonceOf(h.gw);
  return call(h.gw, "POST", "/v1/auth/token", {
    json: { key: keyOf(secret), nonce, sig: sig(nonce) },
  });
}

/** B asks for a pairing code; returns it. */
async function pairingCode(h: Harness, secret: Uint8Array): Promise<string> {
  const nonce = await nonceOf(h.gw);
  const sig = signPairing(secret, nonce, h.gw.report.gatewayKey);
  const answer = await call(h.gw, "POST", "/v1/account/pairing", {
    json: { key: keyOf(secret), nonce, sig },
  });
  expect(answer.status).toBe(200);
  expect(pairingResponseSchema.safeParse(answer.body).success).toBe(true);
  return answer.body.code as string;
}

function addStatement(by: Uint8Array, accountId: string, key: string, code: string) {
  return { action: "add", key, by: keyOf(by), sig: signKeyChange(by, "add", accountId, key), code };
}

describe("sign-in (1, 2)", () => {
  it("refuses a sign-in signed by another key, over another text, or for another gateway", async () => {
    const h = start();
    const gatewayKey = h.gw.report.gatewayKey;
    const byOther = await signedIn(h, A, (nonce) => signSignIn(B, nonce, gatewayKey));
    const wsText = await signedIn(h, A, (nonce) => signWsAuth(A, nonce, gatewayKey));
    const pairText = await signedIn(h, A, (nonce) => signPairing(A, nonce, gatewayKey));
    const otherGateway = await signedIn(h, A, (nonce) => signSignIn(A, nonce, keyOf(C)));
    for (const answer of [byOther, wsText, pairText, otherGateway]) {
      expect(answer.status).toBe(401);
      expect(answer.body.error.code).toBe("auth-signature-invalid");
    }
    expect(linesOf(h.dir, "accounts.jsonl")).toEqual([]);
    const good = await signedIn(h, A, (nonce) => signSignIn(A, nonce, gatewayKey));
    expect(good.status).toBe(200);
    expect(good.body.created).toBe(true);
    h.gw.close();
  });

  it("spends a challenge once, right or wrong, and lets it expire after five minutes", async () => {
    const h = start();
    const gatewayKey = h.gw.report.gatewayKey;
    const nonce = await nonceOf(h.gw);
    const body = { key: keyOf(A), nonce, sig: signSignIn(A, nonce, gatewayKey) };
    expect((await call(h.gw, "POST", "/v1/auth/token", { json: body })).status).toBe(200);
    const replay = await call(h.gw, "POST", "/v1/auth/token", { json: body });
    expect(replay.status).toBe(401);
    expect(replay.body.error.code).toBe("auth-challenge-invalid");

    const burnt = await nonceOf(h.gw);
    const forged = { key: keyOf(B), nonce: burnt, sig: signSignIn(A, burnt, gatewayKey) };
    expect((await call(h.gw, "POST", "/v1/auth/token", { json: forged })).status).toBe(401);
    const afterForgery = { key: keyOf(B), nonce: burnt, sig: signSignIn(B, burnt, gatewayKey) };
    const retry = await call(h.gw, "POST", "/v1/auth/token", { json: afterForgery });
    expect(retry.body.error.code).toBe("auth-challenge-invalid");

    const late = await nonceOf(h.gw);
    h.clock.tick(5 * 60_000 + 1);
    const expired = await call(h.gw, "POST", "/v1/auth/token", {
      json: { key: keyOf(B), nonce: late, sig: signSignIn(B, late, gatewayKey) },
    });
    expect(expired.body.error.code).toBe("auth-challenge-invalid");
    h.gw.close();
  });
});

describe("tokens (3, 4)", () => {
  it("refuses a token it never issued, one changed by a character, a revoked one and a stale one", async () => {
    const h = start();
    const { token, tokenId } = await account(h.gw, A);
    expect((await tokenCall(h, token)).status).toBe(200);
    const forged = `ugk_${base32(new Uint8Array(32).fill(7))}`;
    const last = token.at(-1) === "a" ? "b" : "a";
    for (const bad of [forged, `${token.slice(0, -1)}${last}`, "ugk_short", `x${token}`]) {
      const answer = await tokenCall(h, bad);
      expect(answer.status).toBe(401);
      expect(answer.body.error.code).toBe("account-token-invalid");
    }
    expect(tokenIdOf(token)).toBe(tokenId);

    const file = readFileSync(join(h.dir, "accounts.jsonl"), "utf8");
    expect(file).not.toContain(token);
    expect(file).not.toContain(token.slice(4));

    // Used at day 89, it lives another 90 idle days; then it is dead.
    h.clock.advance(89);
    expect((await tokenCall(h, token)).status).toBe(200);
    h.clock.advance(89);
    expect((await tokenCall(h, token)).status).toBe(200);
    h.clock.ms += 90 * DAY_MS + 1;
    const stale = await tokenCall(h, token);
    expect(stale.body.error.code).toBe("account-token-expired");

    const fresh = await account(h.gw, A);
    expect((await call(h.gw, "POST", "/v1/auth/revoke", { token: fresh.token })).status).toBe(200);
    const revoked = await tokenCall(h, fresh.token);
    expect(revoked.status).toBe(401);
    expect(revoked.body.error.code).toBe("account-token-revoked");
    h.gw.close();
  });

  it("keeps one token per device: a new sign-in replaces the old one", async () => {
    const h = start();
    const first = await account(h.gw, A);
    const second = await account(h.gw, A);
    expect(second.account).toBe(first.account);
    expect((await tokenCall(h, first.token)).body.error.code).toBe("account-token-revoked");
    expect((await tokenCall(h, second.token)).status).toBe(200);
    h.gw.close();
  });

  it("never makes an account for create: false", async () => {
    const h = start();
    for (let i = 0; i < 2; i += 1) {
      const answer = await signIn(h.gw, B, { create: false });
      expect(answer.status).toBe(404);
      expect(answer.body.error.code).toBe("account-unknown-key");
    }
    expect(linesOf(h.dir, "accounts.jsonl")).toEqual([]);
    h.gw.close();
  });
});

describe("pairing (5)", () => {
  it("approves a code once, for the key that asked, by a key in the account", async () => {
    const h = start();
    const a = await account(h.gw, A);
    const code = await pairingCode(h, B);
    const approve = (statement: unknown) =>
      call(h.gw, "POST", "/v1/account/keys", { token: a.token, json: statement });
    const added = await approve(addStatement(A, a.account, keyOf(B), code));
    expect(added.status).toBe(200);
    expect(added.body.keys.map((entry: { key: string }) => entry.key)).toEqual([
      keyOf(A),
      keyOf(B),
    ]);
    const twice = await approve(addStatement(A, a.account, keyOf(B), code));
    expect(twice.body.error.code).toBe("pairing-code-unknown");

    const b = await signIn(h.gw, B, { create: false });
    expect(b.status).toBe(200);
    expect(b.body.account).toBe(a.account);
    expect(b.body.created).toBe(false);
    h.gw.close();
  });

  it("refuses a code after ten minutes, for another key, by an outsider, or for another statement", async () => {
    const h = start();
    const a = await account(h.gw, A);
    const outsider = await account(h.gw, C);
    const approve = (token: string, statement: unknown) =>
      call(h.gw, "POST", "/v1/account/keys", { token, json: statement });

    const late = await pairingCode(h, B);
    h.clock.tick(10 * 60_000 + 1);
    expect(
      (await approve(a.token, addStatement(A, a.account, keyOf(B), late))).body.error.code,
    ).toBe("pairing-code-unknown");

    const forB = await pairingCode(h, B);
    const other = secretOf("device-d");
    const wrongKey = await approve(a.token, addStatement(A, a.account, keyOf(other), forB));
    expect(wrongKey.body.error.code).toBe("pairing-code-other-key");
    // A mismatched approval burns the code: the right key cannot use it afterwards.
    expect(
      (await approve(a.token, addStatement(A, a.account, keyOf(B), forB))).body.error.code,
    ).toBe("pairing-code-unknown");

    const code = await pairingCode(h, B);
    const byOutsider = await approve(a.token, addStatement(C, a.account, keyOf(B), code));
    expect(byOutsider.status).toBe(403);
    expect(byOutsider.body.error.code).toBe("account-key-not-member");
    const otherAccount = await approve(a.token, {
      ...addStatement(A, a.account, keyOf(B), code),
      sig: signKeyChange(A, "add", outsider.account, keyOf(B)),
    });
    expect(otherAccount.body.error.code).toBe("account-statement-invalid");
    const otherAction = await approve(a.token, {
      ...addStatement(A, a.account, keyOf(B), code),
      sig: signKeyChange(A, "remove", a.account, keyOf(B)),
    });
    expect(otherAction.body.error.code).toBe("account-statement-invalid");
    // The outsider's own token cannot add B to A's account either.
    const viaOutsider = await approve(outsider.token, addStatement(A, a.account, keyOf(B), code));
    expect(viaOutsider.body.error.code).toBe("account-key-not-member");
    expect(linesOf(h.dir, "accounts.jsonl").filter((line) => line.t === "key.add")).toEqual([]);
    h.gw.close();
  });

  it("refuses a pairing request from a key that already belongs to an account", async () => {
    const h = start();
    await account(h.gw, C);
    const nonce = await nonceOf(h.gw);
    const sig = signPairing(C, nonce, h.gw.report.gatewayKey);
    const answer = await call(h.gw, "POST", "/v1/account/pairing", {
      json: { key: keyOf(C), nonce, sig },
    });
    expect(answer.status).toBe(409);
    expect(answer.body.error.code).toBe("pairing-key-in-account");
    h.gw.close();
  });
});

describe("removal and restarts (6, 7, 8)", () => {
  it("stops a removed device's token at once, for good, and never removes the last key", async () => {
    const h = start();
    const a = await account(h.gw, A);
    const code = await pairingCode(h, B);
    await call(h.gw, "POST", "/v1/account/keys", {
      token: a.token,
      json: addStatement(A, a.account, keyOf(B), code),
    });
    const b = await account(h.gw, B);
    expect((await tokenCall(h, b.token)).status).toBe(200);
    const remove = (by: Uint8Array, key: string, token = a.token) =>
      call(h.gw, "POST", "/v1/account/keys", {
        token,
        json: {
          action: "remove",
          key,
          by: keyOf(by),
          sig: signKeyChange(by, "remove", a.account, key),
        },
      });
    expect((await remove(A, keyOf(B))).status).toBe(200);
    expect((await tokenCall(h, b.token)).body.error.code).toBe("account-token-revoked");

    const again = await pairingCode(h, B);
    await call(h.gw, "POST", "/v1/account/keys", {
      token: a.token,
      json: addStatement(A, a.account, keyOf(B), again),
    });
    expect((await tokenCall(h, b.token)).body.error.code).toBe("account-token-revoked");
    const b2 = await account(h.gw, B);
    expect((await tokenCall(h, b2.token)).status).toBe(200);

    expect((await remove(B, keyOf(A), b2.token)).status).toBe(200);
    const last = await remove(B, keyOf(B), b2.token);
    expect(last.status).toBe(409);
    expect(last.body.error.code).toBe("account-last-key");
    h.gw.close();
  });

  it("remembers accounts, keys, revocations and idle clocks across a restart", async () => {
    const h = start();
    const a = await account(h.gw, A);
    const revoked = await account(h.gw, C);
    await call(h.gw, "POST", "/v1/auth/revoke", { token: revoked.token });
    h.clock.advance(50);
    expect((await tokenCall(h, a.token)).status).toBe(200);
    h.gw.close();

    const again = start({ dir: h.dir, clock: h.clock });
    h.clock.advance(89);
    const view = await call(again.gw, "GET", "/v1/account", { token: a.token });
    expect(view.status).toBe(200);
    expect(accountViewSchema.safeParse(view.body).success).toBe(true);
    expect(view.body).toEqual({
      id: a.account,
      keys: [{ key: keyOf(A), addedAt: expect.any(String), addedBy: null }],
      device: keyOf(A),
    });
    expect((await tokenCall(again, revoked.token)).body.error.code).toBe("account-token-revoked");
    expect(again.gw.report.gatewayKey).toBe(h.gw.report.gatewayKey);
    h.clock.ms += 90 * DAY_MS + 1;
    expect((await tokenCall(again, a.token)).body.error.code).toBe("account-token-expired");
    again.gw.close();
  });
});

describe("admin routes (9)", () => {
  it("hand a token or credits only to the CLI on this host", async () => {
    const h = start();
    const a = await account(h.gw, A);
    const secret = h.gw.state.adminSecret;
    const ask = (loopback: boolean, headers: Record<string, string>) =>
      call(h.gw, "POST", "/v1/admin/token", {
        loopback,
        headers,
        json: { account: a.account, label: "env" },
      });
    const refused = [
      await ask(false, { "x-unmapped-admin": secret }),
      await ask(true, { "x-unmapped-admin": secret, "x-forwarded-for": "198.51.100.9" }),
      await ask(true, { "x-unmapped-admin": `${secret.slice(0, -1)}x` }),
      await ask(true, {}),
    ];
    expect(refused.map((answer) => answer.status)).toEqual([403, 403, 403, 403]);
    expect(refused.every((answer) => !answer.text.includes("ugk_"))).toBe(true);
    const issued = await ask(true, { "x-unmapped-admin": secret });
    expect(issued.status).toBe(200);
    const view = await tokenCall(h, issued.body.token);
    expect(view.body).toMatchObject({ id: a.account, device: null });
    h.gw.close();
  });
});

describe("pairing lookup (10)", () => {
  const look = (h: Harness, code: string, token?: string) =>
    call(h.gw, "GET", `/v1/account/pairing/${code}`, token === undefined ? {} : { token });

  it("answers the key that asked to a signed-in account only, and never spends the code", async () => {
    const h = start();
    const a = await account(h.gw, A);
    const code = await pairingCode(h, B);
    expect((await look(h, code)).status).toBe(401);
    expect((await look(h, code, `ugk_${"a".repeat(52)}`)).status).toBe(401);
    const typed = `${code.slice(0, 4).toLowerCase()}-${code.slice(4)}`;
    const found = await look(h, typed, a.token);
    expect(found.status).toBe(200);
    expect(pairingLookupSchema.parse(found.body)).toMatchObject({
      key: keyOf(B),
      fingerprint: keyFingerprint(keyOf(B)),
    });
    expect((await look(h, code, a.token)).status).toBe(200);
    const added = await call(h.gw, "POST", "/v1/account/keys", {
      token: a.token,
      json: addStatement(A, a.account, keyOf(B), code),
    });
    expect(added.status).toBe(200);
    const spent = await look(h, code, a.token);
    expect(spent.status).toBe(404);
    expect(spent.body.error.code).toBe("pairing-code-unknown");
    h.gw.close();
  });

  it("answers one 404 for expired, unknown and malformed codes", async () => {
    const h = start();
    const a = await account(h.gw, A);
    const late = await pairingCode(h, B);
    h.clock.tick(10 * 60_000 + 1);
    for (const code of [late, "ABCDEFGH", "short", "%E0%A4%A", "O0O0O0O0"]) {
      const answer = await look(h, code, a.token);
      expect(answer.status, code).toBe(404);
      expect(answer.body.error.code, code).toBe("pairing-code-unknown");
    }
    h.gw.close();
  });

  it("is rate-limited per address like the other pairing routes", async () => {
    const h = start({ limits: { authPerMinute: 4 } });
    const a = await account(h.gw, A);
    expect((await look(h, "ABCDEFGH", a.token)).status).toBe(404);
    expect((await look(h, "ABCDEFGH", a.token)).status).toBe(404);
    const flooded = await look(h, "ABCDEFGH", a.token);
    expect(flooded.status).toBe(429);
    expect(flooded.body.error.code).toBe("gateway-busy");
    h.gw.close();
  });
});
