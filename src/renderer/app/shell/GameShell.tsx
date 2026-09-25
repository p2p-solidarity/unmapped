// Full-screen frame for every out-of-world screen: the content over the live HD-2D land the App
// draws behind all menus (or a still key art when one is given), and a quiet row of controller
// hints in the corner. Nothing scrolls as a page.

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
        <footer className="g-hints">
          {hints.map((hint) => (
            <button
              key={hint.label}
              type="button"
              className="g-hint"
              disabled={hint.onPress === undefined}
              onClick={hint.onPress}
            >
              {hint.keys.map((key) => (
                <kbd key={key} className="ui-key">
                  {key}
                </kbd>
              ))}
              <span>{hint.label}</span>
            </button>
          ))}
        </footer>
      ) : null}
    </div>
  );
}
