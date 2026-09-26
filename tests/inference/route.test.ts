// Where a chat goes (rev 6 phase 4, D2: `routeFor`, `endpointFor`, `parseConfig`) and what happens
// to a refused account token. Written as the failure list first (Rule 0); E2E cannot reach these
// because each one is a key or token going to the wrong place, or a silent change of who pays.
//
// Failures guarded:
//   1. An own key (saved, or the provider's .env variable) loses to the gateway: the player's key
//      must always win, and the allowance is used only when there is none.
//   2. A failed own-key step falls through to the gateway: a saved key that no longer reads (and no
//      .env key) is an error, not a quiet switch of payer.
//   3. The gateway is used when none is configured, or UNMAPPED_GATEWAY_URL points at plain http off
//      this machine.
//   4. A hosted token goes to another URL: a token saved for gateway A is used after the address
//      becomes B; a renderer-supplied hosted `baseUrl` (or key variable) survives `parseConfig`.
//   5. A custom endpoint is handed an .env key (the deliberate Rule 6 exception).
//   6. A readable but revoked saved token keeps shadowing UNMAPPED_GATEWAY_KEY after a 401; a stale
//      401 deletes a newer token; an .env token is "deleted".
//   7. The hosted model: an unlisted selection is sent as is (the gateway would refuse it), or a
//      gateway with no default chat model gets a guess.
//   8. `defaultConfig` prefers the allowance over an OPENAI_API_KEY, or picks hosted with no gateway.

import { forgetRefusedToken } from "@main/account/deadToken";
import { defaultConfig, parseConfig } from "@main/inference/config";
import { endpointFor, type KeyRecord, parseKeyRecord, pickApiKey } from "@main/inference/keys";
import { type RouteDeps, routeFor } from "@main/inference/route";
import { type InferenceConfig, type KeyProvider, PROVIDER_PRESETS } from "@shared/llm";
import type { GatewayModel } from "@shared/quota";
import { err, ok, type Result } from "@shared/result";
import { describe, expect, it } from "vitest";

const GATEWAY = "http://127.0.0.1:8788/v1";
const TOKEN = `ugk_${"a".repeat(52)}`;
const ENV_TOKEN = `ugk_${"b".repeat(52)}`;
const OWN = "sk-own-key-000000";

const licence = {
  id: "apache-2.0",
  name: "Apache License 2.0",
  commercial: true,
  source: "https://www.apache.org/licenses/LICENSE-2.0",
  checkedAt: "2026-09-26",
  notes: "",
};

function model(id: string, isDefault: boolean, kind: "chat" | "image" = "chat"): GatewayModel {
  return { id, object: "model", owned_by: "local", kind, default: isDefault, licence };
}

const openai: InferenceConfig = { ...PROVIDER_PRESETS.openai, sidecar: null };

/** An in-memory key store the route and the 401 rule share, like keyStore's files. */
class Store {
  records = new Map<KeyProvider, Result<KeyRecord | null>>();
  readonly deps = (env: Record<string, string | undefined>, models = [model("chat-a", true)]) =>
    ({
      env,
      readSaved: async (provider) => this.records.get(provider) ?? ok(null),
      gatewayModels: async () => ok(models),
    }) satisfies RouteDeps;
  save(provider: KeyProvider, baseUrl: string, key: string): void {
    this.records.set(provider, ok({ v: 1, provider, baseUrl, key }));
  }
  tokenStore() {
    return {
      read: async () => this.records.get("hosted") ?? ok(null),
      clear: async () => {
        this.records.delete("hosted");
        return ok(undefined);
      },
    };
  }
}

