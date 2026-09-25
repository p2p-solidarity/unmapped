import { type InputHTMLAttributes, type ReactNode, useId } from "react";
import { Text } from "./Text";
import { colors, font, HIT_TARGET, space } from "./tokens";

export interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: ReactNode;
  mono?: boolean;
}

export function TextField({ label, mono = false, style, ...props }: TextFieldProps) {
  const generatedId = useId();
  const inputId = props.id ?? generatedId;
  const input = (
    <input
      {...props}
      id={inputId}
      style={{
        minHeight: HIT_TARGET,
        padding: `${space.sm}px ${space.md}px`,
        borderRadius: 0,
        border: `1px solid ${colors.surfaceBorder}`,
        background: colors.bg,
        color: colors.text,
        fontFamily: mono ? font.mono : font.family,
        fontSize: font.size.body,
        width: "100%",
        boxSizing: "border-box",
        ...style,
      }}
    />
  );
  if (label === undefined) return input;
  return (
    <label htmlFor={inputId} style={{ display: "flex", flexDirection: "column", gap: space.xs }}>
      <Text variant="caption" tone="dim">
        {label}
      </Text>
      {input}
    </label>
  );
}
