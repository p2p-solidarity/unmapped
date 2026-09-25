// The first-person crosshair.
//
// It is not decoration: it runs the same hitscan the trigger runs, so what it shows is exactly
// what a shot would do. Unlocked means the shot is not available — the trigger refuses rather than
// spending a round and a turn on empty air, and the crosshair shakes so the click is not silent.
// A connecting shot flashes a hit marker; a dry magazine greys the arms (the next pull reloads).
//
// Rule 4: the store holds only the last trigger pull; the flash itself is a Web Animation on a ref.

import { useEncounterStore } from "@renderer/state";
import type { ShotRecord } from "@renderer/state/encounterStore";
import { colors, radius, space, Text } from "@renderer/ui";
import { type JSX, type RefObject, useEffect, useRef } from "react";

const SIZE = 26;
const ARM = 8;
const GAP = 4;
/** Hit-marker tick: a short diagonal stroke just outside the crosshair gap. */
const TICK = 6;
const TICK_OFFSET = 7;

/** Replays the feedback for one trigger pull. Nothing here is state; it only moves pixels. */
function playShot(
  shot: ShotRecord,
  arms: RefObject<HTMLDivElement | null>,
  marker: RefObject<HTMLDivElement | null>,
): void {
  const crosshair = arms.current;
  const hitMarker = marker.current;
  if (crosshair === null || hitMarker === null) return;
  switch (shot.outcome) {
    case "hit":
    case "kill": {
      const kill = shot.outcome === "kill";
      hitMarker.style.color = kill ? colors.danger : colors.text;
      hitMarker.animate(
        [
          { opacity: 1, transform: `scale(${kill ? 1.5 : 1.2})` },
          { opacity: 0, transform: "scale(1)" },
        ],
        { duration: kill ? 420 : 240, easing: "ease-out" },
      );
      return;
    }
    case "empty":
      crosshair.animate(
        [
          { transform: "translateX(0)", opacity: 0.4 },
          { transform: "translateX(-3px)" },
          { transform: "translateX(3px)" },
          { transform: "translateX(0)", opacity: 1 },
        ],
        { duration: 220, easing: "ease-out" },
      );
      return;
    case "wait":
      crosshair.animate([{ opacity: 0.3 }, { opacity: 1 }], { duration: 260, easing: "ease-out" });
      return;
    case "reload":
      crosshair.animate([{ transform: "rotate(0deg)" }, { transform: "rotate(90deg)" }], {
        duration: 320,
        easing: "ease-in-out",
      });
      return;
  }
}

function Arm({ style }: { style: React.CSSProperties }): JSX.Element {
  return <span style={{ position: "absolute", ...style }} />;
}

export function Reticle(): JSX.Element {
  const armed = useEncounterStore((state) => state.weapon !== null);
  const targetId = useEncounterStore((state) => state.aimTargetId);
  const target = useEncounterStore((state) =>
    state.combatants.find((one) => one.id === state.aimTargetId),
  );
  const dry = useEncounterStore((state) => state.ammo === 0);
  const lastShot = useEncounterStore((state) => state.lastShot);
  const arms = useRef<HTMLDivElement>(null);
  const marker = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (lastShot !== null) playShot(lastShot, arms, marker);
  }, [lastShot]);

  // Without a weapon the crosshair is a plain aiming mark; there is nothing to lock on to.
  const locked = armed && targetId !== null;
  const tone = dry ? colors.textDim : locked ? colors.danger : colors.text;
  const thickness = 2;
  const centre = SIZE / 2;

  return (
    <div
      style={{
        position: "absolute",
        left: "50%",
        top: "50%",
        transform: "translate(-50%, -50%)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: space.xs,
        pointerEvents: "none",
      }}
    >
      <div style={{ position: "relative", width: SIZE, height: SIZE }} aria-hidden="true">
        <div ref={marker} style={{ position: "absolute", inset: 0, opacity: 0 }}>
          {[45, 135, 225, 315].map((angle) => (
            <Arm
              key={angle}
              style={{
                left: centre - 1,
                top: centre - TICK_OFFSET - TICK,
                width: 2,
                height: TICK,
                background: "currentColor",
                transformOrigin: `1px ${TICK_OFFSET + TICK}px`,
                transform: `rotate(${angle}deg)`,
              }}
            />
          ))}
        </div>
        <div ref={arms} style={{ position: "absolute", inset: 0 }}>
          <Arm
            style={{
              left: centre - thickness / 2,
              top: locked ? 0 : centre - GAP - ARM,
              width: thickness,
              height: ARM,
              background: tone,
            }}
          />
          <Arm
            style={{
              left: centre - thickness / 2,
              top: locked ? SIZE - ARM : centre + GAP,
              width: thickness,
              height: ARM,
              background: tone,
            }}
          />
          <Arm
            style={{
              top: centre - thickness / 2,
              left: locked ? 0 : centre - GAP - ARM,
              height: thickness,
              width: ARM,
              background: tone,
            }}
          />
          <Arm
            style={{
              top: centre - thickness / 2,
              left: locked ? SIZE - ARM : centre + GAP,
              height: thickness,
              width: ARM,
              background: tone,
            }}
          />
          {locked ? (
            <Arm
              style={{
                left: centre - 2,
                top: centre - 2,
                width: 4,
                height: 4,
                borderRadius: "50%",
                background: colors.danger,
              }}
            />
          ) : null}
        </div>
      </div>

      {target === undefined ? null : (
        <div
          style={{
            padding: "1px 6px",
            borderRadius: radius.pill,
            background: colors.bgOverlay,
            border: `1px solid ${colors.danger}`,
          }}
        >
          <Text variant="caption" tone="danger" mono style={{ fontSize: 10 }}>
            {`${target.label} ${target.hp}/${target.maxHp}`}
          </Text>
        </div>
      )}
    </div>
  );
}
