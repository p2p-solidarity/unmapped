# Feature commit index

The 20 commits group the app by delivered capability. This curated history follows product
progression rather than the original development chronology.

| Commit | Delivered capability |
| --- | --- |
| `feat(engine)` | Electron app, world engine, parser and initial play loop |
| `feat(storage)` | Immutable cartridges, pinned instances, backups and wrapped data key |
| `feat(create)` | Open-land content pipeline and creation flow |
| `feat(inference)` | Local model bridge and scene generation |
| `feat(land)` | Streamed 2D open land with CC0 sprites |
| `feat(works)` | Sandboxed, generated interactive worlds |
| `feat(story)` | Story episodes on the land and generated image assets |
| `feat(chain)` | Optional provenance and background chapter preparation |
| `feat(works)` | Resumable worlds and targeted edit repairs |
| `feat(visuals)` | HD-2D land renderer and living title scene |
| `feat(world)` | Reachable story gates and persistent walking progress |
| `feat(combat)` | Open-land fighting and compatible mod capabilities |
| `feat(places)` | Side-scrollers and dungeons entered from the land |
| `feat(assets)` | Generated resident and monster sprites |
| `feat(create)` | World planning before publishing |
| `feat(network)` | Shared continent and ENSv2 cartridge names |
| `feat(saves)` | Land state in backups with end-to-end replay records |
| `feat(combat)` | Roaming hostiles, persistent defeats and combat tuning |
| `feat(play)` | Model selection, language, art and continent entry |
| `feat(create)` | Durable four-step Create flow, hardening and integrated checks |

Evidence: [cartridge runtime](implementation-plan.md),
[interactive worlds](experiments/interactive-works-acceptance.md),
[ENSv2 names](e2e/milestone-ensv2-cartridge-names/result.md),
[Create flow](e2e/milestone-create-four-step/result.md), and
[integration check](e2e/milestone-integration/result.md).
The [handoff](handoff-next-session.md) tracks unfinished work. Screenshot-only folders are
preserved under `docs/e2e/milestone-generated-props/` and
`docs/e2e/milestone-integrated-create/`; they have no replay instructions or result claims.
