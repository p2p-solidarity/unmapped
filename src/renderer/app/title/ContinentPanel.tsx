// Worlds → Continent: choose which saved world to bring, then open its door to friends or enter a
// friend's door number (or their save's ENS name, followed back to its door) and walk through. The
// selected save is opened before the continent opens, so it keeps its own land and progress.

import { errorLine, useT } from "@renderer/i18n";
import { plateOf } from "@renderer/net/codes";
import { joinContinentByCode, openMyDoor } from "@renderer/net/continentActions";
import { useSessionStore } from "@renderer/state";
import { Button, StatePanel, Text, TextField } from "@renderer/ui";
import type { Result } from "@shared/result";
import { type JSX, useRef, useState } from "react";
import { useFriendDoor } from "../land/useFriendDoor";
import { AUTOFOCUS, useArrowFocus } from "../library/focus";
import type { SectionProps } from "../library/sections";
import { useKeys } from "../shell/useKeys";
import { openInstance } from "../useInstanceLoader";
import { ContinentSaveName } from "./ContinentSaveName";

export function ContinentPanel({ data, onClose }: SectionProps): JSX.Element {
  const t = useT();
  const [instanceId, setInstanceId] = useState("");
  const door = useFriendDoor();
  const [busy, setBusy] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const working = busy || door.resolving !== null;

  useKeys({ Escape: () => (working ? undefined : onClose()) });
  useArrowFocus(listRef);

  /** Opens the chosen world, then (only if it really is the world in play) acts on its continent. */
  const bring = async (act: () => Result<string>): Promise<void> => {
    if (busy || instanceId === "") return;
    setBusy(true);
    await openInstance(instanceId);
    const session = useSessionStore.getState();
    if (
      session.screen === "play" &&
      session.activeInstance?.instance.meta.instanceId === instanceId
    ) {
      const done = act();
      if (!done.ok) session.toast("danger", errorLine(done.error));
    }
    setBusy(false);
  };

  /** A door number as typed, or the one a save's ENS name carries. */
  const walkThrough = async (): Promise<void> => {
    if (working || instanceId === "") return;
    const code = await door.resolve("walk");
    if (code !== null) await bring(() => joinContinentByCode(code));
  };

  return (
    <>
      <h2 className="g-heading">{t("library.sectionContinent")}</h2>
      <Text tone="muted">{t("library.continentIntro")}</Text>
      <StatePanel state={data} loadingText={t("library.readingSaves")}>
        {(library) =>
          library.instances.length === 0 ? (
            <Text tone="dim">{t("library.continentNoWorld")}</Text>
          ) : (
            <div className="carts g-scroll" ref={listRef}>
              {library.instances.map((instance, index) => (
                <Button
                  key={instance.instanceId}
                  className={index === 0 ? AUTOFOCUS : undefined}
                  variant="tile"
                  active={instanceId === instance.instanceId}
                  disabled={working}
                  onClick={() => setInstanceId(instance.instanceId)}
                >
                  {instance.name}
                </Button>
              ))}
            </div>
          )
        }
      </StatePanel>
      {instanceId === "" ? (
        <Text variant="caption" tone="dim">
          {t("library.continentPickWorld")}
        </Text>
      ) : (
        <>
          <Text variant="caption" tone="muted">
            {t("continent.yourPlate", { code: plateOf(instanceId) })}
          </Text>
          <ContinentSaveName instanceId={instanceId} />
          <div className="row-actions">
            <Button variant="secondary" disabled={working} onClick={() => void bring(openMyDoor)}>
              {t("continent.openDoor")}
            </Button>
          </div>
        </>
      )}
      <TextField
        label={t("land.friendDoorOrName")}
        value={door.value}
        maxLength={door.maxLength}
        mono
        spellCheck={false}
        autoCapitalize="none"
        autoCorrect="off"
        onChange={door.onChange}
      />
      {door.error === null ? null : (
        <Text variant="caption" tone="danger">
          {errorLine(door.error)}
        </Text>
      )}
      <div className="row-actions">
        <Button
          variant="primary"
          disabled={working || instanceId === "" || door.input === null}
          onClick={() => void walkThrough()}
        >
          {door.resolving === null ? t("continent.walkThrough") : t("continent.resolvingName")}
        </Button>
      </div>
    </>
  );
}
