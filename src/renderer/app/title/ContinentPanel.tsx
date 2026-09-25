// Join a continent from the title: choose which saved world to bring, then enter a friend's door
// number. The selected save is opened before the room joins, so it keeps its own land and progress.

import { errorLine, useT } from "@renderer/i18n";
import { normalizeRoomCode, ROOM_CODE_LENGTH } from "@renderer/net/codes";
import { joinContinentByCode } from "@renderer/net/continentActions";
import { useSessionStore } from "@renderer/state";
import { Button, StatePanel, Text, TextField } from "@renderer/ui";
import type { Loadable } from "@shared/result";
import { useState } from "react";
import { openInstance } from "../useInstanceLoader";
import type { LibraryData } from "./useLibrary";

export function ContinentPanel({ data }: { data: Loadable<LibraryData> }) {
  const t = useT();
  const [instanceId, setInstanceId] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  const join = async (): Promise<void> => {
    if (busy || instanceId === "" || code.length !== ROOM_CODE_LENGTH) return;
    setBusy(true);
    await openInstance(instanceId);
    if (
      useSessionStore.getState().screen === "play" &&
      useSessionStore.getState().activeInstance?.instance.meta.instanceId === instanceId
    ) {
      const joined = joinContinentByCode(code);
      if (!joined.ok) useSessionStore.getState().toast("danger", errorLine(joined.error));
    }
    setBusy(false);
  };

  return (
    <>
      <h2 className="g-heading">{t("title.menuContinent")}</h2>
      <Text tone="muted">{t("title.continentIntro")}</Text>
      <StatePanel state={data} loadingText={t("title.readingCartridges")}>
        {(library) =>
          library.instances.length === 0 ? (
            <Text tone="dim">{t("title.continentNoWorld")}</Text>
          ) : (
            <div className="carts g-scroll">
              {library.instances.map((instance) => (
                <Button
                  key={instance.instanceId}
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
      <TextField
        label={t("land.friendDoorCode")}
        value={code}
        maxLength={ROOM_CODE_LENGTH}
        mono
        onChange={(event) => setCode(normalizeRoomCode(event.target.value))}
      />
      <Button
        variant="primary"
        disabled={busy || instanceId === "" || code.length !== ROOM_CODE_LENGTH}
        onClick={() => void join()}
      >
        {t("continent.walkThrough")}
      </Button>
    </>
  );
}
