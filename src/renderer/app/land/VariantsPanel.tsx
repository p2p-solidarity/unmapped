// The tellings of one chunk (rev 6 phase 3, D15): the one standing (the first the world received),
// each 異聞 (a telling written at the same time, offline or before a claim came back) with its
// writer and entry, this device's own older copy when it keeps one (D6), and the chunk's legends
// (傳說, its looks before it faded into fog). Read only: walking a variant is not part of the game.
// A layer over the notes panel (opened from it); Esc / B closes it back to the notes.

import type { WitnessMark } from "@renderer/history";
import { formatDateTime, useT } from "@renderer/i18n";
import { useLandStore } from "@renderer/state";
import { Button, Surface, space, Text, zIndex } from "@renderer/ui";
import { type ChunkCoord, chunkKey } from "@shared/chunks";
import { type JSX, useEffect, useMemo } from "react";
import { legendName, type Telling, tellingsOf } from "./traces";
import { shortKey } from "./worldDoor";

function MarkLines({ mark, notes }: { mark: WitnessMark; notes: number | null }): JSX.Element {
  const t = useT();
  return (
    <>
      <Text variant="body">{mark.name}</Text>
      <Text variant="caption" tone="muted">
        {t("traces.writtenBy", {
          name: mark.by ?? shortKey(mark.author),
          n: mark.n,
          when: formatDateTime(mark.at),
        })}
      </Text>
      {mark.pending ? (
        <Text variant="caption" tone="dim">
          {t("landHistory.provisional")}
        </Text>
      ) : null}
      {notes === null || notes === 0 ? null : (
        <Text variant="caption" tone="dim">
          {t("traces.variantNotes", { n: notes })}
        </Text>
      )}
    </>
  );
}

function TellingCard({ heading, telling }: { heading: string; telling: Telling }): JSX.Element {
  return (
    <Surface
      variant="inset"
      padding="sm"
      style={{ display: "flex", flexDirection: "column", gap: 2 }}
    >
      <Text variant="label" tone="accent">
        {heading}
      </Text>
      <MarkLines mark={telling.mark} notes={telling.notes} />
    </Surface>
  );
}

export function VariantsPanel({
  chunk,
  onClose,
}: {
  chunk: ChunkCoord;
  onClose(): void;
}): JSX.Element {
  const t = useT();
  const key = chunkKey(chunk);
  const marks = useLandStore((state) => state.marks[key]);
  const notes = useLandStore((state) => state.notes);
  const standing = useLandStore((state) => {
    const here = state.chunks[key];
    return here?.status === "written" ? here.scene.name : null;
  });
  const tellings = useMemo(() => tellingsOf(marks, notes), [marks, notes]);
  const place = standing ?? legendName(marks) ?? t("land.unwrittenLand");

  // Esc / B goes back to the notes, not out of them: caught before the app's own Escape.
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key !== "Escape" && event.code !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      onClose();
    };
    window.addEventListener("keydown", onKey, { capture: true });
    return () => window.removeEventListener("keydown", onKey, { capture: true });
  }, [onClose]);

  return (
    <div
      data-layer="variants"
      style={{
        position: "fixed",
        inset: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: zIndex.overlay,
        pointerEvents: "none",
      }}
    >
      <Surface
        variant="card"
        padding="lg"
        style={{
          width: "min(600px, 92%)",
          maxHeight: "86%",
          overflowY: "auto",
          pointerEvents: "auto",
          display: "flex",
          flexDirection: "column",
          gap: space.sm,
        }}
      >
        <Text variant="title" as="h2">
          {t("traces.variantsTitle", { place, cx: chunk.cx, cz: chunk.cz })}
        </Text>
        {tellings === null ? (
          <Text variant="body" tone="dim">
            {t("common.nothingYet")}
          </Text>
        ) : (
          <>
            {tellings.variants.length > 0 || tellings.localCopy ? (
              <Text variant="caption" tone="muted">
                {t("traces.variantsIntro")}
              </Text>
            ) : null}
            {tellings.live === null ? null : (
              <TellingCard heading={t("traces.standing")} telling={tellings.live} />
            )}
            {tellings.variants.map((telling, index) => (
              <TellingCard
                key={telling.mark.id}
                heading={t("traces.variantRow", { i: index + 1 })}
                telling={telling}
              />
            ))}
            {tellings.localCopy ? (
              <Surface variant="outlined" padding="sm">
                <Text variant="caption" tone="dim">
                  {t("traces.localCopy")}
                </Text>
              </Surface>
            ) : null}
            {tellings.legends.length === 0 ? null : (
              <div style={{ display: "flex", flexDirection: "column", gap: space.xs }}>
                <Text variant="label" tone="muted">
                  {t("traces.legends")}
                </Text>
                {[...tellings.legends].reverse().map((mark) => (
                  <Surface
                    key={mark.id}
                    variant="outlined"
                    padding="sm"
                    style={{ display: "flex", flexDirection: "column", gap: 2 }}
                  >
                    <MarkLines mark={mark} notes={null} />
                  </Surface>
                ))}
              </div>
            )}
          </>
        )}
        <Button variant="secondary" className="g-autofocus" hotkey="Esc" onClick={onClose}>
          {t("common.back")}
        </Button>
      </Surface>
    </div>
  );
}
