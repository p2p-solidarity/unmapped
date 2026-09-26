// What a shared world's history holds, as lists (rev 6 phase 4, D7): the places witnessed there
// (their names from each witness's index), the places built to enter, the notes and the signposts.
// Everything comes from the fold (`WorldNow`); hidden events are skipped like every view does
// (P3 D4), and an empty list says so (Rule 2). Words people wrote are shown as written.

import { type StringKey, useT } from "@renderer/i18n";
import { colors, Surface, space, Text } from "@renderer/ui";
import type { WorldNow } from "@shared/history/types";
import type { JSX, ReactNode } from "react";

function Section({
  title,
  empty,
  children,
}: {
  title: StringKey;
  empty: StringKey;
  children: ReactNode[];
}): JSX.Element {
  const t = useT();
  return (
    <Surface variant="overlay" padding="md">
      <Text variant="label" tone="accent" as="h3">
        {t(title)}
      </Text>
      {children.length === 0 ? (
        <Text variant="body" tone="dim">
          {t(empty)}
        </Text>
      ) : (
        <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: space.sm }}>
          {children}
        </ul>
      )}
    </Surface>
  );
}

function Row({ children }: { children: ReactNode }): JSX.Element {
  return (
    <li
      style={{
        display: "flex",
        flexDirection: "column",
        gap: space.xs,
        paddingBottom: space.sm,
        borderBottom: `1px solid ${colors.surfaceBorder}`,
      }}
    >
      {children}
    </li>
  );
}

export function WorldLists({ now }: { now: WorldNow }): JSX.Element {
  const t = useT();
  const shown = (id: string) => now.hidden[id] !== true;
  const nameOf = (key: string) => now.names[key] ?? t("mobile.someone");
  const chunks = Object.values(now.chunks)
    .filter((chunk) => shown(chunk.live.id))
    .sort((a, b) => a.live.n - b.live.n);
  const places = now.places.filter((place) => shown(place.id));
  const notes = now.notes.filter((note) => shown(note.id));
  const signposts = now.signposts.filter((sign) => shown(sign.id));

  return (
    <>
      <Section title="mobile.witnessedTitle" empty="mobile.witnessedEmpty">
        {chunks.map((chunk) => (
          <Row key={chunk.live.id}>
            <Text variant="bodyLarge">{chunk.index.name}</Text>
            <Text variant="caption" tone="dim">
              {t("mobile.chunkAt", { cx: chunk.cx, cz: chunk.cz })}
              {" · "}
              {t("mobile.byName", { name: nameOf(chunk.live.author) })}
              {chunk.fogged ? ` · ${t("mobile.fogged")}` : ""}
              {chunk.live.pending ? ` · ${t("mobile.notShared")}` : ""}
            </Text>
          </Row>
        ))}
      </Section>
      <Section title="mobile.placesTitle" empty="mobile.placesEmpty">
        {places.map((place) => (
          <Row key={place.id}>
            <Text variant="bodyLarge">{place.body.title}</Text>
            <Text variant="caption" tone="dim">
              {t(`mobile.place_${place.body.kind}`)}
              {" · "}
              {t("mobile.chunkAt", { cx: place.cx, cz: place.cz })}
            </Text>
          </Row>
        ))}
      </Section>
      <Section title="mobile.notesTitle" empty="mobile.notesEmpty">
        {notes.map((note) => (
          <Row key={note.id}>
            <Text variant="body">{note.body.text}</Text>
            <Text variant="caption" tone="dim">
              {t("mobile.byName", { name: note.body.name })}
              {" · "}
              {t("mobile.chunkAt", { cx: note.body.coord.cx, cz: note.body.coord.cz })}
              {note.pending ? ` · ${t("mobile.notShared")}` : ""}
            </Text>
          </Row>
        ))}
      </Section>
      <Section title="mobile.signpostsTitle" empty="mobile.signpostsEmpty">
        {signposts.map((sign) => (
          <Row key={sign.id}>
            <Text variant="body">{sign.body.text}</Text>
            <Text variant="caption" tone="dim">
              {t("mobile.chunkAt", { cx: sign.body.coord.cx, cz: sign.body.coord.cz })}
              {sign.body.toward === null
                ? ""
                : ` · ${t("mobile.toward", { cx: sign.body.toward.cx, cz: sign.body.toward.cz })}`}
              {sign.pending ? ` · ${t("mobile.notShared")}` : ""}
            </Text>
          </Row>
        ))}
      </Section>
    </>
  );
}
