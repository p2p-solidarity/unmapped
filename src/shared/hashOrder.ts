// The one order that everything hashed, or stored and compared on another machine, is sorted in.
// A bare `localeCompare` follows the machine's language: Czech collation puts "ch" after "h" and
// Danish puts "aa" after "z", so the same cartridge would hash one way in Tokyo and another in
// Prague, and a valid revision would fail its integrity check there. English collation is what
// every published hash so far was made with (paths, ids and capability keys are ASCII, where the
// en, zh and ja orders agree), so it is pinned here.

const COLLATOR = new Intl.Collator("en");

export function hashOrder(a: string, b: string): number {
  return COLLATOR.compare(a, b);
}
