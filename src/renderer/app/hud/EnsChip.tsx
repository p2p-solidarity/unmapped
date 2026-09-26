// The player card's ENS pill on open land (display only): this run's own name when it has one on
// chain, else the world's cartridge name, else "not on ENS yet". Read once per save while Play is up
// (only when a lineage parent is configured — with no market there is no pill at all; it stays
// mounted in a place, so walking in and out asks nothing) and again when the chapter offer says so
// (saveEns.ts). Never a made-up name: loading and errors say so.

import { errorLine, type Translate, useT } from "@renderer/i18n";
import { useSessionStore } from "@renderer/state";
import { colors, radius, Text, type TextTone } from "@renderer/ui";
import type { SaveNameView } from "@shared/market";
import { errored, type Loadable, loading, ready } from "@shared/result";
import { type JSX, useEffect, useRef, useState } from "react";
import { chipName, onSaveEnsRefresh, readSaveEns } from "./saveEns";

interface Held {
  instanceId: string;
  view: Loadable<SaveNameView>;
}

interface Pill {
  name: string | null;
  mark: string | null;
  tone: TextTone;
  title: string;
}

function pillOf(t: Translate, view: Loadable<SaveNameView>): Pill {
  if (view.status === "idle" || view.status === "loading") {
    return { name: null, mark: t("hud.ensLoading"), tone: "dim", title: t("hud.ensLoadingTitle") };
  }
  if (view.status === "error") {
    return { name: null, mark: t("hud.ensError"), tone: "dim", title: errorLine(view.error) };
  }
  const chip = chipName(view.value);
  switch (chip.kind) {
    case "save":
      return chip.state === "current"
        ? {
            name: chip.name,
            mark: "✓",
            tone: "accent",
            title: t("hud.ensSaveTitle", { name: chip.name, progress: chip.progress ?? "—" }),
          }
        : {
            name: chip.name,
            mark: t("hud.ensOlder"),
            tone: "muted",
            title: t("hud.ensOlderTitle", { name: chip.name, progress: chip.progress ?? "—" }),
          };
    case "world":
      return {
        name: chip.name,
        mark: null,
        tone: "muted",
        title: t("hud.ensWorldTitle", { name: chip.name }),
      };
    case "none":
      return { name: null, mark: t("hud.ensNone"), tone: "dim", title: t("hud.ensNoneTitle") };
  }
}

/** `shown`: the player card's badge slot is the chip's (open land); hidden, it keeps what it read. */
export function EnsChip({ shown }: { shown: boolean }): JSX.Element | null {
  const t = useT();
  const instanceId = useSessionStore((state) => state.activeInstance?.instance.meta.instanceId);
  // A visitor in someone else's room plays their save, not one of this device's.
  const peer = useSessionStore((state) => state.networkRole === "peer");
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [held, setHeld] = useState<Held | null>(null);
  const [asked, setAsked] = useState(0);
  // Nothing is asked of Sepolia until the pill is first on screen (never, in a bounded scene).
  const [wanted, setWanted] = useState(shown);
  // Only the latest read or news may land: an older answer must not overwrite a fresher one.
  const seq = useRef(0);

  useEffect(() => {
    if (shown) setWanted(true);
  }, [shown]);

  useEffect(() => {
    let live = true;
    void window.seed.market.config().then((config) => {
      if (live) setConfigured(config.parent !== null);
    });
    return () => {
      live = false;
    };
  }, []);

  useEffect(
    () =>
      onSaveEnsRefresh((news) => {
        if (news === null) {
          setAsked((n) => n + 1);
          return;
        }
        if (news.instanceId !== instanceId) return;
        seq.current += 1;
        const view = news.view.ok ? ready(news.view.value) : errored<SaveNameView>(news.view.error);
        setHeld({ instanceId: news.instanceId, view });
      }),
    [instanceId],
  );

  // biome-ignore lint/correctness/useExhaustiveDependencies: `asked` is the re-read trigger.
  useEffect(() => {
    if (!wanted || configured !== true || instanceId === undefined || peer) return;
    const mine = ++seq.current;
    setHeld((before) =>
      before?.instanceId === instanceId && before.view.status === "ready"
        ? before
        : { instanceId, view: loading() },
    );
    void readSaveEns(instanceId).then((result) => {
      if (seq.current !== mine) return;
      setHeld({ instanceId, view: result.ok ? ready(result.value) : errored(result.error) });
    });
  }, [wanted, configured, instanceId, peer, asked]);

  if (!shown || configured !== true || instanceId === undefined || peer) return null;
  const view = held?.instanceId === instanceId ? held.view : loading<SaveNameView>();
  const pill = pillOf(t, view);
  const lit = pill.tone === "accent";
  return (
    <div
      title={pill.title}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 4,
        minWidth: 0,
        maxWidth: 200,
        padding: "1px 6px",
        background: lit ? colors.accentSoft : "transparent",
        borderRadius: radius.pill,
        border: `1px solid ${lit ? colors.accent : colors.surfaceBorder}`,
      }}
    >
      {pill.name === null ? null : (
        <Text
          variant="caption"
          tone={pill.tone}
          mono
          style={{
            display: "block",
            minWidth: 0,
            overflow: "hidden",
            whiteSpace: "nowrap",
            textOverflow: "ellipsis",
          }}
        >
          {pill.name}
        </Text>
      )}
      {pill.mark === null ? null : (
        <Text
          variant="caption"
          tone={pill.tone}
          mono
          style={{ flexShrink: 0, whiteSpace: "nowrap" }}
        >
          {pill.mark}
        </Text>
      )}
    </div>
  );
}
