// Floating name tag. drei's <Text> needs a font file on disk, and the engine never loads external
// assets, so labels are plain DOM through <Html>, styled from the UI tokens.

import { Html } from "@react-three/drei";
import { colors, font, radius, space } from "@renderer/ui";
import type { CSSProperties, JSX } from "react";

const base: CSSProperties = {
  padding: `${space.xs}px ${space.sm}px`,
  borderRadius: radius.pill,
  border: `1px solid ${colors.surfaceBorder}`,
  background: colors.bgOverlay,
  color: colors.text,
  fontFamily: font.family,
  fontSize: font.size.caption,
  fontWeight: font.weight.medium,
  lineHeight: 1.1,
  whiteSpace: "nowrap",
  userSelect: "none",
  pointerEvents: "none",
};

const accent: CSSProperties = { ...base, color: colors.accent, borderColor: colors.accent };

export function Label({
  text,
  y,
  tone = "default",
}: {
  text: string;
  y: number;
  tone?: "default" | "accent";
}): JSX.Element {
  return (
    <Html
      position={[0, y, 0]}
      center
      distanceFactor={11}
      zIndexRange={[8, 0]}
      pointerEvents="none"
      prepend
    >
      <div style={tone === "accent" ? accent : base}>{text}</div>
    </Html>
  );
}
