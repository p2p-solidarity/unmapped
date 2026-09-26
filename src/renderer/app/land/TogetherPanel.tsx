// Watching a place being written (rev 6 phase 3, D16). Whatever `useLandStore.developing` holds —
// someone else's stream this device follows, or this device's own while it writes — shows as a
// chip on the HUD; the stream opens as a layer the way Create's StreamPreview reads a partial
// program: the place's name, its people and their first words, what is told there, arriving
// statement by statement. Someone else's stream opens by itself once; B, Escape or "Keep walking"
// close it and the chip stays, and interact (E / A) with nothing in reach opens it again. Nothing
// here is kept: the committed witness replaces it.
//
// `TogetherLayer` is what the HUD mounts: this panel, the emote wheel and the world's presence.

import { useT } from "@renderer/i18n";
import {
  type Developing,
  useEngineStore,
  useLandStore,
  useSessionStore,
  useWorldStore,
} from "@renderer/state";
import { Button, Surface, space, Text, zIndex } from "@renderer/ui";
import { parseClaimTarget } from "@shared/worldProtocol";
import { type JSX, useCallback, useEffect, useRef, useState } from "react";
import { matchesAction, useKeys } from "../../engine/useKeys";
import { useWorldPresence } from "../../net/worldPresence";
import { EmoteWheel } from "./EmoteWheel";
import { useOpenWorld, writerName } from "./together";

// ── Reading a partial program ─────────────────────────────────────────────────────────────────

export interface StreamStatement {
  id: string;
  component: string;
  /** Each top-level argument: its text when it is a string (so far), else null. */
  args: (string | null)[];
  /** Still arriving: its closing parenthesis has not come yet. */
  open: boolean;
}

const HEAD = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*([A-Z][A-Za-z0-9]*)\s*\(/;

function readArgs(rest: string): { args: (string | null)[]; open: boolean } {
  const args: (string | null)[] = [];
  let depth = 0;
  let inString = false;
  let escaped = false;
  let buffer: string | null = null;
  let started = false;
  // Only a string that is a whole top-level argument is read; strings inside a list are skipped.
  let capture = false;
  for (const ch of rest) {
    if (inString) {
      if (escaped) {
        if (capture) buffer = (buffer ?? "") + (ch === "n" ? " " : ch);
        escaped = false;
      } else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      else if (capture) buffer = (buffer ?? "") + ch;
      continue;
    }
    if (ch === '"') {
      inString = true;
      capture = depth === 0 && !started;
      if (capture) buffer = "";
      started = true;
    } else if (ch === "(" || ch === "[") {
      depth += 1;
      started = true;
    } else if (ch === ")" || ch === "]") {
      if (depth === 0) {
        args.push(buffer);
        return { args, open: false };
      }
      depth -= 1;
    } else if (ch === "," && depth === 0) {
      args.push(buffer);
      buffer = null;
      started = false;
    } else if (ch.trim() !== "") started = true;
  }
  if (started) args.push(buffer);
  return { args, open: true };
}

/**
 * Reads `id = Component(args…)` lines as far as they have arrived. A later line with the same id
 * replaces the earlier one (a repair round rewrites the failing statements); order is first seen.
 */
export function readProgramStream(text: string): StreamStatement[] {
  const byId = new Map<string, StreamStatement>();
  for (const line of text.split("\n")) {
    const head = HEAD.exec(line);
    if (head === null) continue;
    const [whole, id = "", component = ""] = head;
    byId.set(id, { id, component, ...readArgs(line.slice(whole.length)) });
  }
  return [...byId.values()];
}

interface StreamView {
  title: string | null;
  brief: string | null;
  people: { id: string; name: string; words: string | null; open: boolean }[];
  told: string[];
  asks: string[];
  rumors: string[];
  foes: number;
  treasures: number;
  open: boolean;
}

function viewOf(statements: readonly StreamStatement[]): StreamView {
  const arg = (one: StreamStatement, at: number): string | null => one.args[at] ?? null;
  const root = statements.find((one) => ["Chunk", "Chapter", "Scene"].includes(one.component));
  const words = new Map<string, string>();
  for (const one of statements) {
    const npc = arg(one, 0);
    const line = arg(one, 1);
    if (one.component === "Talk" && npc !== null && line !== null) words.set(npc, line);
  }
  const people = statements.flatMap((one) => {
    const id = arg(one, 0);
    const name = arg(one, 1);
    if (one.component !== "NPC" || id === null || name === null || name === "") return [];
    return [{ id, name, words: words.get(id) ?? null, open: one.open }];
  });
  const pick = (components: readonly string[], at: number): string[] =>
    statements.flatMap((one) => {
      const value = components.includes(one.component) ? arg(one, at) : null;
      return value === null || value === "" ? [] : [value];
    });
  return {
    title: root === undefined ? null : arg(root, 0),
    brief: root?.component === "Chapter" ? arg(root, 1) : null,
    people,
    told: pick(["Lore"], 2),
    asks: pick(["Find", "Deliver", "Guide"], 2),
    rumors: pick(["Rumor"], 1),
    foes: statements.filter((one) => one.component === "Monster").length,
    treasures: statements.filter((one) => one.component === "Treasure").length,
    open: statements.at(-1)?.open ?? true,
  };
}

function Writing(): JSX.Element {
  const t = useT();
  return (
    <Text variant="caption" tone="accent">
      {t("together.arriving")}
    </Text>
  );
}

function ProgramPreview({ text }: { text: string }): JSX.Element {
  const t = useT();
  const view = viewOf(readProgramStream(text));
  const empty =
    view.title === null &&
    view.people.length === 0 &&
    view.told.length === 0 &&
    view.asks.length === 0 &&
    view.rumors.length === 0;
  if (empty) {
    return (
      <Text variant="caption" tone="dim">
        {text.trim() === "" ? t("together.nothingYet") : text.slice(-600)}
      </Text>
    );
  }
  const section = (label: string, lines: readonly string[]): JSX.Element | null =>
    lines.length === 0 ? null : (
      <Surface variant="outlined" padding="sm" style={{ gap: 2 }}>
        <Text variant="label" tone="muted">
          {label}
        </Text>
        {lines.map((line, at) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: a stream only appends; position is identity
          <Text key={at} variant="caption">
            – {line}
          </Text>
        ))}
      </Surface>
    );
  return (
    <div
      data-stream-preview="together"
      style={{ display: "flex", flexDirection: "column", gap: 6 }}
    >
      {view.title === null ? null : <Text variant="title">{view.title}</Text>}
      {view.brief === null ? null : (
        <Text variant="caption" tone="muted">
          {view.brief}
        </Text>
      )}
      {view.people.length === 0 ? null : (
        <Surface variant="outlined" padding="sm" style={{ gap: 4 }}>
          <Text variant="label" tone="muted">
            {t("together.people")}
          </Text>
          {view.people.map((person) => (
            <div key={person.id} style={{ display: "flex", flexDirection: "column" }}>
              <Text variant="body" tone={person.open ? "accent" : "default"}>
                {person.name}
              </Text>
              {person.words === null ? null : (
                <Text variant="caption" tone="dim">
                  {t("together.said", { words: person.words })}
                </Text>
              )}
            </div>
          ))}
        </Surface>
      )}
      {section(t("together.told"), view.told)}
      {section(t("together.errand"), view.asks)}
      {section(t("together.targetRumors"), view.rumors)}
      {view.foes === 0 && view.treasures === 0 ? null : (
        <Text variant="caption" tone="muted">
          {[
            view.foes === 0 ? null : t("together.foes", { n: view.foes }),
            view.treasures === 0 ? null : t("together.treasures", { n: view.treasures }),
          ]
            .filter((part) => part !== null)
            .join(" · ")}
        </Text>
      )}
      {view.open ? <Writing /> : null}
    </div>
  );
}

