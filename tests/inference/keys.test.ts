// API keys typed on screen (System → Model) are the one secret the renderer can hand to main.
// Written before `src/main/inference/keys.ts`; each test names the failure it guards:
//
//  1. Exfiltration by edit — a key saved for one custom endpoint is sent to another base URL
//     after the player (or a compromised renderer) changes the endpoint.
//  2. Exfiltration by transport — a key is bound to a plain-http endpoint on another machine,
//     where anyone on the network can read the Authorization header.
//  3. Header injection — a key with whitespace, a newline or a control character is stored and
//     later spliced into an HTTP header.
//  4. Oversized or foreign payloads — a huge string, an unknown provider ("llamacpp",
//     "__proto__") or extra fields are accepted from the untrusted renderer.
//  5. Wrong resolution order — the .env key wins over a key the player saved, or an .env key
//     reaches a custom endpoint.
//  6. Corrupt storage — an undecodable or tampered key file crashes or yields a half-read key
//     instead of reading as "not set".
//  7. Status leak — the status the renderer sees carries the key (or any part of it).
//  8. Lost fallback — a saved key that no longer reads (keychain locked, file damaged) blocks
//     the working OPENAI_API_KEY in .env, so every model and picture call fails.

import {
  describeKey,
  parseKeyRecord,
  parseSetApiKey,
  pickApiKey,
  resolveKey,
  serializeKeyRecord,
} from "@main/inference/keys";
import { type InferenceConfig, PROVIDER_PRESETS } from "@shared/llm";
import { err, ok } from "@shared/result";
import { describe, expect, it } from "vitest";

const KEY = "sk-test-not-real-0123456789";

const custom = (baseUrl: string): InferenceConfig => ({
  ...PROVIDER_PRESETS.custom,
  baseUrl,
  model: "some-model",
  sidecar: null,
});
const openai: InferenceConfig = { ...PROVIDER_PRESETS.openai, sidecar: null };

function savedFor(provider: "openai" | "custom", key: string, baseUrl?: string) {
  const parsed = parseSetApiKey({ provider, key, ...(baseUrl === undefined ? {} : { baseUrl }) });
  if (!parsed.ok) throw new Error(parsed.error.message);
  return parsed.value;
}

describe("binding a saved key to its endpoint", () => {
  it("[1] never sends a custom key to a base URL other than the one it was saved for", () => {
    const record = savedFor("custom", KEY, "https://models.example/v1");
    expect(pickApiKey(custom("https://models.example/v1"), record, {})?.key).toBe(KEY);
    expect(pickApiKey(custom("https://models.example/v1/"), record, {})?.key).toBe(KEY);
    expect(pickApiKey(custom("https://collector.example/v1"), record, {})).toBeNull();
    expect(pickApiKey(custom("https://models.example/other/v1"), record, {})).toBeNull();
    expect(pickApiKey(custom("http://models.example/v1"), record, {})).toBeNull();
  });

  it("[1] never uses one provider's saved key for another provider", () => {
    const record = savedFor("openai", KEY);
    expect(pickApiKey(custom("https://api.openai.com/v1"), record, {})).toBeNull();
  });

  it("[2] refuses to bind a key to plain http on another machine, allows https and loopback", () => {
    expect(parseSetApiKey({ provider: "custom", key: KEY, baseUrl: "http://10.0.0.8/v1" }).ok).toBe(
      false,
    );
    expect(
      parseSetApiKey({ provider: "custom", key: KEY, baseUrl: "https://x.example/v1" }).ok,
    ).toBe(true);
    expect(
      parseSetApiKey({ provider: "custom", key: KEY, baseUrl: "http://127.0.0.1:8000/v1" }).ok,
    ).toBe(true);
    expect(parseSetApiKey({ provider: "custom", key: KEY }).ok).toBe(false);
  });

  it("[2] binds OpenAI keys to the OpenAI endpoint whatever the renderer claims", () => {
    const record = savedFor("openai", KEY, "https://collector.example/v1");
    expect(record.baseUrl).toBe(PROVIDER_PRESETS.openai.baseUrl);
  });
});

