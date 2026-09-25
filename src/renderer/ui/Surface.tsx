import type { CSSProperties, ReactNode } from "react";
import { colors, shadow, space, surfaces } from "./tokens";

export type SurfaceVariant = "card" | "overlay" | "inset" | "outlined";

export interface SurfaceProps {
  variant?: SurfaceVariant;
  padding?: keyof typeof space;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
}

const variantStyle: Record<SurfaceVariant, CSSProperties> = {
  card: {
    background: surfaces.window,
    border: `1px solid ${colors.surfaceBorder}`,
    boxShadow: `${shadow.frame}, ${shadow.card}`,
    backdropFilter: "blur(10px)",
  },
  overlay: {
    background: surfaces.windowSoft,
    border: `1px solid ${colors.surfaceBorder}`,
    boxShadow: shadow.frame,
    backdropFilter: "blur(14px)",
  },
  inset: {
    background: colors.bg,
    border: `1px solid ${colors.surfaceBorder}`,
  },
  outlined: {
    background: "transparent",
    border: `1px dashed ${colors.surfaceBorder}`,
  },
};

export function Surface({
  variant = "card",
  padding = "lg",
  className,
  style,
  children,
}: SurfaceProps) {
  return (
    <div
      className={className}
      style={{
        position: "relative",
        borderRadius: 3,
        padding: space[padding],
        display: "flex",
        flexDirection: "column",
        gap: space.md,
        ...variantStyle[variant],
        ...style,
      }}
    >
      {children}
    </div>
  );
}
