// Engine → UI events. The engine publishes these through the engine store; the narrative and
// HUD layers react. Per-frame data (positions) never crosses this boundary.

export type TargetKind =
  | "npc"
  | "monster"
  | "treasure"
  | "exit"
  | "trigger"
  | "altar"
  /** Open land: the tile a resident's lost thing lies on, once their errand is accepted. */
  | "search"
  /** Open land: the door at home. */
  | "door"
  /** Open land: the gate of a story episode (an AI-written world). */
  | "episode"
  /** Open land: the entrance of a place (a side-scrolling course or a grid dungeon). */
  | "place";

export interface NearbyTarget {
  kind: TargetKind;
  id: string;
  /** Display label resolved by the engine (NPC name, "Treasure", exit label…). */
  label: string;
  distance: number;
}

export type CameraMode = "orbit" | "iso" | "fps" | "side" | "topdown" | "fixed";

export type EngineEvent =
  | { type: "near"; target: NearbyTarget | null }
  | { type: "interact"; target: NearbyTarget }
  | { type: "trigger"; id: string; event: string }
  | { type: "floor-exit"; to: string };
