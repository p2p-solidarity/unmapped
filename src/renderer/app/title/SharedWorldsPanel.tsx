// Settings → Shared worlds (rev 6 phase 3, WP8): the world services this device uses (a per-device
// preference, ./net/worldServices), a real test of each from main (`/v1/health` + the WebSocket
// challenge), save and clear. The door offers these when its owner shares a world; a world already
// shared keeps the service it was shared on.
//
// One row per concern, each its own section below the list. WP7 appends the rumor switch here.

import {
  type RumorChoice,
  rumorChoice,
  setRumorSwitch,
  useRumorChoice,
} from "@renderer/app/land/rumors";
import { formatNumber, useT } from "@renderer/i18n";
import {
  parseServiceList,
  probeService,
  setWorldServices,
  worldServices,
} from "@renderer/net/worldServices";
import { Button, ErrorBlock, space, Text, TextField } from "@renderer/ui";
import { type AppError, fromResult, type Loadable, loading } from "@shared/result";
import type { ServiceProbe } from "@shared/worldApi";
import { type JSX, useEffect, useRef, useState } from "react";

const sameList = (a: readonly string[], b: readonly string[]): boolean =>
  a.length === b.length && a.every((url, index) => url === b[index]);

function ProbeLine({ url, state }: { url: string; state: Loadable<ServiceProbe> | undefined }) {
  const t = useT();
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: space.xs }}>
      <Text variant="caption" mono>
        {url}
      </Text>
      {state === undefined || state.status === "idle" ? (
        <Text variant="caption" tone="dim">
          {t("world.servicesUntested")}
        </Text>
      ) : state.status === "loading" ? (
        <Text variant="caption" tone="muted">
          {t("world.servicesTesting")}
        </Text>
      ) : state.status === "ready" ? (
        <>
          <Text variant="caption" tone="success">
            {t("world.servicesReachable", {
              version: state.value.version,
              physics: state.value.physics.join(", "),
              worlds: state.value.worlds,
              health: formatNumber(state.value.healthMs),
              greeting: formatNumber(state.value.challengeMs),
            })}
          </Text>
          <Text variant="caption" tone="dim" mono>
            {t("world.servicesKey", { key: state.value.key })}
          </Text>
          {state.value.test ? (
            <Text variant="caption" tone="muted">
              {t("world.servicesTestMode")}
            </Text>
          ) : null}
        </>
      ) : (
        <ErrorBlock error={state.error} />
      )}
    </div>
  );
}

function ServiceList(): JSX.Element {
  const t = useT();
  const [own, setOwn] = useState<string[]>(worldServices);
  const [draft, setDraft] = useState(() => own.join("\n"));
  const [probes, setProbes] = useState<Record<string, Loadable<ServiceProbe>>>({});
  const [error, setError] = useState<AppError | null>(null);
  const [saved, setSaved] = useState(false);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const { urls, invalid } = parseServiceList(draft);
  const testing = urls.some((url) => probes[url]?.status === "loading");
  const canSave = invalid.length === 0 && !sameList(urls, own);

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
    // Every service is tested at once; each line fills in as its own answer (or error) arrives.
    for (const url of urls) {
      void probeService(url).then((result) => {
        if (alive.current) setProbes((current) => ({ ...current, [url]: fromResult(result) }));
      });
    }
  };
  const store = (next: string[]): void => {
    const result = setWorldServices(next);
    if (!result.ok) {
      setError(result.error);
      setSaved(false);
      return;
    }
    const stored = worldServices();
    setOwn(stored);
    setDraft(stored.join("\n"));
    setError(null);
    setSaved(true);
  };

  return (
    <>
      <Text variant="caption" tone="muted">
        {own.length === 0 ? t("world.servicesNone") : t("world.servicesOwn")}
      </Text>
      <TextField
        label={t("world.servicesField")}
        mono
        rows={3}
        spellCheck={false}
        autoComplete="off"
        value={draft}
        onChange={(event) => edit(event.target.value)}
      />
      {invalid.length > 0 ? (
        <Text variant="caption" tone="danger">
          {t("world.servicesInvalid", { entries: invalid.join(", ") })}
        </Text>
      ) : null}
      <div style={{ display: "flex", gap: space.xs, flexWrap: "wrap" }}>
        <Button disabled={testing || urls.length === 0} onClick={test}>
          {t("world.servicesTest")}
        </Button>
        <Button variant="primary" disabled={!canSave} onClick={() => store(urls)}>
          {t("world.servicesSave")}
        </Button>
        <Button
          variant="ghost"
          disabled={own.length === 0 && draft.trim() === ""}
          onClick={() => store([])}
        >
          {t("world.servicesClear")}
        </Button>
      </div>
      {urls.map((url) => (
        <ProbeLine key={url} url={url} state={probes[url]} />
      ))}
      {error === null ? null : <ErrorBlock error={error} />}
      {saved ? (
        <Text variant="caption" tone="success">
          {t("world.servicesSaved")}
        </Text>
      ) : null}
      <Text variant="caption" tone="dim">
        {t("world.servicesApplyNote")}
      </Text>
    </>
  );
}

/**
 * WP7 (rev 6 phase 3, D14): whether this device writes a shared world's rumors in the background,
 * with its own model and key. A per-device preference: auto (on for the worlds this device owns, off
 * for the others), or the player's own on / off.
 */
function RumorSwitch(): JSX.Element {
  const t = useT();
  const choice = useRumorChoice();
  const [error, setError] = useState<AppError | null>(null);
  const pick = (next: RumorChoice): void => {
    if (next === rumorChoice()) return;
    const saved = setRumorSwitch(next);
    setError(saved.ok ? null : saved.error);
  };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: space.xs }}>
      <Text variant="label">{t("rumors.switchHeading")}</Text>
      <Text variant="caption" tone="dim">
        {t("rumors.switchIntro")}
      </Text>
      <div style={{ display: "flex", gap: space.xs, alignItems: "center", flexWrap: "wrap" }}>
        <Text variant="body">{t("rumors.switchLabel")}</Text>
        <Button variant="chip" active={choice === "auto"} onClick={() => pick("auto")}>
          {t("rumors.switchAuto")}
        </Button>
        <Button variant="chip" active={choice === "off"} onClick={() => pick("off")}>
          {t("rumors.switchOff")}
        </Button>
        <Button variant="chip" active={choice === "on"} onClick={() => pick("on")}>
          {t("rumors.switchOn")}
        </Button>
      </div>
      <Text variant="caption" tone="muted">
        {t("rumors.switchNote")}
      </Text>
      {error === null ? null : <ErrorBlock error={error} />}
    </div>
  );
}

export function SharedWorldsPanel(): JSX.Element {
  const t = useT();
  return (
    <section style={{ display: "flex", flexDirection: "column", gap: space.sm }}>
      <Text variant="label">{t("world.servicesHeading")}</Text>
      <Text variant="caption" tone="dim">
        {t("world.servicesIntro")}
      </Text>
      <ServiceList />
      <RumorSwitch />
    </section>
  );
}
