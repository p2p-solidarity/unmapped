// `defineTool` — one parameter spec, two artifacts.
//
// A tool declares its parameters once, in the declarative subset a mod may also write
// (`ModParamSchema` in @shared/mods). From that single spec we build BOTH the zod validator the
// registry runs on the model's arguments AND the JSON Schema the model is shown, so the two can
// never drift apart.

import type { ModParamSchema } from "@shared/mods";
import { type ZodType, z } from "zod";
import type { JsonValue, ToolDefinition, ToolExec } from "./types";

/**
 * The parameter vocabulary, narrowed from {@link ModParamSchema} so that `required: true` keeps
 * its literal type and `InferArgs` can tell required keys from optional ones.
 */
export type ParamSpec =
  | { type: "string"; description?: string; enum?: readonly string[]; required?: true }
  | {
      type: "number" | "integer";
      description?: string;
      minimum?: number;
      maximum?: number;
      required?: true;
    }
  | { type: "boolean"; description?: string; required?: true }
  | { type: "array"; description?: string; items: ParamSpec; required?: true };

export type ParamSpecMap = Record<string, ParamSpec>;

/** The TypeScript value one parameter spec accepts. */
export type InferParam<S extends ParamSpec> = S["type"] extends "string"
  ? string
  : S["type"] extends "number" | "integer"
    ? number
    : S["type"] extends "boolean"
      ? boolean
      : S extends { items: infer I extends ParamSpec }
        ? InferParam<I>[]
        : never;

type RequiredKeys<P extends ParamSpecMap> = {
  [K in keyof P]: P[K] extends { required: true } ? K : never;
}[keyof P];

/** The `args` object a tool body receives: required keys required, everything else optional. */
export type InferArgs<P extends ParamSpecMap> = {
  [K in RequiredKeys<P>]: InferParam<P[K]>;
} & {
  [K in Exclude<keyof P, RequiredKeys<P>>]?: InferParam<P[K]>;
};

export interface DefineToolConfig<P extends ParamSpecMap> {
  name: string;
  /** What the model reads: what the tool does AND when to reach for it. */
  description: string;
  parameters: P;
  execute(args: InferArgs<P>, exec: ToolExec): Promise<JsonValue>;
  /** Projects the canonical value to model-facing text. Defaults to `JSON.stringify`. */
  render?(args: InferArgs<P>, value: JsonValue): string;
}

/** The zod validator for one parameter. */
export function paramZod(spec: ParamSpec): ZodType {
  switch (spec.type) {
    case "string": {
      const values = spec.enum;
      if (values !== undefined && values.length > 0) return z.enum([...values]);
      return z.string();
    }
    case "number":
    case "integer": {
      let schema = spec.type === "integer" ? z.number().int() : z.number();
      if (spec.minimum !== undefined) schema = schema.min(spec.minimum);
      if (spec.maximum !== undefined) schema = schema.max(spec.maximum);
      return schema;
    }
    case "boolean":
      return z.boolean();
    case "array":
      return z.array(paramZod(spec.items));
  }
}

/** The JSON Schema node for one parameter, as the model is shown it. */
export function paramJsonSchema(spec: ParamSpec): Record<string, unknown> {
  const node: Record<string, unknown> = { type: spec.type };
  if (spec.description !== undefined) node.description = spec.description;
  switch (spec.type) {
    case "string":
      if (spec.enum !== undefined && spec.enum.length > 0) node.enum = [...spec.enum];
      break;
    case "number":
    case "integer":
      if (spec.minimum !== undefined) node.minimum = spec.minimum;
      if (spec.maximum !== undefined) node.maximum = spec.maximum;
      break;
    case "array":
      node.items = paramJsonSchema(spec.items);
      break;
    case "boolean":
      break;
  }
  return node;
}

/** The whole `parameters` object of a tool schema. */
export function parametersJsonSchema(parameters: ParamSpecMap): Record<string, unknown> {
  const properties: Record<string, unknown> = {};
  const required: string[] = [];
  for (const [name, spec] of Object.entries(parameters)) {
    properties[name] = paramJsonSchema(spec);
    if (spec.required === true) required.push(name);
  }
  return { type: "object", properties, required, additionalProperties: false };
}

/** The zod object validating a whole argument payload; unknown keys are dropped. */
export function parametersZod(parameters: ParamSpecMap): ZodType {
  const shape: Record<string, ZodType> = {};
  for (const [name, spec] of Object.entries(parameters)) {
    const schema = paramZod(spec);
    shape[name] = spec.required === true ? schema : schema.optional();
  }
  return z.object(shape);
}

/**
 * Build a tool definition. The body is typed from the spec, so `args.x` is `number` when `x` is
 * declared a number — the registry has already validated it by the time the body runs.
 */
export function defineTool<P extends ParamSpecMap>(config: DefineToolConfig<P>): ToolDefinition {
  const render = config.render;
  return {
    name: config.name,
    description: config.description,
    parameters: parametersJsonSchema(config.parameters),
    schema: parametersZod(config.parameters),
    // The registry validated `args` against the schema built from the same spec, so this cast
    // re-attaches the static type the spec already describes.
    execute: (args: JsonValue, exec: ToolExec) => config.execute(args as InferArgs<P>, exec),
    render: (args: JsonValue, value: JsonValue) =>
      render === undefined ? JSON.stringify(value) : render(args as InferArgs<P>, value),
  };
}

/** Widen a validated manifest parameter map (`ModParamSchema`) into the narrowed spec type. */
export function toParamSpecMap(parameters: Record<string, ModParamSchema>): ParamSpecMap {
  // `ModParamSchema.required` is `boolean`; the manifest schema only ever admits the literal
  // `true`, so the two shapes agree at runtime and this is the single narrowing point.
  return parameters as ParamSpecMap;
}
