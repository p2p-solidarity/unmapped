// Full-screen frame for every out-of-world screen: the content over the live HD-2D land the App
// draws behind all menus (or a still key art when one is given), and a quiet row of controller
// hints in the corner. Nothing scrolls as a page.
//
// The hints show key caps, or the pad's glyphs after a pad input (ui/KeyHint); a hint the pad has
// no button for is hidden then. The row only repeats what the keys and B / A already do, so the
// pad's focus never lands on it (`data-nav-skip`); the mouse can still click it.

import { useHintKeys } from "@renderer/ui";
import type { ReactNode } from "react";

export interface Hint {
  keys: string[];
  label: string;
  onPress?: () => void;
}

export interface GameShellProps {
  /** Still key art; without it the shell is transparent over the App's live land backdrop. */
  art?: string;
  hints?: Hint[];
  children: ReactNode;
}

function HintButton({ hint }: { hint: Hint }) {
  const { labels, pad } = useHintKeys(hint.keys);
  if (labels.length === 0) return null;
  return (
    <button
      type="button"
      className="g-hint"
      disabled={hint.onPress === undefined}
      onClick={hint.onPress}
    >
      {labels.map((key) => (
        <kbd key={key} className="ui-key" data-pad={pad ? "true" : undefined}>
          {key}
        </kbd>
      ))}
      <span>{hint.label}</span>
    </button>
  );
}

export function GameShell({ art, hints = [], children }: GameShellProps) {
  return (
    <div className={art === undefined ? "g-shell g-shell--live" : "g-shell"}>
      {art === undefined ? null : (
        <div
          className="g-shell__art"
          style={{ backgroundImage: `url(${art})` }}
          aria-hidden="true"
        />
      )}
      <div className="g-shell__shade" aria-hidden="true" />
      <main id="main-content" className="g-stage">
        {children}
      </main>
      {hints.length > 0 ? (
        <footer className="g-hints" data-nav-skip="true">
          {hints.map((hint) => (
            <HintButton key={hint.label} hint={hint} />
          ))}
        </footer>
      ) : null}
    </div>
  );
}