// ── The chip and the layer ────────────────────────────────────────────────────────────────────

function useTargetLabel(): (target: string) => string {
  const t = useT();
  return (target) => {
    const subject = parseClaimTarget(target);
    if (subject === null) return target;
    switch (subject.kind) {
      case "chunk":
        return t("together.targetChunk", { cx: subject.cx, cz: subject.cz });
      case "chapter":
        return t("together.targetChapter", { id: subject.episodeId });
      case "more":
        return t("together.targetMore", { id: subject.episodeId });
      case "rumors":
        return t("together.targetRumors");
    }
  };
}

function useWriterLine(): (developing: Developing) => string {
  const t = useT();
  const world = useOpenWorld();
  return (developing) =>
    developing.mine
      ? t("together.writingMine")
      : t("together.writingBy", { name: writerName(developing.by, world?.now ?? null) });
}

function StreamLayer({
  target,
  developing,
  onClose,
}: {
  target: string;
  developing: Developing;
  onClose: () => void;
}): JSX.Element {
  const t = useT();
  const label = useTargetLabel();
  const writer = useWriterLine();
  const close = useRef(onClose);
  close.current = onClose;

  // This layer owns Escape (and the pad's B) while it is open, so it never leaves Play.
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key !== "Escape" && event.code !== "Escape") return;
      event.preventDefault();
      event.stopImmediatePropagation();
      close.current();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);

  return (
    <div
      data-layer="together"
      role="dialog"
      aria-label={t("together.title")}
      style={{
        position: "absolute",
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
          width: "min(560px, 92%)",
          maxHeight: "72%",
          overflowY: "auto",
          pointerEvents: "auto",
          display: "flex",
          flexDirection: "column",
          gap: space.sm,
        }}
      >
        <Text variant="label" tone="muted">
          {t("together.title")} · {label(target)}
        </Text>
        <Text variant="body" tone="accent">
          {writer(developing)}
        </Text>
        <ProgramPreview text={developing.text} />
        <Text variant="caption" tone="dim">
          {t("together.chars", { n: developing.text.length })}
        </Text>
        <div style={{ display: "flex", gap: space.sm }}>
          <Button variant="primary" className="g-autofocus" hotkey="Esc" onClick={onClose}>
            {t("together.keepWalking")}
          </Button>
        </div>
      </Surface>
    </div>
  );
}

