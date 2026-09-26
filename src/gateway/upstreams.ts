// Where the gateway sends a call (rev 6 phase 4, D2, D4): `<data>/upstreams.json`, written by the
// operator. Each upstream is an OpenAI-compatible endpoint with the models it serves; each served
// model names a licence record (@shared/licence, or one of the operator's own in `licences`, which
// may add records but never replace a built-in one). Upstream keys resolve the app's way on this
// host: the key saved with `set-key <upstream id>`, else the upstream's own .env variable.
//
//   { "v": 1,
//     "licences": [ …LicenceRecord ],
//     "upstreams": [ { "id": "openai", "kind": "openai", "baseUrl": "https://api.openai.com/v1",
//                      "keyEnv": "OPENAI_API_KEY",
//                      "models": [ { "id": "gpt-5.4-mini", "kind": "chat", "licence": "…",
//                                    "default": true, "upstreamModel": "gpt-5.4-mini" } ] } ] }

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { LICENCES, type LicenceRecord, licenceRecordSchema, licenceTable } from "@shared/licence";
import type { GatewayModelKind } from "@shared/quota";
import { err, ok, type Result } from "@shared/result";
import { z } from "zod";
import {
  type EnvLike,
  isLoopbackHost,
  KEY_NAME,
  keyEndpointAllowed,
  type ResolvedKey,
  resolveKey,
  type SavedKeys,
} from "./secrets";

export const UPSTREAMS_FILE = "upstreams.json";

/** How the body is shaped for it (`upstreamBody.ts`); `compatible` gets only the neutral fields. */
export const UPSTREAM_KINDS = ["openai", "llamacpp", "vllm", "ollama", "compatible"] as const;
export type UpstreamKind = (typeof UPSTREAM_KINDS)[number];

const MODEL_ID = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,199}$/;

const modelSchema = z.strictObject({
  id: z.string().regex(MODEL_ID),
  kind: z.enum(["chat", "image"]),
  licence: z.string().min(1).max(48),
  default: z.boolean().optional(),
  upstreamModel: z.string().regex(MODEL_ID).optional(),
});

const upstreamSchema = z.strictObject({
  id: z.string().regex(KEY_NAME),
  kind: z.enum(UPSTREAM_KINDS),
  baseUrl: z.url().max(500),
  /** The .env variable that holds its key; null: a keyless server. */
  keyEnv: z
    .string()
    .regex(/^[A-Z][A-Z0-9_]{0,63}$/)
    .nullable(),
  models: z.array(modelSchema).min(1).max(100),
});

const fileSchema = z.strictObject({
  v: z.literal(1),
  licences: z.array(licenceRecordSchema).max(100).optional(),
  upstreams: z.array(upstreamSchema).min(1).max(40),
});

export interface Upstream {
  id: string;
  kind: UpstreamKind;
  /** Without a trailing slash. */
  baseUrl: string;
  /** Null: a keyless server. */
  key: ResolvedKey | null;
}

export interface ServedModel {
  id: string;
  kind: GatewayModelKind;
  default: boolean;
  /** The id the upstream knows it by. */
  upstreamModel: string;
  upstream: Upstream;
  licence: LicenceRecord;
}

export interface UpstreamSet {
  models: ServedModel[];
  upstreams: Upstream[];
  /** Printed at start; never a key. */
  warnings: string[];
}

function invalid(message: string, hint?: string): Result<never> {
  return err("gateway-upstreams-invalid", message, hint);
}

/** Reads and checks `<data>/upstreams.json`; every refusal here stops the start. */
export function loadUpstreams(
  dataDir: string,
  saved: SavedKeys,
  env: EnvLike,
): Result<UpstreamSet> {
  const path = join(dataDir, UPSTREAMS_FILE);
  if (!existsSync(path)) {
    return err(
      "gateway-no-upstreams",
      `${path} does not exist, so there is nothing to serve.`,
      "Write it (see src/gateway/upstreams.ts for the shape) and a costs.json beside it.",
    );
  }
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    return invalid(`${path} is not readable JSON (${String(error)}).`);
  }
  const parsed = fileSchema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return invalid(`${path}: ${issue?.path.join(".") ?? ""} ${issue?.message ?? ""}`.trim());
  }
  return checkUpstreams(parsed.data, saved, env);
}

export function checkUpstreams(
  file: z.output<typeof fileSchema>,
  saved: SavedKeys,
  env: EnvLike,
): Result<UpstreamSet> {
  const extra = file.licences ?? [];
  for (const record of extra) {
    if (LICENCES.some((builtIn) => builtIn.id === record.id)) {
      return invalid(
        `Licence "${record.id}" is a built-in record; the operator may add records, never replace one.`,
        "Give your record another id.",
      );
    }
  }
  const licences = licenceTable(extra);
  const warnings: string[] = [];
  if (!saved.ok) warnings.push(saved.error.message);
  const upstreams: Upstream[] = [];
  const models: ServedModel[] = [];
  const seen = new Set<string>();
  const defaults = new Set<GatewayModelKind>();
  for (const spec of file.upstreams) {
    if (upstreams.some((other) => other.id === spec.id)) {
      return invalid(`Upstream "${spec.id}" is listed twice.`);
    }
    const baseUrl = spec.baseUrl.replace(/\/+$/, "");
    const protocol = new URL(baseUrl).protocol;
    if (protocol !== "https:" && protocol !== "http:") {
      return invalid(`Upstream "${spec.id}" is not an http(s) address.`);
    }
    const key = spec.keyEnv === null ? null : resolveKey(spec.id, spec.keyEnv, saved, env);
    if (spec.keyEnv !== null && key === null) {
      return err(
        "gateway-upstream-no-key",
        `Upstream "${spec.id}" needs a key and none is set.`,
        `Save one with \`bun run gateway -- set-key ${spec.id} --data <dir>\`, or set ${spec.keyEnv}.`,
      );
    }
    if (key !== null && !keyEndpointAllowed(baseUrl)) {
      return err(
        "gateway-upstream-insecure",
        `Upstream "${spec.id}" would get its key over plain http at ${baseUrl}.`,
        "Use https, or a server on this machine (127.0.0.1).",
      );
    }
    if (key === null && protocol === "http:" && !isLoopbackHost(new URL(baseUrl).hostname)) {
      warnings.push(
        `Upstream "${spec.id}" is plain http off this machine: prompts travel in clear.`,
      );
    }
    const upstream: Upstream = { id: spec.id, kind: spec.kind, baseUrl, key };
    upstreams.push(upstream);
    for (const model of spec.models) {
      if (seen.has(model.id)) return invalid(`Model "${model.id}" is served twice.`);
      seen.add(model.id);
      const licence = licences.get(model.licence);
      if (licence === undefined) {
        return err(
          "gateway-model-unlicensed",
          `Model "${model.id}" names licence "${model.licence}", which has no record.`,
          "Add a dated record with its source to `licences` in upstreams.json.",
        );
      }
      const isDefault = model.default === true;
      if (isDefault && defaults.has(model.kind)) {
        return invalid(`More than one ${model.kind} model is marked default.`);
      }
      if (isDefault) defaults.add(model.kind);
      models.push({
        id: model.id,
        kind: model.kind,
        default: isDefault,
        upstreamModel: model.upstreamModel ?? model.id,
        upstream,
        licence,
      });
    }
  }
  return ok({ models, upstreams, warnings });
}

/** The raw shape, for tests and the smoke run that write an upstreams.json. */
export type UpstreamsFile = z.input<typeof fileSchema>;
