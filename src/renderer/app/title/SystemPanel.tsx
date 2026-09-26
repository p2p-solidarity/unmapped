// Settings (title → Settings, a dialog over the title), kept simple enough for anyone: the language,
// the model, and the player's one passkey. Everything else — the gateway account and its plans,
// pictures, signaling servers, world services and this build's readings — waits folded under
// Advanced settings. Only reached on purpose — the title screen itself stays quiet.

import { LANGUAGE_LABEL, UI_LANGUAGES, useLanguageStore, useT } from "@renderer/i18n";
import { Button, StatePanel } from "@renderer/ui";
import type { AppInfo } from "@shared/ipc";
import { errored, idle, type Loadable, loading, ready, toError } from "@shared/result";
import { useEffect, useState } from "react";
import { useKeys } from "../shell/useKeys";
import { AccountPanel } from "./AccountPanel";
import { ImagePanel } from "./ImagePanel";
import { ModelPanel } from "./ModelPanel";
import { PasskeyPanel } from "./PasskeyPanel";
import { PlanPanel } from "./PlanPanel";
import { SharedWorldsPanel } from "./SharedWorldsPanel";
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

/** What a player rarely needs: mounted only while Advanced settings is open. */
function Advanced() {
  const t = useT();
  const info = useAppInfo();
  return (
    <>
      <AccountPanel />

      <PlanPanel />

      <ImagePanel />

      <SignalingPanel />

      <SharedWorldsPanel />

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
    </>
  );
}

export function SystemPanel({ onClose }: { onClose(): void }) {
  const t = useT();
  const [advanced, setAdvanced] = useState(false);

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

      <PasskeyPanel />

      <section style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        <div>
          <Button variant="ghost" onClick={() => setAdvanced(!advanced)}>
            {`${advanced ? "▾" : "▸"} ${t("identity.settingsAdvanced")}`}
          </Button>
        </div>
        {advanced ? <Advanced /> : null}
      </section>
    </div>
  );
}