describe("validating the payload", () => {
  it("[3] rejects keys with whitespace, newlines or control characters", () => {
    for (const key of [
      "sk-abc def-123456",
      "sk-abc\r\nX-Evil: 1",
      "sk-abc\u0000defghij",
      "ｓｋ-全角キー12345",
    ]) {
      expect(parseSetApiKey({ provider: "openai", key }).ok, JSON.stringify(key)).toBe(false);
    }
  });

  it("[3] trims surrounding whitespace from a pasted key", () => {
    expect(savedFor("openai", `  ${KEY}\n`).key).toBe(KEY);
  });

  it("[4] rejects oversized keys, unknown providers and extra fields", () => {
    expect(parseSetApiKey({ provider: "openai", key: `sk-${"a".repeat(600)}` }).ok).toBe(false);
    expect(parseSetApiKey({ provider: "openai", key: "short" }).ok).toBe(false);
    for (const provider of ["llamacpp", "__proto__", "ollama", ""]) {
      expect(parseSetApiKey({ provider, key: KEY }).ok, provider).toBe(false);
    }
    expect(parseSetApiKey({ provider: "openai", key: KEY, apiKeyEnv: "HOME" }).ok).toBe(false);
    expect(parseSetApiKey(null).ok).toBe(false);
    expect(parseSetApiKey("sk-test").ok).toBe(false);
  });
});

describe("resolution order", () => {
  it("[5] prefers the saved key over .env, and falls back to .env when nothing is saved", () => {
    const env = { OPENAI_API_KEY: "sk-from-env-0123456789" };
    expect(pickApiKey(openai, savedFor("openai", KEY), env)).toEqual({ key: KEY, source: "saved" });
    expect(pickApiKey(openai, null, env)).toEqual({ key: env.OPENAI_API_KEY, source: "env" });
    expect(pickApiKey(openai, null, { OPENAI_API_KEY: "" })).toBeNull();
  });

  it("[5] never sends an .env key to a custom endpoint", () => {
    const env = { OPENAI_API_KEY: "sk-from-env-0123456789" };
    expect(pickApiKey(custom("https://models.example/v1"), null, env)).toBeNull();
  });

  it("[8] a saved key that no longer reads still lets the .env key through", () => {
    const env = { OPENAI_API_KEY: "sk-from-env-0123456789" };
    const broken = err("key-unreadable", "The saved openai key could not be read.");
    expect(resolveKey(openai, broken, env)).toEqual(ok({ key: env.OPENAI_API_KEY, source: "env" }));
    const none = resolveKey(openai, broken, {});
    expect(none.ok ? null : none.error.code).toBe("key-unreadable");
    const customBroken = resolveKey(custom("https://models.example/v1"), broken, env);
    expect(customBroken.ok ? null : customBroken.error.code).toBe("key-unreadable");
    expect(resolveKey(openai, ok(savedFor("openai", KEY)), env)).toEqual(
      ok({ key: KEY, source: "saved" }),
    );
  });
});

describe("reading stored records", () => {
  it("[6] reads corrupt, tampered or foreign files as not set", () => {
    const good = serializeKeyRecord(savedFor("custom", KEY, "https://models.example/v1"));
    expect(parseKeyRecord(good)?.key).toBe(KEY);
    for (const text of [
      "",
      "{",
      "null",
      JSON.stringify({ v: 2, provider: "openai", baseUrl: "https://api.openai.com/v1", key: KEY }),
      JSON.stringify({
        v: 1,
        provider: "openai",
        baseUrl: "https://api.openai.com/v1",
        key: "a b",
      }),
      JSON.stringify({ v: 1, provider: "custom", baseUrl: "http://10.0.0.8/v1", key: KEY }),
      JSON.stringify({ v: 1, provider: "vllm", baseUrl: "http://127.0.0.1:8000/v1", key: KEY }),
    ]) {
      expect(parseKeyRecord(text), text).toBeNull();
    }
  });
});

describe("the status the renderer sees", () => {
  it("[7] says set/source/endpoint and never carries the key", () => {
    const saved = describeKey("custom", savedFor("custom", KEY, "https://models.example/v1"), {});
    expect(saved).toEqual({ set: true, source: "saved", boundTo: "https://models.example/v1" });
    const fromEnv = describeKey("openai", null, { OPENAI_API_KEY: "sk-from-env-0123456789" });
    expect(fromEnv).toEqual({ set: true, source: "env", boundTo: PROVIDER_PRESETS.openai.baseUrl });
    expect(describeKey("openui-gateway", null, {})).toEqual({
      set: false,
      source: null,
      boundTo: null,
    });
    expect(JSON.stringify(saved)).not.toContain("0123456789");
    expect(JSON.stringify(fromEnv)).not.toContain("0123456789");
  });
});
