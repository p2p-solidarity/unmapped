// The chat box over the land (simplify-together → Chat), bottom-left, shown only while this world
// plays with friends (a continent). The newest lines fade after a while; "Press Enter to talk" shows
// once a friend is here. Enter opens the line, Enter sends it (and shows it here), Esc closes it.
//
// While the line is open it owns the keyboard: a capture listener takes every key before the land,
// the dock and Play's own keys see it (so typing never walks, and Esc never leaves Play), and the box
// is a `data-layer`, so a pad falls back to menu focus instead of walking. The engine's input lock is
// not written here: it is derived in one place (app/useInputLock.ts) and nothing else may set it.
// Friends' words are untrusted and render as plain React text only.

import { errorLine, useT } from "@renderer/i18n";
import { topLayer } from "@renderer/input/focus";
import { sendChat } from "@renderer/net/continentChat";
import { type ChatLine, useChatStore, useContinentStore, useEngineStore } from "@renderer/state";
import { colors, radius, space, Text, TextField, zIndex } from "@renderer/ui";
import { CHAT_MAX_CHARS } from "@shared/continentHello";
import type { AppError } from "@shared/result";
import { type JSX, useEffect, useId, useRef, useState } from "react";
import { isTypingTarget } from "../hotkeys";

/** How long a line stays on the land once it arrived, and when it starts to fade. */
const SHOW_MS = 15_000;
const FADE_MS = 3_000;
/** Lines shown while the box is closed / open. */
const SHOWN_CLOSED = 5;
const SHOWN_OPEN = 10;

function ChatRow({ line, now, open }: { line: ChatLine; now: number; open: boolean }): JSX.Element {
  const t = useT();
  const age = now - line.at;
  const opacity = open ? 1 : Math.max(0, Math.min(1, (SHOW_MS - age) / FADE_MS));
  const who = line.mine ? t("together.chatYou") : (line.name ?? t("together.chatFriend"));
  return (
    <div
      style={{
        opacity,
        transition: "opacity 0.5s linear",
        padding: `2px ${space.sm}px`,
        background: colors.bgOverlay,
        borderRadius: radius.md,
        overflowWrap: "anywhere",
      }}
    >
      <Text variant="body" tone={line.mine ? "accent" : "muted"}>
        {`${who}: `}
      </Text>
      <Text variant="body">{line.text}</Text>
    </div>
  );
}

/** Whether Enter on this key press should open the line: the land has the keys and nothing is open. */
function mayOpen(event: KeyboardEvent): boolean {
  if (event.code !== "Enter" && event.code !== "NumpadEnter") return false;
  if (event.repeat || event.isComposing || event.altKey || event.ctrlKey || event.metaKey) {
    return false;
  }
  if (isTypingTarget(event.target)) return false;
  // Enter on a focused button presses that button, never opens the chat as well.
  if (event.target instanceof Element && event.target.closest("button, a, [role='button']")) {
    return false;
  }
  return !useEngineStore.getState().inputLocked && topLayer() === null;
}

export function ChatBox(): JSX.Element | null {
  const t = useT();
  const onContinent = useContinentStore((state) => state.status.kind !== "off");
  const friendsHere = useContinentStore((state) =>
    state.status.kind === "live" ? state.status.peers : 0,
  );
  const lines = useChatStore((state) => state.lines);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const typed = useRef(draft);
  typed.current = draft;
  const [error, setError] = useState<AppError | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const inputId = useId();
  const canTalk = onContinent && friendsHere > 0;
  // Something else took the keys (the console, a talk, a door): the line gives way.
  const locked = useEngineStore((state) => state.inputLocked);

  // Enter opens the line while a friend is here and the land has the keyboard.
  useEffect(() => {
    if (!canTalk || open) return;
    const onKey = (event: KeyboardEvent): void => {
      if (!mayOpen(event)) return;
      event.preventDefault();
      setError(null);
      setOpen(true);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [canTalk, open]);

  // The open line owns every key (see the header); F12 still opens the console over it.
  useEffect(() => {
    if (!open) return;
    document.getElementById(inputId)?.focus();
    const onKey = (event: KeyboardEvent): void => {
      if (event.code === "F12") return;
      event.stopImmediatePropagation();
      // An input method is composing: Enter and Esc belong to it.
      if (event.isComposing) return;
      if (event.code === "Escape" || event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
        return;
      }
      if (event.code !== "Enter" && event.code !== "NumpadEnter") return;
      event.preventDefault();
      const text = typed.current;
      if (text.trim() !== "") {
        const sent = sendChat(text);
        if (!sent.ok) {
          setError(sent.error);
          return;
        }
      }
      setDraft("");
      setError(null);
      setOpen(false);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open, inputId]);

  // Leaving the friends (or the last one leaving), or another layer taking the keys, closes it.
  useEffect(() => {
    if (!canTalk || locked) setOpen(false);
  }, [canTalk, locked]);

  // Lines fade as time passes: re-read the clock while any are still on the land.
  const newest = lines.at(-1)?.at ?? 0;
  useEffect(() => {
    setNow(Date.now());
    if (Date.now() - newest >= SHOW_MS) return;
    const timer = setInterval(() => {
      const at = Date.now();
      setNow(at);
      if (at - newest >= SHOW_MS) clearInterval(timer);
    }, 500);
    return () => clearInterval(timer);
  }, [newest]);

  if (!onContinent) return null;
  const shown = open
    ? lines.slice(-SHOWN_OPEN)
    : lines.slice(-SHOWN_CLOSED).filter((line) => now - line.at < SHOW_MS);

  return (
    <div
      style={{
        position: "absolute",
        left: space.md,
        bottom: 112,
        width: "min(420px, 40%)",
        display: "flex",
        flexDirection: "column",
        gap: space.xs,
        zIndex: zIndex.hud,
        pointerEvents: "none",
      }}
    >
      {shown.map((line) => (
        <ChatRow key={line.id} line={line} now={now} open={open} />
      ))}
      {open ? (
        <div
          data-layer="chat"
          role="dialog"
          aria-label={t("together.chat")}
          style={{ display: "flex", flexDirection: "column", gap: 2, pointerEvents: "auto" }}
        >
          <TextField
            id={inputId}
            value={draft}
            maxLength={CHAT_MAX_CHARS}
            placeholder={t("together.chatPlaceholder")}
            aria-label={t("together.chat")}
            autoComplete="off"
            onChange={(event) => setDraft(event.target.value)}
            onBlur={() => setOpen(false)}
          />
          <Text variant="caption" tone={error === null ? "dim" : "danger"}>
            {error === null ? t("together.chatKeys") : errorLine(error)}
          </Text>
        </div>
      ) : canTalk ? (
        <Text variant="caption" tone="dim">
          {t("together.chatHint")}
        </Text>
      ) : null}
    </div>
  );
}
