// The player card's name line on open land (display only): this run's own ENS name when it has one
// on chain, else the world's cartridge name, else the world's own name — ENS comes first, the
// world's name follows it. Read once per save while Play is up (only when a lineage parent is
// configured — with no market there is no ENS read at all; it stays mounted in a place, so walking in
// and out asks nothing) and again when the chapter offer says so (saveEns.ts). Never a made-up name:
// while the read runs the world's name stands alone, and a failed read says so in a small mark.

import { errorLine, type Translate, useT } from "@renderer/i18n";
import { useSessionStore } from "@renderer/state";
import { font, Text } from "@renderer/ui";
import type { SaveNameView } from "@shared/market";
import { errored, type Loadable, loading, ready } from "@shared/result";
import { type JSX, useEffect, useRef, useState } from "react";
import { chipName, onSaveEnsRefresh, readSaveEns } from "./saveEns";

interface Held {
  instanceId: string;
  view: Loadable<SaveNameView>;
}

interface Named {
  /** The ENS name to lead with, or null (no name, still reading, or the read failed). */
  name: string | null;
  /** A short mark after the name line (an older checkpoint, a failed read), or null. */
  mark: string | null;
  title: string | null;
}

function namedOf(t: Translate, view: Loadable<SaveNameView>): Named {
  if (view.status === "idle" || view.status === "loading") {
    return { name: null, mark: null, title: t("hud.ensLoadingTitle") };
  }
  if (view.status === "error") {
    return { name: null, mark: t("hud.ensError"), title: errorLine(view.error) };
  }
  const chip = chipName(view.value);
  switch (chip.kind) {
    case "save":
      return chip.state === "current"
        ? {
            name: chip.name,
            mark: null,
            title: t("hud.ensSaveTitle", { name: chip.name, progress: chip.progress ?? "—" }),
          }
        : {
            name: chip.name,
            mark: t("hud.ensOlder"),
            title: t("hud.ensOlderTitle", { name: chip.name, progress: chip.progress ?? "—" }),
          };
    case "world":
      return { name: chip.name, mark: null, title: t("hud.ensWorldTitle", { name: chip.name }) };
    case "none":
      return { name: null, mark: null, title: t("hud.ensNoneTitle") };
  }
}

const oneLine = {
  display: "block",
  minWidth: 0,
  overflow: "hidden",
  whiteSpace: "nowrap",
  textOverflow: "ellipsis",
} as const;

/**
 * The card's heading. `shown`: the world plays on open land, where the run can have an ENS name;
 * hidden (a bounded scene), it is the world's name alone and nothing is asked of Sepolia.
 */
export function EnsTitle({ shown, worldName }: { shown: boolean; worldName: string }): JSX.Element {
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

  const heading = (
    <Text variant="bodyLarge" tone="accent" style={{ fontWeight: font.weight.bold }}>
      {worldName}
    </Text>
  );
  if (!shown || configured !== true || instanceId === undefined || peer) return heading;
  const view = held?.instanceId === instanceId ? held.view : loading<SaveNameView>();
  const named = namedOf(t, view);
  return (
    <div
      title={named.title ?? undefined}
      style={{ display: "flex", flexDirection: "column", gap: 1, minWidth: 0 }}
    >
      {named.name === null ? (
        heading
      ) : (
        <>
          <Text
            variant="bodyLarge"
            tone="accent"
            mono
            style={{ ...oneLine, fontWeight: font.weight.bold }}
          >
            {named.name}
          </Text>
          <Text variant="caption" tone="muted" style={oneLine}>
            {worldName}
          </Text>
        </>
      )}
      {named.mark === null ? null : (
        <Text variant="caption" tone="dim">
          {named.mark}
        </Text>
      )}
    </div>
  );
}
