// Genre Matrix (plan.md §2.2): one searchable, multi-select surface over the whole mode catalog.
//
// It looks like a single matrix, but the four axes stay separate in the data — a genre, a pacing,
// a player structure and a subject tag are different kinds of choice, and "回合制 + 第一人稱射擊 +
// 團隊" has to compose rather than overwrite. Nothing here talks to the model: picking modes only
// produces requirements, and `capabilities.ts` decides what the engine can honour.

import { type StringKey, useT } from "@renderer/i18n";
import { Button, space, Text, TextField } from "@renderer/ui";
import { isSelectable, unmetFor } from "@shared/capability-modules";
import {
  MAX_SELECTED_MODES,
  MODE_CATALOG,
  type ModeAxis,
  type ModeDescriptor,
  type ModeSelection,
  searchModes,
  selectedModeIds,
} from "@shared/mode-catalog";
import { type JSX, useMemo, useState } from "react";

const AXIS_FIELD: Record<ModeAxis, keyof ModeSelection> = {
  genre: "genres",
  timing: "timings",
  structure: "structures",
  setting: "settings",
};

/** Section order and headings. Categories inside "genre" are shown as their own groups. */
const GROUPS: {
  title: StringKey;
  note: StringKey | null;
  match: (mode: ModeDescriptor) => boolean;
}[] = [
  { title: "groupTiming", note: "groupTimingNote", match: (mode) => mode.axis === "timing" },
  {
    title: "groupStructure",
    note: "groupStructureNote",
    match: (mode) => mode.axis === "structure",
  },
  { title: "groupRpg", note: null, match: (mode) => mode.category === "rpg_narrative" },
  { title: "groupAction", note: null, match: (mode) => mode.category === "action" },
  { title: "groupSimulation", note: null, match: (mode) => mode.category === "simulation" },
  { title: "groupStrategy", note: null, match: (mode) => mode.category === "strategy" },
  { title: "groupSports", note: null, match: (mode) => mode.category === "sports" },
  { title: "groupSetting", note: "groupSettingNote", match: (mode) => mode.axis === "setting" },
];

export interface GenreMatrixProps {
  selection: ModeSelection;
  onChange(selection: ModeSelection): void;
}

export function GenreMatrix({ selection, onChange }: GenreMatrixProps): JSX.Element {
  const t = useT();
  const [query, setQuery] = useState("");
  const matches = useMemo(() => new Set(searchModes(query).map((mode) => mode.id)), [query]);
  const chosen = useMemo(() => new Set<string>(selectedModeIds(selection)), [selection]);

  const chosenCount = selectedModeIds(selection).length;
  const full = chosenCount >= MAX_SELECTED_MODES;
  const toggle = (mode: ModeDescriptor): void => {
    const field = AXIS_FIELD[mode.axis];
    const list = selection[field] as string[];
    const loaded = list.includes(mode.id);
    // Ejecting is always allowed; loading stops at capacity and at modes nothing can run.
    if (!loaded && (full || !isSelectable(mode))) return;
    const next = loaded ? list.filter((id) => id !== mode.id) : [...list, mode.id];
    onChange({ ...selection, [field]: next } as ModeSelection);
  };

  const visible = GROUPS.map((group) => ({
    ...group,
    modes: MODE_CATALOG.filter((mode) => group.match(mode) && matches.has(mode.id)),
  })).filter((group) => group.modes.length > 0);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: space.md, minHeight: 0 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <Text variant="caption" tone="dim">
          {t("cylinderCount", { n: chosenCount, max: MAX_SELECTED_MODES })}
        </Text>
        {full ? (
          <Text variant="caption" tone="accent">
            {t("cylinderFull")}
          </Text>
        ) : null}
      </div>

      <TextField
        label={t("searchModes")}
        value={query}
        placeholder={t("searchPlaceholder")}
        onChange={(event) => setQuery(event.target.value)}
      />

      {visible.length === 0 ? (
        <Text variant="body" tone="dim">
          {t("noModeMatches", { query })}
        </Text>
      ) : null}

      <div className="g-scroll" style={{ display: "flex", flexDirection: "column", gap: space.lg }}>
        {visible.map((group) => (
          <section key={group.title} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: space.sm }}>
              <Text variant="label" tone="accent">
                {t(group.title)}
              </Text>
              {group.note === null ? null : (
                <Text variant="caption" tone="dim">
                  {t(group.note)}
                </Text>
              )}
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {group.modes.map((mode) => {
                const unmet = unmetFor(mode);
                const loaded = chosen.has(mode.id);
                // Greyed out for one of two stated reasons — no module, or a full cylinder — so a
                // pick can never lead to a Forge that refuses. A loaded mode stays ejectable.
                const blocked = !loaded && (unmet.length > 0 || full);
                return (
                  <Button
                    key={mode.id}
                    variant="chip"
                    active={loaded}
                    disabled={blocked}
                    onClick={() => toggle(mode)}
                    style={{ minHeight: 34 }}
                  >
                    {unmet.length > 0 ? `${mode.label} · ${t("needsModule")}` : mode.label}
                  </Button>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
