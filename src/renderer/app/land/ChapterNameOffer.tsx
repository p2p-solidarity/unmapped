// A chapter cleared during play is a checkpoint worth keeping: when the lineage market has a gas
// station, this small card offers to record the run on ENS (`<label>.<cartridge name>`, when the
// world is named and the run is not yet) or to move the player's own save name to this checkpoint.
// The passkey signs and the gas station pays (usePasskeySigner); main reads the save's fingerprint
// from disk, so the save is checkpointed first. It never shows when nothing could sign, when the
// world has no name, or when the save name is someone else's; "Not now" / Escape just close it.

import { errorLine, type Translate, useT } from "@renderer/i18n";
import { useEngineStore, useLandStore, useSessionStore } from "@renderer/state";
import { Button, Surface, space, Text, zIndex } from "@renderer/ui";
import type { LandProgress } from "@shared/land";
import type { SaveNameView } from "@shared/market";
import { type JSX, useEffect, useRef, useState } from "react";
import { readSaveEns, refreshSaveEns } from "../hud/saveEns";
import { type PasskeySigner, usePasskeySigner } from "../market/usePasskeySigner";
import { checkpointCurrentInstance } from "../usePersistWorld";

interface Offer {
  kind: "record" | "update";
  instanceId: string;
  /** The save's full name, `<label>.<cartridge name>`. */
  name: string;
  label: string;
  /** The save as it is now. */
  progress: string;
  /** What the name records now (an update only). */
  recorded: string | null;
}

function clearedCount(progress: LandProgress | null): number {
  let count = 0;
  for (const episode of Object.values(progress?.episodes ?? {})) if (episode.cleared) count += 1;
  return count;
}

/** What the player could sign for this view; null when there is nothing of theirs to write. */
function offerFor(instanceId: string, view: SaveNameView): Offer | null {
  const save = view.save;
  // No save name hangs under an unnamed world (or a name that belongs to another cartridge).
  if (save === null) return null;
  const base = { instanceId, name: save.name, label: view.local.label };
  if (save.state === "outdated" && save.mine) {
    return { ...base, kind: "update", progress: view.local.progress, recorded: save.progress };
  }
  if (save.state === "free") {
    return { ...base, kind: "record", progress: view.local.progress, recorded: null };
  }
  return null;
}

const activeInstanceId = (): string | null =>
  useSessionStore.getState().activeInstance?.instance.meta.instanceId ?? null;

/**
 * Calls `onCleared` when the number of cleared chapters grows during play. A save loading its
 * progress (another save, the history's world arriving, the player's own progress read) is not
 * play, so only a change that keeps the same save, mode and world counts.
 */
function useChapterClears(onCleared: (instanceId: string) => void): void {
  const handler = useRef(onCleared);
  handler.current = onCleared;
  useEffect(
    () =>
      useLandStore.subscribe((state, previous) => {
        if (state.progress === previous.progress || previous.progress === null) return;
        if (state.instanceId === null || state.instanceId !== previous.instanceId) return;
        if (state.mode !== previous.mode || state.world !== previous.world) return;
        if ((state.personal === null) !== (previous.personal === null)) return;
        if (state.load.status !== "ready" || previous.load.status !== "ready") return;
        if (clearedCount(state.progress) > clearedCount(previous.progress)) {
          handler.current(state.instanceId);
        }
      }),
    [],
  );
}

function buttonLabel(t: Translate, signer: PasskeySigner, offer: Offer): string {
  switch (signer.busy) {
    case "browser":
      return t("market.waitingBrowser");
    case "signing":
    case "passkey":
      return t("market.signing");
    case "sending":
      return t("market.sending");
    default:
      return t(offer.kind === "record" ? "hud.ensOfferRecordButton" : "hud.ensOfferUpdateButton");
  }
}

