// The encounter readout: whose turn it is, how the round is filling, what everyone has left.
//
// Rule 2 again, from the other side. The old HUD had no HP bar because there was no HP; now that
// `shooter_combat@1` gives combatants real hit points and `turn_scheduler@1` a real round, these
// gauges are backed by state — and the whole panel disappears for a cartridge with no combat,
// rather than showing an empty frame.

import { useEncounterStore, useRunStore } from "@renderer/state";
import { colors, font, radius, Surface, space, Text } from "@renderer/ui";
import { hasKind } from "@shared/progression";
import { activeActor, BAR_FULL, type TimingSystemId } from "@shared/timing";
import type { JSX } from "react";
import { RevolverDial } from "./RevolverDial";

const PLAYER_ID = "player";

const SYSTEM_LABEL: Record<TimingSystemId, string> = {
  realtime: "即時",
  real_time_with_pause: "即時暫停",
  tick: "滴答回合",
  turn_based: "回合制",
  turn_bar: "行動槽",
  initiative: "先攻序",
  phase_based: "階段制",
  revolver: "左輪輪替",
};

function Meter({ value, max, tone }: { value: number; max: number; tone: string }): JSX.Element {
  const filled = max <= 0 ? 0 : Math.max(0, Math.min(1, value / max));
  return (
    <div
      style={{
        height: 4,
        background: colors.surfaceBorder,
        borderRadius: radius.pill,
        overflow: "hidden",
      }}
    >
      <div style={{ width: `${filled * 100}%`, height: "100%", background: tone }} />
    </div>
  );
}

export function TurnPanel(): JSX.Element | null {
  const turn = useEncounterStore((state) => state.turn);
  const combatants = useEncounterStore((state) => state.combatants);
  const weapon = useEncounterStore((state) => state.weapon);
  const ammo = useEncounterStore((state) => state.ammo);
  const run = useRunStore((state) => state);

  if (turn === null) return null;

  const active = activeActor(turn);
  const you = combatants.find((one) => one.id === PLAYER_ID);
  const hostiles = combatants.filter((one) => one.side === "hostile");
  const standing = hostiles.filter((one) => one.hp > 0).length;
  const yourTurn = active === PLAYER_ID;

  return (
    <Surface
      variant="overlay"
      padding="sm"
      style={{
        pointerEvents: "auto",
        minWidth: 240,
        maxWidth: 300,
        gap: space.xs,
        borderLeft: `3px solid ${yourTurn ? colors.accent : colors.surfaceBorder}`,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <Text variant="label" tone="accent" style={{ fontWeight: font.weight.bold }}>
          {SYSTEM_LABEL[turn.system]}
        </Text>
        <Text variant="caption" tone="muted" mono>
          {`ROUND ${turn.round}`}
        </Text>
      </div>

      {turn.system === "realtime" ? null : (
        <Text variant="caption" tone={yourTurn ? "accent" : "dim"}>
          {active === null
            ? "行動槽填充中…"
            : yourTurn
              ? turn.phase === "planning"
                ? "你的回合 · 左鍵開火，R 跳過"
                : "結算中…"
              : `${combatants.find((one) => one.id === active)?.label ?? active} 行動中`}
        </Text>
      )}

      {you === undefined ? null : (
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <Text variant="caption" tone="dim" mono>
              HP
            </Text>
            <Text variant="caption" tone="muted" mono>
              {`${you.hp} / ${you.maxHp}`}
            </Text>
          </div>
          <Meter value={you.hp} max={you.maxHp} tone={colors.success} />
        </div>
      )}

      {weapon === null ? null : (
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <Text variant="caption" tone="dim" mono>
            {weapon.name}
          </Text>
          <Text variant="caption" tone="muted" mono>
            {ammo === null ? "∞" : `${ammo} / ${weapon.magazine ?? 0}`}
          </Text>
        </div>
      )}

      {turn.system !== "revolver" ? null : (
        <RevolverDial
          turn={turn}
          sideOf={(id) => combatants.find((one) => one.id === id)?.side ?? "hostile"}
          labelOf={(id) => combatants.find((one) => one.id === id)?.label ?? id}
        />
      )}

      {turn.system !== "turn_bar" ? null : (
        <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
          {combatants
            .filter((one) => one.hp > 0)
            .map((one) => (
              <div key={one.id} style={{ display: "flex", flexDirection: "column", gap: 1 }}>
                <Text variant="caption" tone="dim" mono style={{ fontSize: 10 }}>
                  {one.label}
                </Text>
                <Meter
                  value={turn.bars[one.id] ?? 0}
                  max={BAR_FULL}
                  tone={one.side === "party" ? colors.accent : colors.danger}
                />
              </div>
            ))}
        </div>
      )}

      <Text variant="caption" tone="dim">
        {`敵人 ${standing} / ${hostiles.length}`}
      </Text>

      {hasKind(run.rules, "score_run") ? (
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <Text variant="caption" tone="dim" mono>
            SCORE
          </Text>
          <Text variant="caption" tone="muted" mono>
            {String(run.score)}
          </Text>
        </div>
      ) : null}

      {hasKind(run.rules, "stat_growth") ? (
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <Text variant="caption" tone="dim" mono>
            {`LV ${run.level}`}
          </Text>
          <Text variant="caption" tone="muted" mono>
            {`${run.xp} xp · ${run.kills} kills`}
          </Text>
        </div>
      ) : null}
    </Surface>
  );
}
