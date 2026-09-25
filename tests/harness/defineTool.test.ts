import { paramZod } from "@harness";
import { describe, expect, it } from "vitest";

describe("defineTool parameter specs", () => {
  it("builds a validator that agrees with the schema it advertises", () => {
    expect(paramZod({ type: "string", enum: ["amber", "rose"] }).safeParse("amber").success).toBe(
      true,
    );
    expect(paramZod({ type: "string", enum: ["amber", "rose"] }).safeParse("jade").success).toBe(
      false,
    );
    expect(paramZod({ type: "integer" }).safeParse(2.5).success).toBe(false);
    expect(paramZod({ type: "number", minimum: 0, maximum: 1 }).safeParse(2).success).toBe(false);
    expect(paramZod({ type: "boolean" }).safeParse("yes").success).toBe(false);
    expect(
      paramZod({ type: "array", items: { type: "number" } }).safeParse([1, "two"]).success,
    ).toBe(false);
    expect(
      paramZod({ type: "array", items: { type: "array", items: { type: "string" } } }).safeParse([
        ["a"],
      ]).success,
    ).toBe(true);
  });
});
