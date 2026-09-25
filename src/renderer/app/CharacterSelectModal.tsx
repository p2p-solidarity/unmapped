import { ASSETS } from "@renderer/assets";
import { type CharacterClassId, type ColorTheme, useCharacterStore } from "@renderer/state";
import {
  Button,
  colors,
  font,
  HIT_TARGET,
  radius,
  Surface,
  space,
  Text,
  zIndex,
} from "@renderer/ui";
import type { JSX } from "react";

interface ClassInfo {
  id: CharacterClassId;
  name: string;
  sub: string;
  desc: string;
  role: string;
}

const CLASSES: ClassInfo[] = [
  {
    id: "swordsman",
    name: "Dual Blade Swordsman",
    sub: "雙劍士 · Aether Striker",
    desc: "Lightning fast dual blade combos, high agility and aerial gap closers.",
    role: "Melee DPS",
  },
  {
    id: "mage",
    name: "Aether Mage Caster",
    sub: "魔導士 · Void Weaver",
    desc: "Mystical runic spellcasting, floating mana crystals, and long-range elemental bombardment.",
    role: "Ranged Magic",
  },
  {
    id: "gunner",
    name: "Cyber Gunner Ranger",
    sub: "槍手 · Plasma Sniper",
    desc: "Tactical cybernetic targeting HUD, precision pulse rifle, and high velocity hit-and-run.",
    role: "Ranged Tactical",
  },
  {
    id: "paladin",
    name: "Rune Paladin Guardian",
    sub: "聖騎士 · Aegis Protector",
    desc: "Heavy fortress armor, radiant energy kite shield, and unbreakable defensive auras.",
    role: "Tank / Guardian",
  },
];

const THEMES: { id: ColorTheme; label: string; swatch: string }[] = [
  { id: "cyan", label: "Aether Cyan", swatch: colors.accent },
  { id: "gold", label: "Solar Gold", swatch: colors.gold },
  { id: "crimson", label: "Blood Crimson", swatch: colors.danger },
  { id: "purple", label: "Void Purple", swatch: colors.purple },
  { id: "emerald", label: "Jade Emerald", swatch: colors.success },
];

