// What people left where the player stands (rev 6 phase 3, D3), inside the notes panel (N / pad Y):
// the signposts and gifts of this chunk, a signpost or a gift to leave, a gift to take, and the
// way into the chunk's 異聞 (./VariantsPanel). Every list is what the world's history holds, and
// nothing shows for a save without one or on another world's land. Writing goes through ./traces.

import { errorLine, formatDateTime, useT } from "@renderer/i18n";
import {
  foreignAt,
  useHistoryStore,
  useLandStore,
  useSessionStore,
  useWorldStore,
} from "@renderer/state";
import { Button, ErrorBlock, Surface, space, Text, TextField } from "@renderer/ui";
import { type ChunkCoord, chunkKey } from "@shared/chunks";
import { HISTORY_LIMITS } from "@shared/history/bodies";
import { sameChunk } from "@shared/history/ids";
import type { Folded, GiftNow, SignpostBody } from "@shared/history/types";
import type { AppError } from "@shared/result";
import { type JSX, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  giftable,
  leaveGift,
  leaveSignpost,
  legendName,
  type NoteStanding,
  noteStanding,
  onVariantsRequest,
  signpostTargets,
  takeGift,
  takeVariantsRequest,
  tellingsOf,
  traceBlocker,
  variantCount,
} from "./traces";
import { VariantsPanel } from "./VariantsPanel";
import { shortKey } from "./worldDoor";

const column = { display: "flex", flexDirection: "column", gap: space.xs } as const;
const row = { display: "flex", flexWrap: "wrap", gap: space.xs, alignItems: "center" } as const;
const NO_NAMES: Readonly<Record<string, string>> = {};

/** A message under the control that ran it: done (success), or the error. */
type Said = { kind: "done"; text: string } | { kind: "error"; error: AppError } | null;

function SaidLine({ said }: { said: Said }): JSX.Element | null {
  if (said === null) return null;
  if (said.kind === "error") return <ErrorBlock error={said.error} />;
  return (
    <Text variant="caption" tone="success">
      {said.text}
    </Text>
  );
}

function useNames(): { names: Readonly<Record<string, string>>; me: string | null } {
  const names = useHistoryStore((state) =>
    state.world.status === "ready" ? state.world.value.now.names : NO_NAMES,
  );
  const me = useHistoryStore((state) =>
    state.world.status === "ready" ? state.world.value.status.me : null,
  );
  return { names, me };
}

function SignpostRow({ sign }: { sign: Folded<SignpostBody> }): JSX.Element {
  const t = useT();
  const { names } = useNames();
  const target = useLandStore((state) => {
    const toward = sign.body.toward;
    if (toward === null) return null;
    const there = state.chunks[chunkKey(toward)];
    return there?.status === "written" ? there.scene.name : null;
  });
  const toward = sign.body.toward;
  const place =
    toward === null
      ? null
      : toward.cx === 0 && toward.cz === 0
        ? t("traces.home")
        : `${target ?? t("land.unwrittenLand")} (${toward.cx} · ${toward.cz})`;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <Text variant="body">{`“${sign.body.text}”`}</Text>
      <Text variant="caption" tone="muted">
        {`${names[sign.author] ?? shortKey(sign.author)} · ${formatDateTime(sign.at)}`}
      </Text>
      {place === null ? null : (
        <Text variant="caption" tone="dim">
          {t("traces.toward", { place })}
        </Text>
      )}
      {sign.pending ? (
        <Text variant="caption" tone="dim">
          {t("landHistory.provisional")}
        </Text>
      ) : null}
    </div>
  );
}

