import { type InferenceSlice, inferenceSummary } from "@renderer/app/hud/summary";
import type { InferenceConfig, ProbeResult } from "@shared/llm";
import { errored, idle, type Loadable, loading, ready } from "@shared/result";
import { describe, expect, it } from "vitest";

const config: InferenceConfig = {
  kind: "llamacpp",
  baseUrl: "http://127.0.0.1:8080/v1",
  model: "qwen3.5-4b",
  apiKeyEnv: null,
  sidecar: null,
};

function probe(value: Partial<ProbeResult> = {}): Loadable<ProbeResult> {
  return ready({ reachable: true, models: [], latencyMs: 42.4, serverName: null, ...value });
}

function inference(overrides: Partial<InferenceSlice> = {}): InferenceSlice {
  return { config, probe: idle(), inflight: 0, ...overrides };
}

describe("inferenceSummary", () => {
  it("says so when no provider is configured", () => {
    expect(inferenceSummary({ config: null, probe: idle(), inflight: 0 })).toEqual({
      provider: null,
      model: null,
      state: "unconfigured",
      detail: null,
      thinking: 0,
    });
  });

  it("follows the probe through loading, success and failure", () => {
    expect(inferenceSummary(inference({ probe: loading() })).state).toBe("probing");
    expect(inferenceSummary(inference({ probe: probe() }))).toMatchObject({
      state: "online",
      detail: "42 ms",
    });
    expect(
      inferenceSummary(inference({ probe: probe({ serverName: "llama.cpp" }) })),
    ).toMatchObject({ state: "online", detail: "llama.cpp" });
    expect(inferenceSummary(inference({ probe: probe({ reachable: false }) })).state).toBe(
      "offline",
    );
    expect(
      inferenceSummary(
        inference({ probe: errored({ code: "unreachable", message: "connect ECONNREFUSED" }) }),
      ),
    ).toMatchObject({ state: "error", detail: "connect ECONNREFUSED" });
  });
});
