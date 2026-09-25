# Milestone: interactive work player prototype

Status: disposable experiment on `codex/interactive-work-prototype`. The generated works are
explicitly labelled experimental model output. Nothing here is production game data, a new engine
module, or a migration of the existing Scene DSL path.

## Question

Can one deliberately small, rule-agnostic browser player run a branching story, a card-exchange
game with a custom win condition, and a point-and-click deduction scene without adding a gameplay
kit or changing the player for the second and third work?

## Prototype shape

The player knows a work id and module URL. Each work exports `manifest` and `mount(context)`. The
work owns its markup, scoped CSS, interactions, rules, and JSON-serializable state. The player owns
loading, the root element, per-work in-memory state, restart, exit, status, completion, and load
errors.

The model-facing contract was 1,093 characters, 165 whitespace-delimited words, and 19 lines. It
described two exports, six host capabilities (`root`, state load/save/clear, completion, status),
cleanup, and forbidden privileged/network APIs. It did not describe Three.js, SceneGraph, OpenUI,
genre matrices, gameplay kits, or engine components.

Run the experiment with `bun run prototype:interactive-works`. Regenerate the three samples with
`bun run prototype:generate-works`.

## Measured generation

Provider: the repository's configured OpenAI preset, `gpt-5.4-mini`. All three calls were made on
the prototype milestone and their raw receipts are in
`experiments/interactive-work-player/generated/metrics.json`.

| Work | First response | Wall time | Prompt tokens | Completion tokens | Repair calls | Manual result |
| --- | --- | ---: | ---: | ---: | ---: | --- |
| Branching text story | valid ES module | 17,469 ms | 288 | 3,524 | 0 | Reached a distinct ending through two choices |
| Card exchange | valid ES module | 21,188 ms | 296 | 4,393 | 0 | Reached the stated one-of-each-suit and total-value win condition |
| Click clues and deduce | valid ES module | 17,953 ms | 299 | 3,572 | 0 | Observed insufficient-clue failure, collected four clues, then reached the correct deduction |
| **Total** | **3/3 returned runnable modules** | **56,610 ms** | **883** | **11,489** | **0** | **3/3 manually completed** |

All first responses also passed a browser-target syntax build. The API response exposed token
usage but not billed cost, so cost is intentionally recorded as `null`; no price estimate is
presented as an actual charge.

“Runnable” here means the work loaded and its main interaction could be completed. It does not
mean production-ready. The card sample rendered clickable cards as `div` elements rather than
keyboard-accessible buttons, and all three passed structured completion objects while the first
player display assumed a string. The latter was fixed once in the generic player; no work needed a
repair call.

## Rule-change measurement

The model received the generated card work and one instruction: change the required total from 21
to 20 while preserving the one-of-each-suit rule and everything else.

- 13,845 ms
- 3,636 prompt tokens and 3,550 completion tokens
- 0 repair calls
- 1 file changed, 5 lines replaced (5 additions / 5 deletions)
- Manual replay reached 20/20 with one heart, club, diamond, and spade

The behavioral edit was local, but returning the entire 258-line module cost 3,550 completion
tokens. A later creation loop should request file-targeted edits or a bounded patch rather than
regenerating an unchanged whole work.

## Player-change result

The branching work established the player. Loading and completing the card and clue works required
zero gameplay-specific player changes. The only player changes found during validation were
generic contract fixes: retain a state store for every loaded work, and render structured
completion summaries safely. Switching away from the completed card work and back restored its
20/20 state.

## What the experiment proves — and does not prove

Evidence supports a thin, rule-agnostic 2D work boundary: three materially different interaction
models can own their behavior and use one lifecycle/state shell. It also supports making HTML,
CSS, and JavaScript the default generation surface instead of forcing all work through Scene DSL.

This prototype deliberately uses dynamic module import in the player renderer. That is **not an
acceptable production isolation boundary**: generated code shares the host JavaScript realm and
could reach DOM globals despite prompt instructions. Prompt compliance is not a security control.
The prototype code must not be promoted directly into the product player.

## Recommended minimum production contract

Use a new, explicitly versioned cartridge content type, for example `interactive-web@1`; do not
reinterpret or migrate existing Scene cartridges.

The work owns:

- HTML structure, CSS, drawing (including Canvas when useful), interactions, rules, and result UI.
- Its serializable state schema and the moments when it asks to save.
- References to declared local assets; a missing asset must remain visibly missing.
- A small manifest: format/version, title, entry file, declared files/assets, and no implicit
  permissions.

The player owns:

- Loading an exact immutable work revision and resolving only declared local files/assets.
- Start, restart, exit, reload-after-fix, loading state, and actionable error display.
- The save slot and validated JSON load/save messages, separate from immutable work files.
- The isolation boundary, CSP, navigation/network denial, message validation, quotas, and runtime
  error capture.
- Version negotiation. Unknown work formats or host API versions fail visibly.

For the next phase, load each work in an iframe with `sandbox="allow-scripts"` **without**
`allow-same-origin`. Build the frame from validated local text with a CSP equivalent to
`default-src 'none'; connect-src 'none'; img-src data: blob:; media-src data: blob:; style-src
'unsafe-inline'; script-src 'unsafe-inline'`. Supply validated asset bytes as bounded data/blob
references, not filesystem paths. The only host seam is a versioned `postMessage` protocol. The
host must validate `event.source`, opaque origin behavior, message schema, request id, payload
size, and rate; it must never expose preload or Node objects to the frame. Electron navigation and
window-open handlers remain a second denial layer.

Minimum messages should cover `ready`, `load-state`, `save-state`, `complete`, and typed host/error
responses. Restart and exit are host actions, not APIs the work may invoke arbitrarily.

## Recommendation

Proceed to the minimal player with the iframe/message boundary above. Preserve the existing
Cartridge / Instance / Workspace ownership and immutable revision rules, but add a sibling,
versioned interactive-web content type rather than extending Scene DSL. Do not add per-game engine
modules, a universal component platform, or a creation editor yet.

The highest-value next evidence is not another genre demo. It is adversarial boundary testing:
attempt access to preload, Node, filesystem, credentials, parent DOM, arbitrary network,
navigation, oversized messages, malformed saves, and runaway work errors while confirming that a
different work and the host stay usable.
