import {
  generateRoomCode,
  isValidRoomCode,
  ROOM_CODE_ALPHABET,
  ROOM_CODE_LENGTH,
} from "@renderer/net/codes";
import { describe, expect, it } from "vitest";

describe("room codes", () => {
  it("generates codes of the right length from the alphabet only", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 500; i += 1) {
      const code = generateRoomCode();
      expect(code.length).toBe(ROOM_CODE_LENGTH);
      for (const character of code) expect(ROOM_CODE_ALPHABET).toContain(character);
      expect(isValidRoomCode(code)).toBe(true);
      seen.add(code);
    }
    expect(seen.size).toBeGreaterThan(400);
  });

  it("rejects wrong lengths and banned characters", () => {
    expect(isValidRoomCode("ABC23")).toBe(false);
    expect(isValidRoomCode("ABC23DE")).toBe(false);
    expect(isValidRoomCode("ABC23I")).toBe(false);
    expect(isValidRoomCode("ABC230")).toBe(false);
    expect(isValidRoomCode("abc23d")).toBe(false);
    expect(isValidRoomCode("")).toBe(false);
  });
});
