import { join } from "node:path";
import { isWorldFile, isWorldId, makeWorldId, mapChangedPath, slug } from "@main/worlds/paths";
import { describe, expect, it } from "vitest";

const ROOT = "/tmp/aether/worlds";

describe("slug + makeWorldId", () => {
  it("slugifies names and falls back for scriptless input", () => {
    expect(slug("My Great World!")).toBe("my-great-world");
    expect(slug("  ---  ")).toBe("world");
    expect(slug("私の世界")).toBe("world");
  });

  it("appends a base36 timestamp and stays a valid id", () => {
    const id = makeWorldId("My Great World", 1_700_000_000_000);
    expect(id).toBe(`my-great-world-${(1_700_000_000_000).toString(36)}`);
    expect(isWorldId(id)).toBe(true);
  });

  it("rejects ids that could escape the worlds dir", () => {
    expect(isWorldId("..")).toBe(false);
    expect(isWorldId("../etc")).toBe(false);
    expect(isWorldId("Upper")).toBe(false);
    expect(isWorldId("")).toBe(false);
  });
});

describe("mapChangedPath", () => {
  it("maps <worldsDir>/<id>/<file> to a change event payload", () => {
    expect(mapChangedPath(ROOT, join(ROOT, "abc-123", "world.oui"))).toEqual({
      worldId: "abc-123",
      file: "world.oui",
    });
    expect(mapChangedPath(ROOT, join(ROOT, "abc-123", "karma.jsonl"))).toEqual({
      worldId: "abc-123",
      file: "karma.jsonl",
    });
  });

  it("ignores unknown files, nested paths and anything outside the worlds dir", () => {
    expect(mapChangedPath(ROOT, join(ROOT, "abc-123", "world.oui.swp"))).toBeNull();
    expect(mapChangedPath(ROOT, join(ROOT, "abc-123", "nested", "meta.json"))).toBeNull();
    expect(mapChangedPath(ROOT, join(ROOT, "abc-123"))).toBeNull();
    expect(mapChangedPath(ROOT, "/tmp/elsewhere/meta.json")).toBeNull();
    expect(mapChangedPath(ROOT, join(ROOT, "Bad Id", "meta.json"))).toBeNull();
  });

  it("knows the five world files", () => {
    for (const file of [
      "meta.json",
      "genesis.json",
      "world.oui",
      "karma.jsonl",
      "inventory.json",
    ]) {
      expect(isWorldFile(file)).toBe(true);
    }
    expect(isWorldFile("notes.txt")).toBe(false);
  });
});
