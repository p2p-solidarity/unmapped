import { useSyncExternalStore } from "react";
import type { Room } from "./room";

let activeRoom: Room | null = null;
const listeners = new Set<() => void>();

export function getActiveRoom(): Room | null {
  return activeRoom;
}

export function setActiveRoom(room: Room | null): void {
  if (activeRoom === room) return;
  activeRoom?.leave();
  activeRoom = room;
  for (const listener of listeners) listener();
}

export function useActiveRoom(): Room | null {
  return useSyncExternalStore((listener) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }, getActiveRoom);
}
