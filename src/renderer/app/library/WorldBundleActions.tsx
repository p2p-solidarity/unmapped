// Worlds → World files (rev 6 phase 4, D5): the `.world` side of the library. Every world whose
// history this device holds can be exported as a signed `.world` (main writes it where the player
// chooses); an owner can move an attached world to a service that already holds its log (a mirror
// imported from the file) and gets the move link its members follow; and a `.world` can be checked
// offline, its report read, and brought onto this device as a save. Nothing is shown that main did
// not read (Rule 2): the list, the report and every outcome are Loadables.

import { errorLine, formatDateTime, formatNumber, translate, useT } from "@renderer/i18n";
import { playerName, setPlayerName } from "@renderer/net/room";
import { serviceLabel, worldServices } from "@renderer/net/worldServices";
import { useSessionStore } from "@renderer/state";
import { Button, ErrorBlock, StatePanel, Surface, space, Text, TextField } from "@renderer/ui";
import { isServiceUrl } from "@shared/history/bodies";
import { fromResult, type Loadable, loading, ok } from "@shared/result";
import {
  type BundleExported,
  type BundleImported,
  type BundleInspected,
  type BundleWorld,
  moveLink,
  type WorldBundleReport,
} from "@shared/worldBundle";
import { type JSX, useCallback, useEffect, useMemo, useState } from "react";
import { shortKey, useAction } from "../land/worldDoor";
import { useKeys } from "../shell/useKeys";
import { openInstance } from "../useInstanceLoader";
import { AUTOFOCUS } from "./focus";
import type { SectionProps } from "./sections";

const column = { display: "flex", flexDirection: "column", gap: space.xs } as const;
const row = { display: "flex", flexWrap: "wrap", gap: space.xs, alignItems: "center" } as const;

function MoveBlock({ world, onMoved }: { world: BundleWorld; onMoved(): void }): JSX.Element {
  const t = useT();
  const services = useMemo(() => worldServices().filter((url) => url !== world.url), [world.url]);
  const [address, setAddress] = useState("");
  const move = useAction<{ url: string }>();
  const run = (url: string): void => {
    void move
      .run(async () => {
        const done = await window.seed.world.attach(world.worldId, url);
        return done.ok ? ok({ url }) : done;
      })
      .then((result) => {
        // The row re-reads where the world lives now; this block (and its move link) stays open.
        if (result?.ok) onMoved();
      });
  };
  const typed = address.trim();
  return (
    <div style={column}>
      <Text variant="label" tone="muted">
        {t("bundle.moveHeading")}
      </Text>
      <Text variant="caption" tone="dim">
        {t("bundle.moveIntro")}
      </Text>
      <div style={row}>
        {services.map((url) => (
          <Button
            key={url}
            variant="secondary"
            disabled={move.state.status === "loading"}
            onClick={() => run(url)}
          >
            {t("bundle.moveTo", { service: serviceLabel(url) })}
          </Button>
        ))}
      </div>
      <TextField
        label={t("bundle.moveAddress")}
        mono
        spellCheck={false}
        value={address}
        onChange={(event) => setAddress(event.target.value)}
      />
      <div style={row}>
        <Button
          variant="secondary"
          disabled={!isServiceUrl(typed) || move.state.status === "loading"}
          onClick={() => run(typed)}
        >
          {t("bundle.moveGo")}
        </Button>
      </div>
      {move.state.status === "loading" ? (
        <Text variant="caption" tone="muted">
          {t("bundle.moving")}
        </Text>
      ) : move.state.status === "error" ? (
        <ErrorBlock error={move.state.error} />
      ) : move.state.status === "ready" ? (
        <div style={column}>
          <Text variant="caption" tone="success">
            {t("bundle.moved", { service: serviceLabel(move.state.value.url) })}
          </Text>
          <TextField
            label={t("bundle.moveLink")}
            mono
            readOnly
            value={moveLink(world.worldId, move.state.value.url)}
          />
        </div>
      ) : null}
    </div>
  );
}

function WorldRow({ world, onMoved }: { world: BundleWorld; onMoved(): void }): JSX.Element {
  const t = useT();
  const exported = useAction<BundleExported | null>();
  const [moving, setMoving] = useState(false);
  const where =
    world.url === null
      ? t("bundle.rowLocal", { entries: formatNumber(world.head) })
      : t("bundle.rowShared", {
          entries: formatNumber(world.head),
          service: serviceLabel(world.url),
        });
  return (
    <Surface variant="inset" padding="md" style={column}>
      <Text variant="title" as="h3">
        {world.name}
      </Text>
      <Text variant="caption" tone="muted">
        {where}
      </Text>
      {world.owner ? (
        <Text variant="caption" tone="accent">
          {t("bundle.rowOwner")}
        </Text>
      ) : null}
      <div style={row}>
        <Button
          variant="secondary"
          disabled={exported.state.status === "loading"}
          onClick={() => void exported.run(() => window.seed.bundle.export(world.worldId))}
        >
          {t("bundle.export")}
        </Button>
        {world.owner && world.attached ? (
          <Button variant="ghost" onClick={() => setMoving(!moving)}>
            {t("bundle.moveHeading")}
          </Button>
        ) : null}
      </div>
      {exported.state.status === "loading" ? (
        <Text variant="caption" tone="muted">
          {t("bundle.exporting")}
        </Text>
      ) : exported.state.status === "error" ? (
        <ErrorBlock error={exported.state.error} />
      ) : exported.state.status === "ready" && exported.state.value !== null ? (
        <Text variant="caption" tone="success">
          {t("bundle.exported", {
            file: exported.state.value.fileName,
            size: formatNumber(Math.ceil(exported.state.value.bytes / 1024)),
          })}
        </Text>
      ) : null}
      {moving ? <MoveBlock world={world} onMoved={onMoved} /> : null}
    </Surface>
  );
}

