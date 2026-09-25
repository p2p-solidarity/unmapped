import { createLibrary, defineComponent } from "@openuidev/lang-core";
import type { CartridgeRef } from "@shared/cartridge";
import { WEAPON_KINDS } from "@shared/combat";
import { seedModProposalSchema } from "@shared/mod-proposal-schema";
import type { ModOperation, SeedModProposal } from "@shared/mods";
import { err, ok, type Result } from "@shared/result";
import { TIMING_SYSTEMS, TURN_RESOLUTIONS } from "@shared/timing";
import { z } from "zod";
import { childrenOf, createDialect, parseRoot, readProps } from "./parse/program";

const AddWeapon = defineComponent({
  name: "AddWeapon",
  component: "AddWeapon",
  description: "propose a weapon using an asset already declared by this cartridge",
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
  description: "lock an installed engine module",
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
        ]),
      )
      .min(1)
      .max(16),
  }),
});
export const modProposalLibrary = createLibrary({
  id: "unwritten-land/mod-proposal",
  root: "Proposal",
  components: [Proposal, AddWeapon, ChangeTiming, AddModule, Objective, ReplaceAsset, MoveAsset],
});
const dialect = createDialect(modProposalLibrary);

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
          weapon: { ...p, magazine: p.magazine === 0 ? null : p.magazine, ammoType: null },
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
  return result.success
    ? ok(result.data)
    : err(
        "mod-proposal-invalid",
        result.error.issues[0]?.message ?? "Invalid proposal.",
        "Ask for one supported change at a time.",
      );
}
