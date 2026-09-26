// What the gateway refuses to start with (rev 6 phase 4, D2, D4) and what it never serves. Only
// what E2E cannot reach: operator files that are wrong. What this file guards, written before the
// code:
//   1. GATEWAY_COMMERCIAL=1 starts with a model whose licence is non-commercial, or a model with no
//      licence record at all is listed.
//   2. An upstream key travels over plain http to a remote host, or an .env key is used when a
//      saved key exists (saved → env, the app's order), or a saved key that cannot be read stops
//      the .env key.
//   3. The gateway key file is regenerated over a file it cannot read.
//   4. A second gateway runs on the same data dir (two writers would fork the ledger).
//   5. A torn last ledger line stops the start; a malformed line in the middle is guessed at.
//   6. CORS answers an origin that is not in GATEWAY_WEB_ORIGINS, or ever answers the webhook.
//   7. A refused start writes into the data dir first — the lock, gateway-key.json, admin-secret —
//      so a start the operator still has to fix leaves secrets behind (found by p4-licence).

import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { writeSavedKey } from "../../src/gateway/secrets";
import type { UpstreamsFile } from "../../src/gateway/upstreams";
import {
  account,
  call,
  chat,
  defaultCosts,
  defaultUpstreams,
  grant,
  openWith,
  secretOf,
  start,
  tempDir,
  writeSetup,
} from "./support";

function refusedWith(dir: string, env: Record<string, string> = {}): string {
  const { opened } = openWith({ dir, env });
  if (opened.ok) {
    opened.value.close();
    return "started";
  }
  return opened.error.code;
}

function withModel(
  model: UpstreamsFile["upstreams"][number]["models"][number],
  extra: Partial<UpstreamsFile> = {},
) {
  const upstreams = { ...defaultUpstreams(), ...extra };
  upstreams.upstreams[0]?.models.push(model);
  return upstreams;
}

function remote(baseUrl: string): UpstreamsFile {
  return {
    v: 1,
    upstreams: [
      {
        id: "remote",
        kind: "openai",
        baseUrl,
        keyEnv: "REMOTE_UPSTREAM_KEY",
        models: [{ id: "test-chat", kind: "chat", licence: "apache-2.0", default: true }],
      },
    ],
  };
}

describe("licences (1)", () => {
  it("refuses a non-commercial model in commercial mode, and any model without a licence record", async () => {
    const dir = tempDir();
    writeSetup(
      dir,
      withModel({ id: "qwen-image-2.1", kind: "image", licence: "qwen-research" }),
      defaultCosts(),
    );
    expect(refusedWith(dir, { GATEWAY_COMMERCIAL: "1" })).toBe("gateway-noncommercial-upstream");
    expect(refusedWith(dir)).toBe("started");

    const unlicensed = tempDir();
    writeSetup(unlicensed, withModel({ id: "mystery", kind: "chat", licence: "yours-to-check" }));
    expect(refusedWith(unlicensed)).toBe("gateway-model-unlicensed");

    const shadow = tempDir();
    const record = {
      name: "Mine",
      commercial: true,
      source: "https://example.org/terms",
      checkedAt: "2026-09-26",
      notes: "",
    };
    writeSetup(shadow, { ...defaultUpstreams(), licences: [{ id: "qwen-research", ...record }] });
    expect(refusedWith(shadow)).toBe("gateway-upstreams-invalid");

    const own = tempDir();
    writeSetup(
      own,
      withModel(
        { id: "house-model", kind: "chat", licence: "house-terms" },
        { licences: [{ id: "house-terms", ...record }] },
      ),
      [
        ...defaultCosts(),
        {
          model: "house-model",
          upstream: "local",
          perMillion: { input: 1, cachedInput: 1, output: 1 },
          source: "own",
          asOf: "2026-01-01",
        },
      ],
    );
    const h = start({ dir: own });
    const listed = (await call(h.gw, "GET", "/v1/models")).body.data;
    expect(
      listed.map((model: { id: string; licence: { id: string } }) => [model.id, model.licence.id]),
    ).toEqual([
      ["test-chat", "apache-2.0"],
      ["test-image", "apache-2.0"],
      ["house-model", "house-terms"],
    ]);
    h.gw.close();
  });
});

