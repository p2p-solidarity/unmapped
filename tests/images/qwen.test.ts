// The self-hosted Qwen-Image provider (rev 6 phase 4, D4), against a fake OpenAI-Images server
// (tests/fixtures/images/fakeQwen.ts). No GPU is involved and no real Qwen-Image model is called:
// only the protocol and its failure paths, which E2E cannot reach without a GPU endpoint.
// Written before `src/main/images/qwen.ts`; each test names the failure it guards:
//
//  1. Key exfiltration by transport — QWEN_IMAGE_BASE_URL on plain http off this machine still
//     gets a request, or the key in an Authorization header.
//  2. Key exfiltration by redirect — the server answers with a redirect and the key follows it to
//     another host.
//  3. A reference silently dropped — the server has no `/v1/images/edits`, the picture is drawn
//     without the world's look, and the result still claims it was drawn over it.
//  4. The wrong licence claimed — the server serves another model (Qwen-Image-2.1 under the
//     2512 provider) and the picture is stored under the Apache-2.0 licence anyway.
//  5. An opaque asset accepted — a transparent background was asked for, the picture came back
//     without alpha, and it is kept as a see-through asset.
//  6. A dead server reported as something else — nothing listens, and the error does not say how
//     to start one.

import { probeQwen, type QwenDeps, qwenImageProvider } from "@main/images/qwen";
import { pickProviderKey } from "@main/inference/keys";
import { ok } from "@shared/result";
import { afterEach, describe, expect, it, vi } from "vitest";
import { type FakeQwen, startFakeQwen, tinyPng } from "../fixtures/images/fakeQwen";

const KEY = "qwen-test-key-not-real-0123";
const servers: FakeQwen[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.close()));
});

async function fake(options: Parameters<typeof startFakeQwen>[0]): Promise<FakeQwen> {
  const server = await startFakeQwen(options);
  servers.push(server);
  return server;
}

function deps(base: string, key: string | null, fetcher: typeof fetch = fetch): QwenDeps {
  return {
    env: { QWEN_IMAGE_BASE_URL: base },
    fetch: fetcher,
    resolveKey: async () => ok(key === null ? null : { key, source: "env" as const }),
    resize: (image) => image,
  };
}

const signal = () => new AbortController().signal;

describe("where a Qwen-Image request may go", () => {
  it("[1] sends nothing, key or no key, to plain http off this machine", async () => {
    const spy = vi.fn(fetch);
    const provider = qwenImageProvider(
      "qwen-image-2512",
      deps("http://images.example.test/v1", KEY, spy),
    );
    const drawn = await provider.generate("a boat", signal());
    expect(drawn.ok).toBe(false);
    if (!drawn.ok) expect(drawn.error.code).toBe("image-endpoint-not-allowed");
    const probe = await probeQwen(
      "qwen-image-2512",
      deps("http://images.example.test/v1", KEY, spy),
      signal(),
    );
    expect(probe.ok).toBe(false);
    expect(spy).not.toHaveBeenCalled();
    // The key store never hands out a key bound to such an address either.
    const env = { QWEN_IMAGE_BASE_URL: "http://images.example.test/v1", QWEN_IMAGE_API_KEY: KEY };
    expect(pickProviderKey("qwen-image", null, env)).toBeNull();
    expect(pickProviderKey("qwen-image", null, { QWEN_IMAGE_API_KEY: KEY })?.key).toBe(KEY);
  });

  it("[1] refuses a remote https server with no key instead of calling it keyless", async () => {
    const spy = vi.fn(fetch);
    const drawn = await qwenImageProvider(
      "qwen-image-2512",
      deps("https://images.example.test/v1", null, spy),
    ).generate("a boat", signal());
    expect(drawn.ok).toBe(false);
    if (!drawn.ok) expect(drawn.error.code).toBe("no-api-key");
    expect(spy).not.toHaveBeenCalled();
  });

  it("[2] never lets the key follow a redirect to another host", async () => {
    const elsewhere = await fake({ models: ["Qwen/Qwen-Image-2512"], edits: false, alpha: true });
    const server = await fake({
      models: [],
      edits: false,
      alpha: true,
      redirectModelsTo: `${elsewhere.base}/models`,
    });
    const drawn = await qwenImageProvider("qwen-image-2512", deps(server.base, KEY)).generate(
      "a boat",
      signal(),
    );
    expect(drawn.ok).toBe(false);
    if (!drawn.ok) expect(drawn.error.code).toBe("image-server-unreachable");
    expect(server.seen[0]?.authorization).toBe(`Bearer ${KEY}`);
    expect(elsewhere.seen).toEqual([]);
  });
});

