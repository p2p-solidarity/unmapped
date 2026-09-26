import { sidecarArgs } from "@main/inference/sidecar";
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
});
