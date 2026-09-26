// Settings → Images (rev 6 phase 4, D4): which model draws this computer's pictures. Every provider
// shows the licence its pictures carry (commercial use yes or no, where the claim was read and on
// which day), where it runs, where its key comes from, and a test that asks its server without
// drawing anything. The choice is stored by main; the renderer only ever names a provider id, and
// in commercial mode main refuses a provider whose licence is not commercial.

import { formatNumber, useT } from "@renderer/i18n";
import { Button, ErrorBlock, StatePanel, Surface, space, Text } from "@renderer/ui";
import type { ImageProbe, ImageProviderId, ImageProviderInfo, ImageSettings } from "@shared/images";
import { type AppError, fromResult, idle, type Loadable, loading, ready } from "@shared/result";
import { type JSX, useCallback, useEffect, useRef, useState } from "react";

/** Product names: proper nouns, the same in every language. */
const NAMES: Record<ImageProviderId, string> = {
  openai: "OpenAI",
  "qwen-image-2512": "Qwen-Image 2512",
  "qwen-image-2.1": "Qwen-Image 2.1",
};

const LOCALITY = {
  local: "images.localityLocal",
  direct: "images.localityDirect",
  hosted: "images.localityHosted",
} as const;

const KEY = {
  saved: "images.keySaved",
  env: "images.keyEnv",
  unreadable: "images.keyUnreadable",
  none: "images.keyNone",
  "not-needed": "images.keyNotNeeded",
} as const;

function ProbeLine({
  model,
  state,
}: {
  model: string;
  state: Loadable<ImageProbe> | undefined;
}): JSX.Element {
  const t = useT();
  if (state === undefined || state.status === "idle") {
    return (
      <Text variant="caption" tone="dim">
        {t("images.untested")}
      </Text>
    );
  }
  if (state.status === "loading") {
    return (
      <Text variant="caption" tone="muted">
        {t("images.testing")}
      </Text>
    );
  }
  if (state.status === "error") return <ErrorBlock error={state.error} />;
  const probe = state.value;
  const parts = [
    t("images.answered", { ms: formatNumber(probe.latencyMs) }),
    probe.served
      ? t("images.served", { model })
      : t("images.notServed", { model, models: probe.models.join(", ") || "—" }),
    ...(probe.edits === null ? [] : [probe.edits ? t("images.editsYes") : t("images.editsNo")]),
  ];
  return (
    <Text variant="caption" tone={probe.served ? "success" : "danger"}>
      {parts.join(" · ")}
    </Text>
  );
}

function ProviderRow({
  provider,
  chosen,
  busy,
  probe,
  onChoose,
  onTest,
  onOpenSource,
}: {
  provider: ImageProviderInfo;
  chosen: boolean;
  busy: boolean;
  probe: Loadable<ImageProbe> | undefined;
  onChoose(): void;
  onTest(): void;
  onOpenSource(): void;
}): JSX.Element {
  const t = useT();
  const { licence } = provider;
  const selfHosted = provider.id !== "openai";
  return (
    <Surface variant="outlined" padding="sm">
      <div style={{ display: "flex", flexDirection: "column", gap: space.xs }}>
        <Text variant="body">
          {selfHosted ? `${NAMES[provider.id]} · ${t("images.selfHosted")}` : NAMES[provider.id]}
        </Text>
        <Text variant="caption" mono>
          {provider.model}
        </Text>
        <Text variant="caption" tone="dim">
          {`${t(LOCALITY[provider.locality])} · ${t("images.server", { url: provider.endpoint })}`}
        </Text>
        <Text variant="caption" tone={licence.commercial ? "success" : "danger"}>
          {`${t("images.licence", { name: licence.name })} · ${t(
            licence.commercial ? "images.commercialYes" : "images.commercialNo",
          )}`}
        </Text>
        <Text variant="caption" tone="dim" mono>
          {t("images.source", { source: licence.source, date: licence.checkedAt })}
        </Text>
        <Text variant="caption" tone={provider.key === "unreadable" ? "danger" : "dim"}>
          {t(KEY[provider.key])}
        </Text>
        {provider.selectable ? null : (
          <Text variant="caption" tone="danger">
            {t("images.notInCommercial")}
          </Text>
        )}
        <div style={{ display: "flex", gap: space.xs, flexWrap: "wrap" }}>
          <Button
            variant="chip"
            active={chosen}
            disabled={busy || chosen || !provider.selectable}
            onClick={onChoose}
          >
            {chosen ? t("images.inUse") : t("images.use")}
          </Button>
          <Button variant="ghost" disabled={probe?.status === "loading"} onClick={onTest}>
            {t("images.test")}
          </Button>
          {/^https:\/\//.test(licence.source) ? (
            <Button variant="ghost" onClick={onOpenSource}>
              {t("images.openSource")}
            </Button>
          ) : null}
        </div>
        <ProbeLine model={provider.model} state={probe} />
      </div>
    </Surface>
  );
}

