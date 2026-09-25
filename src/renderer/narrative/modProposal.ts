import { repairPrompt } from "@dsl/index";
import { modProposalLibrary, parseModProposal } from "@dsl/modProposal";
import type { DslError } from "@dsl/types";
import { chat, usageTag } from "@renderer/llm";
import { BUILTIN_MODULES } from "@shared/capability-modules";
import type { CartridgeRevision } from "@shared/cartridge";
import type { ChatMessage } from "@shared/llm";
import type { SeedModProposal } from "@shared/mods";
import type { Result } from "@shared/result";

export async function generateModProposal(
  base: CartridgeRevision,
  wish: string,
): Promise<Result<SeedModProposal>> {
  const { cartridgeId, version, contentHash } = base.manifest;
  const metadata = {
    base: { cartridgeId, version, contentHash },
    authorPrompt: wish,
    proposalId: crypto.randomUUID(),
    generatedAt: new Date().toISOString(),
  };
  const system = `You propose a data-only cartridge revision. Write only OpenUI Lang, no JSON or JavaScript. The first statement is root = Proposal([operation references]). Never apply changes. Change only what the player requests.
Never refuse because the cartridge lacks a capability: propose the change anyway. The host adds any installed module it needs (a weapon or a monster turns combat on; a squad adds combat too). Use AddModule only with an id from "installed".
Asset ids must come from "assets"; if none fits, write "none". Scene ids must come from "scenes". Monster weakness is written in the player's language.
${modProposalLibrary.prompt()}`;
  const facts =
    base.manifest.formatVersion === 2
      ? {
          scenes: base.manifest.definition.scenes.map((scene) => scene.sceneId),
          assets: base.manifest.definition.assetPacks.flatMap((pack) =>
            pack.assets.map((asset) => asset.assetId),
          ),
          locked: base.manifest.definition.moduleLock.entries.map((m) => m.moduleId),
          installed: BUILTIN_MODULES.map(
            (m) => `${m.moduleId}@${m.version}: ${m.provides.join(" ")}`,
          ),
        }
      : {};
  const messages: ChatMessage[] = [
    { role: "system" as const, content: system },
    {
      role: "user" as const,
      content: `Rules:\n${base.rules}\nDeclared content:\n${JSON.stringify(facts)}\nRequest: ${wish}`,
    },
  ];
  let result: Result<SeedModProposal> | null = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    const response = await chat({
      messages,
      maxTokens: 1600,
      temperature: 0.3,
      grammar: null,
      stop: [],
      tools: [],
      usage: usageTag("mod"),
    });
    if (!response.ok) return response;
    result = parseModProposal(response.value.text, metadata);
    if (result.ok) return result;
    const error = result.error;
    console.info(
      `[mods:proposal] attempt ${attempt + 1} rejected: ${error.code}\n${response.value.text}`,
    );
    // A parse failure names the failing statements; the model can only fix what it is shown.
    const detailed = "errors" in error && Array.isArray((error as DslError).errors);
    messages.push({ role: "assistant", content: response.value.text });
    messages.push({
      role: "user",
      content: detailed
        ? repairPrompt(response.value.text, error as DslError)
        : `Validation error: ${error.message}${error.hint ? ` (${error.hint})` : ""}. Return the complete corrected program with every operation you proposed.`,
    });
  }
  if (result !== null && !result.ok && "errors" in result.error) {
    const first = (result.error as DslError).errors[0];
    if (first !== undefined) {
      const where = first.statementId === undefined ? "" : `${first.statementId}: `;
      return { ok: false, error: { ...result.error, hint: `${where}${first.message}` } };
    }
  }
  return result as Result<SeedModProposal>;
}
