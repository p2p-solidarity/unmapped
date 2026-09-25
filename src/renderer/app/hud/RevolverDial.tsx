// The revolver cylinder for `timing:revolver`.
//
// The policy is already a cylinder: the round is a fixed list of slots, each slot belongs to one
// side, and it advances exactly one notch per action. So the HUD draws it as one — chambers loaded
// with the actors of this round, the cylinder clicking round under the hammer as turns are spent,
// and a full reload when the round rolls over.
//
// Rule 2: every chamber is a real entry in `turn.order`, coloured by that actor's real side, and
// emptied only once that actor has actually acted. Nothing here is decoration over nothing.

import { colors, radius, space, Text } from "@renderer/ui";
import type { TurnState } from "@shared/timing";
import type { JSX } from "react";

const SIZE = 84;
const CHAMBER = 13;
/** How far the chambers sit from the middle of the cylinder. */
const ORBIT = SIZE / 2 - CHAMBER / 2 - 7;

export interface RevolverDialProps {
  turn: TurnState;
  /** Side of each actor id, so a chamber can show whose round slot it is. */
  sideOf(actorId: string): "party" | "hostile";
  labelOf(actorId: string): string;
}

export function RevolverDial({ turn, sideOf, labelOf }: RevolverDialProps): JSX.Element | null {
  const chambers = turn.order.length;
  if (chambers === 0) return null;

  const step = 360 / chambers;
  // Rotating by -index brings the current chamber up under the hammer.
  const rotation = -turn.index * step;
  const active = turn.order[turn.index] ?? null;

  return (
    <div style={{ display: "flex", alignItems: "center", gap: space.sm }}>
      <div style={{ position: "relative", width: SIZE, height: SIZE, flexShrink: 0 }}>
        {/* Hammer: the fixed point the cylinder turns under. */}
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            left: "50%",
            top: -2,
            width: 0,
            height: 0,
            transform: "translateX(-50%)",
            borderLeft: "5px solid transparent",
            borderRight: "5px solid transparent",
            borderTop: `8px solid ${colors.accent}`,
          }}
        />

        <div
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: "50%",
            border: `2px solid ${colors.surfaceBorder}`,
            transform: `rotate(${rotation}deg)`,
            transition: "transform 220ms cubic-bezier(0.2, 0.9, 0.2, 1)",
          }}
        >
          {turn.order.map((actorId, slot) => {
            // Slot 0 sits at the top; the rest go clockwise around the cylinder.
            const angle = (slot * step - 90) * (Math.PI / 180);
            const spent = slot < turn.index;
            const isActive = slot === turn.index;
            const loaded = sideOf(actorId) === "party" ? colors.accent : colors.danger;
            return (
              <div
                key={actorId}
                title={labelOf(actorId)}
                style={{
                  position: "absolute",
                  left: SIZE / 2 + Math.cos(angle) * ORBIT - CHAMBER / 2,
                  top: SIZE / 2 + Math.sin(angle) * ORBIT - CHAMBER / 2,
                  width: CHAMBER,
                  height: CHAMBER,
                  borderRadius: "50%",
                  border: `1px solid ${isActive ? colors.text : colors.surfaceBorder}`,
                  // A spent chamber is an empty casing; a loaded one carries its side's colour.
                  background: spent ? "transparent" : loaded,
                  boxShadow: isActive ? `0 0 8px ${loaded}` : undefined,
                  // Keep the round marker upright while the cylinder turns.
                  transform: `rotate(${-rotation}deg)`,
                  transition: "background 180ms linear",
                }}
              />
            );
          })}
        </div>

        {/* Centre pin, with the round number stamped on it. */}
        <div
          style={{
            position: "absolute",
            left: "50%",
            top: "50%",
            transform: "translate(-50%, -50%)",
            width: 30,
            height: 30,
            borderRadius: "50%",
            background: colors.bgOverlay,
            border: `1px solid ${colors.surfaceBorder}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Text variant="caption" tone="muted" mono style={{ fontSize: 11 }}>
            {String(turn.round)}
          </Text>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
        <Text variant="caption" tone="accent" mono>
          {`${chambers - turn.index} / ${chambers}`}
        </Text>
        <Text variant="caption" tone="dim">
          {active === null ? "重新裝填…" : labelOf(active)}
        </Text>
        <div
          style={{
            height: 3,
            borderRadius: radius.pill,
            background: colors.surfaceBorder,
            overflow: "hidden",
          }}
        >
          <div
            style={{
              width: `${((chambers - turn.index) / chambers) * 100}%`,
              height: "100%",
              background: colors.accent,
              transition: "width 200ms linear",
            }}
          />
        </div>
      </div>
    </div>
  );
}
