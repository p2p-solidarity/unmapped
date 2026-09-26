// Blob reads from a page (rev 6 phase 4, D7: the browser proof; `--browser-origin`). Isolated
// because the request comes from a browser tab, which E2E drives only from the one origin it was
// configured for — a hostile origin cannot be staged there. What this file guards, written before
// the code:
//   1. An origin that is not configured — or any origin, with no flag at all — gets a CORS header,
//      so any page could read a world's packs with a stolen or replayed auth header.
//   2. A configured origin's preflight lacks what the browser needs (method, the auth header, the
//      exact origin, Vary), so the proof cannot read a pack.
//   3. A blob GET is served without `nosniff` and `sandbox`, so a pack opened as a page could run.
//   4. `--browser-origin` accepts something that is not an exact origin (a path, a wildcard,
//      another scheme), which would never match — or match too much.

import { blobAuthHeader } from "@shared/history/sign";
import { describe, expect, it } from "vitest";
import { parseArgs } from "../../src/service/config";
import { handleHttp } from "../../src/service/http";
import { sha256File } from "../../src/service/store";
import { attach, Client, LocalWorld, makeService, OWNER } from "./support";

const PAGE = "https://proof.unmapped.test";

async function setup(origins?: string[]) {
  const service = makeService();
  const world = new LocalWorld();
  attach(new Client(service.hub, OWNER), world);
  const bytes = new TextEncoder().encode("a cartridge pack");
  const path = `/v1/worlds/${world.id}/blobs/${sha256File(bytes)}`;
  const context = {
    hub: service.hub,
    test: false,
    advance: () => 0,
    ...(origins === undefined ? {} : { browserOrigins: origins }),
  };
  const send = (
    method: string,
    headers: Record<string, string> = {},
    body?: Uint8Array<ArrayBuffer>,
  ) =>
    handleHttp(
      context,
      new Request(`http://127.0.0.1${path}`, {
        method,
        ...(body === undefined ? {} : { body }),
        headers: {
          "x-unmapped-auth": blobAuthHeader(OWNER, {
            method,
            path,
            ts: Math.floor(Date.now() / 1000),
            body: body ?? new Uint8Array(0),
          }),
          ...headers,
        },
      }),
    );
  expect((await send("PUT", {}, bytes)).status).toBe(201);
  return send;
}

describe("--browser-origin", () => {
  it("sends no CORS header to an origin that is not configured (1)", async () => {
    for (const origins of [undefined, [PAGE]]) {
      const send = await setup(origins);
      const got = await send("GET", { origin: "https://evil.example" });
      expect(got.status).toBe(200);
      expect(got.headers.get("access-control-allow-origin")).toBeNull();
      const pre = await send("OPTIONS", { origin: "https://evil.example" });
      expect(pre.headers.get("access-control-allow-origin")).toBeNull();
    }
    const none = await setup();
    const asPage = await none("OPTIONS", { origin: PAGE });
    expect(asPage.headers.get("access-control-allow-origin")).toBeNull();
  });

  it("answers a configured origin's preflight and GET exactly (2)", async () => {
    const send = await setup([PAGE]);
    const pre = await send("OPTIONS", { origin: PAGE });
    expect(pre.status).toBe(204);
    expect(Object.fromEntries(pre.headers)).toMatchObject({
      "access-control-allow-origin": PAGE,
      "access-control-allow-methods": "GET",
      "access-control-allow-headers": "X-Unmapped-Auth",
      "access-control-max-age": "600",
      vary: "Origin",
    });
    const got = await send("GET", { origin: PAGE });
    expect(got.headers.get("access-control-allow-origin")).toBe(PAGE);
    expect(got.headers.get("vary")).toBe("Origin");
  });

  it("serves every blob GET with nosniff and a sandbox (3)", async () => {
    const send = await setup();
    const got = await send("GET");
    expect(got.headers.get("content-type")).toBe("application/octet-stream");
    expect(got.headers.get("x-content-type-options")).toBe("nosniff");
    expect(got.headers.get("content-security-policy")).toBe("sandbox");
  });

  it("takes only exact http(s) origins (4)", () => {
    const origin = (value: string) => {
      const parsed = parseArgs(["--data", "/tmp/x", "--browser-origin", value], {});
      return parsed.ok && parsed.value !== "help" ? parsed.value.browserOrigins : parsed.ok;
    };
    expect(origin(PAGE)).toEqual([PAGE]);
    expect(origin("http://127.0.0.1:5174")).toEqual(["http://127.0.0.1:5174"]);
    for (const bad of [`${PAGE}/`, `${PAGE}/app`, "*", "file:///tmp", "ftp://x.test"]) {
      expect(origin(bad)).toBe(false);
    }
  });
});
