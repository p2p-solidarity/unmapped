# Complete the cartridge product flow

Scope: finish plan.md Phases 0–8 with the existing engine and UI, preserving legacy data and the current uncommitted work. No new framework or plugin loader.

## Agreed implementation decisions

1. Persist Create drafts and candidate sources in workspaces. Modes, accepted decisions and context changes invalidate dependent candidates and review; publication rejects stale or unanswered required decisions.
2. Publish v2 definitions with all capability contexts, ordered module/mod locks, selected scenes and assets. Keep v1 readers. Recompute hashes from trusted content on publish/load, pin instances exactly, and reject mismatching backups/upgrades.
3. Reuse the real renderer for base/candidate previews. Isolate previews from live encounter state. Give slots multiple candidates, generation receipts, refine/reroll/duplicate/reorder, explicit entry/end and context selection. Story is optional and follows scenes.
4. AI outputs typed proposals only. Approval applies definition patches and reruns the compiler. Scene output stays the existing declarative DSL; errors remain visible without invented fallback output.
5. Existing primitive geometry is a real built-in asset pack. Its recipe hashes are checked, referenced by the DSL, and included in v2 identity. Unknown assets fail validation.
6. Persist player profiles separately. Join from an installed, verified cartridge instance; reject incompatible hello messages before activating gameplay synchronization. No published scene bytes travel through Yjs. Only the host owns progress and transitions.
7. Mod requests become typed operations with compatibility impact and isolated preview. Approval publishes a new immutable revision; old instance/save remains pinned and unchanged. Runtime changes require a fresh instance when no migration exists.
8. Verify behavior at the shared/domain/storage boundaries, run the repository check/build, exercise Electron flows, then independently review standards and spec. Record any environment-dependent behavior not actually exercised.

## Plan critique resolved

- Comparing three caller-provided hashes is insufficient: recompute local identity and compare ordered locks and protocol versions before admitting runtime messages.
- A union profile cannot execute mutually exclusive cameras/timing: keep contexts and select one explicitly per scene.
- Existing Stage preview writes global stores: isolate playtesting and use a noninteractive orbit view for gallery tiles.
- Autosave needs serialized writes and explicit errors; reloading must never quietly replace an unreadable draft with a new empty one.
- A cosmetic Mod panel is insufficient: proposal publication must update the immutable definition/rules and a usable new version, never just in-memory rules.
- Existing tests and uncommitted edits are the baseline; baseline formatting failures are recorded separately from introduced defects.
