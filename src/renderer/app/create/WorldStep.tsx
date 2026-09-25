import { type StringKey, useT } from "@renderer/i18n";
import { Button, Surface, space, Text, TextField } from "@renderer/ui";
import {
  BIBLE_LIMITS,
  BIBLE_PARTS,
  type BibleFields,
  type BiblePart,
  isListPart,
} from "@shared/bible";
import type { DraftWorld } from "@shared/createDraft";
import { type JSX, useState } from "react";

const LABELS: Record<BiblePart, StringKey> = {
  premise: "create.partPremise",
  tone: "create.partTone",
  rules: "create.partRules",
  taboos: "create.partTaboos",
  naming: "create.partNaming",
  voice: "create.partVoice",
};

function WorldCard({
  part,
  world,
  busy,
  onEdit,
  onRewrite,
}: {
  part: BiblePart;
  world: DraftWorld;
  busy: boolean;
  onEdit(part: BiblePart, value: string | string[]): void;
  onRewrite(part: BiblePart, note: string): void;
}): JSX.Element {
  const t = useT();
  const [note, setNote] = useState("");
  const value = world.fields[part];
  const list = isListPart(part);
  const shown = Array.isArray(value) ? value.join("\n") : value;
  return (
    <Surface variant="inset" padding="md" style={{ gap: space.sm }}>
      <Text variant="label">{t(LABELS[part])}</Text>
      <TextField
        label={list ? t("create.onePerLine") : undefined}
        value={shown}
        rows={list ? 5 : part === "premise" ? 4 : 3}
        disabled={busy}
        maxLength={list ? BIBLE_LIMITS[part].max * (BIBLE_LIMITS.line + 1) : BIBLE_LIMITS[part]}
        onChange={(event) =>
          onEdit(
            part,
            list
              ? event.target.value
                  .split("\n")
                  .slice(0, BIBLE_LIMITS[part as "rules" | "taboos"].max)
                  .map((one) => one.slice(0, BIBLE_LIMITS.line))
              : event.target.value,
          )
        }
      />
      <div style={{ display: "flex", gap: space.sm, flexWrap: "wrap" }}>
        <div style={{ flex: "1 1 250px" }}>
          <TextField
            label={t("create.cardNote")}
            value={note}
            maxLength={300}
            disabled={busy}
            onChange={(event) => setNote(event.target.value)}
          />
        </div>
        <Button disabled={busy} onClick={() => onRewrite(part, note)}>
          {t("create.rewriteCard")}
        </Button>
      </div>
    </Surface>
  );
}

export function WorldStep({
  world,
  busy,
  onEdit,
  onRewrite,
}: {
  world: DraftWorld;
  busy: boolean;
  onEdit(part: BiblePart, value: string | string[]): void;
  onRewrite(part: BiblePart, note: string): void;
}): JSX.Element {
  const t = useT();
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: space.md }}>
      <Text variant="title" as="h2">
        {t("create.worldReview")}
      </Text>
      <Text tone="muted">{t("create.worldReviewNote")}</Text>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
          gap: space.md,
        }}
      >
        {BIBLE_PARTS.map((part) => (
          <WorldCard
            key={part}
            part={part}
            world={world}
            busy={busy}
            onEdit={onEdit}
            onRewrite={onRewrite}
          />
        ))}
      </div>
    </div>
  );
}

export function patchBible(
  fields: BibleFields,
  part: BiblePart,
  value: string | string[],
): BibleFields {
  return { ...fields, [part]: value } as BibleFields;
}
