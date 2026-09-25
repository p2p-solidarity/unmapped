// What the model is writing, while it writes it (rev 6 §3.4). The world step's Bible program fills
// its cards one argument at a time, and the story's @@ blocks become chapter cards as they arrive.
// It only reads the streamed text: nothing here is kept — the parsed, repaired result replaces it
// when the call settles, and a repair round (which streams again) restarts the preview.

import { type StringKey, useT } from "@renderer/i18n";
import { Surface, Text } from "@renderer/ui";
import { BIBLE_PARTS, type BiblePart } from "@shared/bible";
import { PLAY_KINDS, type PlayKind } from "@shared/chapter";
import { readStoryBlocks } from "@shared/story";
import type { JSX } from "react";

export interface BibleStream {
  parts: Partial<Record<BiblePart, string | string[]>>;
  /** The part whose text is still arriving. */
  open: BiblePart | null;
}

/**
 * Reads `root = Bible("premise", "tone", [rules], [taboos], "naming", "voice", "look")` as far as it
 * has arrived. Only the latest program counts: a repair round writes a whole new one.
 */
export function readBibleStream(text: string): BibleStream {
  const start = text.lastIndexOf("Bible(");
  const parts: BibleStream["parts"] = {};
  if (start < 0) return { parts, open: null };
  let arg = 0;
  let depth = 0;
  let inString = false;
  let escaped = false;
  let buffer = "";
  let items: string[] = [];
  for (const ch of text.slice(start + "Bible(".length)) {
    const part = BIBLE_PARTS[arg];
    if (inString) {
      if (escaped) {
        buffer += ch === "n" ? "\n" : ch;
        escaped = false;
      } else if (ch === "\\") escaped = true;
      else if (ch === '"') {
        inString = false;
        if (part !== undefined) {
          if (depth > 0) {
            items = [...items, buffer];
            parts[part] = items;
          } else parts[part] = buffer;
        }
      } else buffer += ch;
      continue;
    }
    if (ch === '"') {
      inString = true;
      buffer = "";
    } else if (ch === "[") {
      depth += 1;
      items = [];
      if (part !== undefined) parts[part] = items;
    } else if (ch === "]") depth = Math.max(0, depth - 1);
    else if (ch === "," && depth === 0) arg += 1;
    else if (ch === ")" && depth === 0) return { parts, open: null };
  }
  const part = BIBLE_PARTS[arg] ?? null;
  if (part !== null && inString) parts[part] = depth > 0 ? [...items, buffer] : buffer;
  return { parts, open: part };
}

const CARD: Record<BiblePart, StringKey> = {
  premise: "create.partPremise",
  tone: "create.partTone",
  rules: "create.partRules",
  taboos: "create.partTaboos",
  naming: "create.partNaming",
  voice: "create.partVoice",
  look: "create.partLook",
};

const KIND: Record<PlayKind, StringKey> = {
  meet: "create.kindMeet",
  search: "create.kindSearch",
  fight: "create.kindFight",
  climb: "create.kindClimb",
  maze: "create.kindMaze",
};

function Writing(): JSX.Element {
  const t = useT();
  return (
    <Text variant="caption" tone="accent">
      {t("create.streamWriting")}
    </Text>
  );
}

function BiblePreview({ text }: { text: string }): JSX.Element {
  const t = useT();
  const { parts, open } = readBibleStream(text);
  const shown = BIBLE_PARTS.filter((part) => parts[part] !== undefined);
  if (shown.length === 0) return <Writing />;
  return (
    <div data-stream-preview="world" style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {shown.map((part) => {
        const value = parts[part];
        return (
          <Surface key={part} variant="outlined" padding="sm" style={{ gap: 2 }}>
            <Text variant="label" tone={part === open ? "accent" : "muted"}>
              {t(CARD[part])}
            </Text>
            {Array.isArray(value) ? (
              value.map((item, at) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: a stream only appends; position is identity
                <Text key={`${part}-${at}`} variant="caption">
                  – {item}
                </Text>
              ))
            ) : (
              <Text variant="caption">{value}</Text>
            )}
          </Surface>
        );
      })}
      {open === null ? null : <Writing />}
    </div>
  );
}

function StoryPreview({ text, single }: { text: string; single: boolean }): JSX.Element {
  const t = useT();
  // A repair round writes the whole reply again: only its latest start counts.
  const from = text.lastIndexOf(single ? "@@episode" : "@@logline");
  const { logline, episodes, numbers } = readStoryBlocks(from < 0 ? text : text.slice(from));
  if (logline === "" && episodes.length === 0) return <Writing />;
  return (
    <div data-stream-preview="story" style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {logline === "" ? null : (
        <Text variant="caption" tone="muted">
          {t("create.logline")}: {logline}
        </Text>
      )}
      {episodes.map((episode, at) => {
        // The plan is numbered by order; a single rewrite only by what its header says.
        const n = numbers[at] ?? (single ? null : at + 1);
        return (
          <Surface
            // biome-ignore lint/suspicious/noArrayIndexKey: a stream only appends; position is identity
            key={`${at}-${episode.title}`}
            variant="outlined"
            padding="sm"
            style={{ gap: 2 }}
          >
            <Text variant="label" tone={at === episodes.length - 1 ? "accent" : "muted"}>
              {n === null ? episode.title : `${t("create.chapterN", { n })} · ${episode.title}`}
            </Text>
            <Text variant="caption" tone="dim">
              {episode.place}
              {(PLAY_KINDS as readonly string[]).includes(episode.kind)
                ? ` · ${t(KIND[episode.kind as PlayKind])}`
                : ""}
            </Text>
            <Text variant="caption">{episode.brief}</Text>
          </Surface>
        );
      })}
      <Writing />
    </div>
  );
}

/** The live preview for a Create stage; plain text for the stages that stream prose. */
export function StreamPreview({ stage, text }: { stage: string; text: string }): JSX.Element {
  if (stage === "world") return <BiblePreview text={text} />;
  if (stage === "story" || stage === "note") return <StoryPreview text={text} single={false} />;
  if (stage === "chapter" || stage === "insert") return <StoryPreview text={text} single />;
  return (
    <Text variant="caption" tone="dim" style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
      {text.slice(-1200)}
    </Text>
  );
}
