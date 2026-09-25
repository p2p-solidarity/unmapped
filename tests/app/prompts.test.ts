import { nearbyPrompt } from "@renderer/app/prompts";
import type { NearbyTarget } from "@shared/events";
import { describe, expect, it } from "vitest";

function target(kind: NearbyTarget["kind"], label: string): NearbyTarget {
  return { kind, id: `${kind}-1`, label, distance: 1.2 };
}

describe("nearbyPrompt", () => {
  it("shows nothing when nothing is in range", () => {
    expect(nearbyPrompt(null)).toBeNull();
  });

  it("names the NPC the engine resolved", () => {
    expect(nearbyPrompt(target("npc", "Aoi"))).toBe("E · Talk to Aoi");
  });

  it("uses the verb alone for treasures and exits", () => {
    expect(nearbyPrompt(target("treasure", "Treasure"))).toBe("E · Open");
    expect(nearbyPrompt(target("exit", "the sunken stair"))).toBe("E · Descend");
  });

  it("covers altars, monsters and triggers", () => {
    expect(nearbyPrompt(target("altar", "Altar"))).toBe("E · Make a wish");
    expect(nearbyPrompt(target("monster", "Slime"))).toBe("E · Inspect Slime");
    expect(nearbyPrompt(target("trigger", "cracked floor"))).toBe("E · Examine cracked floor");
  });

  it("degrades to the verb when the model gave no label", () => {
    expect(nearbyPrompt(target("npc", "   "))).toBe("E · Talk");
    expect(nearbyPrompt(target("monster", ""))).toBe("E · Inspect");
    expect(nearbyPrompt(target("trigger", ""))).toBe("E · Examine");
  });
});

describe("errand bearings", () => {
  it("names distance and compass direction with north as -z", async () => {
    const { bearingOf } = await import("@renderer/app/land/errands");
    expect(bearingOf(-12, -4)).toBe("about 13 tiles west");
    expect(bearingOf(0, -5)).toBe("about 5 tiles north");
    expect(bearingOf(3, 3)).toBe("about 4 tiles south-east");
  });
});
