// Every number the HUD shows, derived from the stores in one pure place (Rule 2: a gauge that is
// not backed by state is not drawn at all). There is no HP/MP/combat system, so there are no HP/MP
// bars here — the honest readouts are floor, karma, inventory, peers, inference and fps.

import type { InferenceState, SessionState, WorldState } from "@renderer/state";
import type { Biome } from "@shared/world";

export type WorldSlice = Pick<WorldState, "meta" | "floor" | "karma" | "inventory" | "scene">;
export type SessionSlice = Pick<SessionState, "roomCode" | "peerCount">;
export type InferenceSlice = Pick<InferenceState, "config" | "probe" | "inflight">;

export type ProviderState =
  | "unconfigured"
  | "unprobed"
  | "probing"
  | "online"
  | "offline"
  | "error";

export interface InferenceSummary {
  /** Provider kind from the persisted config ("llamacpp", "openai"…), or null when unconfigured. */
  provider: string | null;
  model: string | null;
  state: ProviderState;
  /** Latency, server name or the probe's error message — whatever the probe actually reported. */
  detail: string | null;
  /** In-flight chat requests; > 0 drives the thinking indicator. */
  thinking: number;
}

export interface HudSummary {
  worldName: string | null;
  floor: number;
  /** Biome of the parsed scene; null while the scene is idle/loading/error. */
  biome: Biome | null;
  karmaCount: number;
  /** Label of the most recent karma entry, or null when the ledger is empty. */
  lastChoice: string | null;
  items: number;
  materials: number;
  /** Peers in the active room; null when no room is open (nothing to claim). */
  peers: number | null;
  inference: InferenceSummary;
}

function text(value: string | undefined | null): string | null {
  if (value === undefined || value === null) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function inferenceSummary(inference: InferenceSlice): InferenceSummary {
  const { config, probe, inflight } = inference;
  const thinking = Math.max(0, inflight);
  if (config === null) {
    return { provider: null, model: null, state: "unconfigured", detail: null, thinking };
  }
  const base = { provider: config.kind, model: text(config.model), thinking };
  switch (probe.status) {
    case "idle":
      return { ...base, state: "unprobed", detail: null };
    case "loading":
      return { ...base, state: "probing", detail: null };
    case "error":
      return { ...base, state: "error", detail: text(probe.error.message) };
    case "ready":
      return probe.value.reachable
        ? {
            ...base,
            state: "online",
            detail: text(probe.value.serverName) ?? `${Math.round(probe.value.latencyMs)} ms`,
          }
        : { ...base, state: "offline", detail: null };
  }
}

export function hudSummary(
  world: WorldSlice,
  session: SessionSlice,
  inference: InferenceSlice,
): HudSummary {
  // The last thing the player chose in a conversation. Lines the host records (a treasure opened, a
  // chapter cleared, a note left) carry no speaker and are host wording, not the player's choice.
  const last = world.karma.findLast((entry) => entry.npcId !== null);
  return {
    worldName: text(world.meta?.name),
    floor: world.floor,
    biome: world.scene.status === "ready" ? world.scene.value.biome : null,
    karmaCount: world.karma.length,
    lastChoice: text(last?.choice),
    items: world.inventory.items.length,
    materials: world.inventory.materials.length,
    peers: session.roomCode === null ? null : Math.max(0, session.peerCount),
    inference: inferenceSummary(inference),
  };
}