export function ChapterNameOffer(): JSX.Element | null {
  const t = useT();
  const toast = useSessionStore((state) => state.toast);
  // Hidden while anything owns the keys (the dialogue that cleared it, a panel, an otherworld).
  const locked = useEngineStore((state) => state.inputLocked);
  const signer = usePasskeySigner();
  const [offer, setOffer] = useState<Offer | null>(null);
  const [working, setWorking] = useState(false);
  const config = useRef(signer.config);
  config.current = signer.config;

  useChapterClears((instanceId) => {
    void (async () => {
      const market = config.current;
      if (market === null || market.parent === null) return;
      if (useSessionStore.getState().networkRole === "peer") return;
      if (activeInstanceId() !== instanceId) return;
      // The name records the save's fingerprint as main reads it from disk: the clear first.
      const saved = await checkpointCurrentInstance();
      if (!saved.ok) {
        toast("danger", errorLine(saved.error));
        return;
      }
      const view = await readSaveEns(instanceId);
      // The HUD chip shows what was read (an error there too), whether or not anything can sign.
      refreshSaveEns({ instanceId, view });
      if (!view.ok || !market.relayer || activeInstanceId() !== instanceId) return;
      setOffer(offerFor(instanceId, view.value));
    })();
  });

  const shown = offer !== null && !locked;
  useEffect(() => {
    if (!shown) return;
    // This layer owns Escape (and the pad's B) while it is up, so it never leaves Play.
    const onKey = (event: KeyboardEvent): void => {
      if (event.key !== "Escape" && event.code !== "Escape") return;
      event.preventDefault();
      event.stopImmediatePropagation();
      setOffer(null);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [shown]);

  if (!shown || offer === null) return null;

  const sign = async (): Promise<void> => {
    setWorking(true);
    // Whatever happened since the clear is part of the checkpoint the name will record.
    const saved = await checkpointCurrentInstance();
    if (!saved.ok) {
      setWorking(false);
      toast("danger", errorLine(saved.error));
      return;
    }
    const summary =
      offer.kind === "record"
        ? t("market.summaryRecordSave", { name: offer.name })
        : t("market.summaryUpdateSave", { name: offer.name });
    const done = await signer.signed(
      { kind: "name-save", instanceId: offer.instanceId, label: offer.label },
      summary,
    );
    setWorking(false);
    if (!done) return;
    toast("success", t("market.nameDone", { name: offer.name }));
    setOffer((now) => (now === offer ? null : now));
    refreshSaveEns();
  };

  const busy = working || signer.busy !== null;
  return (
    <div
      data-layer="ens-offer"
      role="dialog"
      aria-label={t("hud.ensOfferLabel")}
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        paddingTop: "14vh",
        zIndex: zIndex.overlay,
        pointerEvents: "none",
      }}
    >
      <Surface
        variant="card"
        padding="lg"
        style={{
          width: "min(460px, 92%)",
          pointerEvents: "auto",
          display: "flex",
          flexDirection: "column",
          gap: space.sm,
        }}
      >
        <Text variant="label" tone="accent">
          {t("hud.ensOfferLabel")}
        </Text>
        <Text variant="body" style={{ overflowWrap: "anywhere" }}>
          {offer.kind === "record"
            ? t("hud.ensOfferRecord", { name: offer.name })
            : t("hud.ensOfferUpdate", { name: offer.name })}
        </Text>
        <Text variant="caption" tone="muted">
          {t("hud.ensOfferProgress", { progress: offer.progress })}
        </Text>
        {offer.recorded === null ? null : (
          <Text variant="caption" tone="dim">
            {t("hud.ensOfferRecorded", { progress: offer.recorded })}
          </Text>
        )}
        <Text variant="caption" tone="dim">
          {t("hud.ensOfferNote")}
        </Text>
        <div style={{ display: "flex", gap: space.sm, flexWrap: "wrap" }}>
          <Button
            variant="primary"
            className="g-autofocus"
            disabled={busy}
            onClick={() => void sign()}
          >
            {buttonLabel(t, signer, offer)}
          </Button>
          <Button variant="ghost" hotkey="Esc" onClick={() => setOffer(null)}>
            {t("hud.ensOfferNotNow")}
          </Button>
        </div>
      </Surface>
    </div>
  );
}
