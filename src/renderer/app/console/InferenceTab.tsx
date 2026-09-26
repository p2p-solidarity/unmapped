// Provider settings. The renderer never sees a key — only the *name* of the env var the main
// process should read (Rule 6). Everything shown about the endpoint comes from a real probe.

import { errorLine, type StringKey, useT } from "@renderer/i18n";
import { useInferenceStore, useSessionStore } from "@renderer/state";
import {
  Button,
  colors,
  font,
  HIT_TARGET,
  radius,
  StatePanel,
  Surface,
  space,
  Text,
} from "@renderer/ui";
import {
  type InferenceConfig,
  PROVIDER_KINDS,
  type SidecarConfig,
  type SidecarState,
  type SidecarStatus,
} from "@shared/llm";
import { idle, type Loadable, loading, ready } from "@shared/result";
import { useCallback, useEffect, useState } from "react";
import { WorldUsage } from "../hud/UsagePanel";
import { useRefreshProbe } from "../inferenceSync";
import {
  apiKeyEnvFromInput,
  applyProviderPreset,
  EMPTY_SIDECAR,
  isProviderKind,
  numberFromInput,
} from "./presets";

const inputStyle = {
  minHeight: HIT_TARGET,
  padding: `${space.sm}px ${space.md}px`,
  borderRadius: radius.md,
  border: `1px solid ${colors.surfaceBorder}`,
  background: colors.bg,
  color: colors.text,
  fontFamily: font.mono,
  fontSize: font.size.caption,
} as const;

const SIDECAR_STATE: Record<SidecarState, StringKey> = {
  stopped: "console.sidecarStopped",
  starting: "console.sidecarStarting",
  ready: "console.sidecarReady",
  error: "console.sidecarError",
};

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange(next: string): void;
}) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: space.xs }}>
      <Text variant="caption" tone="dim">
        {label}
      </Text>
      <input value={value} onChange={(event) => onChange(event.target.value)} style={inputStyle} />
    </label>
  );
}

function SidecarFields({
  sidecar,
  onChange,
}: {
  sidecar: SidecarConfig;
  onChange(next: SidecarConfig): void;
}) {
  const t = useT();
  return (
    <>
      <Field
        label={t("console.fieldBinaryPath")}
        value={sidecar.binaryPath}
        onChange={(binaryPath) => onChange({ ...sidecar, binaryPath })}
      />
      <Field
        label={t("console.fieldModelPath")}
        value={sidecar.modelPath}
        onChange={(modelPath) => onChange({ ...sidecar, modelPath })}
      />
      <Field
        label={t("console.fieldPort")}
        value={String(sidecar.port)}
        onChange={(port) => onChange({ ...sidecar, port: numberFromInput(port, sidecar.port) })}
      />
      <Field
        label={t("console.fieldCtxSize")}
        value={String(sidecar.ctxSize)}
        onChange={(ctx) => onChange({ ...sidecar, ctxSize: numberFromInput(ctx, sidecar.ctxSize) })}
      />
      <Text variant="caption" tone="dim">
        {t("console.llamaHint")}
      </Text>
    </>
  );
}

function ProviderForm({ config }: { config: InferenceConfig }) {
  const [draft, setDraft] = useState<InferenceConfig>(config);
  const [saving, setSaving] = useState(false);
  const setConfig = useInferenceStore((state) => state.setConfig);
  const toast = useSessionStore((state) => state.toast);
  const t = useT();

  useEffect(() => setDraft(config), [config]);

  const save = useCallback(() => {
    setSaving(true);
    void (async () => {
      const result = await window.seed.inference.setConfig(draft);
      setSaving(false);
      if (!result.ok) {
        toast("danger", errorLine(result.error));
        return;
      }
      setConfig(result.value);
      toast("success", t("console.configSaved"));
    })();
  }, [draft, setConfig, t, toast]);

  return (
    <>
      <label style={{ display: "flex", flexDirection: "column", gap: space.xs }}>
        <Text variant="caption" tone="dim">
          {t("console.fieldKind")}
        </Text>
        <select
          value={draft.kind}
          onChange={(event) => {
            const next = event.target.value;
            if (isProviderKind(next)) setDraft(applyProviderPreset(draft, next));
          }}
          style={inputStyle}
        >
          {PROVIDER_KINDS.map((kind) => (
            <option key={kind} value={kind}>
              {kind}
            </option>
          ))}
        </select>
      </label>

      <Field
        label="baseUrl"
        value={draft.baseUrl}
        onChange={(baseUrl) => setDraft({ ...draft, baseUrl })}
      />
      <Field
        label={t("console.fieldModel")}
        value={draft.model}
        onChange={(model) => setDraft({ ...draft, model })}
      />
      <Field
        label={t("console.fieldApiKeyEnv")}
        value={draft.apiKeyEnv ?? ""}
        onChange={(value) => setDraft({ ...draft, apiKeyEnv: apiKeyEnvFromInput(value) })}
      />

      {draft.sidecar === null ? (
        <Button variant="ghost" onClick={() => setDraft({ ...draft, sidecar: EMPTY_SIDECAR })}>
          {t("console.configureSidecar")}
        </Button>
      ) : (
        <>
          <SidecarFields
            sidecar={draft.sidecar}
            onChange={(sidecar) => setDraft({ ...draft, sidecar })}
          />
          <Button variant="ghost" onClick={() => setDraft({ ...draft, sidecar: null })}>
            {t("console.removeSidecar")}
          </Button>
        </>
      )}

      <Button variant="primary" onClick={save} disabled={saving}>
        {saving ? t("console.saving") : t("common.save")}
      </Button>
    </>
  );
}

