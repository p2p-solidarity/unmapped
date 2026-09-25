// The compatibility report (plan.md §2.3): what the deterministic compiler made of the selection.
//
// Two things it has to get right. It must be honest — when the engine has no turn scheduler it
// says so and names the modes that asked for one, instead of quietly downgrading the game to
// something the engine can already draw. And it must present several Capability Contexts as what
// they are (plan.md §0.9): one cartridge that plays more than one way, scene by scene — not a
// mistake the player has to undo.

import { type StringKey, type Translate, useT } from "@renderer/i18n";
import { Button, colors, Surface, space, Text } from "@renderer/ui";
import type {
  CapabilityConflict,
  CapabilityContext,
  CapabilityKey,
  CapabilityRequirement,
  CapabilityResolution,
  CapabilityStatus,
  CapabilitySubstitution,
} from "@shared/capabilities";
import { findMode } from "@shared/mode-catalog";
import type { JSX, ReactNode } from "react";

const STATUS_COPY: Record<CapabilityStatus, { label: StringKey; tone: string; note: StringKey }> = {
  ready: { label: "statusReady", tone: colors.success, note: "statusReadyNote" },
  needs_decision: {
    label: "statusNeedsDecision",
    tone: colors.gold,
    note: "statusNeedsDecisionNote",
  },
  needs_plugin: {
    label: "statusNeedsPlugin",
    tone: colors.danger,
    note: "statusNeedsPluginNote",
  },
  conflict: { label: "statusConflict", tone: colors.danger, note: "statusConflictNote" },
};

const CONTEXT_STATUS_COPY: Record<CapabilityStatus, StringKey> = {
  ready: "ctxPlayable",
  needs_decision: "ctxPending",
  needs_plugin: "ctxMissing",
  conflict: "ctxConflict",
};

function modeLabels(t: Translate, ids: readonly string[]): string {
  const labels = ids.map((id) => findMode(id)?.label ?? id);
  return labels.length === 0 ? t("defaults") : labels.join("、");
}

function Row({ children }: { children: ReactNode }): JSX.Element {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 2,
        paddingBottom: 6,
        borderBottom: `1px solid ${colors.surfaceBorder}`,
      }}
    >
      {children}
    </div>
  );
}

/** Accepted `set_capability` decisions, and the way to take one back. */
interface Decisions {
  overrides: Partial<Record<CapabilityKey, string>>;
  onRevoke(key: CapabilityKey): void;
}

function MissingRow({
  requirement,
  decisions,
}: {
  requirement: CapabilityRequirement;
  decisions: Decisions;
}): JSX.Element {
  const t = useT();
  // An accepted decision has no source mode either, but it is not an engine default: say what it
  // is and let the player undo it, or the draft stays blocked with nothing to click.
  const decided =
    requirement.sourceModes.length === 0 &&
    decisions.overrides[requirement.key] === requirement.value;
  return (
    <Row>
      <Text variant="caption" tone="danger" mono>
        {`${requirement.key}: ${requirement.value}`}
      </Text>
      <Text variant="caption" tone="dim">
        {decided
          ? t("decidedButMissing")
          : t("requiredBy", { modes: modeLabels(t, requirement.sourceModes) })}
      </Text>
      {decided ? (
        <Button variant="secondary" onClick={() => decisions.onRevoke(requirement.key)}>
          {t("revokeDecision")}
        </Button>
      ) : null}
    </Row>
  );
}

function ConflictRow({ conflict }: { conflict: CapabilityConflict }): JSX.Element {
  const t = useT();
  return (
    <Row>
      <Text variant="caption" tone="danger" mono>
        {`${conflict.key}: ${conflict.resolutionOptions.join(" / ")}`}
      </Text>
      <Text variant="caption" tone="dim">
        {t("conflictBetween", { modes: modeLabels(t, conflict.modes) })}
      </Text>
    </Row>
  );
}

function ContextCard({
  context,
  index,
  total,
  decisions,
}: {
  context: CapabilityContext;
  index: number;
  total: number;
  decisions: Decisions;
}): JSX.Element {
  const t = useT();
  const tone = STATUS_COPY[context.status].tone;
  const title =
    total === 1
      ? t("contextLabel")
      : t("contextNumbered", { n: index + 1, modes: modeLabels(t, context.sourceModes) });

  return (
    <section
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 6,
        padding: space.sm,
        border: `1px solid ${colors.surfaceBorder}`,
        borderLeft: `3px solid ${tone}`,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: space.sm }}>
        <Text variant="caption" tone="accent">
          {title}
        </Text>
        <Text variant="caption" mono style={{ color: tone }}>
          {t(CONTEXT_STATUS_COPY[context.status])}
        </Text>
      </div>

      {context.missingModules.map((requirement) => (
        <MissingRow
          key={`${requirement.key}:${requirement.value}`}
          requirement={requirement}
          decisions={decisions}
        />
      ))}

      <Text variant="caption" tone="dim" mono>
        {context.selectedModules
          .map((module) => `${module.moduleId}@${module.version}`)
          .join(" · ")}
      </Text>
    </section>
  );
}

