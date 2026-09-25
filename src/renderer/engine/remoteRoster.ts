// Other players in the room, as the network last reported them (a few times a second). Kept
// outside zustand like every other position (Rule 4); the room writes, the scene reads.

export interface RemotePlayer {
  clientId: number;
  name: string;
  x: number;
  y: number;
  z: number;
  /** Which way they face and whether they walk, as their own land view last reported it. */
  facing: "north" | "south" | "east" | "west";
  moving: boolean;
}

let players: RemotePlayer[] = [];
const listeners = new Set<() => void>();

export function setRemotePlayers(next: RemotePlayer[]): void {
  players = next;
  for (const listener of listeners) listener();
}

export function getRemotePlayers(): RemotePlayer[] {
  return players;
}

export function subscribeRemotePlayers(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
