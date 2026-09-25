import {
  type CSSProperties,
  type InputHTMLAttributes,
  type ReactNode,
  type TextareaHTMLAttributes,
  useId,
} from "react";
import { Text } from "./Text";
import { colors, font, HIT_TARGET, space } from "./tokens";

export interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: ReactNode;
  mono?: boolean;
  /** Renders a multi-line field with this many visible rows (long answers, such as a story). */
  rows?: number;
}

export function TextField({ label, mono = false, rows, style, ...props }: TextFieldProps) {
  const generatedId = useId();
  const inputId = props.id ?? generatedId;
  const look: CSSProperties = {
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
  };
  const input =
    rows === undefined ? (
      <input {...props} id={inputId} style={look} />
    ) : (
      <textarea
        {...(props as TextareaHTMLAttributes<HTMLTextAreaElement>)}
        id={inputId}
        rows={rows}
        style={{ ...look, resize: "vertical", lineHeight: 1.5 }}
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
