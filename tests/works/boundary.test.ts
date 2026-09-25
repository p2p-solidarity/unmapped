// The host side of the work frame boundary: what a world page is allowed to load, and which
// messages from it the host believes.

import { buildFramePage, FrameSessions, frameCsp } from "@main/works/frame";
import { WORK_LIMITS } from "@shared/works";
import { describe, expect, it } from "vitest";
import { acceptFrameMessage, newRateWindow } from "../../src/renderer/works/frameGuard";

const TOKEN = `w${"a".repeat(32)}`;
const FRAME = { id: "frame-window" };

function event(data: unknown, overrides: Partial<{ source: unknown; origin: string }> = {}) {
  return { source: FRAME, origin: "null", data, ...overrides };
}

describe("frame page", () => {
  const page = buildFramePage({
    token: TOKEN,
    title: "Test",
    text: {
      main: 'const a = 1;\nconst s = "</script><script>alert(1)</script>";\nthrow new Error("x");',
      style: "body { color: red; }\n</style><script>bad()</script>",
      assets: "{}",
    },
    assets: {},
    state: null,
    carry: null,
    nonce: "N0NCE",
  });

  it("denies network, eval, frames, workers and forms; scripts need the nonce", () => {
    const csp = frameCsp("N0NCE");
    expect(csp).toContain("default-src 'none'");
    expect(csp).toContain("connect-src 'none'");
    expect(csp).toContain("script-src 'nonce-N0NCE'");
    expect(csp).toContain("frame-src 'none'");
    expect(csp).toContain("worker-src 'none'");
    expect(csp).toContain("form-action 'none'");
    expect(csp).not.toContain("unsafe-eval");
    expect(page.csp).toBe(csp);
    expect(page.html).toContain(`content="${csp}"`);
  });

  it("world text cannot close its script or style element", () => {
    expect(page.html).not.toContain("</script><script>alert(1)");
    expect(page.html).not.toContain("</style><script>bad()");
    // Only the host's own three script elements carry the nonce.
    expect(page.html.match(/nonce="N0NCE"/g)?.length).toBe(3);
  });

  it("maps main.js line numbers from page lines", () => {
    const boot = JSON.parse(
      /<script type="application\/json" id="ulw-boot">(.*?)<\/script>/.exec(page.html)?.[1] ?? "{}",
    ) as { mainStart: number; mainEnd: number };
    const lines = page.html.split("\n");
    expect(lines[boot.mainStart - 1]).toBe("const a = 1;");
    expect(lines[boot.mainEnd - 1]).toBe('throw new Error("x");');
  });

  it("gives every session a fresh unguessable host", () => {
    const sessions = new FrameSessions();
    const a = sessions.create(() => page);
    const b = sessions.create(() => page);
    expect(a.token).toMatch(/^w[a-f0-9]{32}$/);
    expect(a.url).toBe(`ulwork://${a.token}/`);
    expect(a.token).not.toBe(b.token);
    sessions.close(a.token);
    expect(sessions.page(a.token)).toBeNull();
  });
});

describe("frame message guard", () => {
  const expected = { source: FRAME, token: TOKEN };
  const save = { ulw: 1, token: TOKEN, type: "save", state: { score: 3 } };

  it("accepts a well-formed message from the session's own frame", () => {
    const verdict = acceptFrameMessage(event(save), expected, newRateWindow(), 1);
    expect(verdict.ok).toBe(true);
  });

  it("rejects other windows, non-opaque origins, other tokens and unknown shapes", () => {
    const rate = newRateWindow();
    const reason = (data: unknown, overrides = {}) => {
      const verdict = acceptFrameMessage(event(data, overrides), expected, rate, 1);
      return verdict.ok ? "ok" : verdict.reason;
    };
    expect(reason(save, { source: { id: "other" } })).toBe("source");
    expect(reason(save, { origin: "http://localhost:5173" })).toBe("origin");
    expect(reason({ ...save, token: `w${"b".repeat(32)}` })).toBe("token");
    expect(reason({ ...save, type: "exec", code: "require('fs')" })).toBe("schema");
    expect(reason({ ...save, ulw: 2 })).toBe("schema");
    expect(reason({ ulw: 1, token: TOKEN, type: "status", text: "x".repeat(500) })).toBe("schema");
  });

  it("rejects oversized payloads and throttles floods", () => {
    const big = { ...save, state: "x".repeat(WORK_LIMITS.messageBytes + 1) };
    expect(acceptFrameMessage(event(big), expected, newRateWindow(), 1)).toEqual({
      ok: false,
      reason: "size",
    });
    const rate = newRateWindow();
    const verdicts = Array.from({ length: WORK_LIMITS.messagesPerSecond + 5 }, () =>
      acceptFrameMessage(event(save), expected, rate, 10),
    );
    expect(verdicts.filter((verdict) => verdict.ok)).toHaveLength(WORK_LIMITS.messagesPerSecond);
    expect(rate.dropped).toBe(5);
    expect(acceptFrameMessage(event(save), expected, rate, 1_200).ok).toBe(true);
  });
});