/** The streams being written now, the one where the player stands first. */
function ordered(
  developing: Readonly<Record<string, Developing>>,
  here: string | null,
): [string, Developing][] {
  return Object.entries(developing).sort(([a], [b]) => Number(b === here) - Number(a === here));
}

/**
 * `suppressed` while another layer of Play's own (the emote wheel) is open: only one layer is ever
 * on top, so a stream that starts meanwhile waits and opens by itself once that layer closes.
 */
export function TogetherPanel({
  suppressed,
  onOpenChange,
}: {
  suppressed: boolean;
  onOpenChange: (open: boolean) => void;
}): JSX.Element | null {
  const t = useT();
  const developing = useLandStore((state) => state.developing);
  const chunk = useEngineStore((state) => state.chunk);
  const label = useTargetLabel();
  const writer = useWriterLine();
  const [open, setOpen] = useState<string | null>(null);
  const shown = useRef(new Set<string>());

  // Someone else's stream opens once by itself: this device asked to write there and was told so.
  // A stream that ended closes its layer, so a later one on the same target starts closed.
  useEffect(() => {
    setOpen((was) => (was !== null && developing[was] === undefined ? null : was));
    if (suppressed) return;
    for (const [target, one] of Object.entries(developing)) {
      if (one.mine || shown.current.has(one.sid)) continue;
      shown.current.add(one.sid);
      setOpen(target);
    }
  }, [developing, suppressed]);
  const blocked = useRef(suppressed);
  blocked.current = suppressed;

  const entries = ordered(developing, chunk === null ? null : `chunk:${chunk.cx},${chunk.cz}`);
  const first = useRef<string | null>(null);
  first.current = entries[0]?.[0] ?? null;
  // Interact (E, the pad's A) with nobody and nothing in reach opens the stream again.
  useKeys(
    useCallback((code: string) => {
      const bindings = useWorldStore.getState().gameplayRules?.bindings;
      if (first.current === null || !matchesAction(code, bindings, "interact", ["KeyE"])) return;
      if (useSessionStore.getState().place !== null) return;
      const engine = useEngineStore.getState();
      if (engine.chunk === null || engine.nearby !== null || blocked.current) return;
      setOpen(first.current);
    }, []),
  );
  const current = open === null ? undefined : developing[open];
  const layerOpen = current !== undefined;
  useEffect(() => onOpenChange(layerOpen), [layerOpen, onOpenChange]);
  if (entries.length === 0) return null;
  return (
    <>
      <div
        style={{
          position: "absolute",
          right: space.md,
          top: "34%",
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-end",
          gap: space.xs,
          pointerEvents: "auto",
        }}
      >
        {entries.map(([target, one]) => (
          <Surface
            key={target}
            variant="overlay"
            padding="sm"
            style={{ display: "flex", alignItems: "center", gap: space.sm, maxWidth: 360 }}
          >
            <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
              <Text variant="caption" tone="accent">
                {writer(one)}
              </Text>
              <Text variant="caption" tone="dim">
                {label(target)} · {t("together.chars", { n: one.text.length })}
              </Text>
            </div>
            <Button
              variant="chip"
              hotkey={target === entries[0]?.[0] ? "E" : undefined}
              onClick={() => {
                if (!blocked.current) setOpen(target);
              }}
            >
              {t("together.watch")}
            </Button>
          </Surface>
        ))}
      </div>
      {open === null || current === undefined ? null : (
        <StreamLayer target={open} developing={current} onClose={() => setOpen(null)} />
      )}
    </>
  );
}

/** What the HUD mounts for playing together: the stream panel, the emote wheel, presence. */
export function TogetherLayer(): JSX.Element {
  useWorldPresence();
  // The stream layer and the wheel are both layers of Play: at most one is open at a time, so
  // Escape and the pad's focus always belong to the one on top.
  const [streamOpen, setStreamOpen] = useState(false);
  const [wheelOpen, setWheelOpen] = useState(false);
  return (
    <>
      <TogetherPanel suppressed={wheelOpen} onOpenChange={setStreamOpen} />
      <EmoteWheel blocked={streamOpen} onOpenChange={setWheelOpen} />
    </>
  );
}
