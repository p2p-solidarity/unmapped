// The service's HTTP side (rev 6 phase 3, D9, D10): blobs, a health line, and the test clock.
//
//   GET  /v1/health                          { key, version, protocol, physics, worlds, broken, test }
//   PUT  /v1/worlds/<id>/blobs/<sha256 hex>  store a pack (owner or member; body hashes to the name)
//   GET  /v1/worlds/<id>/blobs/<sha256 hex>  fetch it (whoever may read the world, or an invitee)
//   POST /v1/test/advance {days}             UNMAPPED_SERVICE_TEST=1 only: move the receipt clock
//                                            forward and run a beat pass at once
//
// Blob requests carry `X-Unmapped-Auth: <key>.<ts>.<sig>` over the method, the exact path, the time
// (±300 s of the service's real clock) and the body's sha256 (`readBlobAuth`). Blobs are opaque:
// the service checks only that the bytes hash to their name and fit the limits (each ≤ 32 MiB, a
// world's ≤ 256 MiB); clients verify and unpack them. No CORS headers are sent: the app talks to
// the service from main, never from a page.

import { mayWrite } from "@shared/history/access";
import { EVENT_ID } from "@shared/history/ids";
import { readBlobAuth } from "@shared/history/sign";
import { PHYSICS_SUPPORTED } from "@shared/physics";
import type { AppError } from "@shared/result";
import { WORLD_PROTOCOL } from "@shared/worldProtocol";
import { z } from "zod";
import { beatPass } from "./beats";
import { isoAt } from "./clock";
import { type Hub, SERVICE_VERSION } from "./hub";
import { BLOB_HASH, sha256File } from "./store";

export interface HttpContext {
  hub: Hub;
  test: boolean;
  /** Test mode: moves the receipt clock; returns the total offset in days. */
  advance: (days: number) => number;
}

const BLOB_PATH = /^\/v1\/worlds\/([^/]+)\/blobs\/([^/]+)$/;
const advanceSchema = z.strictObject({ days: z.number().positive().max(3650) });

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

function fail(status: number, error: AppError): Response {
  return json(status, { error });
}

const notFound = (): Response =>
  fail(404, { code: "not-found", message: "No such endpoint on this world service." });

async function blob(
  context: HttpContext,
  request: Request,
  path: string,
  worldId: string,
  hash: string,
): Promise<Response> {
  const { hub } = context;
  if (!EVENT_ID.test(worldId) || !BLOB_HASH.test(hash)) return notFound();
  const world = hub.worlds.get(worldId);
  if (world === undefined) {
    return fail(
      404,
      hub.broken.get(worldId) ?? { code: "world-unknown", message: "No such world here." },
    );
  }
  const put = request.method === "PUT";
  if (put) {
    const declared = Number(request.headers.get("content-length") ?? "0");
    if (Number.isFinite(declared) && declared > hub.limits.blobBytes) {
      return fail(413, {
        code: "quota-blob-size",
        message: `A blob is at most ${hub.limits.blobBytes} bytes.`,
      });
    }
  }
  const body = put ? new Uint8Array(await request.arrayBuffer()) : new Uint8Array(0);
  const header = request.headers.get("x-unmapped-auth") ?? "";
  const signed = (ms: number) =>
    readBlobAuth(header, { method: request.method, path, body, nowS: Math.floor(ms / 1000) });
  let auth = signed(Date.now());
  // In test mode a client may sign with the advanced clock (UNMAPPED_TEST_CLOCK_DAYS).
  if (!auth.ok && auth.error.code === "blob-auth-stale" && context.test) {
    auth = signed(hub.clock.now());
  }
  if (!auth.ok) return fail(401, auth.error);
  const key = auth.value;
  if (!put) {
    if (!hub.mayReadBlob(world, key)) {
      const access = hub.readAccess(world, key, null);
      return fail(
        403,
        access.ok ? { code: "access-denied", message: "Not yours to read." } : access.error,
      );
    }
    if (!world.blobs.has(hash)) {
      return fail(404, { code: "blob-unknown", message: "This world has no such blob." });
    }
    const bytes = hub.store.readBlob(hash);
    if (!bytes.ok) return fail(500, bytes.error);
    return new Response(bytes.value, {
      status: 200,
      headers: {
        "content-type": "application/octet-stream",
        "content-length": String(bytes.value.length),
        "cache-control": "no-store",
      },
    });
  }
  const door = mayWrite(world.now, "place", key);
  if (!door.ok) return fail(403, door.error);
  if (body.length > hub.limits.blobBytes) {
    return fail(413, {
      code: "quota-blob-size",
      message: `A blob is at most ${hub.limits.blobBytes} bytes.`,
    });
  }
  if (sha256File(body) !== hash) {
    return fail(400, {
      code: "blob-hash-mismatch",
      message: "The bytes do not hash to that name.",
    });
  }
  if (world.blobs.has(hash)) return json(200, { hash, bytes: body.length, stored: false });
  if (world.blobBytes + body.length > hub.limits.worldBlobBytes) {
    return fail(413, {
      code: "quota-world-blobs",
      message: "This world's blobs are full.",
      hint: "The service operator can raise --world-blob-bytes.",
    });
  }
  const stored = hub.store.addBlob(world.id, hash, body);
  if (!stored.ok) return fail(500, stored.error);
  world.blobs.set(hash, body.length);
  return json(201, { hash, bytes: body.length, stored: true });
}

async function advance(context: HttpContext, request: Request): Promise<Response> {
  if (!context.test) {
    return fail(403, {
      code: "test-mode-off",
      message: "The test clock is off.",
      hint: "Start the service with UNMAPPED_SERVICE_TEST=1.",
    });
  }
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return fail(400, { code: "advance-invalid", message: 'Send {"days": <number>}.' });
  }
  const parsed = advanceSchema.safeParse(raw);
  if (!parsed.success) {
    return fail(400, { code: "advance-invalid", message: "days must be in (0, 3650]." });
  }
  const offsetDays = context.advance(parsed.data.days);
  const beats = beatPass(context.hub);
  return json(200, { offsetDays, now: isoAt(context.hub.clock.now()), beats });
}

/** Every HTTP request that is not the WebSocket upgrade. */
export async function handleHttp(context: HttpContext, request: Request): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname;
  const { hub } = context;
  try {
    if (path === "/v1/health" && request.method === "GET") {
      return json(200, {
        key: hub.key.key,
        version: SERVICE_VERSION,
        protocol: WORLD_PROTOCOL,
        physics: PHYSICS_SUPPORTED,
        worlds: hub.worlds.size,
        broken: hub.broken.size,
        test: context.test,
      });
    }
    if (path === "/v1/test/advance" && request.method === "POST") {
      return await advance(context, request);
    }
    const match = BLOB_PATH.exec(path);
    if (match !== null && (request.method === "GET" || request.method === "PUT")) {
      return await blob(context, request, path, match[1] ?? "", match[2] ?? "");
    }
    return notFound();
  } catch (error) {
    hub.log(
      `http ${request.method} ${path}: ${error instanceof Error ? error.stack : String(error)}`,
    );
    return fail(500, { code: "service-internal", message: "The service failed on that request." });
  }
}
