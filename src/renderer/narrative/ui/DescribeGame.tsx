// "Say what you want to make." Cards are good for browsing; typing is better for starting, so this
// sits above the matrix and loads the cylinder from a sentence.
//
// The model picks from the catalogue and says what it left out. Nothing here is required: the
// cards below keep working with no model at all.

import { useT } from "@renderer/i18n";
import { modesFromDescription } from "@renderer/narrative/describe";
import { Button, ErrorBlock, Surface, space, Text, TextField } from "@renderer/ui";
import type { GameModeId } from "@shared/mode-catalog";
import { errored, idle, type Loadable, loading } from "@shared/result";
import { type JSX, useState } from "react";

export function DescribeGame({
  placeholder,
  value,
  onChange,
  onModes,
}: {
  placeholder: string;
  /** The draft's own brief: this sentence is saved and anchors every later generation prompt. */
  value: string;
  onChange(text: string): void;
  onModes(modes: GameModeId[]): void;
}): JSX.Element {
  const t = useT();
  const text = value;
  const [state, setState] = useState<Loadable<string>>(idle());

  const ask = async (): Promise<void> => {
    if (text.trim() === "") return;
    setState(loading());
    const result = await modesFromDescription({ text: text.trim(), language: navigator.language });
    if (!result.ok) {
      setState(errored(result.error));
      return;
    }
    onModes(result.value.modes);
    setState({ status: "ready", value: result.value.note });
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: space.sm }}>
      <TextField
        label={t("describeLabel")}
        value={text}
        maxLength={200}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
      />
      <div style={{ display: "flex", gap: space.sm, alignItems: "center", flexWrap: "wrap" }}>
        <Button
          variant="secondary"
          disabled={state.status === "loading" || text.trim() === ""}
          onClick={() => void ask()}
        >
          {state.status === "loading" ? t("describeThinking") : t("describeAsk")}
        </Button>
        {state.status === "ready" ? (
          <Text variant="caption" tone="dim">
            {state.value}
          </Text>
        ) : null}
      </div>
      {state.status === "error" ? (
        <Surface variant="inset" padding="sm">
          <ErrorBlock error={state.error} />
          <Text variant="caption" tone="dim">
            {t("describeNoModel")}
          </Text>
        </Surface>
      ) : null}
    </div>
  );
}
