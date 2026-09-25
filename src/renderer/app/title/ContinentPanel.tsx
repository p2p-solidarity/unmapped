// Worlds → Continent: choose which saved world to bring, then open its door to friends or enter a
// friend's door number and walk through. The selected save is opened before the continent opens,
// so it keeps its own land and progress.

import { errorLine, useT } from "@renderer/i18n";
import { normalizeRoomCode, plateOf, ROOM_CODE_LENGTH } from "@renderer/net/codes";
import { joinContinentByCode, openMyDoor } from "@renderer/net/continentActions";
import { useSessionStore } from "@renderer/state";
import { Button, StatePanel, Text, TextField } from "@renderer/ui";
import type { Result } from "@shared/result";
import { type JSX, useRef, useState } from "react";
import { AUTOFOCUS, useArrowFocus } from "../library/focus";
import type { SectionProps } from "../library/sections";
import { useKeys } from "../shell/useKeys";
import { openInstance } from "../useInstanceLoader";

export function ContinentPanel({ data, onClose }: SectionProps): JSX.Element {
  const t = useT();
  const [instanceId, setInstanceId] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  useKeys({ Escape: () => (busy ? undefined : onClose()) });
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

  const codeReady = code.length === ROOM_CODE_LENGTH;

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
                  disabled={busy}
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
          <div className="row-actions">
            <Button variant="secondary" disabled={busy} onClick={() => void bring(openMyDoor)}>
              {t("continent.openDoor")}
            </Button>
          </div>
        </>
      )}
      <TextField
        label={t("land.friendDoorCode")}
        value={code}
        maxLength={ROOM_CODE_LENGTH}
        mono
        onChange={(event) => setCode(normalizeRoomCode(event.target.value))}
      />
      <div className="row-actions">
        <Button
          variant="primary"
          disabled={busy || instanceId === "" || !codeReady}
          onClick={() => void bring(() => joinContinentByCode(code))}
        >
          {t("continent.walkThrough")}
        </Button>
      </div>
    </>
  );
}