describe("what a Qwen-Image picture claims", () => {
  it("[3] says usedReference: false when the server lists no edits route", async () => {
    const server = await fake({ models: ["Qwen/Qwen-Image-2512"], edits: false, alpha: true });
    const drawn = await qwenImageProvider("qwen-image-2512", deps(server.base, null)).generate(
      "a boat",
      signal(),
      { reference: tinyPng(false) },
    );
    expect(drawn.ok).toBe(true);
    if (!drawn.ok) return;
    expect(drawn.value.usedReference).toBe(false);
    expect(drawn.value.call).toBe("images.generate");
    expect(server.seen.map((one) => one.path)).toContain("/v1/images/generations");
    expect(server.seen.map((one) => one.path)).not.toContain("/v1/images/edits");
  });

  it("[3] sends the reference through /v1/images/edits when the server lists it", async () => {
    const server = await fake({ models: ["Qwen/Qwen-Image-2512"], edits: true, alpha: true });
    const drawn = await qwenImageProvider("qwen-image-2512", deps(server.base, null)).generate(
      "a boat",
      signal(),
      { reference: tinyPng(false) },
    );
    expect(drawn.ok).toBe(true);
    if (!drawn.ok) return;
    expect(drawn.value.usedReference).toBe(true);
    expect(drawn.value.call).toBe("images.edit");
    const edit = server.seen.find((one) => one.path === "/v1/images/edits");
    expect(edit?.contentType).toMatch(/^multipart\/form-data/);
    expect(edit?.body).toContain('name="image"; filename="look.png"');
    // Keyless on this machine: nothing to send, so no Authorization header.
    expect(edit?.authorization).toBeNull();
  });

  it("[4] refuses to draw when the server serves another model than its licence covers", async () => {
    const server = await fake({ models: ["Qwen/Qwen-Image-2.1"], edits: false, alpha: true });
    const drawn = await qwenImageProvider("qwen-image-2512", deps(server.base, null)).generate(
      "a boat",
      signal(),
    );
    expect(drawn.ok).toBe(false);
    if (!drawn.ok) expect(drawn.error.code).toBe("image-model-not-served");
    expect(server.seen.some((one) => one.path.startsWith("/v1/images/"))).toBe(false);
  });

  it("[4] carries the licence record of the model that drew it", async () => {
    const server = await fake({ models: ["Qwen/Qwen-Image-2.1"], edits: false, alpha: true });
    const drawn = await qwenImageProvider("qwen-image-2.1", deps(server.base, KEY)).generate(
      "a boat",
      signal(),
    );
    expect(drawn.ok).toBe(true);
    if (!drawn.ok) return;
    expect(drawn.value.licence).toBe("qwen-research");
    expect(drawn.value.provider).toBe("qwen-image-2.1");
    const body = JSON.parse(
      server.seen.find((one) => one.path === "/v1/images/generations")?.body ?? "{}",
    );
    expect(body).toMatchObject({ model: "Qwen/Qwen-Image-2.1", background: "transparent" });
  });

  it("[5] refuses an asset that came back without alpha, but not an opaque concept", async () => {
    const server = await fake({ models: ["Qwen/Qwen-Image-2512"], edits: false, alpha: false });
    const provider = qwenImageProvider("qwen-image-2512", deps(server.base, null));
    const asset = await provider.generate("a boat", signal());
    expect(asset.ok).toBe(false);
    if (!asset.ok) expect(asset.error.code).toBe("image-no-alpha");
    const concept = await provider.generate("a harbour", signal(), { kind: "concept" });
    expect(concept.ok).toBe(true);
  });

  it("[5] refuses an alpha channel with nothing see-through in it", async () => {
    const server = await fake({ models: ["Qwen/Qwen-Image-2512"], edits: false, alpha: true });
    const drawn = await qwenImageProvider("qwen-image-2512", {
      ...deps(server.base, null),
      transparent: () => false,
    }).generate("a boat", signal());
    expect(drawn.ok).toBe(false);
    if (!drawn.ok) expect(drawn.error.code).toBe("image-no-alpha");
  });
});

describe("a Qwen-Image server that is not there", () => {
  it("[6] says it is unreachable and how to start it", async () => {
    const server = await fake({ models: [], edits: false, alpha: true });
    const base = server.base;
    await server.close();
    servers.splice(servers.indexOf(server), 1);
    const drawn = await qwenImageProvider("qwen-image-2.1", deps(base, null)).generate(
      "a boat",
      signal(),
    );
    expect(drawn.ok).toBe(false);
    if (drawn.ok) return;
    expect(drawn.error.code).toBe("image-server-unreachable");
    expect(drawn.error.hint).toContain("vllm serve Qwen/Qwen-Image-2.1 --omni --port 8091");
  });
});
