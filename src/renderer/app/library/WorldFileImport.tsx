// Join a world → 從 .world 檔加入 (rev 6 phase 4, D5): a `.world` a friend sent is checked offline
// first (main's report, never a bare yes or no, Rule 2), then brought onto this device as a world
// the player can open. The report says whether the world was ever shared, never where.

import { errorLine, formatDateTime, formatNumber, translate, useT } from "@renderer/i18n";
import { playerName, setPlayerName } from "@renderer/net/room";
import { useSessionStore } from "@renderer/state";
import { Button, ErrorBlock, Surface, space, Text, TextField } from "@renderer/ui";
import type { BundleImported, BundleInspected, WorldBundleReport } from "@shared/worldBundle";
import { type JSX, useState } from "react";
import { useAction } from "../land/worldDoor";
import { openInstance } from "../useInstanceLoader";

const column = { display: "flex", flexDirection: "column", gap: space.xs } as const;

/** What a `.world` holds and how it verified, from main's report. */
function ReportCard({ report }: { report: WorldBundleReport }): JSX.Element {
  const t = useT();
  return (
    <Surface variant="inset" padding="md" style={column}>
      <Text variant="title" as="h3">
        {report.name ?? report.worldId ?? "—"}
      </Text>
      <Text variant="caption" tone="muted">
        {t("bundle.reportEntries", { entries: formatNumber(report.entries) })}
      </Text>
      <Text variant="caption" tone="muted">
        {t("bundle.reportOwners", {
          owners: report.owners.length,
          authors: report.authors.length,
        })}
      </Text>
      <Text variant="caption" tone="dim">
        {report.services.length === 0 ? t("bundle.reportLocal") : t("bundle.reportShared")}
      </Text>
      {report.exportedAt === null ? null : (
        <Text variant="caption" tone="dim">
          {t("bundle.reportSigned", { at: formatDateTime(report.exportedAt) })}
        </Text>
      )}
      {report.newer > 0 ? (
        <Text variant="caption" tone="dim">
          {t("bundle.reportNewer", { n: report.newer })}
        </Text>
      ) : null}
      {report.problems.length === 0 ? (
        <Text variant="caption" tone="success">
          {t("bundle.reportOk")}
        </Text>
      ) : (
        <div style={column}>
          <Text variant="caption" tone="danger">
            {t("bundle.reportProblems", { n: report.problems.length })}
          </Text>
          {report.problems.slice(0, 12).map((problem) => (
            <Text
              key={`${problem.check}:${problem.code}:${problem.n ?? ""}:${problem.path ?? ""}:${problem.message}`}
              variant="caption"
              tone="danger"
            >
              {t("bundle.problemLine", { check: problem.check, text: errorLine(problem) })}
            </Text>
          ))}
        </div>
      )}
    </Surface>
  );
}

export function WorldFileImport({ refresh }: { refresh(): Promise<void> }): JSX.Element {
  const t = useT();
  const inspect = useAction<BundleInspected | null>();
  const bring = useAction<BundleImported>();
  const [name, setName] = useState(playerName);
  const inspected = inspect.state.status === "ready" ? inspect.state.value : null;
  const trimmed = name.trim();

  const bringIn = (file: BundleInspected): void => {
    void bring
      .run(() => window.seed.bundle.import(file.token, trimmed))
      .then((result) => {
        if (result === null || !result.ok) return;
        setPlayerName(trimmed);
        const key =
          result.value.adoptedFrom === null ? "bundle.imported" : "bundle.importedAdopted";
        const title = file.report.name ?? "";
        useSessionStore.getState().toast("success", translate(key, { name: title }));
        const { instanceId } = result.value;
        void refresh().then(() => openInstance(instanceId));
      });
  };

  return (
    <div style={column}>
      <Text variant="label" tone="muted">
        {t("bundle.importHeading")}
      </Text>
      <Text variant="caption" tone="dim">
        {t("bundle.importIntro")}
      </Text>
      <div className="row-actions">
        <Button
          variant="secondary"
          disabled={inspect.state.status === "loading" || bring.state.status === "loading"}
          onClick={() => {
            bring.clear();
            void inspect.run(() => window.seed.bundle.inspect());
          }}
        >
          {t("bundle.choose")}
        </Button>
      </div>
      {inspect.state.status === "loading" ? (
        <Text variant="caption" tone="muted">
          {t("bundle.checking")}
        </Text>
      ) : inspect.state.status === "error" ? (
        <ErrorBlock error={inspect.state.error} />
      ) : null}
      {inspected === null ? null : (
        <div style={{ ...column, gap: space.sm }}>
          <Text variant="caption" tone="dim" mono>
            {inspected.fileName}
          </Text>
          <ReportCard report={inspected.report} />
          {inspected.report.problems.length > 0 ? null : (
            <>
              <TextField
                label={t("bundle.playerName")}
                maxLength={60}
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
              <div className="row-actions">
                <Button
                  variant="primary"
                  disabled={trimmed === "" || bring.state.status === "loading"}
                  onClick={() => bringIn(inspected)}
                >
                  {t("bundle.importGo")}
                </Button>
              </div>
            </>
          )}
          {bring.state.status === "loading" ? (
            <Text variant="caption" tone="muted">
              {t("bundle.importing")}
            </Text>
          ) : bring.state.status === "error" ? (
            <ErrorBlock error={bring.state.error} />
          ) : null}
        </div>
      )}
    </div>
  );
}
