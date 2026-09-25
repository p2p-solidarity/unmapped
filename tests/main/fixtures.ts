// Fixtures for the main-process tests. Only imported by tests (Rule 2) — nothing here is shipped.

import type { CreateWorldInput } from "@shared/ipc";
import type { Genesis } from "@shared/world";

export const testGenesis: Genesis = {
  archetype: "delve",
  physics: "gentle",
  language: "en-US",
  seed: 1234,
  intent: "test covenant",
  createdAt: "2026-01-01T00:00:00.000Z",
};

export const testScene =
  'root = Scene("Test Floor", "meadow", [ground])\nground = Floor(8, 8, "grass")\n';

export function createInput(name = "Test World"): CreateWorldInput {
  return { name, genesis: testGenesis, scene: testScene };
}
