import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cspHeader } from "@main/window";
import { describe, expect, it } from "vitest";

describe("renderer Content-Security-Policy", () => {
  it("allows Rapier WebAssembly without enabling general eval", () => {
    const dev = cspHeader(true);
    const production = cspHeader(false);

    expect(dev).toContain("script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'");
    expect(production).toContain("script-src 'self' 'wasm-unsafe-eval'");
    expect(production).not.toContain("'unsafe-eval'");
  });

  it("keeps the packaged renderer meta policy WebAssembly-safe", () => {
    const html = readFileSync(join(import.meta.dirname, "../../src/renderer/index.html"), "utf8");
    expect(html).toContain("script-src 'self' 'wasm-unsafe-eval'");
    expect(html).not.toContain("'unsafe-eval'");
  });
});