function GiftRow({ gift }: { gift: GiftNow }): JSX.Element {
  const t = useT();
  const { names, me } = useNames();
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState<Said>(null);
  const who = (key: string): string => names[key] ?? shortKey(key);
  const { item } = gift.body;
  const forLine =
    gift.body.for === null
      ? null
      : gift.body.for === me
        ? t("traces.giftForYou")
        : t("traces.giftForOther", { name: who(gift.body.for) });
  const mayTake = gift.taken === null && (gift.body.for === null || gift.body.for === me);
  return (
    <Surface
      variant="inset"
      padding="sm"
      style={{ display: "flex", flexDirection: "column", gap: 2 }}
    >
      <Text variant="body">{`${item.name} · ${item.kind}`}</Text>
      {gift.body.words.trim().length === 0 ? null : (
        <Text variant="body" tone="muted">{`“${gift.body.words}”`}</Text>
      )}
      <Text variant="caption" tone="muted">
        {`${t("traces.giftFrom", { name: who(gift.author) })} · ${formatDateTime(gift.at)}`}
      </Text>
      {forLine === null ? null : (
        <Text variant="caption" tone="dim">
          {forLine}
        </Text>
      )}
      {gift.pending ? (
        <Text variant="caption" tone="dim">
          {t("landHistory.provisional")}
        </Text>
      ) : null}
      {gift.taken === null ? null : (
        <Text variant="caption" tone={gift.taken.by === me ? "success" : "dim"}>
          {gift.taken.pending
            ? t("traces.takeWaiting")
            : t("traces.takenBy", { name: who(gift.taken.by) })}
        </Text>
      )}
      {mayTake ? (
        <div style={row}>
          <Button
            variant="secondary"
            disabled={busy}
            onClick={() => {
              setBusy(true);
              setSaid(null);
              void takeGift(gift.id).then((taken) => {
                setBusy(false);
                if (!taken.ok) {
                  setSaid({ kind: "error", error: taken.error });
                  return;
                }
                const text =
                  taken.value.kind === "mine"
                    ? t("traces.tookIt", { item: item.name })
                    : taken.value.kind === "lost"
                      ? t("traces.tookFirst")
                      : t("traces.takeWaiting");
                setSaid({ kind: "done", text });
              });
            }}
          >
            {busy ? t("traces.taking") : t("traces.take")}
          </Button>
        </div>
      ) : null}
      <SaidLine said={said} />
    </Surface>
  );
}

function SignpostForm({ chunk, onDone }: { chunk: ChunkCoord; onDone(text: string): void }) {
  const t = useT();
  const named = useLandStore((state) => state.chunks);
  const targets = useMemo(() => {
    const names: Record<string, string> = {};
    for (const [key, status] of Object.entries(named)) {
      if (status.status === "written") names[key] = status.scene.name;
    }
    return signpostTargets(chunk, names);
  }, [named, chunk]);
  const [text, setText] = useState("");
  const [toward, setToward] = useState<ChunkCoord | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<AppError | null>(null);
  return (
    <div style={column}>
      <TextField
        label={t("traces.signpostText", { n: HISTORY_LIMITS.signpostChars })}
        value={text}
        maxLength={HISTORY_LIMITS.signpostChars}
        onChange={(event) => setText(event.target.value)}
      />
      <Text variant="label" tone="muted">
        {t("traces.pointsToward")}
      </Text>
      <div style={row}>
        <Button variant="chip" active={toward === null} onClick={() => setToward(null)}>
          {t("traces.nowhere")}
        </Button>
        {targets.map((target) => (
          <Button
            key={chunkKey(target.coord)}
            variant="chip"
            active={toward !== null && sameChunk(toward, target.coord)}
            onClick={() => setToward(target.coord)}
          >
            {target.name === null
              ? t("traces.home")
              : `${target.name} (${target.coord.cx} · ${target.coord.cz})`}
          </Button>
        ))}
      </div>
      {error === null ? null : <ErrorBlock error={error} />}
      <div style={row}>
        <Button
          variant="primary"
          disabled={busy || text.trim().length === 0}
          onClick={() => {
            setBusy(true);
            void leaveSignpost(text, toward).then((done) => {
              setBusy(false);
              if (!done.ok) {
                setError(done.error);
                return;
              }
              setError(null);
              onDone(t("traces.signpostDone"));
            });
          }}
        >
          {t("traces.putUp")}
        </Button>
      </div>
    </div>
  );
}

