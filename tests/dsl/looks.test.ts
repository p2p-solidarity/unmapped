import { accentFor, ROLE_LOOK } from "@dsl/index";
import { BODY_KINDS, HAT_KINDS, HELD_KINDS, NPC_ROLES } from "@shared/world";
import { describe, expect, it } from "vitest";

const HEX = /^#[0-9a-f]{6}$/;

describe("ROLE_LOOK", () => {
  it("dresses every role from the shared vocabulary", () => {
    expect(Object.keys(ROLE_LOOK).sort()).toEqual([...NPC_ROLES].sort());
    for (const role of NPC_ROLES) {
      const look = ROLE_LOOK[role];
      expect(BODY_KINDS).toContain(look.body);
      expect(HAT_KINDS).toContain(look.hat);
      expect(HELD_KINDS).toContain(look.held);
    }
  });

  it("gives the roles that carry the world's tools their own silhouette", () => {
    expect(ROLE_LOOK.monk).toEqual({ body: "slim", hat: "hood", held: "staff" });
    expect(ROLE_LOOK.smith).toEqual({ body: "stout", hat: "headband", held: "hammer" });
    expect(ROLE_LOOK.child).toEqual({ body: "child", hat: "ribbon", held: "none" });
    expect(ROLE_LOOK.guard).toEqual({ body: "tall", hat: "helm", held: "spear" });
  });

  it("does not give every role the same look", () => {
    const looks = NPC_ROLES.map((role) => Object.values(ROLE_LOOK[role]).join("/"));
    expect(new Set(looks).size).toBe(NPC_ROLES.length);
  });
});

describe("accentFor", () => {
  it("is a pure function of the colour", () => {
    expect(accentFor("#e2b7c3")).toBe(accentFor("#e2b7c3"));
    expect(accentFor("#E2B7C3")).toBe(accentFor("#e2b7c3"));
    expect(accentFor("#abc")).toBe(accentFor("#aabbcc"));
  });

  it("always answers with a lowercase #rrggbb that is not the body colour", () => {
    for (const color of ["#e2b7c3", "#9ab0c8", "#000000", "#ffffff", "#808080", "#00ff00"]) {
      const accent = accentFor(color);
      expect(accent).toMatch(HEX);
      expect(accent).not.toBe(color);
    }
  });

  it("stays colourful even for a grey body, so the trim reads as a choice", () => {
    const accent = accentFor("#777777");
    const channels = [1, 3, 5].map((i) => Number.parseInt(accent.slice(i, i + 2), 16));
    expect(Math.max(...channels) - Math.min(...channels)).toBeGreaterThan(24);
  });

  it("separates two nearby body colours", () => {
    expect(accentFor("#e2b7c3")).not.toBe(accentFor("#c3b7e2"));
  });
});
