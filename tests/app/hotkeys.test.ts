import { type HotkeyContext, hotkeyAction } from "@renderer/app/hotkeys";
import { describe, expect, it } from "vitest";

const base: HotkeyContext = {
  screen: "play",
  consoleOpen: false,
  altarOpen: false,
  dialogueOpen: false,
  typing: false,
};

describe("hotkeyAction", () => {
  it("toggles the console with F12 and ` while playing", () => {
    expect(hotkeyAction("F12", base)).toBe("toggle-console");
    expect(hotkeyAction("Backquote", base)).toBe("toggle-console");
  });

  it("does not open the console outside the play screen", () => {
    for (const screen of ["worlds", "create"] as const) {
      expect(hotkeyAction("F12", { ...base, screen })).toBeNull();
      expect(hotkeyAction("Backquote", { ...base, screen })).toBeNull();
    }
  });

  it("leaves ` to the text field while typing, but keeps F12", () => {
    const typing = { ...base, typing: true, consoleOpen: true };
    expect(hotkeyAction("Backquote", typing)).toBeNull();
    expect(hotkeyAction("F12", typing)).toBe("toggle-console");
  });

  it("closes console, then altar, then dialogue on Escape", () => {
    const all = { ...base, consoleOpen: true, altarOpen: true, dialogueOpen: true };
    expect(hotkeyAction("Escape", all)).toBe("close-console");
    expect(hotkeyAction("Escape", { ...all, consoleOpen: false })).toBe("close-altar");
    expect(hotkeyAction("Escape", { ...all, consoleOpen: false, altarOpen: false })).toBe(
      "close-dialogue",
    );
    expect(hotkeyAction("Escape", base)).toBe("exit-play");
  });

  it("closes overlays with Escape even when typing", () => {
    expect(hotkeyAction("Escape", { ...base, typing: true, consoleOpen: true })).toBe(
      "close-console",
    );
  });

  it("ignores movement and other keys", () => {
    for (const code of ["KeyW", "KeyE", "KeyC", "ShiftLeft", "Enter", "F5"]) {
      expect(hotkeyAction(code, base)).toBeNull();
    }
  });
});
