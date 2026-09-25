import { parseModProposal } from "@dsl/modProposal";
import { describe, expect, it } from "vitest";

const metadata = {
  base: { cartridgeId: "test", version: "1.0.0", contentHash: `sha256:${"a".repeat(64)}` as const },
  authorPrompt: "Add a gun",
  proposalId: "proposal-1",
  generatedAt: "2026-09-26T00:00:00.000Z",
};
describe("typed mod DSL", () => {
  it("produces approved-only data with bounded weapon values", () => {
    const source =
      'root = Proposal([weapon])\nweapon = AddWeapon("my_gun", "My gun", "gun", 30, 20, 300, 12, "builtin:crystal")';
    const result = parseModProposal(source, metadata);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.operations[0]).toMatchObject({
      type: "add_weapon",
      weapon: { weaponId: "my_gun", damage: 30 },
    });
    expect(parseModProposal(source.replace(", 30,", ", 999999,"), metadata).ok).toBe(false);
    expect(parseModProposal('root = Proposal([x])\nx = Execute("evil.js")', metadata).ok).toBe(
      false,
    );
  });
});
