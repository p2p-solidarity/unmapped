import {
  generateRoomCode,
  isValidRoomCode,
  normalizeRoomCode,
  ROOM_CODE_ALPHABET,
  ROOM_CODE_LENGTH,
  roomName,
} from "@renderer/net/codes";
import { describe, expect, it } from "vitest";

describe("room codes", () => {
  it("excludes the characters that get misread", () => {
    expect(ROOM_CODE_ALPHABET).toBe("ABCDEFGHJKLMNPQRSTUVWXYZ23456789");
    for (const banned of ["I", "O", "0", "1"]) {
      expect(ROOM_CODE_ALPHABET).not.toContain(banned);
    }
  });

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

  it("uses every symbol of the alphabet across enough draws", () => {
    const used = new Set<string>();
    for (let i = 0; i < 5000; i += 1) {
      for (const character of generateRoomCode()) used.add(character);
    }
    expect(used.size).toBe(ROOM_CODE_ALPHABET.length);
  });

  it("normalises the separators people retype", () => {
    expect(normalizeRoomCode("  abc-23d ")).toBe("ABC23D");
    expect(normalizeRoomCode("ab c_23 d")).toBe("ABC23D");
  });

  it("rejects wrong lengths and banned characters", () => {
    expect(isValidRoomCode("ABC23")).toBe(false);
    expect(isValidRoomCode("ABC23DE")).toBe(false);
    expect(isValidRoomCode("ABC23I")).toBe(false);
    expect(isValidRoomCode("ABC230")).toBe(false);
    expect(isValidRoomCode("abc23d")).toBe(false);
    expect(isValidRoomCode("")).toBe(false);
  });

  it("namespaces the y-webrtc room", () => {
    expect(roomName("ABC23D")).toBe("unwritten-land:ABC23D");
  });
});