describe("upstream keys (2)", () => {
  it("never sends a key over plain http off this machine", () => {
    for (const [baseUrl, expected] of [
      ["http://10.0.0.5:8080/v1", "gateway-upstream-insecure"],
      ["http://api.example.org/v1", "gateway-upstream-insecure"],
      ["http://127.0.0.1:8080/v1", "started"],
      ["https://api.example.org/v1", "started"],
    ] as const) {
      const dir = tempDir();
      writeSetup(dir, remote(baseUrl), [
        {
          model: "test-chat",
          upstream: "remote",
          perMillion: { input: 1, cachedInput: 1, output: 1 },
          source: "t",
          asOf: "2026-01-01",
        },
      ]);
      expect(refusedWith(dir, { REMOTE_UPSTREAM_KEY: "env-key-0000001" })).toBe(expected);
    }
  });

  it("resolves saved → .env, and an unreadable saved file never hides the .env key", async () => {
    const costs = [
      {
        model: "test-chat",
        upstream: "remote",
        perMillion: { input: 1, cachedInput: 1, output: 1 },
        source: "t",
        asOf: "2026-01-01",
      },
    ];
    const env = { REMOTE_UPSTREAM_KEY: "env-key-0000001" };
    const dir = tempDir();
    writeSetup(dir, remote("https://api.example.org/v1"), costs);
    expect(refusedWith(dir)).toBe("gateway-upstream-no-key");
    expect(writeSavedKey(dir, "remote", "saved-key-0000002").ok).toBe(true);
    const saved = start({ dir, env });
    const a = await account(saved.gw, secretOf("keys-a"));
    await grant(saved.gw, a.account, 100_000);
    await chat(saved.gw, a.token, "req-keys-00001");
    expect(saved.upstream.calls[0]?.auth).toBe("Bearer saved-key-0000002");
    saved.gw.close();

    writeFileSync(join(dir, "keys.json"), "{ not json");
    const fallback = start({ dir, env });
    expect(fallback.gw.report.warnings.join("\n")).toContain("keys.json cannot be read");
    await chat(fallback.gw, a.token, "req-keys-00002");
    expect(fallback.upstream.calls[0]?.auth).toBe("Bearer env-key-0000001");
    fallback.gw.close();
  });
});

describe("the gateway key file (3)", () => {
  it("never makes a new key over a file it cannot read", () => {
    const h = start();
    h.gw.close();
    const path = join(h.dir, "gateway-key.json");
    const good = readFileSync(path, "utf8");
    for (const damaged of [
      "not json",
      JSON.stringify({ ...JSON.parse(good), key: `k${"a".repeat(52)}` }),
    ]) {
      writeFileSync(path, damaged);
      expect(refusedWith(h.dir)).toBe("gateway-key-unreadable");
      expect(readFileSync(path, "utf8")).toBe(damaged);
    }
    writeFileSync(path, good);
    const again = start({ dir: h.dir });
    expect(again.gw.report.gatewayKey).toBe(h.gw.report.gatewayKey);
    again.gw.close();
  });
});

describe("one writer (4)", () => {
  it("refuses a second gateway on the same data dir", () => {
    const h = start();
    expect(refusedWith(h.dir)).toBe("gateway-data-locked");
    h.gw.close();
    expect(refusedWith(h.dir)).toBe("started");
  });
});

