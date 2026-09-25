// The player's wounds across the land ↔ place swap. The open land (useLandCombat) and a place
// (usePlaceCombat) each run their own fight and PlayScreen mounts one or the other, so whichever
// mounts next starts from the HP the other left — walking through a doorway is never a free heal.
// In memory only, like HP itself (it is not saved): a fresh load of a save and getting back up after
// a fall both clear it, and the next fight starts whole.

let carried: number | null = null;

/** Remembers the player's HP (null forgets it: the next fight starts whole). */
export function carryPlayerHp(hp: number | null): void {
  carried = hp;
}

/** The HP the last fight left the player with, or null when there is none to carry. */
export function carriedPlayerHp(): number | null {
  return carried;
}
