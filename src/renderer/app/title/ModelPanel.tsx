// One model setting for Create, play and the console. The renderer only writes API keys; main
// encrypts them and returns status, never the secret. Detection and probe show real readings, and
// the route line says where the next call goes (own key, this computer, or the free allowance)
// before any call is made (rev 6 phase 4, D2).

import { errorLine, useT } from "@renderer/i18n";
import { useInferenceStore } from "@renderer/state";
import { Button, ErrorBlock, space, Text, TextField } from "@renderer/ui";
import {
  type InferenceConfig,
  type KeyStatusMap,
  type LocalDetection,
  PROVIDER_PRESETS,
  type ProviderKind,
  type TypedKeyProvider,
} from "@shared/llm";
import { type AppError, errored, idle, type Loadable, loading, ready } from "@shared/result";
import { type JSX, useCallback, useEffect, useState } from "react";
import { useRefreshProbe } from "../inferenceSync";
import { kindLabel, RouteLine } from "./RouteLine";
import { useRoute } from "./useGateway";

/** `hosted` is offered only when main reports a configured gateway. */
const CLOUD: ProviderKind[] = ["openai", "openui-gateway", "custom", "hosted"];
const LOCAL: ProviderKind[] = ["apple-fm", "ollama", "llamacpp"];

function mode(kind: ProviderKind): "cloud" | "local" {
  return CLOUD.includes(kind) ? "cloud" : "local";
}

function cloudKey(kind: ProviderKind): TypedKeyProvider | null {
  return kind === "openai" || kind === "openui-gateway" || kind === "custom" ? kind : null;
}

function option(kind: ProviderKind, detection: LocalDetection | null): InferenceConfig {
  if (kind === "llamacpp") {
    const binaryPath = detection?.llamacpp.binaryPath ?? "";
    return {
      ...PROVIDER_PRESETS[kind],
      // Without llama-server on this machine the app only talks to one the player runs on :8080:
      // a sidecar needs a trusted binary path, and an empty one was refused as untrusted-config.
      sidecar:
        binaryPath === "" ? null : { binaryPath, modelPath: "", port: 8080, ctxSize: 16_384 },
    };
  }
  if (kind === "ollama") {
    return {
      ...PROVIDER_PRESETS[kind],
      model: detection?.ollama.models[0] ?? PROVIDER_PRESETS.ollama.model,
      sidecar: null,
    };
  }
  return { ...PROVIDER_PRESETS[kind], sidecar: null };
}

function localAvailable(kind: ProviderKind, found: LocalDetection | null): boolean {
  if (found === null) return false;
  if (kind === "apple-fm") return found.apple.available;
  if (kind === "ollama") return found.ollama.reachable;
  if (kind === "llamacpp") return found.llamacpp.binaryPath !== null;
  return false;
}

