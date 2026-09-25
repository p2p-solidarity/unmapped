// Where the chapters' gates will stand on the land, drawn small: home at the centre, each gate at
// the chunk the host gives it (`episodePlaces`), joined in the order they open. The same numbers
// the game uses — nothing here is decorative.

import { colors, font } from "@renderer/ui";
import type { StoryEpisode } from "@shared/story";
import type { JSX } from "react";

const SIZE = 240;
const PAD = 22;

export function ChapterMap({
  episodes,
}: {
  episodes: readonly Pick<StoryEpisode, "cx" | "cz" | "title">[];
}): JSX.Element {
  const points = [{ cx: 0, cz: 0 }, ...episodes];
  const reach = Math.max(1, ...points.map((p) => Math.max(Math.abs(p.cx), Math.abs(p.cz))));
  const scale = (SIZE / 2 - PAD) / reach;
  const at = (p: { cx: number; cz: number }) => ({
    x: SIZE / 2 + p.cx * scale,
    y: SIZE / 2 + p.cz * scale,
  });
  const path = points.map((p) => at(p));
  return (
    <svg
      viewBox={`0 0 ${SIZE} ${SIZE}`}
      width="100%"
      style={{ maxWidth: SIZE, display: "block" }}
      role="img"
      aria-label={`Home and ${episodes.length} chapter gates on the land`}
    >
      <rect
        x={0.5}
        y={0.5}
        width={SIZE - 1}
        height={SIZE - 1}
        fill={colors.bg}
        stroke={colors.surfaceBorder}
      />
      <polyline
        points={path.map((p) => `${p.x},${p.y}`).join(" ")}
        fill="none"
        stroke={colors.textDim}
        strokeDasharray="3 4"
      />
      <rect
        x={SIZE / 2 - 6}
        y={SIZE / 2 - 6}
        width={12}
        height={12}
        fill={colors.surface}
        stroke={colors.text}
      >
        <title>Home — where the world starts</title>
      </rect>
      {episodes.map((episode, index) => {
        const p = at(episode);
        return (
          <g key={`${episode.cx},${episode.cz}`}>
            <circle cx={p.x} cy={p.y} r={10} fill={colors.goldSoft} stroke={colors.gold} />
            <text
              x={p.x}
              y={p.y + 4}
              textAnchor="middle"
              fontSize={11}
              fontFamily={font.family}
              fill={colors.accent}
            >
              {index + 1}
            </text>
            <title>{`${index + 1}. ${episode.title}`}</title>
          </g>
        );
      })}
    </svg>
  );
}
