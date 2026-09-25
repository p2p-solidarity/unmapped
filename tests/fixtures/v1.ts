// A save exactly as the build before runtime pins wrote it (instance and save format 1, shape of
// a real 2026-09-26 save: no runtimePin, no player/party), plus a format 1 cartridge to pin it to.

import type { CartridgeRef, PublishCartridgeInput } from "@shared/cartridge";

const RULES = [
  'root = Rules("tps_exploration@1", "grounded", [tps, forward, back, left, right, interact])',
  'tps = Kit("tps_exploration@1", 4, 7, 6.4, 15, 2, 55, 0.0022, 9)',
  'forward = Bind("move_forward", ["KeyW"])',
  'back = Bind("move_backward", ["KeyS"])',
  'left = Bind("move_left", ["KeyA"])',
  'right = Bind("move_right", ["KeyD"])',
  'interact = Bind("interact", ["KeyE"])',
].join("\n");

const DECK = [
  'root = Scene("deck", "meadow", [contract, ground, exit])',
  'contract = Contract("deck", "tps_exploration@1", [], [], "carry", ["deck_done"], true)',
  'ground = Floor(8, 8, "grass")',
  'exit = Exit(7, 7, "The light")',
  "",
].join("\n");

export function v1CartridgeInput(): PublishCartridgeInput {
  return {
    manifest: {
      formatVersion: 1,
      cartridgeId: "reactor-deck",
      version: "1.0.0",
      name: "Reactor Deck",
      description: "A cartridge published before runtime pins.",
      author: "dev",
      createdAt: "2026-09-26T05:57:23.029Z",
      engineApiVersion: 1,
      saveSchemaVersion: 1,
      entrySceneId: "deck",
      story: {
        premise: "A reactor deck overrun by maintenance drones.",
        finale: "The deck is clear.",
        scenes: [
          {
            id: "deck",
            title: "Reactor Deck",
            summary: "A wide deck around a reactor core.",
            objective: "Reach the shutdown gate.",
            kit: "tps_exploration@1",
          },
        ],
      },
      scenes: [{ id: "deck", title: "Reactor Deck" }],
      requiredKits: ["tps_exploration@1"],
      genesis: {
        archetype: "delve",
        physics: "gentle",
        language: "zh-TW",
        seed: 1,
        intent: "Dev cartridge.",
        createdAt: "2026-09-26T05:57:23.029Z",
      },
      lineage: null,
    },
    rules: RULES,
    scenes: { deck: DECK },
  };
}

export const V1_INSTANCE_ID = "reactor-deck-run-1-mu3ov5k5";

/** instance.json and saves/default/{save.json,karma.jsonl} of a format 1 save. */
export function v1InstanceFiles(cartridge: CartridgeRef): {
  instance: unknown;
  save: unknown;
  karma: string;
} {
  return {
    instance: {
      formatVersion: 1,
      instanceId: V1_INSTANCE_ID,
      name: "Reactor Deck · Run 1",
      cartridge,
      activeSaveId: "default",
      saveSchemaVersion: 1,
      createdAt: "2026-09-26T05:57:23.045Z",
      updatedAt: "2026-09-26T06:10:00.000Z",
    },
    save: {
      formatVersion: 1,
      instanceId: V1_INSTANCE_ID,
      cartridge,
      saveSchemaVersion: 1,
      currentSceneId: "deck",
      flags: { drones_cleared: true, visits: 2 },
      inventory: { items: [], materials: ["scrap"] },
      mutation: null,
      completedSceneIds: [],
      updatedAt: "2026-09-26T06:10:00.000Z",
    },
    karma:
      '{"at":"2026-09-26T06:09:09.544Z","floor":1,"npcId":null,"choice":"Exit","action":"floor","effect":"reached the gate"}\n',
  };
}
