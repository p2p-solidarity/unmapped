// Awareness -> PeerInfo. Pure, so the mapping is unit-tested without a signaling server.
//
// A state that carries no usable name/floor is skipped rather than filled in with a placeholder:
// an unnamed peer is not "Anonymous", it is simply not shown yet (Rule 2).

export interface PeerInfo {
  clientId: number;
  name: string;
  floor: number;
}

export type AwarenessStates = ReadonlyMap<number, Record<string, unknown>>;

export function toPeerInfo(states: AwarenessStates, selfClientId: number): PeerInfo[] {
  const peers: PeerInfo[] = [];
  for (const [clientId, state] of states) {
    if (clientId === selfClientId) continue;
    const name = state.name;
    const floor = state.floor;
    if (typeof name !== "string" || name.trim().length === 0) continue;
    if (typeof floor !== "number" || !Number.isFinite(floor)) continue;
    peers.push({ clientId, name, floor });
  }
  peers.sort((a, b) => a.clientId - b.clientId);
  return peers;
}
