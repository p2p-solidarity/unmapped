import type { CSSProperties, MouseEventHandler, ReactNode } from "react";
import { colors, font, HIT_TARGET, space } from "./tokens";

/**
 * primary/secondary/ghost/destructive — actions.
 * menu — a row in a vertical game menu (▶ marker when `active`).
 * tile — a selectable card (scene base, cartridge); light frame when `active`.
 * chip — a compact multi-select tag (genre, timing, setting); filled when `active`.
 */
export type ButtonVariant =
  | "primary"
  | "secondary"
  | "ghost"
  | "destructive"
  | "menu"
  | "tile"
  | "chip";

export interface ButtonProps {
  className?: string;
  variant?: ButtonVariant;
  /** Selected/focused-by-keyboard state for `menu` and `tile`. */
  active?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
  onClick?: MouseEventHandler<HTMLButtonElement>;
  onFocus?: () => void;
  onMouseEnter?: () => void;
  type?: "button" | "submit";
  /** Keyboard hint rendered at the right edge, e.g. "E" or "1". */
  hotkey?: string;
  style?: CSSProperties;
  children: ReactNode;
}

const variantStyle: Record<ButtonVariant, CSSProperties> = {
  primary: {
    background: colors.accent,
    color: colors.accentInk,
    borderColor: colors.accent,
    fontWeight: font.weight.bold,
  },
  secondary: {
    background: colors.bgOverlay,
    color: colors.text,
    borderColor: colors.surfaceBorder,
  },
  ghost: { background: "transparent", color: colors.textMuted, borderColor: "transparent" },
  destructive: { background: colors.dangerSoft, color: colors.danger, borderColor: colors.danger },
  menu: {
    background: "transparent",
    color: colors.textDim,
    borderColor: "transparent",
    fontSize: font.size.titleLarge,
    fontWeight: font.weight.medium,
    letterSpacing: 2,
    padding: `${space.sm}px ${space.lg}px ${space.sm}px ${space.xxl}px`,
  },
  tile: {
    background: colors.bgOverlay,
    color: colors.textMuted,
    borderColor: colors.surfaceBorder,
    alignItems: "stretch",
    padding: space.lg,
  },
  chip: {
    background: "transparent",
    color: colors.textMuted,
    borderColor: colors.surfaceBorder,
    fontSize: font.size.caption,
    padding: `${space.xs}px ${space.md}px`,
    justifyContent: "flex-start",
    gap: space.xs,
  },
};

const activeStyle: Partial<Record<ButtonVariant, CSSProperties>> = {
  menu: { color: colors.text },
  tile: { color: colors.text, borderColor: colors.accent, background: colors.surface },
  chip: { color: colors.accentInk, background: colors.accent, borderColor: colors.accent },
};

export function Button({
  className,
  variant = "secondary",
  active = false,
  disabled = false,
  fullWidth = false,
  onClick,
  onFocus,
  onMouseEnter,
  type = "button",
  hotkey,
  style,
  children,
}: ButtonProps) {
  return (
    <button
      className={["ui-btn", className].filter(Boolean).join(" ")}
      data-variant={variant}
      data-active={active ? "true" : undefined}
      type={type}
      disabled={disabled}
      onClick={onClick}
      onFocus={onFocus}
      onMouseEnter={onMouseEnter}
      style={{
        position: "relative",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: space.md,
        minHeight: HIT_TARGET,
        padding: `${space.sm}px ${space.lg}px`,
        borderRadius: 0,
        borderWidth: 1,
        borderStyle: "solid",
        fontFamily: font.family,
        fontSize: font.size.body,
        fontWeight: font.weight.medium,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.45 : 1,
        alignSelf: fullWidth ? "stretch" : undefined,
        width: fullWidth ? "100%" : undefined,
        textAlign: "left",
        ...variantStyle[variant],
        ...(active ? activeStyle[variant] : undefined),
        ...style,
      }}
    >
      <span style={{ flex: 1, minWidth: 0 }}>{children}</span>
      {hotkey ? <kbd className="ui-key">{hotkey}</kbd> : null}
    </button>
  );
}
