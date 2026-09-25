import { createWorldInputSchema, worldFileSchema, worldIdSchema } from "@main/worlds/schemas";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { createInput } from "./fixtures";

describe("ipc payload schemas", () => {
  it("checks the worlds.read argument tuple", () => {
    const args = z.tuple([worldIdSchema, worldFileSchema]);
    expect(args.safeParse(["abc-1", "world.oui"]).success).toBe(true);
    expect(args.safeParse(["abc-1", "evil.sh"]).success).toBe(false);
    expect(args.safeParse(["abc-1"]).success).toBe(false);
    expect(args.safeParse([1, "world.oui"]).success).toBe(false);
  });

  it("checks the create payload", () => {
    expect(createWorldInputSchema.safeParse(createInput()).success).toBe(true);
    expect(createWorldInputSchema.safeParse({ name: "x", scene: "y" }).success).toBe(false);
    expect(createWorldInputSchema.safeParse({ ...createInput(), scene: "" }).success).toBe(false);
    expect(
      createWorldInputSchema.safeParse({
        ...createInput(),
        genesis: { ...createInput().genesis, archetype: "chaos" },
      }).success,
    ).toBe(false);
  });
});
