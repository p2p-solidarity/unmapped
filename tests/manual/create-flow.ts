// Dev check (not shipped): the whole v2 Create flow against a real model, with no Electron and no
// UI — scene candidates, baked voices, Forge, publish, instance, scene transitions.
//
//   set -a && . ./.env && set +a
//   bun --tsconfig-override tsconfig.test.json tests/manual/create-flow.ts [model] [scenes]
//
// Not a vitest file (no `.test.ts`): it spends real tokens, so it runs only when asked.
//
// It writes to a throwaway directory under $TMPDIR and prints what it built.

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  type CandidateSceneContext,
  candidateIssues,
  candidateScenePrompt,
  dialoguePrompt,
  normalizeOutput,
  parseDialogue,
  parseScene,
  repairPrompt,
  serializeScene,
} from "@dsl/index";
import { publishCartridgeRevision, readCartridgeRevision } from "@main/cartridges/store";
import { createInstance, resolveInstance, transitionInstance } from "@main/instances/store";
import { buildCartridge } from "@renderer/narrative/forge";
import { type CapabilityProfile, compileCapabilities } from "@shared/capabilities";
import { BUILTIN_MODULES } from "@shared/capability-modules";
import { hashText } from "@shared/content-hash";
import { kitFor } from "@shared/forge";
import { emptyDraft } from "@shared/game-definition";
import { requirementsFor } from "@shared/mode-catalog";
import { rollBases } from "@shared/scene-bases";
import type { AuthoringSnapshot, SceneGallerySlot } from "@shared/scene-gallery";
import OpenAI from "openai";

const model = process.argv[2] ?? "gpt-5-mini";
const sceneCount = Number(process.argv[3] ?? 2);
const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

type Turn = { role: "system" | "user" | "assistant"; content: string };

async function ask(messages: Turn[]): Promise<string> {
  const response = await client.chat.completions.create({
    model,
    messages,
    max_completion_tokens: 6000,
  });
  return response.choices[0]?.message?.content ?? "";
}

function must<T>(
  result: { ok: true; value: T } | { ok: false; error: { code: string; message: string } },
): T {
  if (!result.ok) throw new Error(`${result.error.code}: ${result.error.message}`);
  return result.value;
}

const BRIEF = "A quiet errand between two farms at dusk.";
const TITLE = "Low Well";
const selection = { genres: ["adventure_rpg"], timings: [], structures: [], settings: [] } as const;
const resolution = compileCapabilities({
  requirements: requirementsFor(selection as never),
  modules: BUILTIN_MODULES,
  overrides: {},
  accepted: {},
});
const firstContext = resolution.contexts[0];
if (firstContext === undefined || firstContext.profile === null) {
  throw new Error("no ready capability context");
}
const context = firstContext;
const profile: CapabilityProfile = firstContext.profile;

const bases = rollBases(11);

