// Worlds → Join a world: one field for whatever a friend gave (./joinInput). An ENS name is looked
// up first — a save's name leads to its join code, a world's name offers to play that world; a join
// code brings one of My worlds over to the friend's (./BringLine, ./bring: the world opens first,
// then `joinContinentByCode`); an invite link shows the world and joins it (./InviteJoin); a move
// link follows a world this device holds to where its owner moved it (only when that log extends
// ours). A `.world` file is folded under 更多. One Escape handler: it closes the world picker, then
// puts away what was looked at, then leaves for the title.

import { translate, useT } from "@renderer/i18n";
import { joinContinentByCode } from "@renderer/net/continentActions";
import { useSessionStore } from "@renderer/state";
import { Button, ErrorBlock, StatePanel, space, Text, TextField } from "@renderer/ui";
import { ROOM_CODE_LENGTH } from "@shared/doorCode";
import type { AppError } from "@shared/result";
import type { InvitePreview } from "@shared/worldApi";
import type { WorldMoved } from "@shared/worldBundle";
import { type JSX, useMemo, useState } from "react";
import { useAction } from "../land/worldDoor";
import { useKeys } from "../shell/useKeys";
import { EnsWorldCard } from "../title/CartridgeName";
import { isCancelled } from "../title/useLibrary";
import { BringLine, bringable } from "./BringLine";
import { bringWorld } from "./bring";
import { AUTOFOCUS } from "./focus";
import { InviteJoin } from "./InviteJoin";
import { lookupJoinName, type NameTarget, readJoinInput } from "./joinInput";
import { rowNames, worldList } from "./rows";
import { useSaveEnsNames } from "./saveNames";
import type { SectionProps } from "./sections";
import { playWorld } from "./startWorld";
import { useWorldBadges } from "./WorldBadges";
import { WorldFileImport } from "./WorldFileImport";
import { MoreButton } from "./WorldRow";

const column = { display: "flex", flexDirection: "column", gap: space.sm } as const;

type Working = null | "name" | "opening" | "world";