describe("routing order (1, 2, 3)", () => {
  it("sends an own key direct even when a gateway and a token exist", async () => {
    const store = new Store();
    store.save("hosted", GATEWAY, TOKEN);
    const env = { UNMAPPED_GATEWAY_URL: "http://127.0.0.1:8788", OPENAI_API_KEY: OWN };
    const fromEnv = await routeFor(openai, store.deps(env));
    expect(fromEnv.ok && fromEnv.value).toMatchObject({
      route: "direct",
      key: { key: OWN, source: "env" },
    });
    store.save("openai", PROVIDER_PRESETS.openai.baseUrl, "sk-saved-0000000");
    const saved = await routeFor(openai, store.deps(env));
    expect(saved.ok && saved.value).toMatchObject({
      route: "direct",
      config: { kind: "openai", baseUrl: PROVIDER_PRESETS.openai.baseUrl },
      key: { source: "saved" },
    });
  });

  it("goes to the gateway only without an own key, and says why", async () => {
    const store = new Store();
    store.save("hosted", GATEWAY, TOKEN);
    const routed = await routeFor(openai, store.deps({ UNMAPPED_GATEWAY_URL: GATEWAY }));
    expect(routed.ok && routed.value).toMatchObject({
      route: "hosted",
      via: "no-own-key",
      config: {
        kind: "hosted",
        baseUrl: GATEWAY,
        model: "chat-a",
        apiKeyEnv: "UNMAPPED_GATEWAY_KEY",
      },
      key: { key: TOKEN, source: "saved" },
    });
  });

  it("never switches payer when the own key cannot be read", async () => {
    const store = new Store();
    store.save("hosted", GATEWAY, TOKEN);
    store.records.set("openai", err("key-unreadable", "The saved openai key could not be read."));
    const routed = await routeFor(openai, store.deps({ UNMAPPED_GATEWAY_URL: GATEWAY }));
    expect(routed.ok).toBe(false);
    if (!routed.ok) expect(routed.error.code).toBe("key-unreadable");
  });

  it("answers no-api-key without a gateway, mentioning the allowance only when one exists", async () => {
    const store = new Store();
    const none = await routeFor(openai, store.deps({}));
    expect(!none.ok && none.error.code).toBe("no-api-key");
    expect(!none.ok && none.error.hint).not.toMatch(/allowance/);
    const hostedSelected = await routeFor(
      { ...PROVIDER_PRESETS.hosted, sidecar: null },
      store.deps({}),
    );
    expect(!hostedSelected.ok && hostedSelected.error.code).toBe("gateway-not-configured");
    const signedOut = await routeFor(openai, store.deps({ UNMAPPED_GATEWAY_URL: GATEWAY }));
    expect(!signedOut.ok && signedOut.error.code).toBe("no-api-key");
    expect(!signedOut.ok && signedOut.error.hint).toMatch(/free allowance/);
  });

  it("refuses a gateway address over plain http off this machine", async () => {
    const store = new Store();
    store.save("hosted", "http://gateway.example/v1", TOKEN);
    const env = { UNMAPPED_GATEWAY_URL: "http://gateway.example", UNMAPPED_GATEWAY_KEY: ENV_TOKEN };
    expect(endpointFor("hosted", undefined, env).ok).toBe(false);
    const routed = await routeFor({ ...PROVIDER_PRESETS.hosted, sidecar: null }, store.deps(env));
    expect(!routed.ok && routed.error.code).toBe("gateway-url-not-allowed");
    const fromOpenAi = await routeFor(openai, store.deps(env));
    expect(!fromOpenAi.ok && fromOpenAi.error.code).toBe("no-api-key");
  });

  it("keeps local kinds on this computer with no key and no gateway", async () => {
    const store = new Store();
    store.save("hosted", GATEWAY, TOKEN);
    const local = { ...PROVIDER_PRESETS.llamacpp, sidecar: null };
    const routed = await routeFor(local, store.deps({ UNMAPPED_GATEWAY_URL: GATEWAY }));
    expect(routed.ok && routed.value).toMatchObject({ route: "local", key: null, config: local });
  });
});

