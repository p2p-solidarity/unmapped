// Renders a Loadable<T> honestly: idle / loading / error / ready. Use it for every data-driven
// panel instead of hand-rolling placeholders (Rule 2: no fake data).

import { describeError, useT } from "@renderer/i18n";
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
  const t = useT();
  // `t` subscribes to the language, so the description below follows the picker too.
  const { message, hint, detail } = describeError(error);
  return (
    <Surface variant="inset" padding="md">
      <Text variant="label" tone="danger">
        {t("common.errorCode", { code: error.code })}
      </Text>
      <Text variant="body">{message}</Text>
      {detail === null ? null : (
        <Text variant="caption" tone="dim" mono>
          {detail}
        </Text>
      )}
      {hint === null ? null : (
        <Text variant="caption" tone="muted">
          {hint}
        </Text>
      )}
    </Surface>
  );
}

export function StatePanel<T>({ state, idleText, loadingText, children }: StatePanelProps<T>) {
  const t = useT();
  switch (state.status) {
    case "idle":
      return (
        <Text variant="body" tone="dim">
          {idleText ?? t("common.nothingYet")}
        </Text>
      );
    case "loading":
      return (
        <Text variant="body" tone="muted">
          {loadingText ?? t("common.loading")}
        </Text>
      );
    case "error":
      return <ErrorBlock error={state.error} />;
    case "ready":
      return <>{children(state.value)}</>;
  }
}
