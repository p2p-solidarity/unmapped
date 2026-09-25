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
import { lockedParts } from "./draftState";

const LABELS: Record<BiblePart, StringKey> = {
  premise: "create.partPremise",
  tone: "create.partTone",
  rules: "create.partRules",
  taboos: "create.partTaboos",
  naming: "create.partNaming",
  voice: "create.partVoice",
  look: "create.partLook",
};

interface CardActions {
  onEdit(part: BiblePart, value: string | string[]): void;
  onRewrite(part: BiblePart, note: string): void;
  onLock(part: BiblePart): void;
}

function WorldCard({
  part,
  world,
  busy,
  onEdit,
  onRewrite,
  onLock,
}: CardActions & { part: BiblePart; world: DraftWorld; busy: boolean }): JSX.Element {
  const t = useT();
  const [note, setNote] = useState("");
  const value = world.fields[part];
  const list = isListPart(part);
  const locked = lockedParts(world).includes(part);
  const shown = Array.isArray(value) ? value.join("\n") : value;
  return (
    <Surface variant="inset" padding="md" style={{ gap: space.sm }}>
      <div style={{ display: "flex", gap: space.xs, alignItems: "center", flexWrap: "wrap" }}>
        <Text variant="label" style={{ flex: "1 1 auto" }}>
          {t(LABELS[part])}
        </Text>
        <Button variant="chip" active={locked} disabled={busy} onClick={() => onLock(part)}>
          {t(locked ? "create.unlockChapter" : "create.lockChapter")}
        </Button>
      </div>
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
      {locked ? (
        <Text variant="caption" tone="dim">
          {t("create.cardLocked")}
        </Text>
      ) : (
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
      )}
    </Surface>
  );
}

export function WorldStep({
  world,
  name,
  busy,
  onRename,
  onRewriteUnlocked,
  ...actions
}: CardActions & {
  world: DraftWorld;
  name: string;
  busy: boolean;
  onRename(name: string): void;
  onRewriteUnlocked(note: string): void;
}): JSX.Element {
  const t = useT();
  const [note, setNote] = useState("");
  const locked = lockedParts(world);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: space.md }}>
      <Text variant="title" as="h2">
        {t("create.worldReview")}
      </Text>
      <Text tone="muted">{t("create.worldReviewNote")}</Text>
      <TextField
        label={t("create.worldName")}
        value={name}
        maxLength={60}
        disabled={busy}
        onChange={(event) => onRename(event.target.value)}
      />
      <Text variant="caption" tone="dim">
        {t("create.worldNameNote")}
      </Text>
      <div style={{ display: "flex", gap: space.sm, flexWrap: "wrap", alignItems: "flex-end" }}>
        <div style={{ flex: "1 1 320px" }}>
          <TextField
            label={t("create.cardsNote")}
            value={note}
            maxLength={300}
            disabled={busy}
            onChange={(event) => setNote(event.target.value)}
          />
        </div>
        <Button
          disabled={busy || locked.length >= BIBLE_PARTS.length}
          onClick={() => onRewriteUnlocked(note)}
        >
          {t("create.rewriteUnlockedCards", { n: BIBLE_PARTS.length - locked.length })}
        </Button>
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
          gap: space.md,
        }}
      >
        {BIBLE_PARTS.map((part) => (
          <div key={part} data-card={part} style={{ display: "flex", flexDirection: "column" }}>
            <WorldCard part={part} world={world} busy={busy} {...actions} />
          </div>
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