async function writeScene(index: number): Promise<{ slot: SceneGallerySlot; source: string }> {
  const base = bases[index % bases.length];
  if (base === undefined) throw new Error("no base");
  const slotId = `scene-${index + 1}`;
  const terminal = index === sceneCount - 1;
  const ctx: CandidateSceneContext = {
    gameTitle: TITLE,
    brief: BRIEF,
    modes: [...selection.genres],
    sceneTitle: `Scene ${index + 1}`,
    sceneRole: terminal ? "ending" : index === 0 ? "opening" : "hub",
    position: index + 1,
    total: sceneCount,
    terminal,
    base,
    kit: kitFor(profile),
    combat: false,
    language: "en-US",
  };
  const messages: Turn[] = [
    { role: "system", content: candidateScenePrompt(ctx) },
    { role: "user", content: `Write the Scene program for "${ctx.sceneTitle}". Output only.` },
  ];
  for (let round = 0; round < 3; round += 1) {
    const source = normalizeOutput(await ask(messages));
    const parsed = parseScene(source);
    if (!parsed.ok) {
      console.log(`  ${slotId} round ${round}: parse — ${parsed.error.message}`);
      messages.push({ role: "assistant", content: source });
      messages.push({ role: "user", content: repairPrompt(source, parsed.error) });
      continue;
    }
    const issues = candidateIssues(parsed.value, ctx);
    if (issues.length === 0) {
      const canonical = `${serializeScene(parsed.value).replace(/\n*$/, "")}\n`;
      const graph = parsed.value;
      console.log(
        `  ${slotId} "${graph.name}" — ${graph.npcs.length} npcs, ${graph.props.length} props, ${graph.treasures.length} treasures, ${graph.quests.length} quests`,
      );
      const dialogues: Record<string, string> = {};
      for (const npc of graph.npcs) {
        const written = normalizeOutput(
          await ask([
            {
              role: "system",
              content: dialoguePrompt({
                genesis: { language: "en-US", intent: BRIEF },
                npc,
                scene: graph,
                karmaSummary: [],
                inventorySummary: [],
              }),
            },
            { role: "user", content: `Write the Dialogue program for ${npc.id}. Output only.` },
          ]),
        );
        const dialogue = parseDialogue(written);
        if (!dialogue.ok) throw new Error(`${npc.id}: ${dialogue.error.message}`);
        dialogues[npc.id] = written;
        console.log(`    voice ${npc.id}: "${dialogue.value.line.slice(0, 70)}…"`);
      }
      const contentHash = await hashText(canonical);
      const requestHash = await hashText(`${slotId}|${BRIEF}`);
      return {
        source: canonical,
        slot: {
          slotId,
          role: ctx.sceneRole as SceneGallerySlot["role"],
          title: graph.name,
          contextId: context.contextId,
          baseId: base.id,
          selectedCandidateId: `${slotId}-candidate`,
          candidates: [
            {
              candidateId: `${slotId}-candidate`,
              slotId,
              contextId: context.contextId,
              baseId: base.id,
              title: graph.name,
              sceneSource: canonical,
              contentHash,
              status: "ready",
              staleReason: null,
              dialogues,
              receipt: {
                operation: "initial",
                generationSeed: index,
                requestHash,
                parentCandidateHash: null,
                modelId: model,
                createdAt: new Date().toISOString(),
              },
            },
          ],
        },
      };
    }
    console.log(`  ${slotId} round ${round}: ${issues.length} fit issue(s)`);
    for (const issue of issues) console.log(`    - ${issue.message}`);
    messages.push({ role: "assistant", content: source });
    messages.push({
      role: "user",
      content: `Fix these and resend the whole program:\n${issues.map((i) => `- ${i.message} ${i.hint ?? ""}`).join("\n")}`,
    });
  }
  throw new Error(`${slotId}: no fitting scene after 3 rounds`);
}

const root = await mkdtemp(join(tmpdir(), "aether-create-flow-"));
try {
  console.log(`model=${model} scenes=${sceneCount} userData=${root}\n`);
  const slots: SceneGallerySlot[] = [];
  for (let index = 0; index < sceneCount; index += 1) slots.push((await writeScene(index)).slot);

  const snapshot: AuthoringSnapshot = {
    formatVersion: 1,
    workspaceId: "try-create-flow",
    draft: {
      ...emptyDraft(new Date().toISOString()),
      name: TITLE,
      brief: BRIEF,
      cartridgeId: "low-well-try",
      author: "dev",
      selection: selection as never,
      sceneBases: { baseIds: [slots[0]?.baseId ?? ""], rerollSeed: 11 },
    },
    gallery: {
      formatVersion: 1,
      slots,
      entrySlotId: slots[0]?.slotId ?? null,
      endingSlotIds: [slots[slots.length - 1]?.slotId ?? ""],
    },
    narrative: null,
    updatedAt: new Date().toISOString(),
  };

  const input = must(await buildCartridge(snapshot, resolution));
  if (input.manifest.formatVersion !== 2) throw new Error("expected a v2 manifest");
  const manifest = must(await publishCartridgeRevision(join(root, "cartridges"), input));
  console.log(`\nFORGED ${manifest.cartridgeId}@${manifest.version}`);
  console.log(`  ${manifest.contentHash}`);
  console.log(`  files: ${manifest.files.map((file) => file.path).join(", ")}`);

  const revision = must(
    await readCartridgeRevision(join(root, "cartridges"), manifest.cartridgeId, manifest.version),
  );
  console.log(
    `  read back: ${Object.keys(revision.scenes).length} scenes, ${Object.keys(revision.dialogues).length} voices`,
  );

  const instance = must(await createInstance(join(root, "instances"), manifest, `${TITLE} run`));
  console.log(`\nINSTANCE ${instance.meta.instanceId} at scene ${instance.save.currentSceneId}`);
  for (const slot of slots.slice(1)) {
    const moved = must(
      await transitionInstance(
        join(root, "cartridges"),
        join(root, "instances"),
        instance.meta.instanceId,
        slot.slotId,
      ),
    );
    console.log(`  → ${moved.instance.save.currentSceneId}`);
  }
  const reopened = must(
    await resolveInstance(
      join(root, "cartridges"),
      join(root, "instances"),
      instance.meta.instanceId,
    ),
  );
  console.log(`  reopened at ${reopened.instance.save.currentSceneId}`);
  console.log("\nOK");
} finally {
  await rm(root, { recursive: true, force: true });
}
