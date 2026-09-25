import {
  defineTool,
  type ParamSpecMap,
  parametersJsonSchema,
  paramJsonSchema,
  paramZod,
} from "@harness";
import { describe, expect, it } from "vitest";

describe("defineTool parameter specs", () => {
  it("builds a JSON Schema node for every spec kind", () => {
    expect(paramJsonSchema({ type: "string", description: "a name" })).toEqual({
      type: "string",
      description: "a name",
    });
    expect(paramJsonSchema({ type: "string", enum: ["amber", "rose"] })).toEqual({
      type: "string",
      enum: ["amber", "rose"],
    });
    expect(paramJsonSchema({ type: "number", minimum: 0, maximum: 0.2 })).toEqual({
      type: "number",
      minimum: 0,
      maximum: 0.2,
    });
    expect(paramJsonSchema({ type: "integer", minimum: 1 })).toEqual({
      type: "integer",
      minimum: 1,
    });
    expect(paramJsonSchema({ type: "boolean" })).toEqual({ type: "boolean" });
    expect(paramJsonSchema({ type: "array", items: { type: "string" } })).toEqual({
      type: "array",
      items: { type: "string" },
    });
  });

  it("builds a validator that agrees with the schema it advertises", () => {
    expect(paramZod({ type: "string", enum: ["amber", "rose"] }).safeParse("amber").success).toBe(
      true,
    );
    expect(paramZod({ type: "string", enum: ["amber", "rose"] }).safeParse("jade").success).toBe(
      false,
    );
    expect(paramZod({ type: "integer" }).safeParse(2.5).success).toBe(false);
    expect(paramZod({ type: "number", minimum: 0, maximum: 1 }).safeParse(2).success).toBe(false);
    expect(paramZod({ type: "boolean" }).safeParse("yes").success).toBe(false);
    expect(
      paramZod({ type: "array", items: { type: "number" } }).safeParse([1, "two"]).success,
    ).toBe(false);
    expect(
      paramZod({ type: "array", items: { type: "array", items: { type: "string" } } }).safeParse([
        ["a"],
      ]).success,
    ).toBe(true);
  });

  it("marks only `required: true` parameters as required", () => {
    const parameters: ParamSpecMap = {
      needed: { type: "string", required: true },
      optional: { type: "boolean" },
    };
    expect(parametersJsonSchema(parameters)).toEqual({
      type: "object",
      additionalProperties: false,
      required: ["needed"],
      properties: { needed: { type: "string" }, optional: { type: "boolean" } },
    });
  });

  it("validates a whole payload, dropping unknown keys", () => {
    const tool = defineTool({
      name: "t",
      description: "d",
      parameters: { a: { type: "string", required: true }, b: { type: "number" } },
      execute: (args) => Promise.resolve(args.a),
    });
    expect(tool.schema.safeParse({ a: "x", extra: 1 })).toMatchObject({
      success: true,
      data: { a: "x" },
    });
    expect(tool.schema.safeParse({ b: 1 }).success).toBe(false);
  });

  it("defaults render to JSON.stringify", () => {
    const tool = defineTool({
      name: "t",
      description: "d",
      parameters: {},
      execute: () => Promise.resolve(null),
    });
    expect(tool.render({}, { ok: true })).toBe('{"ok":true}');
  });
});
