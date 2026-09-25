import { type GameplayRules, INPUT_ACTIONS } from "@shared/cartridge";

const str = (value: string): string => JSON.stringify(value);
const num = (value: number): string => String(value);
const list = (values: readonly string[]): string => `[${values.map(str).join(", ")}]`;

export function serializeRules(rules: GameplayRules): string {
  const statements: { id: string; call: string }[] = [];
  for (const [index, kit] of rules.kits.entries()) {
    statements.push({
      id: `kit${index + 1}`,
      call: `Kit(${[
        str(kit.id),
        num(kit.moveSpeed),
        num(kit.sprintSpeed),
        num(kit.jumpSpeed),
        num(kit.gravity),
        num(kit.interactDistance),
        num(kit.cameraFov),
        num(kit.lookSensitivity),
        num(kit.cameraDistance),
      ].join(", ")})`,
    });
  }
  if (rules.timing !== null) {
    statements.push({
      id: "timing",
      call: `Timing(${[
        str(rules.timing.system),
        str(rules.timing.resolution),
        num(rules.timing.turnSeconds),
      ].join(", ")})`,
    });
  }
  if (rules.combat !== null) {
    statements.push({
      id: "combat",
      call: `Combat(${[
        num(rules.combat.playerHp),
        num(rules.combat.monsterHpBase),
        num(rules.combat.monsterHpPerLevel),
      ].join(", ")})`,
    });
  }
  if (rules.party !== null) {
    statements.push({
      id: "party",
      call: `Party(${[
        num(rules.party.size),
        num(rules.party.memberHp),
        num(rules.party.memberSpeed),
      ].join(", ")})`,
    });
  }
  if (rules.generation !== null) {
    statements.push({
      id: "generate",
      call: `Generate(${[
        str(rules.generation.kind),
        num(rules.generation.width),
        num(rules.generation.depth),
        num(rules.generation.braid),
      ].join(", ")})`,
    });
  }
  for (const [index, rule] of rules.progression.entries()) {
    statements.push({
      id: `progression${index + 1}`,
      call: `Progression(${str(rule.kind)}, ${num(rule.value)})`,
    });
  }
  for (const [index, weapon] of rules.weapons.entries()) {
    statements.push({
      id: `weapon${index + 1}`,
      call: `Weapon(${[
        str(weapon.id),
        str(weapon.name),
        str(weapon.kind),
        num(weapon.damage),
        num(weapon.range),
        num(weapon.cooldownMs),
        // null round-trips as 0, the DSL's "never runs dry".
        num(weapon.magazine ?? 0),
        ...(weapon.assetId === undefined ? [] : [str(weapon.assetId)]),
      ].join(", ")})`,
    });
  }
  for (const action of INPUT_ACTIONS) {
    const keys = rules.bindings[action];
    if (keys === undefined || keys.length === 0) continue;
    statements.push({ id: action, call: `Bind(${str(action)}, ${list(keys)})` });
  }
  const children = statements.map((statement) => statement.id).join(", ");
  const root = `root = Rules(${str(rules.defaultKit)}, ${str(rules.physics)}, [${children}])`;
  return [root, ...statements.map((statement) => `${statement.id} = ${statement.call}`)].join("\n");
}
