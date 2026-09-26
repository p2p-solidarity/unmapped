// Settings (title → Settings, a dialog over the title): real readings of this machine (build,
// storage, model endpoint, the gateway account and its plans, signaling servers, world services)
// and save protection. Only reached on purpose — the title screen itself stays quiet.

import { LANGUAGE_LABEL, UI_LANGUAGES, useLanguageStore, useT } from "@renderer/i18n";
import { UnlockPanel } from "@renderer/identity";
import { Button, StatePanel } from "@renderer/ui";
import type { AppInfo } from "@shared/ipc";
import { errored, idle, type Loadable, loading, ready, toError } from "@shared/result";
import { useEffect, useState } from "react";
import { useKeys } from "../shell/useKeys";
import { AccountPanel } from "./AccountPanel";
import { ImagePanel } from "./ImagePanel";
import { ModelPanel } from "./ModelPanel";
import { PlanPanel } from "./PlanPanel";
import { SignalingPanel } from "./SignalingPanel";

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

  useKeys({ Escape: onClose });

  const language = useLanguageStore((state) => state.language);
  const setLanguage = useLanguageStore((state) => state.setLanguage);

  return (
    <div className="g-scroll" style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <h2 className="g-heading">{t("title.menuSettings")}</h2>

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

      <ModelPanel />

      <AccountPanel />

      <PlanPanel />

      <ImagePanel />

      <SignalingPanel />

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

      <UnlockPanel onUnlocked={onClose} />
    </div>
  );
}
