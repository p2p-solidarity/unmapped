// The relay service (src/turn) and the app's reading of its answer (@shared/ice) — only what an E2E
// run cannot reach (Rule 0): untrusted input on both sides of the network.
//
// Ways this fails:
// 1. Untrusted input: a web page (any site the player visits) mints relay credentials on the
//    operator's Cloudflare bill, because the Worker answers requests that carry an Origin.
// 2. Secret leak: the Worker echoes its TURN API token (or the upstream's raw answer) back to the app.
// 3. Silent failure: a Worker with no key calls Cloudflare anyway, or answers 200 with no relay, so
//    the app believes friends can always meet.
// 4. Untrusted input: the answer the app reads is not a server list (HTML, an error page, junk
//    types) and the peer connection is built from it, or the app throws instead of returning a value.
// 5. Silent failure: a port-53 URL (blocked by browsers) or a TURN URL without credentials is kept,
//    and ICE sits on it until it times out; a non-STUN/TURN scheme reaches the peer connection.

import { cleanIceServers, readIceAnswer } from "@shared/ice";
import { describe, expect, it } from "vitest";
import { handleTurn, type TurnEnv } from "../../src/turn/worker";

const TOKEN = "cf-secret-token-never-echoed";
const env: TurnEnv = { TURN_KEY_ID: "key123", TURN_KEY_API_TOKEN: TOKEN };

const upstream = {
  iceServers: [
    { urls: ["stun:stun.cloudflare.com:3478", "stun:stun.cloudflare.com:53"] },
    {
      urls: [
        "turn:turn.cloudflare.com:3478?transport=udp",
        "turn:turn.cloudflare.com:53?transport=udp",
        "turns:turn.cloudflare.com:443?transport=tcp",
      ],
      username: "user",
      credential: "pass",
    },
  ],
};

function fakeFetch(calls: string[]): typeof fetch {
  return (async (input: string | URL | Request) => {
    calls.push(String(input));
    return new Response(JSON.stringify(upstream), { status: 201 });
  }) as typeof fetch;
}

const post = (headers: Record<string, string> = {}) =>
  new Request("https://turn.example/ice", { method: "POST", headers });

describe("relay service (Worker)", () => {
  it("[1] refuses a request from a web page", async () => {
    const calls: string[] = [];
    const answer = await handleTurn(
      post({ origin: "https://evil.example" }),
      env,
      fakeFetch(calls),
    );
    expect(answer.status).toBe(403);
    expect(calls).toEqual([]);
  });

  it("[2] never sends the API token back, and drops port-53 URLs", async () => {
    const answer = await handleTurn(post(), env, fakeFetch([]));
    const text = await answer.text();
    expect(text).not.toContain(TOKEN);
    expect(text).not.toContain(":53");
    const read = readIceAnswer(JSON.parse(text));
    expect(read.ok).toBe(true);
  });

  it("[3] without a key it says so and asks nobody", async () => {
    const calls: string[] = [];
    const answer = await handleTurn(post(), {}, fakeFetch(calls));
    expect(answer.status).toBe(503);
    expect(((await answer.json()) as { error: { code: string } }).error.code).toBe("turn-no-key");
    expect(calls).toEqual([]);
  });
});

describe("the app reading the answer", () => {
  it("[4] turns junk into an error value, never a server list", () => {
    for (const junk of [null, "<html>", 42, { ok: true }, { ok: true, iceServers: "x" }]) {
      const read = readIceAnswer(junk);
      expect(read.ok).toBe(false);
    }
    const stunOnly = readIceAnswer({
      ok: true,
      iceServers: [{ urls: ["stun:stun.cloudflare.com:3478"] }],
      expiresAt: new Date().toISOString(),
    });
    expect(stunOnly.ok ? null : stunOnly.error.code).toBe("ice-no-relay");
  });

  it("[5] keeps only usable STUN/TURN URLs, and TURN only with credentials", () => {
    const cleaned = cleanIceServers([
      { urls: ["http://evil.example", "stun:a.example:53", "stun:a.example:3478"] },
      { urls: "turn:b.example:3478?transport=udp" },
      { urls: ["turns:c.example:443?transport=tcp"], username: "u", credential: "p" },
    ]);
    expect(cleaned).toEqual([
      { urls: ["stun:a.example:3478"] },
      { urls: ["turns:c.example:443?transport=tcp"], username: "u", credential: "p" },
    ]);
  });
});
