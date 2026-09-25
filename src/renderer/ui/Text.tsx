import type { CSSProperties, ReactNode } from "react";
import { colors, font } from "./tokens";

export type TextVariant =
  | "headline"
  | "titleLarge"
  | "title"
  | "bodyLarge"
  | "body"
  | "label"
  | "caption";

export type TextTone = "default" | "muted" | "dim" | "accent" | "danger" | "success";

const variantStyle: Record<TextVariant, CSSProperties> = {
  headline: { fontSize: font.size.headline, fontWeight: font.weight.bold, lineHeight: 1.15 },
  titleLarge: { fontSize: font.size.titleLarge, fontWeight: font.weight.bold, lineHeight: 1.2 },
  title: { fontSize: font.size.title, fontWeight: font.weight.medium, lineHeight: 1.3 },
  bodyLarge: { fontSize: font.size.bodyLarge, fontWeight: font.weight.regular, lineHeight: 1.5 },
  body: { fontSize: font.size.body, fontWeight: font.weight.regular, lineHeight: 1.5 },
  label: {
    fontSize: font.size.label,
    fontWeight: font.weight.medium,
    lineHeight: 1.4,
    letterSpacing: 0.4,
  },
  caption: { fontSize: font.size.caption, fontWeight: font.weight.regular, lineHeight: 1.4 },
};

const toneColor: Record<TextTone, string> = {
  default: colors.text,
  muted: colors.textMuted,
  dim: colors.textDim,
  accent: colors.accent,
  danger: colors.danger,
  success: colors.success,
};

export interface TextProps {
  variant?: TextVariant;
  tone?: TextTone;
  as?: "span" | "p" | "h1" | "h2" | "h3" | "div";
  mono?: boolean;
  style?: CSSProperties;
  children: ReactNode;
}

export function Text({
  variant = "body",
  tone = "default",
  as: Tag = "span",
  mono = false,
  style,
  children,
}: TextProps) {
  return (
    <Tag
      style={{
        margin: 0,
        fontFamily: mono ? font.mono : font.family,
        color: toneColor[tone],
        ...variantStyle[variant],
        ...style,
      }}
    >
      {children}
    </Tag>
  );
}
