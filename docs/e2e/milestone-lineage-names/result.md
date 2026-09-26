# ENS names for cartridges and saves — E2E on Sepolia (2026-09-26)

LineageRegistry v2 names things first: a cartridge revision is `<cartridge>.unmapped.eth`, a remix
hangs under its parent's name, and a player's save is `<save>.<cartridge>.unmapped.eth`, held by the
player's PasskeyAccount. Launching on the market attaches a token and an auction to a name that
already exists. This run drives the naming from the real app, keyless, through the gas station, then
restores the save on a second app with no passkey and no station. Replay: `run.json`.

Registry `0xda8051e3e2855C125AAd6050f97Ea64cf203dAf6` (deployed at block 11,781,460, `unmapped.eth`
repointed to its root). The dry run (`bun run lineage:market --dry-run`) passed its new checks 9 and
10 first; see the table at the end.

## What was checked, and what we saw

| # | Step | Observed | Evidence |
| --- | --- | --- | --- |
| 1 | Worlds → Cartridges, aether-land 1.3.0 | `ENS aether-land.unmapped.eth · 指向這個版本` (held by the operator, who launched it) | 01 |
| 2 | Same cartridge, 1.2.0 | `由 0x8eEC…51C3 持有，指向 1.3.0` (someone else's name, another revision: no write offered) | 02 |
| 3 | moss-hollow 1.0.0, a remix of aether-land 1.3.0 | its name is derived under the parent: `moss-hollow.aether-land.unmapped.eth · 尚未登記` | 03 |
| 4 | 用 passkey 登記名稱 → the page shows `登記 moss-hollow.aether-land.unmapped.eth → moss-hollow@1.0.0` → approve | `指向這個版本`; the name is held by the passkey account | `0x866a8c93…f9e9`; 04–05 |
| 5 | New Game, then Worlds → Saves: 這個存檔的 ENS 名稱 | cartridge name current; default label from the seed; `目前：0 chapters cleared · 1 deed · <hash>` | 06–07, 11 |
| 6 | Label `kidney-run`, 用 passkey 記錄 (first account) | `kidney-run.aether-land.unmapped.eth 記錄的就是這個存檔目前的樣子。` | `0x094dfa62…1d8a`; 08–09 |
| 7 | Label `first-light`, 用 passkey 記錄 (new account `0xfBaB…8537`) | recorded | `0x4c4c0479…175f` 901,746 gas; 12 |
| 8 | Export the backup; restore it on app B (fresh data, no passkey, no station) | **Failed first:** the restored save hashed differently (`227c7ed4…` vs `53c4df88…`). A field-by-field diff showed only `save.updatedAt`, which restore sets to the restore time. | 13-restored-before-fix |
| 9 | Fix: the fingerprint leaves out `updatedAt` (when the file was written, not the run). App A now reads the name as `記錄的是較早的進度`; 更新到目前進度 | `updateSave` moved `first-light` to `cf063883…4dbc` | `0x7156551a…084d` 274,808 gas; 14–15 |
| 10 | App B again (restarted on the fixed code), Worlds → Saves | it found the name by hash on its own: `first-light.aether-land.unmapped.eth 記錄的就是這個存檔目前的樣子。 目前：… cf063883…4dbc`, and `由 passkey 帳戶 0xfBaB…8537 持有，不是這台機器的 passkey。` | 16 |
| 11 | App B, 用 ENS 名稱開啟 `first-light.aether-land.unmapped.eth` | `這是 aether-land@1.3.0 的一個存檔：0 chapters cleared · 1 deed（進度雜湊 cf063883…4dbc）。 aether-land@1.3.0 已在你的收藏裡。` | 17 |
| 12 | Live auction page, Family tree | aether-land (market) → moss-hollow (cartridge), kidney-run and first-light (save, with their progress line) | 18 |

`kidney-run` still records its first checkpoint under the old fingerprint (with `updatedAt`); its
passkey was a virtual one whose credential was lost when the machine's temp folder was cleared, so
it cannot be moved. It stays as a historical record.

## The dry run's new checks (simulated on Sepolia's real contracts)

| Check | Result |
| --- | --- |
| A cartridge named with no market resolves to its revision; its node is `namehash(name)` | `atlas.<parent>` 846,210 gas |
| Only the holder may launch a name | refused |
| A remix cannot launch before its parent | refused (`globe.atlas`) |
| A save recorded by a passkey account is held by that account; records resolve | 880,211 gas |
| The holder moves it to a later checkpoint | 277,320 gas |
| Anyone else moving it | refused |
| A name under a save | refused |

## Not verified here

- Real Touch ID (virtual authenticator), and the deployed Worker sending (it has no key yet); see
  milestone-lineage-relay.
- A save with cleared chapters: the progress line was only seen at `0 chapters cleared · 1 deed`.
