import { modProposalLibrary, parseModProposal } from "@dsl/modProposal";
import { chat } from "@renderer/llm";
import type { CartridgeRevision } from "@shared/cartridge";
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
  const system = `You propose a data-only cartridge revision. Write only OpenUI Lang, no JSON or JavaScript. The first statement is root = Proposal([operation references]). Never apply changes. Use only the installed capabilities and asset IDs in the facts. Change only what the player requests.\n${modProposalLibrary.prompt()}`;
  const facts =
    base.manifest.formatVersion === 2
      ? {
          scenes: base.manifest.definition.scenePlan,
          assets: base.manifest.definition.assetPacks,
          modules: base.manifest.definition.moduleLock,
        }
      : {};
  const messages = [
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
    });
    if (!response.ok) return response;
    result = parseModProposal(response.value.text, metadata);
    if (result.ok) return result;
    messages.push({
      role: "user",
      content: `Your previous program:\n${response.value.text}\nValidation error: ${result.error.message}. Return a corrected complete program.`,
    });
  }
  return result as Result<SeedModProposal>;
}
