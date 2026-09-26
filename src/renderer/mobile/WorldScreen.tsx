// One joined world on the phone (rev 6 phase 4, D7). Its fold is read once here and shared: the
// land fills the screen (./LandScreen), and the world — its link, notes and lists, the note
// composer, the other worlds on this browser — opens over it as a layer from a thumb button or the
// pad's Y (the land's notes key), and closes with Back to the land or B. While the world is open the
// land takes no input. When this browser cannot draw the land (no pack yet, a bounded world, a pack
// that does not match), the world is a plain page again, with the reason and its hint (Rule 2).

import { useT } from "@renderer/i18n";
import { useEngineStore, useSessionStore } from "@renderer/state";
import {
  Button,
  colors,
  ErrorBlock,
  HIT_TARGET,
  StatePanel,
  Surface,
  space,
  Text,
  zIndex,
} from "@renderer/ui";
import type { WorldBadge } from "@shared/worldApi";
import { type JSX, useEffect } from "react";
import { LandScreen } from "./LandScreen";
import type { PhoneDevice } from "./phoneDevice";
import { THUMB_SPOT, TOUCH_PAD_HEIGHT, TouchPad } from "./TouchPad";
import { usePhoneLand } from "./usePhoneLand";
import { useSharedWorld } from "./useSharedWorld";
import { WorldPanel } from "./WorldPanel";

interface WorldsProps {
  list: WorldBadge[];
  worldId: string;
  onOpen: (worldId: string) => void;
  onJoinAnother: () => void;
}

function Switcher({ list, worldId, onOpen }: WorldsProps): JSX.Element | null {
  const t = useT();
  if (list.length < 2) return null;
  return (
    <div style={{ display: "grid", gap: space.xs }}>
      <Text variant="caption" tone="dim">
        {t("mobile.worldsTitle")}
      </Text>
      <div style={{ display: "flex", flexWrap: "wrap", gap: space.sm }}>
        {list.map((badge) => (
          <Button
            key={badge.worldId}
            variant="chip"
            active={badge.worldId === worldId}
            onClick={() => onOpen(badge.worldId)}
          >
            {badge.ownerName ?? badge.worldId.slice(0, 9)}
          </Button>
        ))}
      </div>
    </div>
  );
}

const column = {
  maxWidth: 560,
  margin: "0 auto",
  display: "grid",
  gap: space.md,
} as const;

const closeWorld = (): void => useSessionStore.getState().toggleNotes(false);

/** The world over its land: a layer (focus stays in it, B closes it), the land locked beneath. */
function WorldLayer({ children }: { children: JSX.Element }): JSX.Element {
  const t = useT();
  useEffect(() => {
    useEngineStore.getState().setInputLocked(true);
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === "Escape") closeWorld();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      useEngineStore.getState().setInputLocked(false);
    };
  }, []);
  return (
    <div
      data-layer
      role="dialog"
      aria-modal="true"
      aria-label={t("mobile.openWorld")}
      className="mobile-shell"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: zIndex.hud,
        background: colors.bg,
        padding: space.lg,
        paddingBottom: TOUCH_PAD_HEIGHT + HIT_TARGET + space.xl,
      }}
    >
      <div style={column}>{children}</div>
      <div style={THUMB_SPOT}>
        <Button variant="primary" hotkey="Escape" onClick={closeWorld}>
          {t("mobile.backToLand")}
        </Button>
      </div>
    </div>
  );
}

export function WorldScreen({
  device,
  ...worlds
}: WorldsProps & { device: PhoneDevice }): JSX.Element {
  const t = useT();
  const { worldId, onJoinAnother } = worlds;
  const view = useSharedWorld(worldId);
  const land = usePhoneLand(device, worldId, view);
  const open = useSessionStore((state) => state.notesOpen);

  const contents = (
    <>
      <Switcher {...worlds} />
      <WorldPanel worldId={worldId} state={view} />
      <Button variant="secondary" fullWidth onClick={onJoinAnother}>
        {t("mobile.joinAnother")}
      </Button>
    </>
  );

  if (land.status === "ready" && view.status === "ready") {
    return (
      <>
        <LandScreen
          key={land.value.revision.manifest.contentHash}
          worldId={worldId}
          land={land.value}
          view={view.value}
          device={device}
        />
        {open ? (
          <WorldLayer>{contents}</WorldLayer>
        ) : (
          <div style={THUMB_SPOT}>
            <Button
              variant="secondary"
              hotkey="N"
              onClick={() => useSessionStore.getState().toggleNotes(true)}
            >
              {t("mobile.openWorld")}
            </Button>
          </div>
        )}
        <TouchPad buttons={open ? ["a"] : ["y"]} />
      </>
    );
  }

  return (
    <div
      className="mobile-shell"
      style={{ padding: space.lg, paddingBottom: TOUCH_PAD_HEIGHT + space.lg }}
    >
      <div style={column}>
        {land.status === "error" ? (
          <Surface variant="inset" padding="md">
            <Text variant="body" tone="muted">
              {t("mobile.landMissing")}
            </Text>
            <ErrorBlock error={land.error} />
          </Surface>
        ) : (
          <StatePanel state={land} loadingText={t("mobile.landLoading")}>
            {() => null}
          </StatePanel>
        )}
        {contents}
      </div>
      <TouchPad buttons={["a"]} />
    </div>
  );
}