describe("a token or key goes only where it belongs (4, 5)", () => {
  it("never uses a token saved for another gateway", async () => {
    const store = new Store();
    store.save("hosted", "http://127.0.0.1:9999/v1", TOKEN);
    const env = { UNMAPPED_GATEWAY_URL: GATEWAY };
    // The record reads as nothing (keyStore reports it unreadable), so it is never sent.
    expect(
      parseKeyRecord(
        JSON.stringify({
          v: 1,
          provider: "hosted",
          baseUrl: "http://127.0.0.1:9999/v1",
          key: TOKEN,
        }),
        env,
      ),
    ).toBeNull();
    const routed = await routeFor({ ...PROVIDER_PRESETS.hosted, sidecar: null }, store.deps(env));
    expect(!routed.ok && routed.error.code).toBe("account-signed-out");
    const withEnv = await routeFor(
      { ...PROVIDER_PRESETS.hosted, sidecar: null },
      store.deps({ ...env, UNMAPPED_GATEWAY_KEY: ENV_TOKEN }),
    );
    expect(withEnv.ok && withEnv.value.key).toEqual({ key: ENV_TOKEN, source: "env" });
  });

  it("rewrites a renderer-supplied hosted address and key variable", () => {
    const env = { UNMAPPED_GATEWAY_URL: "http://127.0.0.1:8788/" };
    const parsed = parseConfig(
      {
        kind: "hosted",
        baseUrl: "https://collector.example/v1",
        model: "",
        apiKeyEnv: "OPENAI_API_KEY",
        sidecar: null,
      },
      env,
    );
    expect(parsed.ok && parsed.value).toMatchObject({
      baseUrl: GATEWAY,
      apiKeyEnv: "UNMAPPED_GATEWAY_KEY",
    });
    expect(parseConfig({ ...PROVIDER_PRESETS.hosted, sidecar: null }, {}).ok).toBe(false);
  });

  it("gives a hosted config pointed anywhere else no token at all", () => {
    const env = { UNMAPPED_GATEWAY_URL: GATEWAY, UNMAPPED_GATEWAY_KEY: ENV_TOKEN };
    const saved: KeyRecord = { v: 1, provider: "hosted", baseUrl: GATEWAY, key: TOKEN };
    const elsewhere: InferenceConfig = {
      ...PROVIDER_PRESETS.hosted,
      baseUrl: "https://collector.example/v1",
      sidecar: null,
    };
    expect(pickApiKey(elsewhere, saved, env)).toBeNull();
    expect(pickApiKey(elsewhere, null, env)).toBeNull();
    const openAiElsewhere = { ...openai, baseUrl: "https://collector.example/v1" };
    expect(pickApiKey(openAiElsewhere, null, { OPENAI_API_KEY: OWN })).toBeNull();
  });

  it("never hands a custom endpoint an .env key", async () => {
    const store = new Store();
    const custom: InferenceConfig = {
      ...PROVIDER_PRESETS.custom,
      baseUrl: "https://models.example/v1",
      apiKeyEnv: null,
      sidecar: null,
    };
    const env = {
      OPENAI_API_KEY: OWN,
      UNMAPPED_GATEWAY_KEY: ENV_TOKEN,
      UNMAPPED_GATEWAY_URL: GATEWAY,
    };
    const routed = await routeFor(custom, store.deps(env));
    expect(routed.ok && routed.value).toMatchObject({ route: "direct", key: null });
  });
});

describe("a refused token (6)", () => {
  it("deletes the readable saved token that got a 401, so .env takes over", async () => {
    const store = new Store();
    store.save("hosted", GATEWAY, TOKEN);
    const env = { UNMAPPED_GATEWAY_URL: GATEWAY, UNMAPPED_GATEWAY_KEY: ENV_TOKEN };
    const hosted = { ...PROVIDER_PRESETS.hosted, sidecar: null };
    const before = await routeFor(hosted, store.deps(env));
    expect(before.ok && before.value.key).toEqual({ key: TOKEN, source: "saved" });
    expect(await forgetRefusedToken({ key: TOKEN, source: "saved" }, store.tokenStore())).toBe(
      true,
    );
    const after = await routeFor(hosted, store.deps(env));
    expect(after.ok && after.value.key).toEqual({ key: ENV_TOKEN, source: "env" });
  });

  it("keeps a newer token and never touches an .env one", async () => {
    const store = new Store();
    const newer = `ugk_${"c".repeat(52)}`;
    store.save("hosted", GATEWAY, newer);
    expect(await forgetRefusedToken({ key: TOKEN, source: "saved" }, store.tokenStore())).toBe(
      false,
    );
    expect(await forgetRefusedToken({ key: newer, source: "env" }, store.tokenStore())).toBe(false);
    const kept = store.records.get("hosted");
    expect(kept?.ok && kept.value?.key).toBe(newer);
  });
});

describe("the hosted model (7) and the default (8)", () => {
  it("uses the selection when listed for chat, else the gateway's default, else refuses", async () => {
    const store = new Store();
    store.save("hosted", GATEWAY, TOKEN);
    const env = { UNMAPPED_GATEWAY_URL: GATEWAY };
    const listed = [
      model("chat-a", true),
      model("gpt-5.4-mini", false),
      model("pic", true, "image"),
    ];
    const chosen = await routeFor(openai, store.deps(env, listed));
    expect(chosen.ok && chosen.value.config.model).toBe("gpt-5.4-mini");
    const fallback = await routeFor({ ...openai, model: "pic" }, store.deps(env, listed));
    expect(fallback.ok && fallback.value.config.model).toBe("chat-a");
    const noDefault = await routeFor(openai, store.deps(env, [model("other", false)]));
    expect(!noDefault.ok && noDefault.error.code).toBe("gateway-model-unavailable");
  });

  it("defaults to OpenAI with its key, then the allowance, then this computer", () => {
    expect(defaultConfig({ OPENAI_API_KEY: OWN, UNMAPPED_GATEWAY_URL: GATEWAY }, true).kind).toBe(
      "openai",
    );
    const hosted = defaultConfig({ UNMAPPED_GATEWAY_URL: GATEWAY }, true);
    expect(hosted).toMatchObject({ kind: "hosted", baseUrl: GATEWAY });
    expect(defaultConfig({}, true).kind).toBe("apple-fm");
  });
});
