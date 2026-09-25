// Settings → Signaling servers: which servers this device uses to find friends (a per-device
// preference), a real connection test for each, and the way back to the default. A continent reads
// the list when it opens, so a change applies to the next door opened or walked through.

import { formatNumber, useT } from "@renderer/i18n";
import {
  DEFAULT_SIGNALING,
  ownSignaling,
  parseSignalingList,
  probeSignaling,
  type SignalingProbe,
  setOwnSignaling,
} from "@renderer/net/signaling";
import { Button, ErrorBlock, space, Text, TextField } from "@renderer/ui";
import { type AppError, fromResult, type Loadable, loading } from "@shared/result";
import { type JSX, useEffect, useRef, useState } from "react";

const sameList = (a: readonly string[], b: readonly string[]): boolean =>
  a.length === b.length && a.every((url, index) => url === b[index]);

function ProbeLine({ url, state }: { url: string; state: Loadable<SignalingProbe> | undefined }) {
  const t = useT();
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: space.xs }}>
      <Text variant="caption" mono>
        {url}
      </Text>
      {state === undefined || state.status === "idle" ? (
        <Text variant="caption" tone="dim">
          {t("title.signalingUntested")}
        </Text>
      ) : state.status === "loading" ? (
        <Text variant="caption" tone="muted">
          {t("title.signalingTesting")}
        </Text>
      ) : state.status === "ready" ? (
        <Text variant="caption" tone="success">
          {t("title.signalingReachable", {
            handshake: formatNumber(state.value.handshakeMs),
            relay: formatNumber(state.value.relayMs),
          })}
        </Text>
      ) : (
        <ErrorBlock error={state.error} />
      )}
    </div>
  );
}

export function SignalingPanel(): JSX.Element {
  const t = useT();
  const [own, setOwn] = useState<string[] | null>(ownSignaling);
  const [draft, setDraft] = useState(() => (own ?? DEFAULT_SIGNALING).join("\n"));
  const [probes, setProbes] = useState<Record<string, Loadable<SignalingProbe>>>({});
  const [error, setError] = useState<AppError | null>(null);
  const [saved, setSaved] = useState(false);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const { urls, invalid } = parseSignalingList(draft);
  const inUse = own ?? [...DEFAULT_SIGNALING];
  const testing = urls.some((url) => probes[url]?.status === "loading");
  const canSave = invalid.length === 0 && urls.length > 0 && !sameList(urls, inUse);
  const isDefault = own === null && sameList(urls, DEFAULT_SIGNALING) && invalid.length === 0;

  const edit = (text: string): void => {
    setDraft(text);
    setSaved(false);
    setError(null);
  };
  const test = (): void => {
    setProbes((current) => {
      const next = { ...current };
      for (const url of urls) next[url] = loading();
      return next;
    });
    // Every server is tested at once; each line fills in as its own answer (or error) arrives.
    for (const url of urls) {
      void probeSignaling(url).then((result) => {
        if (alive.current) setProbes((current) => ({ ...current, [url]: fromResult(result) }));
      });
    }
  };
  const store = (next: string[] | null): void => {
    const result = setOwnSignaling(next);
    if (!result.ok) {
      setError(result.error);
      setSaved(false);
      return;
    }
    const stored = ownSignaling();
    setOwn(stored);
    setDraft((stored ?? DEFAULT_SIGNALING).join("\n"));
    setError(null);
    setSaved(true);
  };

  return (
    <section style={{ display: "flex", flexDirection: "column", gap: space.sm }}>
      <Text variant="label">{t("title.signalingHeading")}</Text>
      <Text variant="caption" tone="dim">
        {t("title.signalingIntro")}
      </Text>
      <Text variant="caption" tone="muted">
        {own === null ? t("title.signalingUsingDefault") : t("title.signalingUsingOwn")}
      </Text>
      <TextField
        label={t("title.signalingField")}
        mono
        rows={3}
        spellCheck={false}
        autoComplete="off"
        value={draft}
        onChange={(event) => edit(event.target.value)}
      />
      {invalid.length > 0 ? (
        <Text variant="caption" tone="danger">
          {t("title.signalingInvalid", { entries: invalid.join(", ") })}
        </Text>
      ) : urls.length === 0 ? (
        <Text variant="caption" tone="danger">
          {t("title.signalingEmpty")}
        </Text>
      ) : null}
      <div style={{ display: "flex", gap: space.xs, flexWrap: "wrap" }}>
        <Button disabled={testing || urls.length === 0} onClick={test}>
          {t("title.signalingTest")}
        </Button>
        <Button variant="primary" disabled={!canSave} onClick={() => store(urls)}>
          {t("title.signalingSave")}
        </Button>
        <Button variant="ghost" disabled={isDefault} onClick={() => store(null)}>
          {t("title.signalingUseDefault")}
        </Button>
      </div>
      {urls.map((url) => (
        <ProbeLine key={url} url={url} state={probes[url]} />
      ))}
      {error === null ? null : <ErrorBlock error={error} />}
      {saved ? (
        <Text variant="caption" tone="success">
          {t("title.signalingSaved")}
        </Text>
      ) : null}
      <Text variant="caption" tone="dim">
        {t("title.signalingApplyNote")}
      </Text>
    </section>
  );
}
