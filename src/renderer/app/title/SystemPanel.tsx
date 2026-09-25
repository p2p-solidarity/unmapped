// System sub-menu: real readings of this machine (build, storage, model endpoint) and save
// protection. Only reached on purpose — the title screen itself stays quiet.

import { UnlockPanel } from "@renderer/identity";
import { useInferenceStore } from "@renderer/state";
import { Button, StatePanel, Text } from "@renderer/ui";
import type { AppInfo } from "@shared/ipc";
import { errored, idle, type Loadable, loading, ready, toError } from "@shared/result";
import { useEffect, useState } from "react";
import { useRefreshProbe } from "../inferenceSync";
import { useKeys } from "../shell/useKeys";

function useAppInfo(): Loadable<AppInfo> {
  const [info, setInfo] = useState<Loadable<AppInfo>>(idle());
  useEffect(() => {
    let alive = true;
    setInfo(loading());
    window.seed.app.info().then(
      (value) => {
        if (alive) setInfo(ready(value));
      },
      (error: unknown) => {
        if (alive) setInfo(errored(toError(error, "app-info-failed")));
      },
    );
    return () => {
      alive = false;
    };
  }, []);
  return info;
}

export function SystemPanel({ onClose }: { onClose(): void }) {
  const info = useAppInfo();
  const config = useInferenceStore((state) => state.config);
  const probe = useInferenceStore((state) => state.probe);
  const refreshProbe = useRefreshProbe();

  useKeys({ Escape: onClose });

  return (
    <div className="g-scroll" style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <h2 className="g-heading">System</h2>

      <StatePanel state={info} loadingText="Reading build…">
        {(value) => (
          <dl className="info-list">
            <dt>Version</dt>
            <dd>{value.version}</dd>
            <dt>Platform</dt>
            <dd>{`${value.platform} · electron ${value.electron}`}</dd>
            <dt>Worlds</dt>
            <dd>{value.worldsDir}</dd>
          </dl>
        )}
      </StatePanel>

      <dl className="info-list">
        <dt>Model</dt>
        <dd>{config === null ? "…" : `${config.kind} · ${config.model}`}</dd>
        <dt>Endpoint</dt>
        <dd>{config === null ? "…" : config.baseUrl}</dd>
        <dt>Status</dt>
        <dd>
          <StatePanel state={probe} idleText="Not probed." loadingText="Probing…">
            {(value) =>
              value.reachable ? (
                <Text variant="caption" tone="success" mono>
                  {`online · ${value.latencyMs} ms · ${value.models.length} model(s)`}
                </Text>
              ) : (
                <Text variant="caption" tone="danger" mono>
                  offline — start llama-server / ollama, or change provider in F12 → Inference
                </Text>
              )
            }
          </StatePanel>
        </dd>
      </dl>
      <div className="row-actions">
        <Button onClick={refreshProbe}>Probe again</Button>
      </div>

      <UnlockPanel onUnlocked={onClose} />
    </div>
  );
}