function ProbeSection() {
  const probe = useInferenceStore((state) => state.probe);
  const refreshProbe = useRefreshProbe();
  const t = useT();

  return (
    <Surface variant="inset" padding="md">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <Text variant="label" tone="muted">
          {t("console.probeLabel")}
        </Text>
        <Button variant="ghost" onClick={refreshProbe}>
          {t("console.probe")}
        </Button>
      </div>
      <StatePanel
        state={probe}
        idleText={t("common.notProbed")}
        loadingText={t("console.probeLoading")}
      >
        {(value) => (
          <>
            <Text variant="caption" tone={value.reachable ? "success" : "danger"}>
              {`${value.reachable ? t("console.reachable") : t("console.unreachable")} · ${
                value.latencyMs
              } ms${value.serverName === null ? "" : ` · ${value.serverName}`}`}
            </Text>
            {value.models.length === 0 ? (
              <Text variant="caption" tone="dim">
                {t("console.noModels")}
              </Text>
            ) : (
              value.models.map((model) => (
                <Text key={model} variant="caption" mono tone="muted">
                  {model}
                </Text>
              ))
            )}
          </>
        )}
      </StatePanel>
    </Surface>
  );
}

function SidecarSection() {
  const sidecar = useInferenceStore((state) => state.sidecar);
  const setSidecar = useInferenceStore((state) => state.setSidecar);
  const toast = useSessionStore((state) => state.toast);
  const [busy, setBusy] = useState(false);
  const state: Loadable<SidecarStatus> = sidecar === null ? idle() : ready(sidecar);
  const t = useT();

  const run = useCallback(
    (action: "start" | "stop") => {
      setBusy(true);
      void (async () => {
        const result =
          action === "start"
            ? await window.seed.inference.sidecarStart()
            : await window.seed.inference.sidecarStop();
        if (!result.ok) toast("danger", errorLine(result.error));
        setSidecar(await window.seed.inference.sidecarStatus());
        setBusy(false);
      })();
    },
    [setSidecar, toast],
  );

  return (
    <Surface variant="inset" padding="md">
      <Text variant="label" tone="muted">
        {t("console.sidecarLabel")}
      </Text>
      <StatePanel state={state} idleText={t("console.sidecarIdle")}>
        {(value) => (
          <>
            <Text variant="caption" tone={value.state === "ready" ? "success" : "muted"}>
              {`${t(SIDECAR_STATE[value.state])}${value.pid === null ? "" : ` · pid ${value.pid}`}${
                value.port === null ? "" : ` · :${value.port}`
              }`}
            </Text>
            {value.message === null ? null : (
              <Text variant="caption" mono tone="dim">
                {value.message}
              </Text>
            )}
          </>
        )}
      </StatePanel>
      <div style={{ display: "flex", gap: space.sm }}>
        <Button onClick={() => run("start")} disabled={busy}>
          {t("console.start")}
        </Button>
        <Button variant="ghost" onClick={() => run("stop")} disabled={busy}>
          {t("common.stop")}
        </Button>
      </div>
    </Surface>
  );
}

export function InferenceTab() {
  const config = useInferenceStore((state) => state.config);
  const state: Loadable<InferenceConfig> = config === null ? loading() : ready(config);
  const instanceId = useSessionStore(
    (session) => session.activeInstance?.instance.meta.instanceId ?? null,
  );
  const t = useT();

  return (
    <>
      <Text variant="label" tone="muted">
        {t("console.provider")}
      </Text>
      <StatePanel state={state} loadingText={t("console.readingConfig")}>
        {(value) => <ProviderForm config={value} />}
      </StatePanel>
      <ProbeSection />
      <SidecarSection />
      {/* What this world's model calls cost: moved here from the HUD (simplify-together). */}
      <Text variant="label" tone="muted">
        {t("usage.title")}
      </Text>
      <WorldUsage scope={instanceId === null ? null : { kind: "instance", id: instanceId }} />
    </>
  );
}