export function ModelPanel(): JSX.Element {
  const t = useT();
  const current = useInferenceStore((state) => state.config);
  const setConfig = useInferenceStore((state) => state.setConfig);
  const probe = useInferenceStore((state) => state.probe);
  const sidecar = useInferenceStore((state) => state.sidecar);
  const setSidecar = useInferenceStore((state) => state.setSidecar);
  const refreshProbe = useRefreshProbe();
  const [draft, setDraft] = useState<InferenceConfig | null>(current);
  const [found, setFound] = useState<Loadable<LocalDetection>>(idle());
  const [keys, setKeys] = useState<Loadable<KeyStatusMap>>(idle());
  const [secret, setSecret] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<AppError | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // Re-read the route when the saved setting or a key changes (a string, so equal means equal).
  const { route } = useRoute(
    JSON.stringify([current?.kind, current?.model, keys.status === "ready" ? keys.value : null]),
  );
  const gateway = route.status === "ready" && route.value.gateway !== null;

  useEffect(() => setDraft(current), [current]);
  const detect = useCallback(async () => {
    setFound(loading());
    const result = await window.seed.inference.detectLocal();
    setFound(result.ok ? ready(result.value) : errored(result.error));
  }, []);
  const readKeys = useCallback(async () => {
    setKeys(loading());
    const result = await window.seed.inference.keyStatus();
    setKeys(result.ok ? ready(result.value) : errored(result.error));
  }, []);
  useEffect(() => {
    void detect();
    void readKeys();
  }, [detect, readKeys]);

  if (draft === null) return <Text tone="dim">{t("model.checking")}</Text>;
  const selected = draft;
  const detected = found.status === "ready" ? found.value : null;
  const provider = cloudKey(selected.kind);
  const keyState = provider !== null && keys.status === "ready" ? keys.value[provider] : null;
  const selectedMode = mode(selected.kind);
  const active =
    current?.kind === selected.kind &&
    current.baseUrl === selected.baseUrl &&
    current.model === selected.model &&
    JSON.stringify(current.sidecar) === JSON.stringify(selected.sidecar);

  const choose = (kind: ProviderKind) => {
    setDraft(option(kind, detected));
    setSecret("");
    setError(null);
    setNotice(null);
  };
  const save = async () => {
    setBusy(true);
    setError(null);
    const result = await window.seed.inference.setConfig(selected);
    setBusy(false);
    if (!result.ok) return setError(result.error);
    setConfig(result.value);
    setNotice(t("model.saved"));
    void refreshProbe();
  };
  const saveKey = async () => {
    if (provider === null) return;
    setBusy(true);
    setError(null);
    const result = await window.seed.inference.setApiKey({
      provider,
      key: secret,
      ...(provider === "custom" ? { baseUrl: selected.baseUrl } : {}),
    });
    setBusy(false);
    setSecret("");
    if (!result.ok) return setError(result.error);
    setKeys(ready(result.value));
    setNotice(t("model.keyUpdated"));
    void refreshProbe();
  };
  const clearKey = async () => {
    if (provider === null) return;
    setBusy(true);
    const result = await window.seed.inference.clearApiKey(provider);
    setBusy(false);
    if (!result.ok) return setError(result.error);
    setKeys(ready(result.value));
    setNotice(t("model.keyUpdated"));
    void refreshProbe();
  };
  const server = async (action: "start" | "stop") => {
    setBusy(true);
    setError(null);
    const result =
      action === "start"
        ? await window.seed.inference.sidecarStart()
        : await window.seed.inference.sidecarStop();
    setBusy(false);
    if (!result.ok) return setError(result.error);
    setSidecar(await window.seed.inference.sidecarStatus());
    void refreshProbe();
  };

  return (
    <section style={{ display: "flex", flexDirection: "column", gap: space.sm }}>
      <Text variant="label">{t("model.heading")}</Text>
      <div style={{ display: "flex", flexWrap: "wrap", gap: space.xs }}>
        <Button variant="chip" active={selectedMode === "cloud"} onClick={() => choose("openai")}>
          {t("model.cloud")}
        </Button>
        <Button variant="chip" active={selectedMode === "local"} onClick={() => choose("apple-fm")}>
          {t("model.local")}
        </Button>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: space.xs }}>
        {(selectedMode === "cloud" ? CLOUD : LOCAL)
          .filter((kind) => kind !== "hosted" || gateway || selected.kind === "hosted")
          .map((kind) => (
            <Button
              key={kind}
              variant="chip"
              active={selected.kind === kind}
              onClick={() => choose(kind)}
            >
              {kindLabel(kind, t)}
            </Button>
          ))}
      </div>
      {selected.kind === "hosted" ? (
        <Text variant="caption" tone="dim">
          {t("model.hostedNote")}
        </Text>
      ) : null}
      {selectedMode === "local" ? (
        <Text
          variant="caption"
          tone={localAvailable(selected.kind, detected) ? "success" : "muted"}
        >
          {found.status === "loading"
            ? t("model.checking")
            : found.status === "error"
              ? errorLine(found.error)
              : localAvailable(selected.kind, detected)
                ? t("model.available")
                : selected.kind === "apple-fm" && detected?.apple.reason
                  ? t("model.appleReason", { reason: detected.apple.reason })
                  : t("model.notInstalled")}
        </Text>
      ) : null}
      {selected.kind === "ollama" && detected?.ollama.models.length ? (
        <Text variant="caption" tone="dim">
          {t("model.installedModels", { models: detected.ollama.models.join(", ") })}
        </Text>
      ) : null}
      {selected.kind === "llamacpp" && selected.sidecar !== null ? (
        <>
          <Text
            variant="caption"
            tone="dim"
          >{`${t("model.modelFile")}: ${selected.sidecar.modelPath || "—"}`}</Text>
          <Button
            onClick={async () => {
              const result = await window.seed.inference.pickModelFile();
              if (!result.ok) return setError(result.error);
              if (result.value !== null && selected.sidecar !== null)
                setDraft({
                  ...selected,
                  sidecar: { ...selected.sidecar, modelPath: result.value },
                });
            }}
          >
            {t("model.chooseFile")}
          </Button>
          <TextField
            label={t("model.contextSize")}
            type="number"
            min={512}
            max={1048576}
            value={selected.sidecar.ctxSize}
            onChange={(event) => {
              if (selected.sidecar === null) return;
              setDraft({
                ...selected,
                sidecar: { ...selected.sidecar, ctxSize: Number(event.target.value) },
              });
            }}
          />
        </>
      ) : null}
      {selected.kind === "custom" ? (
        <TextField
          label={t("model.endpoint")}
          mono
          value={selected.baseUrl}
          onChange={(event) => setDraft({ ...selected, baseUrl: event.target.value })}
        />
      ) : null}
      {selected.kind !== "apple-fm" && selected.kind !== "llamacpp" ? (
        <TextField
          label={t("model.modelId")}
          mono
          value={selected.model}
          onChange={(event) => setDraft({ ...selected, model: event.target.value })}
        />
      ) : null}
      {provider !== null ? (
        <>
          <Text
            variant="caption"
            tone={keyState?.source === "unreadable" ? "danger" : keyState?.set ? "success" : "dim"}
          >
            {keyState === null
              ? t("model.checking")
              : keyState.source === "saved"
                ? t("model.keySaved")
                : keyState.source === "env"
                  ? t("model.keyEnv")
                  : keyState.source === "unreadable"
                    ? t("model.keyUnreadable")
                    : t("model.keyMissing")}
          </Text>
          {keyState?.boundTo ? (
            <Text variant="caption" tone="dim">
              {t("model.keyBound", { url: keyState.boundTo })}
            </Text>
          ) : null}
          <TextField
            label={t("model.apiKey")}
            type="password"
            autoComplete="off"
            value={secret}
            onChange={(event) => setSecret(event.target.value)}
          />
          <Text variant="caption" tone="dim">
            {t("model.keyNote")}
          </Text>
          <div style={{ display: "flex", gap: space.xs, flexWrap: "wrap" }}>
            <Button disabled={busy || secret.length === 0} onClick={() => void saveKey()}>
              {t("model.saveKey")}
            </Button>
            {keyState?.source === "saved" || keyState?.source === "unreadable" ? (
              <Button variant="ghost" disabled={busy} onClick={() => void clearKey()}>
                {t("model.clearKey")}
              </Button>
            ) : null}
          </div>
        </>
      ) : null}
      <Text variant="caption" tone="dim">
        {t("model.budgetHint")}
      </Text>
      <div style={{ display: "flex", gap: space.xs, flexWrap: "wrap" }}>
        <Button variant="primary" disabled={busy || active} onClick={() => void save()}>
          {active ? t("model.active") : t("model.useModel")}
        </Button>
        <Button variant="ghost" disabled={busy} onClick={refreshProbe}>
          {t("model.probe")}
        </Button>
        {active && selected.sidecar !== null ? (
          <Button
            variant="ghost"
            disabled={busy}
            onClick={() => void server(sidecar?.state === "ready" ? "stop" : "start")}
          >
            {sidecar?.state === "ready" ? t("model.stop") : t("model.start")}
          </Button>
        ) : null}
      </div>
      <RouteLine route={route} />
      {active && probe.status === "ready" ? (
        <Text variant="caption" tone={probe.value.reachable ? "success" : "danger"}>
          {probe.value.reachable
            ? t("model.online", { ms: probe.value.latencyMs })
            : t("model.offline")}
        </Text>
      ) : null}
      {active &&
      selected.sidecar !== null &&
      sidecar?.state === "error" &&
      sidecar.message !== null ? (
        <Text variant="caption" tone="danger">
          {sidecar.message}
        </Text>
      ) : null}
      {active && probe.status === "ready" && probe.value.context !== null ? (
        <Text variant="caption" tone="dim">
          {t("model.contextReading", {
            n: probe.value.context.tokens,
            source: probe.value.context.source,
          })}
        </Text>
      ) : null}
      {error !== null ? <ErrorBlock error={error} /> : null}
      {notice !== null ? (
        <Text variant="caption" tone="success">
          {notice}
        </Text>
      ) : null}
    </section>
  );
}
