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
  for (const action of INPUT_ACTIONS) {
    const keys = rules.bindings[action];
    if (keys === undefined || keys.length === 0) continue;
    statements.push({ id: action, call: `Bind(${str(action)}, ${list(keys)})` });
  }
  const children = statements.map((statement) => statement.id).join(", ");
  const root = `root = Rules(${str(rules.defaultKit)}, ${str(rules.physics)}, [${children}])`;
  return [root, ...statements.map((statement) => `${statement.id} = ${statement.call}`)].join("\n");
}
