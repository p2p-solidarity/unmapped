// The world's own lists at the door (rev 6 phase 3, D6, D11, D18): what the world refused of this
// device's entries (each with its reason, listed until dismissed — Rule 2: never dropped silently),
// what moving this save into its history kept on this device only (one item at a time), and how
// many entries a newer build wrote that this one keeps but cannot show. Nothing shows when all three
// are empty, and nothing for a save without a world.

import { errorLine, formatDateTime, translate, useT } from "@renderer/i18n";
import { useHistoryStore } from "@renderer/state";
import { Button, ErrorBlock, Surface, space, Text } from "@renderer/ui";
import { readEvent } from "@shared/history/event";
import type { AppError } from "@shared/result";
import type { RefusedEvent, Skipped } from "@shared/worldApi";
import { type JSX, useState } from "react";
import { dismissRefused, refusedGiftItem } from "./traces";

const column = { display: "flex", flexDirection: "column", gap: space.xs } as const;
const row = { display: "flex", flexWrap: "wrap", gap: space.xs, alignItems: "center" } as const;

const clip = (text: string, max = 40): string =>
  text.length > max ? `${text.slice(0, max - 1)}…` : text;

/** What a refused entry was, in one line (its body is this device's own, signed by main). */
function describe(event: RefusedEvent["event"]): string {
  const read = readEvent(event);
  if (!read.ok) return translate("traces.evOther", { kind: String(event.kind ?? "?") });
  const one = read.value;
  switch (one.kind) {
    case "note":
      return translate("traces.evNote", { text: clip(one.body.text) });
    case "signpost":
      return translate("traces.evSignpost", { text: one.body.text });
    case "gift":
      return translate("traces.evGift", { item: one.body.item.name });
    case "gift.take":
      return translate("traces.evTake");
    case "witness":
      return translate("traces.evWitness", { cx: one.body.cx, cz: one.body.cz });
    case "place":
      return translate("traces.evPlace", { title: one.body.title });
    case "chapter":
      return translate("traces.evChapter", { title: one.body.title });
    case "story.more":
      return translate("traces.evChapter", { title: one.body.episode.title });
    default:
      return translate("traces.evOther", { kind: one.kind });
  }
}

function RefusedRow({ refused, me }: { refused: RefusedEvent; me: string | null }): JSX.Element {
  const t = useT();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<AppError | null>(null);
  const item = refusedGiftItem(refused, me);
  return (
    <Surface variant="inset" padding="sm" style={{ ...column, gap: 2 }}>
      <Text variant="body">{describe(refused.event)}</Text>
      <Text variant="caption" tone="danger">
        {errorLine(refused.error)}
      </Text>
      <Text variant="caption" tone="dim">
        {formatDateTime(refused.at)}
      </Text>
      {error === null ? null : <ErrorBlock error={error} />}
      <div style={row}>
        <Button
          variant="secondary"
          disabled={busy}
          onClick={() => {
            setBusy(true);
            void dismissRefused(refused).then((done) => {
              setBusy(false);
              setError(done.ok ? null : done.error);
            });
          }}
        >
          {item === null ? t("traces.dismiss") : t("traces.dismissGift", { item: item.name })}
        </Button>
      </div>
    </Surface>
  );
}

function skippedWhat(skipped: Skipped): string {
  switch (skipped.what) {
    case "chunk":
      return translate("traces.whatChunk", { key: skipped.key.replace(",", " · ") });
    case "note":
      return translate("traces.whatNote", { key: skipped.key });
    case "place":
      return translate("traces.whatPlace", { key: skipped.key });
    default:
      return translate("traces.whatOther", { what: skipped.what, key: skipped.key });
  }
}

/** The migration's skipped list, one item at a time. */
function SkippedPager({ skipped }: { skipped: readonly Skipped[] }): JSX.Element {
  const t = useT();
  const [at, setAt] = useState(0);
  const index = Math.min(at, skipped.length - 1);
  const one = skipped[index];
  return (
    <div style={column}>
      <Text variant="label" tone="muted">
        {t("traces.skipped", { n: skipped.length })}
      </Text>
      <Text variant="caption" tone="dim">
        {t("traces.skippedIntro")}
      </Text>
      {one === undefined ? null : (
        <Surface variant="inset" padding="sm" style={{ ...column, gap: 2 }}>
          <Text variant="body">{skippedWhat(one)}</Text>
          <Text variant="caption" tone="muted">
            {errorLine({ code: one.code, message: one.message })}
          </Text>
        </Surface>
      )}
      {skipped.length < 2 ? null : (
        <div style={row}>
          <Button variant="ghost" disabled={index === 0} onClick={() => setAt(index - 1)}>
            {t("traces.previous")}
          </Button>
          <Text variant="caption" tone="muted">
            {t("traces.skippedOf", { i: index + 1, n: skipped.length })}
          </Text>
          <Button
            variant="ghost"
            disabled={index >= skipped.length - 1}
            onClick={() => setAt(index + 1)}
          >
            {t("traces.next")}
          </Button>
        </div>
      )}
    </div>
  );
}

export function WorldRecordsSection(): JSX.Element | null {
  const t = useT();
  const world = useHistoryStore((state) => state.world);
  // idle: no world (a legacy save); error: the land and the door say why already.
  if (world.status === "idle" || world.status === "error") return null;
  if (world.status === "loading") {
    return (
      <Text variant="caption" tone="muted">
        {t("landHistory.reading")}
      </Text>
    );
  }
  const { refused, ensured, status } = world.value;
  const { skipped } = ensured;
  if (refused.length === 0 && skipped.length === 0 && status.newer === 0) return null;
  return (
    <div style={{ ...column, gap: space.sm }}>
      <Text variant="label" tone="muted">
        {t("traces.records")}
      </Text>
      {refused.length === 0 ? null : (
        <div style={column}>
          <Text variant="label" tone="danger">
            {t("traces.refused", { n: refused.length })}
          </Text>
          <Text variant="caption" tone="dim">
            {t("traces.refusedIntro")}
          </Text>
          {refused.map((one) => (
            <RefusedRow key={one.event.id} refused={one} me={status.me} />
          ))}
        </div>
      )}
      {skipped.length === 0 ? null : <SkippedPager skipped={skipped} />}
      {status.newer === 0 ? null : (
        <Text variant="caption" tone="muted">
          {t("traces.newer", { n: status.newer })}
        </Text>
      )}
    </div>
  );
}
