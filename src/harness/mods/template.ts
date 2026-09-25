// Effect templates: how a mod's declarative tool becomes a GameEffect.
//
// A manifest writes `{{param}}` into the effect it wants. The harness has already validated the
// model's arguments, so substitution is mechanical:
//
//   "{{hue}}"            → the argument itself, keeping its own type (number stays a number)
//   "a {{hue}} lantern"  → the argument rendered into the surrounding text
//   "{{missing}}"        → an error naming the placeholder (the model sees it and can retry)
//
// There are no derived helpers: `{{hue_hex}}` is unknown unless a parameter is named `hue_hex`.

import { err, ok, type Result } from "@shared/result";
import type { JsonValue } from "../types";

const WHOLE = /^\{\{([a-z][a-z0-9_]*)\}\}$/;
const REFERENCE = /\{\{([a-z][a-z0-9_]*)\}\}/g;

function render(value: JsonValue): string {
  if (typeof value === "string") return value;
  if (value === null || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return JSON.stringify(value);
}

function unknownPlaceholder(name: string, args: Record<string, JsonValue>): Result<JsonValue> {
  const known = Object.keys(args).sort();
  return err(
    "mod-template-placeholder",
    `unknown placeholder "{{${name}}}" in the effect template`,
    known.length > 0
      ? `arguments available here: ${known.join(", ")}`
      : "this tool takes no arguments",
  );
}

/**
 * Substitute every `{{param}}` in `template` with the matching argument.
 *
 * @param template - the manifest's effect, or any value nested inside it.
 * @param args - the validated arguments of the call.
 */
export function fillTemplate(
  template: unknown,
  args: Record<string, JsonValue>,
): Result<JsonValue> {
  if (typeof template === "string") {
    const whole = WHOLE.exec(template);
    if (whole !== null) {
      const name = whole[1] ?? "";
      if (!Object.hasOwn(args, name)) return unknownPlaceholder(name, args);
      return ok(args[name] ?? null);
    }
    const missing: string[] = [];
    const text = template.replace(REFERENCE, (_match, name: string) => {
      if (!Object.hasOwn(args, name)) {
        missing.push(name);
        return "";
      }
      return render(args[name] ?? null);
    });
    const first = missing[0];
    if (first !== undefined) return unknownPlaceholder(first, args);
    return ok(text);
  }
  if (Array.isArray(template)) {
    const items: JsonValue[] = [];
    for (const entry of template) {
      const filled = fillTemplate(entry, args);
      if (!filled.ok) return filled;
      items.push(filled.value);
    }
    return ok(items);
  }
  if (template !== null && typeof template === "object") {
    const record: Record<string, JsonValue> = {};
    for (const [key, value] of Object.entries(template)) {
      const filled = fillTemplate(value, args);
      if (!filled.ok) return filled;
      record[key] = filled.value;
    }
    return ok(record);
  }
  if (typeof template === "number" || typeof template === "boolean") return ok(template);
  // `undefined` is not JSON; a YAML key with no value becomes an explicit null.
  return ok(null);
}