describe("damaged files (5)", () => {
  it("sets a torn last line aside, and refuses a bad line in the middle", async () => {
    const h = start();
    const a = await account(h.gw, secretOf("torn-a"));
    await grant(h.gw, a.account, 10);
    h.gw.close();
    const path = join(h.dir, "ledger.jsonl");
    const good = readFileSync(path, "utf8");
    writeFileSync(path, `${good}{"t":"grant","at":"2026-10`);
    const torn = start({ dir: h.dir });
    expect(torn.gw.report.warnings.join("\n")).toContain("ledger.jsonl: a torn last line");
    expect(readFileSync(path, "utf8")).toBe(good);
    expect(readdirSync(h.dir).some((name) => name.startsWith("ledger.jsonl.torn-"))).toBe(true);
    expect((await call(torn.gw, "GET", "/v1/quota", { token: a.token })).body.granted).toBe(10);
    torn.gw.close();

    writeFileSync(path, `garbage\n${good}`);
    const { opened } = openWith({ dir: h.dir });
    expect(opened.ok ? "" : opened.error.message).toContain("ledger.jsonl line 1");
    const accounts = join(h.dir, "accounts.jsonl");
    writeFileSync(path, good);
    writeFileSync(
      accounts,
      `${readFileSync(accounts, "utf8")}${JSON.stringify({ t: "token.revoke", at: "x", tokenId: `t${"a".repeat(16)}`, reason: "operator" })}\n`,
    );
    expect(refusedWith(h.dir)).toBe("gateway-ledger-damaged");
    expect(existsSync(accounts)).toBe(true);
  });
});

describe("a refused start writes nothing (7)", () => {
  it("leaves the data dir as the operator left it, or never makes it", () => {
    const operatorFiles = ["costs.json", "upstreams.json"];
    const cases: Array<[string, (dir: string) => void, Record<string, string>]> = [
      [
        "gateway-noncommercial-upstream",
        (dir) =>
          writeSetup(
            dir,
            withModel({ id: "qwen-image-2.1", kind: "image", licence: "qwen-research" }),
          ),
        { GATEWAY_COMMERCIAL: "1" },
      ],
      ["gateway-billing-incomplete", (dir) => writeSetup(dir), { STRIPE_SECRET_KEY: "sk_test_a1" }],
      [
        "gateway-costs-invalid",
        (dir) => {
          writeSetup(dir);
          writeFileSync(join(dir, "costs.json"), "{ not json");
        },
        {},
      ],
    ];
    for (const [code, setup, env] of cases) {
      const dir = tempDir();
      setup(dir);
      expect(refusedWith(dir, env)).toBe(code);
      expect(readdirSync(dir).sort()).toEqual(operatorFiles);
    }
    const empty = tempDir();
    expect(refusedWith(empty)).toBe("gateway-no-upstreams");
    expect(readdirSync(empty)).toEqual([]);
    const missing = join(tempDir(), "not-made-yet");
    expect(openWith({ dir: missing }).opened.ok).toBe(false);
    expect(existsSync(missing)).toBe(false);
  });
});

describe("CORS (6)", () => {
  it("answers only the listed origins, and never on the webhook or admin routes", async () => {
    const h = start({ env: { GATEWAY_WEB_ORIGINS: "https://unmapped.example, not a url" } });
    const from = (origin: string, method = "GET", path = "/v1/status") =>
      call(h.gw, method, path, { headers: { origin } });
    expect(
      (await from("https://unmapped.example")).headers.get("access-control-allow-origin"),
    ).toBe("https://unmapped.example");
    expect(
      (await from("https://evil.example")).headers.get("access-control-allow-origin"),
    ).toBeNull();
    expect((await from("https://evil.example", "OPTIONS")).status).toBe(403);
    const preflight = await from("https://unmapped.example", "OPTIONS", "/v1/chat/completions");
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get("access-control-allow-headers")).toContain("x-request-id");
    for (const path of ["/v1/billing/webhook", "/v1/admin/grant", "/v1/test/advance"]) {
      const answer = await from("https://unmapped.example", "POST", path);
      expect(answer.headers.get("access-control-allow-origin")).toBeNull();
      expect((await from("https://unmapped.example", "OPTIONS", path)).status).toBe(403);
    }
    h.gw.close();
  });
});
