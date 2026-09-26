// The door's light chain (rev 6 phase 4, D6, app side): the owners' opt-in and the chain's answer.
// An owner (the maker or a co-owner) turns "record this world's beats on chain" on or off — a
// `chain` event, off unless an owner turns it on — after reading plainly that what gets recorded
// is public metadata. Everyone sees whether it is on, and what the chain says about this device's
// copy: it matches at entry n, it differs at n, it is recorded further than this copy has synced,
// or it is not recorded. With no chain set up on this device (`provenance-not-configured`) that is
// one calm line, not an error: the chain can be switched off entirely and the door still works.

import { useT } from "@renderer/i18n";
import { Button, ErrorBlock, space, Text } from "@renderer/ui";
import type { ProvenanceReport } from "@shared/provenance";
import { ok } from "@shared/result";
import type { JSX } from "react";
import { Outcome } from "./DoorOutcome";
import { useAction, useWorldProvenance } from "./worldDoor";

const column = { display: "flex", flexDirection: "column", gap: space.xs } as const;
const row = { display: "flex", flexWrap: "wrap", gap: space.xs, alignItems: "center" } as const;

const NOT_CONFIGURED = "provenance-not-configured";

function Recording({
  world,
  recording,
  pending,
  onChanged,
}: {
  world: string;
  recording: boolean;
  pending: boolean;
  onChanged(): void;
}): JSX.Element {
  const t = useT();
  const set = useAction<{ record: boolean }>();
  const choices = [
    { record: false, label: t("world.chainRecordOff") },
    { record: true, label: t("world.chainRecordOn") },
  ];
  return (
    <>
      <div style={row}>
        {choices.map(({ record, label }) => (
          <Button
            key={label}
            variant="chip"
            active={recording === record}
            disabled={recording === record || set.state.status === "loading"}
            onClick={() => {
              void set
                .run(async () => {
                  const done = await window.seed.world.setChainRecording(world, record);
                  return done.ok ? ok({ record }) : done;
                })
                .then(onChanged);
            }}
          >
            {label}
          </Button>
        ))}
      </div>
      <Text variant="caption" tone="dim">
        {pending ? `${t("world.chainNote")} ${t("world.accessWaiting")}` : t("world.chainNote")}
      </Text>
      <Outcome
        state={set.state}
        busy={t("world.working")}
        done={({ record }) =>
          t("world.chainSet", {
            state: record ? t("world.chainRecordOn") : t("world.chainRecordOff"),
          })
        }
      />
    </>
  );
}

function Verdict({ report }: { report: ProvenanceReport }): JSX.Element {
  const t = useT();
  const { verdict } = report;
  const unverified = report.streams.filter((stream) => stream.trust !== "verified").length;
  const line =
    verdict.status === "matches"
      ? { text: t("world.provenanceMatches", { n: verdict.upTo }), tone: "success" as const }
      : verdict.status === "differs"
        ? { text: t("world.provenanceDiffers", { n: verdict.upTo }), tone: "danger" as const }
        : verdict.status === "not-synced"
          ? { text: t("world.provenanceNotSynced", { n: verdict.upTo }), tone: "muted" as const }
          : { text: t("world.provenanceNotRecorded"), tone: "muted" as const };
  return (
    <>
      <Text variant="caption" tone={line.tone}>
        {line.text}
      </Text>
      {unverified > 0 ? (
        <Text variant="caption" tone="dim">
          {t("world.provenanceUnverified", { n: unverified })}
        </Text>
      ) : null}
    </>
  );
}

function Provenance({ world }: { world: string }): JSX.Element | null {
  const t = useT();
  const { state, check } = useWorldProvenance(world);
  if (state.status === "idle") return null;
  if (state.status === "loading") {
    return (
      <Text variant="caption" tone="muted">
        {t("world.provenanceChecking")}
      </Text>
    );
  }
  if (state.status === "error" && state.error.code === NOT_CONFIGURED) {
    return (
      <Text variant="caption" tone="dim">
        {t("world.provenanceOff")}
      </Text>
    );
  }
  return (
    <>
      {state.status === "error" ? <ErrorBlock error={state.error} /> : null}
      {state.status === "ready" ? <Verdict report={state.value} /> : null}
      <div style={row}>
        <Button variant="ghost" onClick={check}>
          {t("world.provenanceCheck")}
        </Button>
      </div>
    </>
  );
}

export function ChainSection({
  world,
  owner,
  recording,
  pending,
  onChanged,
}: {
  world: string;
  /** This device owns the world (the maker or a co-owner): it may change the opt-in. */
  owner: boolean;
  recording: boolean;
  pending: boolean;
  onChanged(): void;
}): JSX.Element {
  const t = useT();
  return (
    <div style={column}>
      <Text variant="label" tone="muted">
        {t("world.chainHeading")}
      </Text>
      {owner ? (
        <Recording world={world} recording={recording} pending={pending} onChanged={onChanged} />
      ) : (
        <Text variant="caption" tone="dim">
          {recording ? t("world.chainOnMember") : t("world.chainOffMember")}
        </Text>
      )}
      <Provenance world={world} />
    </div>
  );
}
