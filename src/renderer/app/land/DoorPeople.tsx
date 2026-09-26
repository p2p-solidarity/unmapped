// The door's people (rev 6 phase 3, D8, WP8; phase 4, D5): the world's owners — its maker while it
// owns the world, then its co-owners — then invited friends (members) and removed ones, each row
// told apart by a word for its kind. A person with no name shows a short key, the only way to tell
// two unnamed rows apart. An owner removes a member, makes a member a co-owner, or ends another owner's ownership
// (never the last one's: main refuses `owner-last` too). Every action asks first, goes through
// `window.seed.world.*` and shows its Result; the door reads itself again after it.

import { translate, useT } from "@renderer/i18n";
import { Button, Surface, space, Text } from "@renderer/ui";
import { ok, type Result } from "@shared/result";
import type { DoorPerson, DoorRowKind, WorldAppended, WorldDoor } from "@shared/worldApi";
import { type JSX, useState } from "react";
import { Outcome } from "./DoorOutcome";
import { shortKey, useAction } from "./worldDoor";

const column = { display: "flex", flexDirection: "column", gap: space.xs } as const;
const row = { display: "flex", flexWrap: "wrap", gap: space.xs, alignItems: "center" } as const;

/** What each row kind says after the name (a word, never an entry number); one entry per kind. */
const PERSON_TAG = {
  owner: "world.personOwner",
  "co-owner": "world.personCoOwner",
  member: "world.personMember",
  removed: "world.personRemoved",
} as const satisfies Record<DoorRowKind, string>;

/** What an owner's "Remove" ends on each row kind: a membership, an ownership, or nothing. */
const REMOVABLE: Record<DoorRowKind, "member" | "owner" | null> = {
  owner: "owner",
  "co-owner": "owner",
  member: "member",
  removed: null,
};

type Act = "remove" | "make-owner" | "remove-owner";

const ACT = {
  remove: {
    label: "world.personRemove",
    ask: "world.personRemoveAsk",
    confirm: "world.personRemoveConfirm",
    done: "world.personRemovedDone",
    variant: "destructive",
  },
  "make-owner": {
    label: "world.personMakeOwner",
    ask: "world.personMakeOwnerAsk",
    confirm: "world.personMakeOwnerConfirm",
    done: "world.personMadeOwner",
    variant: "primary",
  },
  "remove-owner": {
    label: "world.personRemoveOwner",
    ask: "world.personRemoveOwnerAsk",
    confirm: "world.personRemoveOwnerConfirm",
    done: "world.personRemovedOwnerDone",
    variant: "destructive",
  },
} as const satisfies Record<Act, object>;

/** What an owner may do to a row that is not its own: never remove the last owner. */
function actsOn(person: DoorPerson, owners: number): Act[] {
  const removal = REMOVABLE[person.kind];
  if (removal === "member") return ["make-owner", "remove"];
  return removal === "owner" && owners > 1 ? ["remove-owner"] : [];
}

function send(act: Act, world: string, key: string): Promise<Result<WorldAppended>> {
  if (act === "make-owner") return window.seed.world.addOwner(world, key);
  if (act === "remove-owner") return window.seed.world.removeOwner(world, key);
  return window.seed.world.removeMember(world, key);
}

function personName(person: DoorPerson): string {
  return person.name ?? `${translate("world.personUnnamed")} · ${shortKey(person.key)}`;
}

export function People({
  door,
  owner,
  onChanged,
}: {
  door: WorldDoor;
  /** This device owns the world (the maker or a co-owner). */
  owner: boolean;
  onChanged(): void;
}): JSX.Element {
  const t = useT();
  const [asking, setAsking] = useState<{ key: string; act: Act } | null>(null);
  const action = useAction<{ act: Act; name: string }>();
  const busy = action.state.status === "loading";
  const owners = door.people.filter((one) => one.kind === "owner" || one.kind === "co-owner");
  const others = door.people.filter((one) => one.kind === "member" || one.kind === "removed");
  return (
    <div style={column}>
      <Text variant="label" tone="muted">
        {t("world.peopleHeading")}
      </Text>
      {door.people.map((person) => {
        const name = personName(person);
        const tag = t(PERSON_TAG[person.kind]);
        const extra = [
          person.pending ? t("world.personWaiting") : "",
          person.me ? t("world.personYou") : "",
        ]
          .filter((part) => part !== "")
          .join(" ");
        const acts = owner && !person.me ? actsOn(person, owners.length) : [];
        const ask = asking?.key === person.key ? asking.act : null;
        return (
          <div key={`${person.kind}:${person.key}`} style={column}>
            <div style={row}>
              <Text variant="body" tone={person.kind === "removed" ? "dim" : "default"}>
                {name}
              </Text>
              <Text variant="caption" tone="muted" style={{ flex: 1 }}>
                {extra === "" ? tag : `${tag} ${extra}`}
              </Text>
              {ask === null
                ? acts.map((act) => (
                    <Button
                      key={act}
                      variant="ghost"
                      disabled={busy}
                      onClick={() => setAsking({ key: person.key, act })}
                    >
                      {t(ACT[act].label)}
                    </Button>
                  ))
                : null}
            </div>
            {ask === null ? null : (
              <Surface variant="inset" padding="md" style={column}>
                <Text variant="caption">{t(ACT[ask].ask, { name })}</Text>
                <div style={row}>
                  <Button
                    variant={ACT[ask].variant}
                    onClick={() => {
                      setAsking(null);
                      void action
                        .run(async () => {
                          const done = await send(ask, door.world, person.key);
                          return done.ok ? ok({ act: ask, name }) : done;
                        })
                        .then(onChanged);
                    }}
                  >
                    {t(ACT[ask].confirm)}
                  </Button>
                  <Button variant="ghost" onClick={() => setAsking(null)}>
                    {t("common.cancel")}
                  </Button>
                </div>
              </Surface>
            )}
          </div>
        );
      })}
      {others.length === 0 ? (
        <Text variant="caption" tone="dim">
          {t("world.peopleNoMembers")}
        </Text>
      ) : null}
      {owner && owners.length === 1 ? (
        <Text variant="caption" tone="dim">
          {t("world.ownersOnlyOne")}
        </Text>
      ) : null}
      <Outcome
        state={action.state}
        busy={t("world.working")}
        done={({ act, name }) => t(ACT[act].done, { name })}
      />
    </div>
  );
}
