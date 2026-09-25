// The place maker's otherworld (異界) choice: put the entrance of one of this device's published AI
// worlds on the land — no model call — or write a new one in the workshop opened over the land.
// Everything listed comes from main (`works.list`); a device with none says so.

import { errorLine, useT } from "@renderer/i18n";
import { useSessionStore } from "@renderer/state";
import { Button, StatePanel, Surface, space, Text } from "@renderer/ui";
import { titleOf } from "@renderer/works/WorksScreen";
import type { OtherworldPlace } from "@shared/places";
import { errored, fromResult, idle, type Loadable, loading } from "@shared/result";
import type { WorkManifest } from "@shared/works";
import { type JSX, useEffect, useState } from "react";
import { checkpointCurrentInstance } from "../usePersistWorld";
import { writeOtherworld } from "./OtherworldState";
import { placeOtherworld } from "./places";

export function OtherworldPicker({ wish }: { wish: string }): JSX.Element {
  const t = useT();
  const [works, setWorks] = useState<Loadable<WorkManifest[]>>(loading());
  const [writing, setWriting] = useState<Loadable<true>>(idle());
  const [placed, setPlaced] = useState<Loadable<OtherworldPlace>>(idle());

  useEffect(() => {
    let live = true;
    void window.seed.works.list().then((result) => {
      if (live) setWorks(fromResult(result));
    });
    return () => {
      live = false;
    };
  }, []);

  const place = (work: WorkManifest): void => {
    setPlaced(fromResult(placeOtherworld(work, wish)));
  };

  const write = async (): Promise<void> => {
    const words = wish.trim();
    if (words === "") return;
    setWriting(loading());
    const opened = await writeOtherworld(words, titleOf(words), words);
    setWriting(opened.ok ? idle() : errored(opened.error));
  };

  const library = (): void => {
    void checkpointCurrentInstance().then((saved) => {
      const session = useSessionStore.getState();
      if (!saved.ok) {
        session.toast("danger", errorLine(saved.error));
        return;
      }
      session.closeTweak();
      session.setScreen("works");
    });
  };

  return (
    <>
      <Surface variant="inset" padding="md" style={{ gap: space.sm }}>
        <Text variant="label">{t("works.otherworldSaved")}</Text>
        <Text variant="caption" tone="muted">
          {t("works.otherworldFree")}
        </Text>
        <StatePanel state={works} loadingText={t("works.readingWorlds")}>
          {(list) =>
            list.length === 0 ? (
              <Text variant="body" tone="dim">
                {t("works.otherworldNone")}
              </Text>
            ) : (
              list.map((work) => (
                <div
                  key={work.contentHash}
                  style={{ display: "flex", alignItems: "center", gap: space.sm }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <Text variant="body">
                      {work.title}{" "}
                      <Text variant="caption" tone="muted">
                        v{work.version}
                      </Text>
                    </Text>
                    <Text variant="caption" tone="dim">
                      {work.description || t("works.noSummary")}
                    </Text>
                  </div>
                  <Button variant="secondary" onClick={() => place(work)}>
                    {t("works.otherworldPlace")}
                  </Button>
                </div>
              ))
            )
          }
        </StatePanel>
        <StatePanel state={placed} idleText="">
          {(entrance) => (
            <Text variant="caption" tone="accent">
              {entrance.title} · {t("hud.placeMade", { cx: entrance.cx, cz: entrance.cz })}
            </Text>
          )}
        </StatePanel>
      </Surface>
      <Surface variant="inset" padding="md" style={{ gap: space.sm }}>
        <Text variant="caption" tone="muted">
          {t("works.otherworldWriteNote")}
        </Text>
        {writing.status === "error" ? <StatePanel state={writing}>{() => null}</StatePanel> : null}
        <div style={{ display: "flex", gap: space.sm, flexWrap: "wrap" }}>
          <Button
            variant="primary"
            disabled={wish.trim() === "" || writing.status === "loading"}
            onClick={() => void write()}
          >
            {t("works.otherworldWrite")}
          </Button>
          <Button variant="ghost" onClick={library}>
            {t("works.otherworldLibrary")}
          </Button>
        </div>
      </Surface>
    </>
  );
}
