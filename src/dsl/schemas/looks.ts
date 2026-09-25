// How an NPC is assembled when the model does not say. A role already implies a silhouette, so
// `NPC(...)` may stop after `color` and the converter fills in build, headwear, held item and the
// accent colour. Every value here is derived, never invented per world: `ROLE_LOOK` is a fixed
// table and `accentFor` is a pure function of the body colour, so two runs agree.

import type { BodyKind, HatKind, HeldKind, NpcRole } from "@shared/world";
import { toHex } from "./common";

export interface RoleLook {
  body: BodyKind;
  hat: HatKind;
  held: HeldKind;
}

/** Default look per role — the silhouette the player reads before anyone speaks. */
export const ROLE_LOOK: Record<NpcRole, RoleLook> = {
  merchant: { body: "stout", hat: "none", held: "basket" },
  monk: { body: "slim", hat: "hood", held: "staff" },
  smith: { body: "stout", hat: "headband", held: "hammer" },
  farmer: { body: "slim", hat: "straw", held: "basket" },
  guard: { body: "tall", hat: "helm", held: "spear" },
  child: { body: "child", hat: "ribbon", held: "none" },
  elder: { body: "elder", hat: "none", held: "staff" },
  bard: { body: "slim", hat: "none", held: "lute" },
  stranger: { body: "tall", hat: "hood", held: "lantern" },
};

interface Hsl {
  h: number;
  s: number;
  l: number;
}

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

function toHsl(hex: string): Hsl {
  const value = toHex(hex).slice(1);
  const r = Number.parseInt(value.slice(0, 2), 16) / 255;
  const g = Number.parseInt(value.slice(2, 4), 16) / 255;
  const b = Number.parseInt(value.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const span = max - min;
  const l = (max + min) / 2;
  if (span === 0) return { h: 0, s: 0, l };
  const s = span / (1 - Math.abs(2 * l - 1));
  const h =
    max === r
      ? 60 * (((g - b) / span) % 6)
      : max === g
        ? 60 * ((b - r) / span + 2)
        : 60 * ((r - g) / span + 4);
  return { h: (h + 360) % 360, s, l };
}

const channel = (value: number): string =>
  Math.round(clamp01(value) * 255)
    .toString(16)
    .padStart(2, "0");

function fromHsl({ h, s, l }: Hsl): string {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const sector = Math.floor((((h % 360) + 360) % 360) / 60);
  const rgb: readonly [number, number, number] =
    sector === 0
      ? [c, x, 0]
      : sector === 1
        ? [x, c, 0]
        : sector === 2
          ? [0, c, x]
          : sector === 3
            ? [0, x, c]
            : sector === 4
              ? [x, 0, c]
              : [c, 0, x];
  return `#${channel(rgb[0] + m)}${channel(rgb[1] + m)}${channel(rgb[2] + m)}`;
}

/**
 * The accent (scarf, trim, held-item glow) an NPC gets when the model omits it: the body colour
 * rotated 150° around the hue circle and pushed away from it in lightness, so it always reads as
 * a deliberate second colour. Pure and deterministic — the serializer omits an accent that equals
 * this value, so the same program comes back out of `serializeScene`.
 */
export function accentFor(color: string): string {
  const { h, s, l } = toHsl(color);
  return fromHsl({
    h: (h + 150) % 360,
    s: clamp01(Math.max(s, 0.38) * 0.9),
    l: clamp01(l > 0.55 ? l - 0.24 : l + 0.24),
  });
}