/** What a `.world` holds and how it verified, from main's report (never a bare yes or no). */
export function ReportCard({ report }: { report: WorldBundleReport }): JSX.Element {
  const t = useT();
  const services = report.services.map((one) => serviceLabel(one.url)).join(", ");
  return (
    <Surface variant="inset" padding="md" style={column}>
      <Text variant="title" as="h3">
        {report.name ?? report.worldId ?? "—"}
      </Text>
      <Text variant="caption" tone="muted">
        {t("bundle.reportEntries", {
          entries: formatNumber(report.entries),
          head: formatNumber(report.head?.n ?? 0),
          physics: report.physicsVersion ?? "?",
        })}
      </Text>
      <Text variant="caption" tone="muted">
        {t("bundle.reportOwners", {
          owners: report.owners.length,
          authors: report.authors.length,
          beats: report.beats.total,
          works: report.works,
        })}
      </Text>
      <Text variant="caption" tone="dim">
        {services === "" ? t("bundle.reportLocal") : t("bundle.reportServices", { services })}
      </Text>
      {report.exportedAt === null || report.exportedBy === null ? null : (
        <Text variant="caption" tone="dim">
          {t("bundle.reportSigned", {
            at: formatDateTime(report.exportedAt),
            key: shortKey(report.exportedBy),
          })}
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

function ImportBlock({ refresh }: { refresh(): Promise<void> }): JSX.Element {
  const t = useT();
  const inspect = useAction<BundleInspected | null>();
  const bring = useAction<BundleImported>();
  const [name, setName] = useState(playerName);
  const inspected = inspect.state.status === "ready" ? inspect.state.value : null;
  const trimmed = name.trim();
  return (
    <div style={column}>
      <Text variant="label" tone="muted">
        {t("bundle.importHeading")}
      </Text>
      <Text variant="caption" tone="dim">
        {t("bundle.importIntro")}
      </Text>
      <div style={row}>
        <Button
          className={AUTOFOCUS}
          variant={inspected === null ? "primary" : "secondary"}
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
              <div style={row}>
                <Button
                  variant="primary"
                  disabled={trimmed === "" || bring.state.status === "loading"}
                  onClick={() => {
                    void bring
                      .run(() => window.seed.bundle.import(inspected.token, trimmed))
                      .then((result) => {
                        if (result === null || !result.ok) return;
                        setPlayerName(trimmed);
                        const title = inspected.report.name ?? "";
                        const key =
                          result.value.adoptedFrom === null
                            ? "bundle.imported"
                            : "bundle.importedAdopted";
                        useSessionStore
                          .getState()
                          .toast("success", translate(key, { name: title }));
                        void refresh().then(() => openInstance(result.value.instanceId));
                      });
                  }}
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

export function WorldBundleActions({ refresh, onClose }: SectionProps): JSX.Element {
  const t = useT();
  const [worlds, setWorlds] = useState<Loadable<BundleWorld[]>>(loading());
  // Re-read in place (no loading state between), so rows stay mounted: a row that just moved shows
  // its new service and keeps its open move block with the link to send.
  const load = useCallback(async () => {
    setWorlds(fromResult(await window.seed.bundle.list()));
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  useKeys({ Escape: onClose });
  return (
    <>
      <h2 className="g-heading">{t("bundle.section")}</h2>
      <Text variant="caption" tone="dim">
        {t("bundle.intro")}
      </Text>
      <ImportBlock refresh={refresh} />
      <Text variant="label" tone="muted">
        {t("bundle.listHeading")}
      </Text>
      <StatePanel state={worlds} loadingText={t("bundle.reading")}>
        {(list) =>
          list.length === 0 ? (
            <Text variant="caption" tone="dim">
              {t("bundle.none")}
            </Text>
          ) : (
            <div style={{ ...column, gap: space.sm }}>
              {list.map((world) => (
                <WorldRow key={world.worldId} world={world} onMoved={() => void load()} />
              ))}
            </div>
          )
        }
      </StatePanel>
    </>
  );
}
