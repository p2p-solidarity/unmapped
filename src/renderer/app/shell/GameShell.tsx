// Full-screen frame for every out-of-world screen: one slowly moving key art, the content, and a
// quiet row of controller hints in the corner. Nothing scrolls as a page.

import type { ReactNode } from "react";

export interface Hint {
  keys: string[];
  label: string;
  onPress?: () => void;
}

export interface GameShellProps {
  art: string;
  hints?: Hint[];
  children: ReactNode;
}

export function GameShell({ art, hints = [], children }: GameShellProps) {
  return (
    <div className="g-shell">
      <div className="g-shell__art" style={{ backgroundImage: `url(${art})` }} aria-hidden="true" />
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
