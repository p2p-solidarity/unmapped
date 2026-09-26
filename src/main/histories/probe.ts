// "Test" in Settings → Shared worlds (rev 6 phase 3, D9, D10): both halves of a service address,
// from main, because the service sends no CORS headers and a page may not read it.
//
//   1. `GET <http base>/v1/health` — the service's key, version, protocol and physics;
//   2. a WebSocket to `<url>/v1/ws` — the `challenge` it greets every client with (read with
//      `readFromService`, so a server that merely accepts WebSockets fails), then closed unanswered.
//
// Both must name the same key: one address, one service. A service on another protocol, or one that
// cannot reproduce this build's physics, is reachable but not usable, and says so. No device key is
// used; nothing is signed or sent but the two requests.

import { isServiceUrl } from "@shared/history/bodies";
import { AUTHOR_KEY } from "@shared/history/ids";
import { PHYSICS_VERSION } from "@shared/physics";
import { err, ok, type Result } from "@shared/result";
import type { ServiceProbe } from "@shared/worldApi";
import { readFromService, WORLD_PROTOCOL } from "@shared/worldProtocol";
import { z } from "zod";
import { httpBase } from "./blobClient";
import { socketUrl } from "./sync";

export const PROBE_MS = 10_000;

const healthSchema = z.object({
  key: z.string().regex(AUTHOR_KEY),
  version: z.string().min(1).max(40),
  protocol: z.number().int().min(1),
  physics: z.array(z.number().int().min(1)).min(1).max(64),
  worlds: z.number().int().min(0),
  test: z.boolean(),
});

export interface ProbeImpl {
  fetch?: typeof fetch;
  WebSocket?: typeof WebSocket;
}

const seconds = (ms: number): number => Math.round(ms / 1000);

async function health(
  url: string,
  impl: ProbeImpl,
  ms: number,
): Promise<Result<{ body: z.infer<typeof healthSchema>; ms: number }>> {
  const started = performance.now();
  const fetchImpl = impl.fetch ?? globalThis.fetch;
  const at = `${httpBase(url)}/v1/health`;
  let response: Response;
  try {
    response = await fetchImpl(at, {
      signal: AbortSignal.timeout(ms),
      redirect: "error",
      headers: { accept: "application/json" },
    });
  } catch (cause) {
    const timedOut = cause instanceof Error && cause.name === "TimeoutError";
    return timedOut
      ? err(
          "world-service-timeout",
          `${at} did not answer within ${seconds(ms)} s.`,
          "Check that the service runs and this network reaches it.",
        )
      : err(
          "service-unreachable",
          `Cannot reach ${at}: ${cause instanceof Error ? cause.message : String(cause)}`,
          "Check the address and that the service runs.",
        );
  }
  let raw: unknown = null;
  try {
    raw = await response.json();
  } catch {
    raw = null;
  }
  const parsed = healthSchema.safeParse(raw);
  if (!response.ok || !parsed.success) {
    return err(
      "world-service-not-service",
      `${at} answered ${response.status}, not a world service's health line.`,
      "Check the address: a world service answers /v1/health.",
    );
  }
  return ok({ body: parsed.data, ms: Math.round(performance.now() - started) });
}

function challenge(
  url: string,
  impl: ProbeImpl,
  ms: number,
): Promise<Result<{ key: string; version: string; ms: number }>> {
  const Impl = impl.WebSocket ?? globalThis.WebSocket;
  const at = socketUrl(url);
  return new Promise((resolve) => {
    const started = performance.now();
    let socket: WebSocket;
    try {
      socket = new Impl(at);
    } catch (cause) {
      resolve(
        err(
          "service-unreachable",
          `Cannot open ${at}: ${cause instanceof Error ? cause.message : String(cause)}`,
          "Check the address and that the service runs.",
        ),
      );
      return;
    }
    let settled = false;
    const finish = (result: Result<{ key: string; version: string; ms: number }>): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      socket.onmessage = null;
      socket.onclose = null;
      socket.onerror = null;
      try {
        socket.close();
      } catch {
        // already closing
      }
      resolve(result);
    };
    const timer = setTimeout(() => {
      finish(
        err(
          "world-service-timeout",
          `${at} did not greet within ${seconds(ms)} s.`,
          "Check that the service runs and this network reaches it.",
        ),
      );
    }, ms);
    socket.onmessage = (message: MessageEvent) => {
      const frame =
        typeof message.data === "string" ? readFromService(message.data) : { ok: false as const };
      if (!frame.ok || frame.value.t !== "challenge") {
        finish(
          err(
            "world-service-not-service",
            `${at} accepted a WebSocket but did not greet like a world service.`,
            "Check the address: it must be a world service (bun run service).",
          ),
        );
        return;
      }
      const { key, version } = frame.value;
      finish(ok({ key, version, ms: Math.round(performance.now() - started) }));
    };
    const closed = (): void => {
      finish(
        err(
          "service-unreachable",
          `Cannot reach ${at}.`,
          "Check the address and that the service runs.",
        ),
      );
    };
    socket.onerror = closed;
    socket.onclose = closed;
  });
}

/** Both halves of a world service's address, or the first thing wrong with it. */
export async function probeService(
  url: string,
  impl: ProbeImpl = {},
  ms: number = PROBE_MS,
): Promise<Result<ServiceProbe>> {
  if (!isServiceUrl(url)) {
    return err(
      "world-service-url",
      `"${url}" is not a world service address.`,
      "Use wss://…, or ws://127.0.0.1:<port> for a service on this machine.",
    );
  }
  const [healthLine, greeting] = await Promise.all([
    health(url, impl, ms),
    challenge(url, impl, ms),
  ]);
  if (!healthLine.ok) return healthLine;
  if (!greeting.ok) return greeting;
  const { body } = healthLine.value;
  if (body.key !== greeting.value.key) {
    return err(
      "world-service-key-mismatch",
      "The address answers with two different service keys over HTTP and WebSocket.",
      "Two services may share this address; check the proxy in front of it.",
    );
  }
  if (body.protocol !== WORLD_PROTOCOL) {
    return err(
      "protocol-unsupported",
      `This service speaks world protocol ${body.protocol}; this build speaks ${WORLD_PROTOCOL}.`,
      "Use a service and a build of UNMAPPED that match.",
    );
  }
  if (!body.physics.includes(PHYSICS_VERSION)) {
    return err(
      "world-service-physics",
      `This service reproduces physics ${body.physics.join(", ")}; this build makes worlds on ${PHYSICS_VERSION}.`,
      "Update the service, or use another one.",
    );
  }
  return ok({
    url,
    key: body.key,
    version: body.version,
    protocol: body.protocol,
    physics: body.physics,
    worlds: body.worlds,
    test: body.test,
    healthMs: healthLine.value.ms,
    challengeMs: greeting.value.ms,
  });
}
