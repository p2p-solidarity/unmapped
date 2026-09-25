// Token-only styles for the two raw form elements the UI primitives do not cover (text input and
// textarea). Hex literals stay in tokens.ts (Rule 3); nothing here invents a colour.

import { colors, font, HIT_TARGET, radius, space } from "@renderer/ui";
import type { CSSProperties } from "react";

export const fieldStyle: CSSProperties = {
  background: colors.bg,
  color: colors.text,
  border: `1px solid ${colors.surfaceBorder}`,
  borderRadius: radius.md,
  padding: `${space.sm}px ${space.md}px`,
  fontFamily: font.family,
  fontSize: font.size.body,
  minHeight: HIT_TARGET,
  width: "100%",
  boxSizing: "border-box",
};

export const textareaStyle: CSSProperties = {
  ...fieldStyle,
  minHeight: HIT_TARGET * 2,
  resize: "vertical",
  lineHeight: 1.5,
};

export const columnStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: space.sm,
};

export const rowStyle: CSSProperties = {
  display: "flex",
  flexDirection: "row",
  gap: space.sm,
  flexWrap: "wrap",
};
