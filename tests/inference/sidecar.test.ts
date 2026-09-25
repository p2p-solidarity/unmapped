import { createRingBuffer, STDERR_LINES, sidecarArgs } from "@main/inference/sidecar";
import type { SidecarConfig } from "@shared/llm";
import { describe, expect, it } from "vitest";

const config: SidecarConfig = {
  binaryPath: "/opt/homebrew/bin/llama-server",
  modelPath: "/Users/p/models/Qwen3.5-4B-Q4_K_M.gguf",
  port: 8080,
  ctxSize: 16384,
};

describe("sidecarArgs", () => {
  it("builds the llama-server command line", () => {
    expect(sidecarArgs(config)).toEqual([
      "-m",
      "/Users/p/models/Qwen3.5-4B-Q4_K_M.gguf",
      "--port",
      "8080",
      "-c",
      "16384",
      "--jinja",
      "--host",
      "127.0.0.1",
      "-ngl",
      "99",
    ]);
  });

  it("carries a custom port and context size through as strings", () => {
    const args = sidecarArgs({ ...config, port: 9099, ctxSize: 4096 });
    expect(args[args.indexOf("--port") + 1]).toBe("9099");
    expect(args[args.indexOf("-c") + 1]).toBe("4096");
  });
});

describe("createRingBuffer", () => {
  it("keeps only the last N lines", () => {
    const ring = createRingBuffer(3);
    ring.push("a\nb\nc\nd\n");
    expect(ring.lines()).toEqual(["b", "c", "d"]);
  });

  it("splits multi-line chunks and drops blank lines", () => {
    const ring = createRingBuffer(10);
    ring.push("first\n\n  \nsecond\n");
    ring.push("third");
    expect(ring.lines()).toEqual(["first", "second", "third"]);
  });

  it("tails the most recent lines as text", () => {
    const ring = createRingBuffer(10);
    ring.push("one\ntwo\nthree\n");
    expect(ring.tail(2)).toBe("two\nthree");
  });

  it("clears", () => {
    const ring = createRingBuffer(10);
    ring.push("x");
    ring.clear();
    expect(ring.lines()).toEqual([]);
  });

  it("defaults to the documented 50-line window", () => {
    const ring = createRingBuffer();
    ring.push(Array.from({ length: 80 }, (_, i) => `line ${i}`).join("\n"));
    expect(ring.lines()).toHaveLength(STDERR_LINES);
    expect(ring.lines()[0]).toBe("line 30");
  });
});
