# Create a game: four steps

Run in an Electron dev window with `AETHER_TEST_USER_DATA=/tmp/ul-create-e2e.pzTXCA`, CDP port 9451, zh-TW UI and the real OpenAI `gpt-5.4-mini` model. The test data directory was new and separate from the user's app data. `run.json` combines the CDP actions used during this session into a single replay sequence. Start with a fresh temporary userData directory and run `CDP_PORT=9451 bun scripts/cdp-drive.ts "$(cat docs/e2e/milestone-create-four-step/run.json)"` against `bun run dev --remoteDebuggingPort 9451`.

## Observed

- Started a draft, entered the Chinese world name `潮間小鎮` and an intent, left the player's story empty, left Create and reopened the draft. The name and intent returned from the workspace draft.
- The model produced all six world cards and, despite the empty player story, a four-chapter story. [World review](03-world-review.jpg) · [Story review](04-story-review.jpg).
- Edited a chapter title. Locked chapters had their single-chapter rewrite buttons disabled. Rewrote one unlocked chapter, inserted a fifth chapter, moved a chapter, removed one, and revised the unlocked chapters with a story note. The locked chapter title stayed `新的空站`. Cancelled a later in-flight single-chapter rewrite; its title stayed `石坡上的便條`. [Edited story](06-story-edited.jpg).
- Continued to Build and started play. The land opened with `故事 0/4` and the first chapter `新的空站`. One cartridge revision was written under `cartridges/xn--yetr46bqp0anub-952bce/1.0.0/`; the manifest name was `潮間小鎮`, its author was this test device's `player-NT8B`, and the built draft no longer appeared in `workspaces/`. [Build review](07-build-review.jpg) · [Opened land](08-built-land.jpg).
- In a second draft, changing the language from zh-TW to ja-JP marked the world stale and disabled “keep this world.” Changing it back and changing only the name kept the stale warning but enabled that choice. [Language](09-world-stale-language.jpg) · [Name](10-world-stale-name.jpg).
- In a third draft, a note rewrote only the tone card; the other five textarea values remained identical. Changing the play style from peaceful to gun marked the world stale and disabled “keep this world.” [Card rewrite](11-card-rewrite.jpg) · [Play style](12-world-stale-play.jpg).
- Removed both exploratory drafts from the picker. Only the published cartridge remained; no Create draft remained in the test `workspaces/` directory.

`bun run check` passed: typecheck, Biome, line limit, 93 test files and 385 tests. Biome reported three pre-existing `!important` style warnings in `src/renderer/game.css` and no errors. The dev log showed inference requests and no renderer errors in this flow. Model token use and elapsed generation time were not measured, so none are reported here.

## Limits

The recorded fixed waits allow the model to finish in this run. A slower endpoint may require longer waits when replaying. The background generation of the first playable chapter had begun when the land screenshot was taken; finishing and playing that chapter was outside this Create-flow run.