function GiftForm({ onDone }: { onDone(text: string): void }) {
  const t = useT();
  const items = useWorldStore((state) => state.inventory.items);
  const { names, me } = useNames();
  const people = useHistoryStore((state) =>
    state.world.status === "ready" ? state.world.value.now : null,
  );
  const choices = useMemo(() => items.filter(giftable), [items]);
  const recipients = useMemo(() => {
    if (people === null) return [];
    const keys = [
      ...Object.keys(people.owners).filter((key) => people.owners[key]?.removed === null),
      ...Object.keys(people.members).filter((key) => people.removed[key] === undefined),
    ];
    return [...new Set(keys)].filter((key) => key !== me).slice(0, 8);
  }, [people, me]);
  const [picked, setPicked] = useState<number | null>(null);
  const [words, setWords] = useState("");
  const [forKey, setForKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<AppError | null>(null);
  const item = picked === null ? undefined : choices[picked];
  if (choices.length === 0) {
    return (
      <Text variant="caption" tone="dim">
        {t("traces.giftNone")}
      </Text>
    );
  }
  return (
    <div style={column}>
      <Text variant="label" tone="muted">
        {t("traces.giftPick")}
      </Text>
      <div style={row}>
        {choices.map((choice, index) => (
          <Button
            // biome-ignore lint/suspicious/noArrayIndexKey: the same item can be carried twice
            key={`${choice.id}-${index}`}
            variant="chip"
            active={picked === index}
            onClick={() => setPicked(index)}
          >
            {choice.name}
          </Button>
        ))}
      </div>
      <TextField
        label={t("traces.giftWords", { n: HISTORY_LIMITS.giftWords })}
        value={words}
        maxLength={HISTORY_LIMITS.giftWords}
        onChange={(event) => setWords(event.target.value)}
      />
      {recipients.length === 0 ? null : (
        <>
          <Text variant="label" tone="muted">
            {t("traces.giftFor")}
          </Text>
          <div style={row}>
            <Button variant="chip" active={forKey === null} onClick={() => setForKey(null)}>
              {t("traces.anyone")}
            </Button>
            {recipients.map((key) => (
              <Button
                key={key}
                variant="chip"
                active={forKey === key}
                onClick={() => setForKey(key)}
              >
                {names[key] ?? shortKey(key)}
              </Button>
            ))}
          </div>
        </>
      )}
      {error === null ? null : <ErrorBlock error={error} />}
      <div style={row}>
        <Button
          variant="primary"
          disabled={busy || item === undefined}
          onClick={() => {
            if (item === undefined) return;
            setBusy(true);
            void leaveGift(item, words, forKey).then((done) => {
              setBusy(false);
              if (!done.ok) {
                setError(done.error);
                return;
              }
              setError(null);
              setPicked(null);
              setWords("");
              onDone(t("traces.giftLeft", { item: item.name }));
            });
          }}
        >
          {t("traces.leaveIt")}
        </Button>
      </div>
    </div>
  );
}

/** How a note stands in the history, under its author line in the notes panel; or nothing. */
export function NoteMarkLine({ id }: { id: string }): JSX.Element | null {
  const t = useT();
  const onWorld = useLandStore((state) => state.mode === "history");
  const mark = useLandStore((state) => state.noteMarks[id]);
  const standing: NoteStanding | null = noteStanding(mark, onWorld);
  if (standing === null) return null;
  const text = {
    pending: t("landHistory.provisional"),
    variant: t("traces.noteVariant"),
    kept: t("traces.noteKept"),
    local: t("traces.noteLocal"),
  }[standing];
  return (
    <Text variant="caption" tone={standing === "variant" ? "accent" : "dim"}>
      {text}
    </Text>
  );
}

/** The chunk's traces and the ways to leave one; nothing without a world or off its own land. */
export function TracePanel({ chunk }: { chunk: ChunkCoord }): JSX.Element | null {
  const t = useT();
  const onWorld = useHistoryStore((state) => state.world.status === "ready");
  // Re-read whenever the world changes, so the blocker below and the lists stay current.
  useHistoryStore((state) => state.world);
  const peer = useSessionStore((state) => state.networkRole === "peer");
  const signposts = useLandStore((state) => state.signposts);
  const gifts = useLandStore((state) => state.gifts);
  const notes = useLandStore((state) => state.notes);
  const marks = useLandStore((state) => state.marks[chunkKey(chunk)]);
  const [variantsOpen, setVariantsOpen] = useState(takeVariantsRequest);
  const [form, setForm] = useState<"signpost" | "gift" | null>(null);
  const [said, setSaid] = useState<Said>(null);
  useEffect(() => onVariantsRequest(() => setVariantsOpen(true)), []);

  if (!onWorld || peer || foreignAt(chunk) !== null) return null;
  const signsHere = signposts.filter((sign) => sameChunk(sign.body.coord, chunk));
  const giftsHere = gifts.filter((gift) => sameChunk(gift.body.coord, chunk));
  const variants = variantCount(marks);
  const tellings = tellingsOf(marks, notes);
  const legend = legendName(marks);
  const blocker = traceBlocker("signpost");
  const done = (text: string) => {
    setForm(null);
    setSaid({ kind: "done", text });
  };

  return (
    <div style={{ ...column, gap: space.sm }}>
      {signsHere.length + giftsHere.length === 0 ? null : (
        <Text variant="label" tone="muted">
          {t("traces.heading")}
        </Text>
      )}
      {signsHere.length === 0 ? null : (
        <div style={column}>
          <Text variant="caption" tone="muted">
            {t("traces.signposts")}
          </Text>
          {signsHere.map((sign) => (
            <SignpostRow key={sign.id} sign={sign} />
          ))}
        </div>
      )}
      {giftsHere.length === 0 ? null : (
        <div style={column}>
          <Text variant="caption" tone="muted">
            {t("traces.gifts")}
          </Text>
          {giftsHere.map((gift) => (
            <GiftRow key={gift.id} gift={gift} />
          ))}
        </div>
      )}
      <div style={row}>
        <Button
          variant={form === "signpost" ? "secondary" : "ghost"}
          disabled={blocker !== null}
          onClick={() => setForm(form === "signpost" ? null : "signpost")}
        >
          {t("traces.leaveSignpost")}
        </Button>
        <Button
          variant={form === "gift" ? "secondary" : "ghost"}
          disabled={blocker !== null}
          onClick={() => setForm(form === "gift" ? null : "gift")}
        >
          {t("traces.leaveGift")}
        </Button>
        {tellings === null ? null : (
          <Button variant="chip" onClick={() => setVariantsOpen(true)}>
            {variants > 0
              ? t("traces.variants", { n: variants })
              : legend === null
                ? t("traces.legends")
                : t("traces.legend", { name: legend })}
          </Button>
        )}
      </div>
      {blocker === null ? null : (
        <Text variant="caption" tone="dim">
          {errorLine(blocker)}
        </Text>
      )}
      {form === "signpost" ? <SignpostForm chunk={chunk} onDone={done} /> : null}
      {form === "gift" ? <GiftForm onDone={done} /> : null}
      <SaidLine said={said} />
      {/* Over the whole screen, not inside the notes card (its blur would clip a layer in it). */}
      {variantsOpen
        ? createPortal(
            <VariantsPanel chunk={chunk} onClose={() => setVariantsOpen(false)} />,
            document.body,
          )
        : null}
    </div>
  );
}
