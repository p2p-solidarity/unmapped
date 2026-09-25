// Create a game, the last step: what Build makes, and the quote before the button — the calls it
// will make, the tokens measured from the real prompt (an estimate), the output cap, what this draft
// has used so far, and money only when the model has a dated price (local models are free). Then the
// first chapter is written in the background once the player is in; that is counted separately.

import { formatNumber, useT } from "@renderer/i18n";
import { playRules } from "@renderer/narrative/openLandCartridge";
import type { BuildReadiness } from "@renderer/narrative/originScene";
import { ErrorBlock, StatePanel, Surface, space, Text } from "@renderer/ui";
import type { CreateDraft } from "@shared/createDraft";
import { type KeyProvider, type KeyStatusMap, PROVIDER_PRESETS } from "@shared/llm";
import type { AppError, Loadable } from "@shared/result";
import { type JSX, useEffect, useMemo, useState } from "react";
import { UsageLine } from "../hud/UsagePanel";
import { buildQuote } from "./quote";

/** Providers whose calls need a key (main's `needsKey`); the others run without one. */
const KEYED: readonly KeyProvider[] = ["openai", "openui-gateway"];

function usd(t: ReturnType<typeof useT>, value: number): string {
  // Rounded up to the cent: an estimate should not read cheaper than it can be.
  return value < 0.01
    ? t("create.quoteUnderCent")
    : t("create.quoteUsd", { amount: formatNumber(Math.ceil(value * 100) / 100) });
}

function Quote({
  draft,
  readiness,
}: {
  draft: CreateDraft;
  readiness: BuildReadiness;
}): JSX.Element {
  const t = useT();
  const [keys, setKeys] = useState<Loadable<KeyStatusMap>>({ status: "loading" });
  useEffect(() => {
    let alive = true;
    void window.seed.inference.keyStatus().then((result) => {
      if (alive) {
        setKeys(
          result.ok
            ? { status: "ready", value: result.value }
            : { status: "error", error: result.error },
        );
      }
    });
    return () => {
      alive = false;
    };
  }, []);
  const fields = draft.world?.fields ?? null;
  const quote = useMemo(
    () => (fields === null ? null : buildQuote(draft.idea, fields, readiness)),
    [draft.idea, fields, readiness],
  );
  const keyed = (KEYED as readonly string[]).includes(readiness.kind);
  const noKey: AppError | null =
    keyed && keys.status === "ready" && !keys.value[readiness.kind as KeyProvider].set
      ? readiness.kind === "openai"
        ? {
            code: "no-api-key",
            message: "No OpenAI key is set.",
            hint: "Enter one in Settings → Model (Cloud API → OpenAI), or add OPENAI_API_KEY to .env.",
          }
        : {
            code: "no-api-key",
            message: `The ${readiness.kind} provider needs an API key and none is set.`,
            hint: `Enter a key in Settings → Model (Cloud API), or add ${PROVIDER_PRESETS[readiness.kind].apiKeyEnv ?? "the key"} to .env.`,
          }
      : null;
  if (quote === null) return <Text tone="danger">{t("create.worldIncomplete")}</Text>;
  if (!quote.ok) return <ErrorBlock error={quote.error} />;
  const q = quote.value;
  return (
    <div data-quote="">
      <Surface variant="inset" padding="md" style={{ gap: space.xs }}>
        <Text variant="label">{t("create.quoteTitle")}</Text>
        <Text variant="caption">
          {t("create.quoteCalls", { repairs: q.repairs, provider: q.provider, model: q.model })}
        </Text>
        {q.first === null || q.worst === null ? (
          <Text variant="caption" tone="dim">
            {t("create.quoteBridge")}
          </Text>
        ) : (
          <>
            <Text variant="caption" mono>
              {t("create.quoteFirst", {
                input: formatNumber(q.first.input),
                output: formatNumber(q.first.output),
              })}
            </Text>
            <Text variant="caption" mono>
              {t("create.quoteWorst", {
                calls: q.worst.calls,
                input: formatNumber(q.worst.input),
                output: formatNumber(q.worst.output),
              })}
            </Text>
          </>
        )}
        <Text variant="caption" tone={q.price.kind === "unknown" ? "dim" : "default"}>
          {q.price.kind === "free"
            ? t("create.quoteFree")
            : q.price.kind === "unknown"
              ? t("create.quotePriceUnknown", { model: q.price.model })
              : t("create.quoteMoney", {
                  first: usd(t, q.firstUsd ?? 0),
                  worst: usd(t, q.worstUsd ?? 0),
                  model: q.model,
                  date: q.price.price.asOf,
                  source: q.price.price.source,
                })}
        </Text>
        <Text variant="caption" tone="dim">
          {t("create.quoteChapter", {
            repairs: q.repairs,
            output: formatNumber(q.chapterCap),
          })}
        </Text>
        <UsageLine scope={{ kind: "create", id: draft.draftId }} draft />
        <Text variant="caption" tone="dim">
          {t("create.quoteEstimate")}
        </Text>
        {noKey !== null && <ErrorBlock error={noKey} />}
      </Surface>
    </div>
  );
}

export function BuildStep({
  draft,
  readiness,
  lookUrl,
  lookMissing,
}: {
  draft: CreateDraft;
  readiness: Loadable<BuildReadiness>;
  /** The chosen concept picture, or null when the world goes without one. */
  lookUrl: string | null;
  /** A picture is chosen but cannot be read: Build waits (it never publishes without it). */
  lookMissing: boolean;
}): JSX.Element {
  const t = useT();
  const rules = playRules(draft.idea.play);
  return (
    <>
      <Text variant="title" as="h2">
        {draft.idea.name}
      </Text>
      <Text>{t("create.buildWhat")}</Text>
      <Text variant="caption">
        {t("create.buildLanguage")}: {draft.idea.language}
      </Text>
      <Text variant="caption">
        {t("create.buildChapters", { n: draft.story?.chapters.length ?? 0 })}
      </Text>
      {lookMissing ? (
        <Text variant="caption" tone="danger">
          {t("create.lookMissing")}
        </Text>
      ) : lookUrl === null ? (
        <Text variant="caption" tone="dim">
          {t("create.buildNoLook")}
        </Text>
      ) : (
        <div style={{ display: "flex", gap: space.sm, alignItems: "center" }}>
          <img
            src={lookUrl}
            alt={t("create.lookChosen")}
            style={{ width: 96, height: 96, objectFit: "cover" }}
          />
          <Text variant="caption">{t("create.buildLook")}</Text>
        </div>
      )}
      {rules.ok && (
        <Text variant="caption">
          {t("create.rules")}:{" "}
          {draft.idea.play.fights === "none"
            ? t("create.rulesPeaceful")
            : t("create.rulesFighting", {
                weapon:
                  draft.idea.play.weapon.trim() ||
                  t(draft.idea.play.fights === "gun" ? "create.defaultGun" : "create.defaultBlade"),
                hp: rules.value.combat?.playerHp ?? 0,
                damage: rules.value.weapons[0]?.damage ?? 0,
                range: rules.value.weapons[0]?.range ?? 0,
                base: rules.value.combat?.monsterHpBase ?? 0,
                per: rules.value.combat?.monsterHpPerLevel ?? 0,
              })}
        </Text>
      )}
      <StatePanel state={readiness} loadingText={t("create.quoteLoading")}>
        {(value) => <Quote draft={draft} readiness={value} />}
      </StatePanel>
    </>
  );
}
