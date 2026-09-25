// System sub-menu: real readings of this machine (build, storage, model endpoint) and save
// protection. Only reached on purpose — the title screen itself stays quiet.

import { LANGUAGE_LABEL, UI_LANGUAGES, useLanguageStore, useT } from "@renderer/i18n";
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
  const t = useT();
  const info = useAppInfo();
  const config = useInferenceStore((state) => state.config);
  const probe = useInferenceStore((state) => state.probe);
  const sidecar = useInferenceStore((state) => state.sidecar);
  const refreshProbe = useRefreshProbe();

  useKeys({ Escape: onClose });

  const language = useLanguageStore((state) => state.language);
  const setLanguage = useLanguageStore((state) => state.setLanguage);

  return (
    <div className="g-scroll" style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <h2 className="g-heading">{t("title.menuSystem")}</h2>

      <section style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <h3 className="g-heading" style={{ fontSize: 13 }}>
          {t("common.language")}
        </h3>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {UI_LANGUAGES.map((option) => (
            <Button
              key={option}
              variant="chip"
              active={language === option}
              onClick={() => setLanguage(option)}
              style={{ minHeight: 34 }}
            >
              {LANGUAGE_LABEL[option]}
            </Button>
          ))}
        </div>
        <span className="g-meta">{t("common.languageNote")}</span>
      </section>

      <StatePanel state={info} loadingText={t("title.readingBuild")}>
        {(value) => (
          <dl className="info-list">
            <dt>{t("title.version")}</dt>
            <dd>{value.version}</dd>
            <dt>{t("title.platform")}</dt>
            <dd>{`${value.platform} · electron ${value.electron}`}</dd>
            <dt>{t("title.worldsFolder")}</dt>
            <dd>{value.worldsDir}</dd>
          </dl>
        )}
      </StatePanel>

      <dl className="info-list">
        <dt>{t("common.model")}</dt>
        <dd>{config === null ? "…" : `${config.kind} · ${config.model}`}</dd>
        <dt>{t("common.endpoint")}</dt>
        <dd>{config === null ? "…" : config.baseUrl}</dd>
        <dt>{t("common.status")}</dt>
        <dd>
          <StatePanel
            state={probe}
            idleText={t("common.notProbed")}
            loadingText={t("common.probing")}
          >
            {(value) =>
              value.reachable ? (
                <Text variant="caption" tone="success" mono>
                  {t("title.probeOnline", { ms: value.latencyMs, n: value.models.length })}
                </Text>
              ) : (
                <Text variant="caption" tone="danger" mono>
                  {sidecar?.state === "error" && sidecar.message !== null
                    ? t("title.offlineBecause", { reason: sidecar.message })
                    : config?.kind === "apple-fm"
                      ? t("title.offlineAppleFm")
                      : t("title.offlineLocal")}
                </Text>
              )
            }
          </StatePanel>
        </dd>
      </dl>
      <div className="row-actions">
        <Button onClick={refreshProbe}>{t("common.probeAgain")}</Button>
      </div>

      <UnlockPanel onUnlocked={onClose} />
    </div>
  );
}