export function CharacterSelectModal(): JSX.Element | null {
  const isCustomizing = useCharacterStore((state) => state.isCustomizing);
  const setIsCustomizing = useCharacterStore((state) => state.setIsCustomizing);
  const currentClass = useCharacterStore((state) => state.classId);
  const setClassId = useCharacterStore((state) => state.setClassId);
  const currentTheme = useCharacterStore((state) => state.colorTheme);
  const setColorTheme = useCharacterStore((state) => state.setColorTheme);
  const showWeapon = useCharacterStore((state) => state.showWeapon);
  const setShowWeapon = useCharacterStore((state) => state.setShowWeapon);
  const showAura = useCharacterStore((state) => state.showAura);
  const setShowAura = useCharacterStore((state) => state.setShowAura);

  if (!isCustomizing) return null;

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        background: colors.bgOverlay,
        backdropFilter: "blur(12px)",
        zIndex: zIndex.overlay,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: space.xl,
      }}
    >
      <Surface
        variant="card"
        padding="xl"
        style={{
          maxWidth: 880,
          width: "100%",
          maxHeight: "90vh",
          overflowY: "auto",
          gap: space.lg,
          border: `1px solid ${colors.accent}`,
          boxShadow: `0 0 32px ${colors.accentSoft}, 0 20px 48px rgba(0,0,0,0.85)`,
        }}
      >
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <Text variant="headline" as="h1">
              THE SEED · AVATAR ARCHETYPES
            </Text>
            <Text variant="body" tone="accent">
              Select your VRMMO class avatar and tactical gear configuration
            </Text>
          </div>
          <Button variant="primary" onClick={() => setIsCustomizing(false)}>
            Confirm & Enter
          </Button>
        </div>

        {/* 4 Class Cards Grid */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            gap: space.md,
          }}
        >
          {CLASSES.map((cls) => {
            const isSelected = cls.id === currentClass;
            const img = ASSETS.classes[cls.id];
            return (
              <button
                key={cls.id}
                type="button"
                aria-pressed={isSelected}
                onClick={() => setClassId(cls.id)}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  borderRadius: radius.md,
                  overflow: "hidden",
                  border: `2px solid ${isSelected ? colors.accent : colors.surfaceBorder}`,
                  background: isSelected ? colors.surface : colors.bg,
                  cursor: "pointer",
                  transition: "all 0.2s ease",
                  boxShadow: isSelected
                    ? `0 0 20px ${colors.accentSoft}, inset 0 0 12px ${colors.accentSoft}`
                    : "none",
                  padding: 0,
                  margin: 0,
                  textAlign: "left",
                  font: "inherit",
                  color: "inherit",
                  minHeight: HIT_TARGET,
                }}
              >
                {/* Image */}
                <div
                  style={{
                    position: "relative",
                    width: "100%",
                    aspectRatio: "1/1",
                    overflow: "hidden",
                  }}
                >
                  <img
                    src={img}
                    alt={cls.name}
                    style={{
                      width: "100%",
                      height: "100%",
                      objectFit: "cover",
                      transform: isSelected ? "scale(1.05)" : "scale(1)",
                      transition: "transform 0.3s ease",
                    }}
                  />
                  <div
                    style={{
                      position: "absolute",
                      top: 8,
                      right: 8,
                      padding: "2px 8px",
                      background: colors.bgOverlay,
                      borderRadius: radius.pill,
                      border: `1px solid ${isSelected ? colors.accent : colors.surfaceBorder}`,
                    }}
                  >
                    <Text variant="caption" tone={isSelected ? "accent" : "muted"}>
                      {cls.role}
                    </Text>
                  </div>
                </div>

                {/* Content */}
                <div
                  style={{ padding: space.sm, display: "flex", flexDirection: "column", gap: 4 }}
                >
                  <Text variant="label" tone={isSelected ? "accent" : "default"}>
                    {cls.name}
                  </Text>
                  <Text variant="caption" tone="dim">
                    {cls.sub}
                  </Text>
                  <Text variant="caption" tone="muted" style={{ marginTop: 4, minHeight: 36 }}>
                    {cls.desc}
                  </Text>
                </div>
              </button>
            );
          })}
        </div>

        {/* Customization Options */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: space.lg,
            borderTop: `1px solid ${colors.surfaceBorder}`,
            paddingTop: space.md,
          }}
        >
          {/* Color Themes */}
          <div style={{ display: "flex", flexDirection: "column", gap: space.sm }}>
            <Text variant="label" tone="muted">
              ARMOR ENERGY COLOR THEME
            </Text>
            <div style={{ display: "flex", gap: space.sm, flexWrap: "wrap" }}>
              {THEMES.map((th) => {
                const active = currentTheme === th.id;
                return (
                  <button
                    key={th.id}
                    type="button"
                    onClick={() => setColorTheme(th.id)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: space.xs,
                      padding: `${space.xs}px ${space.md}px`,
                      borderRadius: radius.md,
                      background: active ? colors.accentSoft : colors.bg,
                      border: `1px solid ${active ? colors.accent : colors.surfaceBorder}`,
                      color: active ? colors.accent : colors.text,
                      cursor: "pointer",
                      fontFamily: font.family,
                      fontSize: font.size.caption,
                    }}
                  >
                    <span
                      style={{
                        width: 12,
                        height: 12,
                        borderRadius: "50%",
                        background: th.swatch,
                        boxShadow: `0 0 6px ${th.swatch}`,
                      }}
                    />
                    <span>{th.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Gear Toggles */}
          <div style={{ display: "flex", flexDirection: "column", gap: space.sm }}>
            <Text variant="label" tone="muted">
              EQUIPMENT & VISUAL FX
            </Text>
            <div style={{ display: "flex", gap: space.md }}>
              <Button
                variant={showWeapon ? "primary" : "secondary"}
                onClick={() => setShowWeapon(!showWeapon)}
              >
                {showWeapon ? "Weapons: Visible" : "Weapons: Hidden"}
              </Button>
              <Button
                variant={showAura ? "primary" : "secondary"}
                onClick={() => setShowAura(!showAura)}
              >
                {showAura ? "Aura FX: Active" : "Aura FX: Off"}
              </Button>
            </div>
          </div>
        </div>
      </Surface>
    </div>
  );
}
