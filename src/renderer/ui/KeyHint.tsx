// Key caps for hints and button hotkeys. After a pad input they show the pad's glyphs for the same
// thing (@shared/input `padGlyphs`: Esc → B, Enter → A, arrows → ✚); a key the pad has no
// counterpart for is left out. The next keyboard or mouse input switches them back.

import { useInputDevice } from "@renderer/input/device";
import { padGlyphs } from "@shared/input";
import type { JSX } from "react";

/** The labels to draw for these keys on the device in use (empty: nothing to show). */
export function useHintKeys(keys: readonly string[]): { labels: readonly string[]; pad: boolean } {
  const pad = useInputDevice() === "pad";
  return { labels: pad ? padGlyphs(keys) : keys, pad };
}

export function KeyHint({ keys }: { keys: readonly string[] }): JSX.Element | null {
  const { labels, pad } = useHintKeys(keys);
  if (labels.length === 0) return null;
  return (
    <>
      {labels.map((label) => (
        <kbd key={label} className="ui-key" data-pad={pad ? "true" : undefined}>
          {label}
        </kbd>
      ))}
    </>
  );
}
