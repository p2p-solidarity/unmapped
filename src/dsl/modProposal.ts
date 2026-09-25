import { createLibrary, defineComponent } from "@openuidev/lang-core";
import type { CartridgeRef } from "@shared/cartridge";
import { WEAPON_KINDS } from "@shared/combat";
import { seedModProposalSchema } from "@shared/mod-proposal-schema";
import type { ModOperation, SeedModProposal } from "@shared/mods";
import { err, ok, type Result } from "@shared/result";
import { TIMING_SYSTEMS, TURN_RESOLUTIONS } from "@shared/timing";
import { MONSTER_KINDS } from "@shared/world";
import { z } from "zod";
import { childrenOf, createDialect, parseRoot, readProps } from "./parse/program";

const AddWeapon = defineComponent({
  name: "AddWeapon",
  component: "AddWeapon",
  description:
    "propose a weapon; assetId is a declared asset id or none. A cartridge without combat gets the combat module added for it",
  props: z.object({
    weaponId: z.string(),
    name: z.string(),
    kind: z.enum(WEAPON_KINDS),
    damage: z.number(),
    range: z.number(),
    cooldownMs: z.number(),
    magazine: z.number(),
    assetId: z.string(),
  }),
});
const ChangeTiming = defineComponent({
  name: "ChangeTiming",
  component: "ChangeTiming",
  description: "propose a timing change; must name the current system accurately",
  props: z.object({
    from: z.enum(TIMING_SYSTEMS),
    to: z.enum(TIMING_SYSTEMS),
    resolution: z.enum(TURN_RESOLUTIONS),
    turnDurationMs: z.number(),
  }),
});
const AddModule = defineComponent({
  name: "AddModule",
  component: "AddModule",
  description:
    "add an installed engine module; the host also adds what it requires and turns its rules on",
  props: z.object({ moduleId: z.string(), version: z.string() }),
});
const Objective = defineComponent({
  name: "Objective",
  component: "Objective",
  description: "change one existing scene objective",
  props: z.object({ sceneId: z.string(), text: z.string() }),
});
const ReplaceAsset = defineComponent({
  name: "ReplaceAsset",
  component: "ReplaceAsset",
  description: "replace every placement of an existing asset in one scene",
  props: z.object({ sceneId: z.string(), fromAssetId: z.string(), toAssetId: z.string() }),
});
const MoveAsset = defineComponent({
  name: "MoveAsset",
  component: "MoveAsset",
  description: "move an existing asset inside one scene",
  props: z.object({ sceneId: z.string(), assetId: z.string(), x: z.number(), z: z.number() }),
});
const AddMonster = defineComponent({
  name: "AddMonster",
  component: "AddMonster",
  description:
    "place a hostile creature in one scene (combat is turned on if the cartridge had none); weakness in the player's language",
  props: z.object({
    sceneId: z.string(),
    kind: z.enum(MONSTER_KINDS),
    x: z.number(),
    z: z.number(),
    level: z.number(),
    weakness: z.string(),
  }),
});
const Proposal = defineComponent({
  name: "Proposal",
  component: "Proposal",
  description: "root, proposed operations only; nothing is applied without human approval",
  props: z.object({
    children: z
      .array(
        z.union([
          AddWeapon.ref,
          ChangeTiming.ref,
          AddModule.ref,
          Objective.ref,
          ReplaceAsset.ref,
          MoveAsset.ref,
          AddMonster.ref,
        ]),
      )
      .min(1)
      .max(16),
  }),
});
export const modProposalLibrary = createLibrary({
  id: "unwritten-land/mod-proposal",
  root: "Proposal",
  components: [
    Proposal,
    AddWeapon,
    ChangeTiming,
    AddModule,
    Objective,
    ReplaceAsset,
    MoveAsset,
    AddMonster,
  ],
});
const dialect = createDialect(modProposalLibrary);

/** Ids are ascii snake_case; a model's `weapon:gun 1` is made one rather than refused. */
function safeId(raw: string, fallback: string): string {
  const id = raw
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "_")
    .replace(/^[^a-z0-9]+/, "")
    .slice(0, 80);
  return id === "" ? fallback : id;
}

export function parseModProposal(
  source: string,
  metadata: { base: CartridgeRef; authorPrompt: string; proposalId: string; generatedAt: string },
): Result<SeedModProposal> {
  const parsed = parseRoot(dialect, source);
  if (!parsed.ok) return parsed;
  const operations: ModOperation[] = [];
  const issues: Parameters<typeof readProps>[2] = [];
  for (const child of childrenOf(parsed.value)) {
    if (child.typeName === "AddWeapon") {
      const p = readProps(AddWeapon.props, child, issues);
      if (p)
        operations.push({
          type: "add_weapon",
          weapon: {
            ...p,
            weaponId: safeId(p.weaponId, "weapon"),
            magazine: p.magazine <= 0 ? null : Math.round(p.magazine),
            cooldownMs: Math.round(p.cooldownMs),
            assetId: p.assetId.trim() === "" ? "none" : p.assetId,
            ammoType: null,
          },
        });
    } else if (child.typeName === "ChangeTiming") {
      const p = readProps(ChangeTiming.props, child, issues);
      if (p) operations.push({ type: "change_timing", change: p });
    } else if (child.typeName === "AddModule") {
      const p = readProps(AddModule.props, child, issues);
      if (p) operations.push({ type: "add_capability_module", ...p });
    } else if (child.typeName === "Objective") {
      const p = readProps(Objective.props, child, issues);
      if (p)
        operations.push({
          type: "scene_patch",
          sceneId: p.sceneId,
          patch: { operations: [{ type: "set_objective", text: p.text }] },
        });
    } else if (child.typeName === "ReplaceAsset") {
      const p = readProps(ReplaceAsset.props, child, issues);
      if (p)
        operations.push({
          type: "scene_patch",
          sceneId: p.sceneId,
          patch: {
            operations: [
              { type: "replace_asset", fromAssetId: p.fromAssetId, toAssetId: p.toAssetId },
            ],
          },
        });
    } else if (child.typeName === "AddMonster") {
      const p = readProps(AddMonster.props, child, issues);
      if (p)
        operations.push({
          type: "scene_patch",
          sceneId: p.sceneId,
          patch: {
            operations: [
              {
                type: "add_monster",
                kind: p.kind,
                x: Math.max(0, Math.round(p.x)),
                z: Math.max(0, Math.round(p.z)),
                level: Math.min(99, Math.max(1, Math.round(p.level))),
                weakness: p.weakness,
              },
            ],
          },
        });
    } else if (child.typeName === "MoveAsset") {
      const p = readProps(MoveAsset.props, child, issues);
      if (p)
        operations.push({
          type: "scene_patch",
          sceneId: p.sceneId,
          patch: { operations: [{ type: "move_asset", assetId: p.assetId, x: p.x, z: p.z }] },
        });
    }
  }
  if (issues.length) return err("mod-proposal-invalid", issues[0]?.message ?? "Invalid operation.");
  const result = seedModProposalSchema.safeParse({ ...metadata, operations });
  if (result.success) return ok(result.data);
  const issue = result.error.issues[0];
  // Say exactly which operation and field failed, so a retry fixes that and keeps the rest.
  const where = issue?.path.join(".") ?? "proposal";
  return err(
    "mod-proposal-invalid",
    `${where}: ${issue?.message ?? "invalid"}`,
    "Keep every other operation as it was and fix only this field.",
  );
}