export function JoinWorld({ data, refresh, onClose }: SectionProps): JSX.Element {
  const t = useT();
  const [text, setText] = useState("");
  const [working, setWorking] = useState<Working>(null);
  const [error, setError] = useState<AppError | null>(null);
  const [named, setNamed] = useState<Extract<NameTarget, { kind: "world" }> | null>(null);
  const [chosenId, setChosenId] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const [more, setMore] = useState(false);
  const look = useAction<InvitePreview>();
  const move = useAction<WorldMoved>();
  const badges = useWorldBadges(data);
  const input = readJoinInput(text);

  const library = data.status === "ready" ? data.value : null;
  const saves = useMemo(
    () => (library === null ? [] : bringable(library.instances, badges)),
    [library, badges],
  );
  const chosen = saves.find((save) => save.instanceId === chosenId) ?? saves[0] ?? null;
  // Which world goes is known only once the worlds and where they live are read; before that a
  // press would start a new land instead of bringing the player's own.
  const known = data.status === "ready" && (badges.status === "ready" || badges.status === "error");
  const ensNames = useSaveEnsNames(chosen === null ? [] : [chosen.instanceId]);
  const names = useMemo(() => {
    const out = new Map<string, string>();
    if (library === null) return out;
    const named = rowNames(worldList(library, null).rows, ensNames, (name, n) =>
      t("library.numbered", { name, n }),
    );
    for (const save of library.instances) {
      out.set(save.instanceId, named.get(`save:${save.instanceId}`) ?? save.name);
    }
    return out;
  }, [library, ensNames, t]);

  const clear = (): void => {
    setError(null);
    setNamed(null);
    look.clear();
    move.clear();
  };
  const looked = look.state.status !== "idle" || named !== null || error !== null;
  useKeys({
    Escape: () => {
      if (picking) setPicking(false);
      else if (looked) clear();
      else if (working === null) onClose();
    },
  });

  /** Brings the chosen world (or a new land) over to the friend behind `code`. */
  const walk = async (code: string): Promise<void> => {
    setWorking("opening");
    const done = await bringWorld(chosen?.instanceId ?? null, () => joinContinentByCode(code));
    setWorking(null);
    if (!done.ok) setError(done.error);
  };

  const go = async (): Promise<void> => {
    if (input === null || working !== null) return;
    if ((input.kind === "code" || input.kind === "name") && !known) return;
    clear();
    if (input.kind === "code") return walk(input.code);
    if (input.kind === "invite") {
      await look.run(() => window.seed.world.preview(input.link));
      return;
    }
    if (input.kind === "move") {
      const result = await move.run(() => window.seed.bundle.move(input.link));
      if (result?.ok) void refresh();
      return;
    }
    setWorking("name");
    const target = await lookupJoinName(input.name);
    setWorking(null);
    if (!target.ok) return setError(target.error);
    if (target.value.kind === "code") return walk(target.value.code);
    setNamed(target.value);
  };

  const playNamed = (manifest: Parameters<typeof playWorld>[0]): void => {
    setWorking("world");
    void playWorld(manifest).then((result) => {
      setWorking(null);
      if (!result.ok) setError(result.error);
    });
  };

  const importNamed = (): void => {
    setWorking("world");
    void window.seed.cartridges.importPack().then(async (result) => {
      setWorking(null);
      if (!result.ok) {
        if (!isCancelled(result.error.code)) setError(result.error);
        return;
      }
      const ref = `${result.value.cartridgeId}@${result.value.version}`;
      useSessionStore.getState().toast("success", translate("title.imported", { name: ref }));
      await refresh();
    });
  };

  const button =
    input?.kind === "invite"
      ? t("world.joinLook")
      : input?.kind === "move"
        ? t("bundle.moveFollow")
        : t("library.joinButton");
  const kindLine =
    input === null
      ? text.trim() === ""
        ? null
        : t("library.kindUnknown", { n: ROOM_CODE_LENGTH })
      : input.kind === "code"
        ? t("library.kindCode")
        : input.kind === "name"
          ? t("library.kindName")
          : input.kind === "invite"
            ? t("library.kindInvite")
            : t("bundle.moveDetected");
  const bringing = input?.kind === "code" || input?.kind === "name";
  const busy =
    working !== null || look.state.status === "loading" || move.state.status === "loading";

  return (
    <>
      <h2 className="g-heading">{t("world.sectionJoin")}</h2>
      <Text tone="muted">{t("world.joinIntro")}</Text>
      <div style={column}>
        <TextField
          className={AUTOFOCUS}
          label={t("world.joinField")}
          mono
          spellCheck={false}
          autoCapitalize="none"
          autoCorrect="off"
          autoComplete="off"
          value={text}
          onChange={(event) => {
            setText(event.target.value);
            clear();
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.repeat) void go();
          }}
        />
        {kindLine === null ? null : (
          <Text variant="caption" tone={input === null ? "dim" : "accent"}>
            {kindLine}
          </Text>
        )}
        {bringing ? (
          <StatePanel state={data} loadingText={t("library.readingSaves")}>
            {() => (
              <BringLine
                saves={saves}
                chosen={chosen}
                names={names}
                picking={picking}
                busy={busy}
                onPicking={setPicking}
                onChoose={setChosenId}
              />
            )}
          </StatePanel>
        ) : null}
        <div className="row-actions">
          <Button
            variant={look.state.status === "ready" ? "secondary" : "primary"}
            disabled={input === null || busy || (bringing && !known)}
            onClick={() => void go()}
          >
            {working === "name"
              ? t("library.nameChecking")
              : working === "opening"
                ? t("library.opening")
                : button}
          </Button>
          {looked ? (
            <Button
              variant="ghost"
              disabled={busy}
              onClick={() => {
                setText("");
                clear();
              }}
            >
              {t("world.joinOther")}
            </Button>
          ) : null}
        </div>
      </div>

      {error === null ? null : <ErrorBlock error={error} />}
      {look.state.status === "loading" ? (
        <Text variant="caption" tone="muted">
          {t("world.joinLooking")}
        </Text>
      ) : look.state.status === "error" ? (
        <ErrorBlock error={look.state.error} />
      ) : look.state.status === "ready" && input?.kind === "invite" ? (
        <InviteJoin link={input.link} world={look.state.value} refresh={refresh} />
      ) : null}
      {move.state.status === "loading" ? (
        <Text variant="caption" tone="muted">
          {t("bundle.moveFollowing")}
        </Text>
      ) : move.state.status === "error" ? (
        <ErrorBlock error={move.state.error} />
      ) : move.state.status === "ready" ? (
        <Text variant="caption" tone="success">
          {t("bundle.moveFollowed", { added: move.state.value.added })}
        </Text>
      ) : null}
      {named === null ? null : (
        <EnsWorldCard
          name={named.name}
          pointer={named.pointer}
          cartridges={library?.cartridges ?? []}
          busy={busy}
          onPlay={playNamed}
          onImport={importNamed}
        />
      )}

      <div className="row-actions">
        <MoreButton open={more} onToggle={() => setMore(!more)} label={t("library.joinMore")} />
      </div>
      {more ? <WorldFileImport refresh={refresh} /> : null}
    </>
  );
}
