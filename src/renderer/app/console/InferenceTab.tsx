// Provider settings. The renderer never sees a key — only the *name* of the env var the main
// process should read (Rule 6). Everything shown about the endpoint comes from a real probe.

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
  APPLE_FM_BINARY,
  type InferenceConfig,
  PROVIDER_KINDS,
  type SidecarConfig,
  type SidecarStatus,
} from "@shared/llm";
import { idle, type Loadable, loading, ready } from "@shared/result";
import { useCallback, useEffect, useState } from "react";
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
  return (
    <>
      <Field
        label="binaryPath"
        value={sidecar.binaryPath}
        onChange={(binaryPath) => onChange({ ...sidecar, binaryPath })}
      />
      <Field
        label="modelPath (.gguf)"
        value={sidecar.modelPath}
        onChange={(modelPath) => onChange({ ...sidecar, modelPath })}
      />
      <Field
        label="port"
        value={String(sidecar.port)}
        onChange={(port) => onChange({ ...sidecar, port: numberFromInput(port, sidecar.port) })}
      />
      <Field
        label="ctxSize"
        value={String(sidecar.ctxSize)}
        onChange={(ctx) => onChange({ ...sidecar, ctxSize: numberFromInput(ctx, sidecar.ctxSize) })}
      />
      <Text variant="caption" tone="dim">
        {sidecar.binaryPath === APPLE_FM_BINARY
          ? "Apple's on-device model needs no model file. Accept its terms once with `sudo fm license` in Terminal."
          : "`brew install llama.cpp` puts llama-server in your Homebrew bin directory; the model path is any .gguf file you downloaded."}
      </Text>
    </>
  );
}

function ProviderForm({ config }: { config: InferenceConfig }) {
  const [draft, setDraft] = useState<InferenceConfig>(config);
  const [saving, setSaving] = useState(false);
  const setConfig = useInferenceStore((state) => state.setConfig);
  const toast = useSessionStore((state) => state.toast);

  useEffect(() => setDraft(config), [config]);

  const save = useCallback(() => {
    setSaving(true);
    void (async () => {
      const result = await window.seed.inference.setConfig(draft);
      setSaving(false);
      if (!result.ok) {
        toast(
          "danger",
          `${result.error.message}${result.error.hint ? ` — ${result.error.hint}` : ""}`,
        );
        return;
      }
      setConfig(result.value);
      toast("success", "inference.json saved");
    })();
  }, [draft, setConfig, toast]);

  return (
    <>
      <label style={{ display: "flex", flexDirection: "column", gap: space.xs }}>
        <Text variant="caption" tone="dim">
          kind
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
        label="model"
        value={draft.model}
        onChange={(model) => setDraft({ ...draft, model })}
      />
      <Field
        label="apiKeyEnv (empty = no auth)"
        value={draft.apiKeyEnv ?? ""}
        onChange={(value) => setDraft({ ...draft, apiKeyEnv: apiKeyEnvFromInput(value) })}
      />

      {draft.sidecar === null ? (
        <Button variant="ghost" onClick={() => setDraft({ ...draft, sidecar: EMPTY_SIDECAR })}>
          Configure llama-server sidecar
        </Button>
      ) : (
        <>
          <SidecarFields
            sidecar={draft.sidecar}
            onChange={(sidecar) => setDraft({ ...draft, sidecar })}
          />
          <Button variant="ghost" onClick={() => setDraft({ ...draft, sidecar: null })}>
            Remove sidecar config
          </Button>
        </>
      )}

      <Button variant="primary" onClick={save} disabled={saving}>
        {saving ? "Saving…" : "Save"}
      </Button>
    </>
  );
}

function ProbeSection() {
  const probe = useInferenceStore((state) => state.probe);
  const refreshProbe = useRefreshProbe();

  return (
    <Surface variant="inset" padding="md">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <Text variant="label" tone="muted">
          PROBE
        </Text>
        <Button variant="ghost" onClick={refreshProbe}>
          Probe
        </Button>
      </div>
      <StatePanel state={probe} idleText="Not probed yet." loadingText="Calling /v1/models…">
        {(value) => (
          <>
            <Text variant="caption" tone={value.reachable ? "success" : "danger"}>
              {`${value.reachable ? "reachable" : "not reachable"} · ${value.latencyMs} ms${
                value.serverName === null ? "" : ` · ${value.serverName}`
              }`}
            </Text>
            {value.models.length === 0 ? (
              <Text variant="caption" tone="dim">
                The server listed no models.
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

  const run = useCallback(
    (action: "start" | "stop") => {
      setBusy(true);
      void (async () => {
        const result =
          action === "start"
            ? await window.seed.inference.sidecarStart()
            : await window.seed.inference.sidecarStop();
        if (!result.ok) {
          toast(
            "danger",
            `${result.error.message}${result.error.hint ? ` — ${result.error.hint}` : ""}`,
          );
        }
        setSidecar(await window.seed.inference.sidecarStatus());
        setBusy(false);
      })();
    },
    [setSidecar, toast],
  );

  return (
    <Surface variant="inset" padding="md">
      <Text variant="label" tone="muted">
        SIDECAR
      </Text>
      <StatePanel state={state} idleText="No sidecar status reported yet.">
        {(value) => (
          <>
            <Text variant="caption" tone={value.state === "ready" ? "success" : "muted"}>
              {`${value.state}${value.pid === null ? "" : ` · pid ${value.pid}`}${
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
          Start
        </Button>
        <Button variant="ghost" onClick={() => run("stop")} disabled={busy}>
          Stop
        </Button>
      </div>
    </Surface>
  );
}

export function InferenceTab() {
  const config = useInferenceStore((state) => state.config);
  const state: Loadable<InferenceConfig> = config === null ? loading() : ready(config);

  return (
    <>
      <Text variant="label" tone="muted">
        PROVIDER
      </Text>
      <StatePanel state={state} loadingText="Reading inference.json…">
        {(value) => <ProviderForm config={value} />}
      </StatePanel>
      <ProbeSection />
      <SidecarSection />
    </>
  );
}