export function CapabilityReport({
  resolution,
  applied = [],
  onAccept,
  onAcceptAll,
  overrides,
  onRevoke,
}: {
  resolution: CapabilityResolution;
  /** Substitutions already in force. Shown so a trade is never made behind the player's back. */
  applied?: readonly CapabilitySubstitution[];
  /** Accepts one substitution; the compiler re-runs with that value swapped. */
  onAccept(substitution: CapabilitySubstitution): void;
  onAcceptAll(substitutions: readonly CapabilitySubstitution[]): void;
} & Decisions): JSX.Element {
  const t = useT();
  const status = STATUS_COPY[resolution.status];
  const split = resolution.splitKeys.length > 0;

  return (
    <Surface
      variant="overlay"
      padding="md"
      style={{ gap: space.md, minHeight: 0, overflowY: "auto" }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <Text variant="label" mono style={{ color: status.tone }}>
          {t(status.label)}
        </Text>
        <Text variant="caption" tone="dim">
          {t(status.note)}
        </Text>
      </div>

      {split ? (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 2,
            padding: space.sm,
            background: colors.accentSoft,
            border: `1px solid ${colors.accent}`,
          }}
        >
          <Text variant="caption" tone="accent">
            {t("contextsHeadline", { count: resolution.contexts.length })}
          </Text>
          <Text variant="caption" tone="dim">
            {t("contextsNote", { keys: resolution.splitKeys.join("、") })}
          </Text>
        </div>
      ) : null}

      {applied.length > 0 ? (
        <section style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <Text variant="caption" tone="accent">
            {t("swapped")}
          </Text>
          {applied.map((substitution) => (
            <Row key={substitution.missing}>
              <Text variant="caption" tone="muted" mono>
                {`${substitution.missing} → ${substitution.use}`}
              </Text>
              <Text variant="caption" tone="dim">
                {substitution.note}
              </Text>
            </Row>
          ))}
        </section>
      ) : null}

      {resolution.substitutions.length > 0 ? (
        <section style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: space.sm }}>
            <Text variant="caption" tone="accent">
              {t("availableSwaps")}
            </Text>
            <Button variant="secondary" onClick={() => onAcceptAll(resolution.substitutions)}>
              全部採用
            </Button>
          </div>
          {resolution.substitutions.map((substitution) => (
            <div
              key={substitution.missing}
              style={{ display: "flex", flexDirection: "column", gap: 4, paddingBottom: 6 }}
            >
              <Text variant="caption" tone="muted" mono>
                {`${substitution.missing} → ${substitution.use}`}
              </Text>
              <Text variant="caption" tone="dim">
                {substitution.note}
              </Text>
              <Button variant="secondary" onClick={() => onAccept(substitution)}>
                {t("useThisSwap")}
              </Button>
            </div>
          ))}
        </section>
      ) : null}

      {resolution.conflicts.length > 0 ? (
        <section style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <Text variant="caption" tone="accent">
            {t("globalConflict")}
          </Text>
          {resolution.conflicts.map((conflict) => (
            <ConflictRow key={conflict.key} conflict={conflict} />
          ))}
        </section>
      ) : null}

      <div style={{ display: "flex", flexDirection: "column", gap: space.sm }}>
        {resolution.contexts.map((context, index) => (
          <ContextCard
            key={context.contextId}
            context={context}
            index={index}
            total={resolution.contexts.length}
            decisions={{ overrides, onRevoke }}
          />
        ))}
      </div>

      <section style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <Text variant="caption" tone="accent">
          {t("modulesToMount", { count: resolution.selectedModules.length })}
        </Text>
        {resolution.selectedModules.map((module) => (
          <Row key={`${module.moduleId}@${module.version}`}>
            <Text variant="caption" tone="muted" mono>
              {`${module.moduleId}@${module.version}`}
            </Text>
            <Text variant="caption" tone="dim">
              {module.implementedBy}
            </Text>
          </Row>
        ))}
      </section>
    </Surface>
  );
}
