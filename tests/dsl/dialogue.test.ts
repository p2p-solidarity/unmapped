import { parseDialogue } from "@dsl/index";
import { LIMITS } from "@dsl/limits";
import { describe, expect, it } from "vitest";
import { fixture } from "./fixtures";

describe("parseDialogue", () => {
  it('rejects the action "fight", which the engine cannot honour', () => {
    const result = parseDialogue(fixture("dialogue-fight.oui"));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("dsl-invalid-props");
    expect(result.error.errors[0]?.statementId).toBe("c1");
    expect(result.error.errors[0]?.message).toContain("fight");
  });

  it("drops repeated labels and keeps at most three choices", () => {
    const result = parseDialogue(
      [
        'root = Dialogue("hana_inn", "Well?", [c1, c2, c3, c4, c5])',
        'c1 = Choice("Yes", "talk", "She nods.", [])',
        'c2 = Choice("yes", "talk", "She nods again.", [])',
        'c3 = Choice("No", "leave", "She shrugs.", [])',
        'c4 = Choice("Maybe", "talk", "She waits.", [])',
        'c5 = Choice("Buy soup", "trade", "She fills a bowl.", ["hot soup"])',
      ].join("\n"),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.choices).toHaveLength(LIMITS.maxChoices);
    expect(result.value.choices.map((choice) => choice.label)).toEqual(["Yes", "No", "Maybe"]);
  });

  it("treats an empty Mutation as no mutation and demands at least one choice", () => {
    const quiet = parseDialogue(
      [
        'root = Dialogue("hana_inn", "Nothing changes.", [c1], m)',
        'c1 = Choice("Leave", "leave", "She waves.", [])',
        "m = Mutation(null, null, null)",
      ].join("\n"),
    );
    expect(quiet.ok).toBe(true);
    if (quiet.ok) expect(quiet.value.mutation).toBeNull();

    const silent = parseDialogue('root = Dialogue("hana_inn", "...", [])');
    expect(silent.ok).toBe(false);
    if (!silent.ok) expect(silent.error.code).toBe("dsl-no-choices");
  });
});