export function ImagePanel(): JSX.Element {
  const t = useT();
  const [settings, setSettings] = useState<Loadable<ImageSettings>>(idle());
  const [probes, setProbes] = useState<Partial<Record<ImageProviderId, Loadable<ImageProbe>>>>({});
  const [error, setError] = useState<AppError | null>(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const read = useCallback(async () => {
    setSettings(loading());
    const result = await window.seed.images.settings();
    if (alive.current) setSettings(fromResult(result));
  }, []);
  useEffect(() => {
    void read();
  }, [read]);

  const choose = async (id: ImageProviderId): Promise<void> => {
    setBusy(true);
    setError(null);
    setSaved(false);
    const result = await window.seed.images.choose(id);
    if (!alive.current) return;
    setBusy(false);
    if (!result.ok) return setError(result.error);
    setSettings(ready(result.value));
    setSaved(true);
  };
  const test = async (id: ImageProviderId): Promise<void> => {
    setProbes((current) => ({ ...current, [id]: loading() }));
    const result = await window.seed.images.probe(id);
    if (alive.current) setProbes((current) => ({ ...current, [id]: fromResult(result) }));
  };
  const openSource = async (url: string): Promise<void> => {
    const result = await window.seed.app.openExternal(url);
    if (!result.ok && alive.current) setError(result.error);
  };

  return (
    <section
      data-testid="image-panel"
      style={{ display: "flex", flexDirection: "column", gap: space.sm }}
    >
      <Text variant="label">{t("images.heading")}</Text>
      <Text variant="caption" tone="dim">
        {t("images.intro")}
      </Text>
      <StatePanel state={settings} loadingText={t("images.reading")}>
        {(value) => {
          const current = value.providers.find((provider) => provider.id === value.choice);
          return (
            <>
              <Text variant="caption" tone={value.commercial.on ? "accent" : "muted"}>
                {value.commercial.on
                  ? value.commercial.source === "gateway"
                    ? t("images.commercialGateway")
                    : t("images.commercialBuild")
                  : t("images.commercialOff")}
              </Text>
              {value.problem === null ? null : <ErrorBlock error={value.problem} />}
              {current !== undefined && !current.selectable ? (
                <Text variant="caption" tone="danger">
                  {t("images.chosenRefused")}
                </Text>
              ) : null}
              {value.providers.map((provider) => (
                <ProviderRow
                  key={provider.id}
                  provider={provider}
                  chosen={provider.id === value.choice}
                  busy={busy}
                  probe={probes[provider.id]}
                  onChoose={() => void choose(provider.id)}
                  onTest={() => void test(provider.id)}
                  onOpenSource={() => void openSource(provider.licence.source)}
                />
              ))}
            </>
          );
        }}
      </StatePanel>
      {error === null ? null : <ErrorBlock error={error} />}
      {saved ? (
        <Text variant="caption" tone="success">
          {t("images.saved")}
        </Text>
      ) : null}
    </section>
  );
}
