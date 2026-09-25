// Renders a Loadable<T> honestly: idle / loading / error / ready. Use it for every data-driven
// panel instead of hand-rolling placeholders (Rule 2: no fake data).

import type { AppError, Loadable } from "@shared/result";
import type { ReactNode } from "react";
import { Surface } from "./Surface";
import { Text } from "./Text";

export interface StatePanelProps<T> {
  state: Loadable<T>;
  idleText?: string;
  loadingText?: string;
  children: (value: T) => ReactNode;
}

export function ErrorBlock({ error }: { error: AppError }) {
  return (
    <Surface variant="inset" padding="md">
      <Text variant="label" tone="danger">
        {error.code}
      </Text>
      <Text variant="body">{error.message}</Text>
      {error.hint ? (
        <Text variant="caption" tone="muted">
          {error.hint}
        </Text>
      ) : null}
    </Surface>
  );
}

export function StatePanel<T>({
  state,
  idleText = "Nothing yet.",
  loadingText = "Loading…",
  children,
}: StatePanelProps<T>) {
  switch (state.status) {
    case "idle":
      return (
        <Text variant="body" tone="dim">
          {idleText}
        </Text>
      );
    case "loading":
      return (
        <Text variant="body" tone="muted">
          {loadingText}
        </Text>
      );
    case "error":
      return <ErrorBlock error={state.error} />;
    case "ready":
      return <>{children(state.value)}</>;
  }
}
