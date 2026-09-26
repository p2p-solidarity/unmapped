// Test scaffolding only (Rule 2): a tiny stand-in for a vLLM-Omni server speaking the OpenAI Images
// API, and tiny PNGs, so the Qwen-Image provider's protocol and failure paths can be checked
// without a GPU. It never draws anything: every "picture" is a fixed 1 × 1 PNG. No real Qwen-Image
// model is ever called by the tests that use it.

import { createServer, type IncomingMessage, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { deflateSync } from "node:zlib";

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (const byte of bytes) c = (CRC_TABLE[(c ^ byte) & 0xff] as number) ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  out.set(new TextEncoder().encode(type), 4);
  out.set(data, 8);
  view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}

/** A 1 × 1 PNG: RGBA with a see-through pixel (`alpha`), or opaque RGB. */
export function tinyPng(alpha: boolean): Uint8Array {
  const header = new Uint8Array(13);
  const view = new DataView(header.buffer);
  view.setUint32(0, 1);
  view.setUint32(4, 1);
  header[8] = 8;
  header[9] = alpha ? 6 : 2;
  const row = alpha ? [0, 10, 20, 30, 0] : [0, 10, 20, 30];
  const parts = [
    new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", new Uint8Array(deflateSync(new Uint8Array(row)))),
    chunk("IEND", new Uint8Array()),
  ];
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}

export interface SeenRequest {
  method: string;
  path: string;
  authorization: string | null;
  contentType: string | null;
  body: string;
}

export interface FakeQwenOptions {
  /** Model ids `/v1/models` lists. */
  models: string[];
  /** Whether `/openapi.json` lists `/v1/images/edits`. */
  edits: boolean;
  /** Whether a drawn picture has an alpha channel. */
  alpha: boolean;
  /** Answer `/v1/models` with a redirect to this URL instead. */
  redirectModelsTo?: string;
}

export interface FakeQwen {
  base: string;
  seen: SeenRequest[];
  close(): Promise<void>;
}

async function readBody(request: IncomingMessage): Promise<string> {
  const parts: Buffer[] = [];
  for await (const part of request) parts.push(part as Buffer);
  return Buffer.concat(parts).toString("latin1");
}

export async function startFakeQwen(options: FakeQwenOptions): Promise<FakeQwen> {
  const seen: SeenRequest[] = [];
  const server: Server = createServer(async (request, response) => {
    const body = await readBody(request);
    const path = request.url ?? "/";
    seen.push({
      method: request.method ?? "GET",
      path,
      authorization: request.headers.authorization ?? null,
      contentType: request.headers["content-type"] ?? null,
      body,
    });
    const json = (status: number, value: unknown) => {
      response.writeHead(status, { "content-type": "application/json" });
      response.end(JSON.stringify(value));
    };
    if (path === "/v1/models") {
      if (options.redirectModelsTo !== undefined) {
        response.writeHead(302, { location: options.redirectModelsTo });
        response.end();
        return;
      }
      json(200, { object: "list", data: options.models.map((id) => ({ id, object: "model" })) });
      return;
    }
    if (path === "/openapi.json") {
      const paths: Record<string, unknown> = { "/v1/images/generations": {} };
      if (options.edits) paths["/v1/images/edits"] = {};
      json(200, { openapi: "3.1.0", paths });
      return;
    }
    if (path === "/v1/images/generations" || (path === "/v1/images/edits" && options.edits)) {
      json(200, {
        created: 0,
        data: [{ b64_json: Buffer.from(tinyPng(options.alpha)).toString("base64") }],
      });
      return;
    }
    json(404, { error: { message: `no route ${path}` } });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return {
    base: `http://127.0.0.1:${port}/v1`,
    seen,
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}
