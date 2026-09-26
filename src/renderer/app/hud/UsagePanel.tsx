// What this world's model calls cost, read back from main's usage ledger (@shared/usage): one line
// for the HUD and Create, and a panel with the total by purpose and the latest calls. Every number
// is one main recorded; a provider that reported no tokens is shown as such, never as zero.

import { formatNumber, formatTime, type StringKey, useT } from "@renderer/i18n";
import { useUsageSummary } from "@renderer/llm";
import { Button, colors, StatePanel, Surface, space, Text, zIndex } from "@renderer/ui";
import type {
  UsageOutcome,
  UsagePurpose,
  UsageRecord,
  UsageScope,
  UsageTotals,
} from "@shared/usage";
import { type JSX, useState } from "react";

const PURPOSE_LABEL: Record<UsagePurpose, StringKey> = {
  witness: "usage.purposeWitness",
  chapter: "usage.purposeChapter",
  place: "usage.purposePlace",
  dialogue: "usage.purposeDialogue",
  item: "usage.purposeItem",
  scene: "usage.purposeScene",
  origin: "usage.purposeOrigin",
  bible: "usage.purposeBible",
  story: "usage.purposeStory",
  "story-edit": "usage.purposeStoryEdit",
  resolve: "usage.purposeResolve",
  mod: "usage.purposeMod",
  tweak: "usage.purposeTweak",
  work: "usage.purposeWork",
  image: "usage.purposeImage",
  rumor: "rumors.usagePurpose",
};

const OUTCOME_LABEL: Record<UsageOutcome, StringKey> = {
  done: "usage.outcomeDone",
  failed: "usage.outcomeFailed",
  aborted: "usage.outcomeAborted",
};

const seconds = (ms: number): string => formatNumber(Math.round(ms / 100) / 10);

function totalsLine(totals: UsageTotals): Record<string, string | number> {
  return {
    calls: totals.calls,
    input: formatNumber(totals.input),
    output: formatNumber(totals.output),
    cached: formatNumber(totals.cached),
  };
}

/** One line: the world's (or the draft's) total so far; opens the breakdown when given `onOpen`. */
export function UsageLine({
  scope,
  draft = false,
  onOpen,
}: {
  scope: UsageScope | null;
  draft?: boolean;
  onOpen?: () => void;
}): JSX.Element | null {
  const summary = useUsageSummary(scope);
  const t = useT();
  if (scope === null) return null;
  return (
    <StatePanel state={summary} loadingText={t("usage.loading")}>
      {(value) => (
        <div
          data-usage-line=""
          style={{ display: "flex", alignItems: "center", gap: space.sm, flexWrap: "wrap" }}
        >
          <Text variant="caption" tone="muted" mono>
            {value.calls === 0
              ? t(draft ? "usage.draftNone" : "usage.none")
              : t(draft ? "usage.draftLine" : "usage.worldLine", totalsLine(value))}
          </Text>
          {onOpen === undefined ? null : (
            <Button variant="ghost" onClick={onOpen}>
              {t("usage.open")}
            </Button>
          )}
        </div>
      )}
    </StatePanel>
  );
}

function RecentCall({ record }: { record: UsageRecord }): JSX.Element {
  const t = useT();
  const tokens =
    record.input === null && record.output === null
      ? t("usage.tokensUnknown")
      : t("usage.tokens", {
          input: formatNumber(record.input ?? 0),
          output: formatNumber(record.output ?? 0),
        });
  return (
    <Text variant="caption" tone={record.outcome === "done" ? "muted" : "dim"} mono>
      {t("usage.recentLine", {
        when: formatTime(record.at),
        purpose: t(PURPOSE_LABEL[record.purpose]),
        model: record.model,
        tokens,
        s: seconds(record.ms),
        outcome: t(OUTCOME_LABEL[record.outcome]),
      })}
    </Text>
  );
}

const cell = { padding: `2px ${space.sm}px`, textAlign: "right" as const };

/** The breakdown: totals per purpose, then the latest calls. */
export function UsageDetails({
  scope,
  onClose,
}: {
  scope: UsageScope;
  onClose: () => void;
}): JSX.Element {
  const summary = useUsageSummary(scope);
  const t = useT();
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: space.xl,
        background: colors.bgOverlay,
        zIndex: zIndex.overlay,
        pointerEvents: "auto",
      }}
    >
      <Surface variant="card" padding="lg" style={{ maxWidth: 640, width: "100%", gap: space.md }}>
        <Text variant="title" as="h2">
          {t("usage.title")}
        </Text>
        <StatePanel state={summary} loadingText={t("usage.loading")}>
          {(value) => (
            <div style={{ display: "flex", flexDirection: "column", gap: space.md }}>
              <Text variant="body" mono>
                {value.calls === 0 ? t("usage.none") : t("usage.worldLine", totalsLine(value))}
              </Text>
              {value.unreported === 0 ? null : (
                <Text variant="caption" tone="dim">
                  {t("usage.unreported", { n: value.unreported })}
                </Text>
              )}
              {value.skipped === 0 ? null : (
                <Text variant="caption" tone="danger">
                  {t("usage.skipped", { n: value.skipped })}
                </Text>
              )}
              {value.calls === 0 ? null : (
                <>
                  <Text variant="label" tone="accent">
                    {t("usage.byPurpose")}
                  </Text>
                  <table style={{ borderCollapse: "collapse", color: colors.text }}>
                    <thead>
                      <tr>
                        {(
                          [
                            "usage.colPurpose",
                            "usage.colCalls",
                            "usage.colInput",
                            "usage.colOutput",
                            "usage.colCached",
                            "usage.colTime",
                          ] as const
                        ).map((key, at) => (
                          <th key={key} style={at === 0 ? { ...cell, textAlign: "left" } : cell}>
                            <Text variant="caption" tone="dim">
                              {t(key)}
                            </Text>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(value.byPurpose).map(([purpose, totals]) => (
                        <tr key={purpose} data-usage-purpose={purpose}>
                          <td style={{ ...cell, textAlign: "left" }}>
                            <Text variant="caption">
                              {t(PURPOSE_LABEL[purpose as UsagePurpose])}
                            </Text>
                          </td>
                          {[
                            formatNumber(totals.calls),
                            formatNumber(totals.input),
                            formatNumber(totals.output),
                            formatNumber(totals.cached),
                            t("usage.seconds", { s: seconds(totals.ms) }),
                          ].map((text, at) => (
                            // biome-ignore lint/suspicious/noArrayIndexKey: fixed columns, in order
                            <td key={`${purpose}-${at}`} style={cell}>
                              <Text variant="caption" mono>
                                {text}
                              </Text>
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <Text variant="label" tone="accent">
                    {t("usage.recent")}
                  </Text>
                  <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                    {value.recent.map((record) => (
                      <RecentCall key={`${record.at}-${record.purpose}`} record={record} />
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
        </StatePanel>
        <Button variant="secondary" onClick={onClose}>
          {t("usage.close")}
        </Button>
      </Surface>
    </div>
  );
}

/** The HUD's line with the breakdown behind it. */
export function WorldUsage({ scope }: { scope: UsageScope | null }): JSX.Element | null {
  const [open, setOpen] = useState(false);
  if (scope === null) return null;
  return (
    <>
      <UsageLine scope={scope} onOpen={() => setOpen(true)} />
      {open ? <UsageDetails scope={scope} onClose={() => setOpen(false)} /> : null}
    </>
  );
}
