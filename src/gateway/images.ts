// `POST /v1/images/generations` and `POST /v1/images/edits` (rev 6 phase 4, D2, D4): the same hold
// and settle as chat, priced per picture from the model's `perImage` record. The hold is n pictures;
// the settle charges the pictures the upstream actually returned (never more than the hold), and
// keeps the provider's reported token counts in the line when it gives them. An edit's reference
// pictures are forwarded as they came, under the size cap; nothing is stored.

import type { UsagePurpose } from "@shared/usage";
import { z } from "zod";
import type { TokenAuth } from "./accounts";
import { type MeteredCall, startCall } from "./chat";
import { type ImageCost, imageCredits } from "./costs";
import { callHeaders, type MeterContext, pickModel, postUpstream, upstreamRefusal } from "./meter";
import { fail, readJson, refusal, status413 } from "./respond";
import type { ServedModel } from "./upstreams";

/** Pictures per call, and the most an edit may upload. */
export const IMAGES_MAX = 4;
export const EDIT_BODY_MAX = 32 * 1024 * 1024;

const generationSchema = z.object({
  model: z.string().min(1).max(200),
  prompt: z.string().min(1).max(32_000),
  n: z.number().int().min(1).max(IMAGES_MAX).optional(),
  size: z.string().max(20).optional(),
  quality: z.string().max(20).optional(),
  background: z.enum(["transparent", "opaque", "auto"]).optional(),
  output_format: z.enum(["png", "webp", "jpeg"]).optional(),
  moderation: z.enum(["auto", "low"]).optional(),
});

/** The fields an edit may carry besides its pictures (multipart text fields). */
const EDIT_FIELDS = ["prompt", "size", "quality", "background", "output_format", "moderation"];

function imageUsage(value: unknown): { input: number | null; output: number | null } {
  const usage = (typeof value === "object" && value !== null ? value : {}) as Record<
    string,
    unknown
  >;
  const count = (item: unknown) =>
    typeof item === "number" && Number.isSafeInteger(item) && item >= 0 ? item : null;
  return { input: count(usage.input_tokens), output: count(usage.output_tokens) };
}

async function forward(
  ctx: MeterContext,
  call: MeteredCall,
  model: ServedModel,
  cost: ImageCost,
  path: string,
  body: string | FormData,
  n: number,
): Promise<Response> {
  const sent = await postUpstream(ctx, model, path, body, call.controller.signal);
  if (!sent.ok) {
    call.release(call.failure());
    return call.capped ? fail(504, call.capError()) : refusal(sent, 502);
  }
  const response = sent.value;
  if (!response.ok) {
    call.release("error");
    return refusal(await upstreamRefusal(model, response));
  }
  let text: string;
  let pictures: number;
  let usage: { input: number | null; output: number | null };
  try {
    text = await response.text();
    const parsed = JSON.parse(text) as { data?: unknown; usage?: unknown };
    if (!Array.isArray(parsed.data)) throw new Error("no data");
    pictures = Math.min(parsed.data.length, n);
    usage = imageUsage(parsed.usage);
  } catch {
    call.release(call.failure());
    return call.capped
      ? fail(504, call.capError())
      : fail(502, {
          code: "gateway-upstream",
          message: "The upstream's image answer was not readable.",
        });
  }
  call.settle({ ...usage, cached: null }, imageCredits(cost, pictures));
  return new Response(text, {
    status: 200,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

function begin(
  ctx: MeterContext,
  auth: TokenAuth,
  request: Request,
  requestId: string,
  purpose: UsagePurpose,
  model: ServedModel,
  hold: number,
) {
  const started = startCall(ctx, auth, {
    requestId,
    purpose,
    upstream: model.upstream.id,
    model: model.id,
    credits: hold,
  });
  if (started.ok) {
    const call = started.value;
    request.signal.addEventListener(
      "abort",
      () => {
        call.clientGone = true;
        call.controller.abort();
      },
      { once: true },
    );
  }
  return started;
}

export async function imageGenerations(
  ctx: MeterContext,
  request: Request,
  auth: TokenAuth,
): Promise<Response> {
  const headers = callHeaders(request);
  if (!headers.ok) return fail(400, headers.error);
  const { requestId, purpose } = headers.value;
  const duplicate = ctx.ledger.duplicate(auth.account, requestId);
  if (duplicate !== null) return refusal(duplicate);
  const body = await readJson(request, generationSchema, 256 * 1024);
  if (!body.ok) return fail(status413(body), body.error);
  const picked = pickModel(ctx, body.value.model, "image");
  if (!picked.ok) return refusal(picked, 404);
  const { model } = picked.value;
  const cost = picked.value.cost as ImageCost;
  const n = body.value.n ?? 1;
  const started = begin(ctx, auth, request, requestId, purpose, model, imageCredits(cost, n));
  if (!started.ok) return refusal(started, 503);
  const upstreamBody = JSON.stringify({ ...body.value, model: model.upstreamModel, n });
  return forward(ctx, started.value, model, cost, "/images/generations", upstreamBody, n);
}

export async function imageEdits(
  ctx: MeterContext,
  request: Request,
  auth: TokenAuth,
): Promise<Response> {
  const headers = callHeaders(request);
  if (!headers.ok) return fail(400, headers.error);
  const { requestId, purpose } = headers.value;
  const duplicate = ctx.ledger.duplicate(auth.account, requestId);
  if (duplicate !== null) return refusal(duplicate);
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (!Number.isFinite(declared) || declared > EDIT_BODY_MAX) {
    return fail(413, {
      code: "gateway-body-too-large",
      message: `An edit is at most ${EDIT_BODY_MAX} bytes.`,
    });
  }
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return fail(400, { code: "gateway-body-invalid", message: "An edit is multipart/form-data." });
  }
  const modelId = form.get("model");
  const nText = form.get("n");
  const n = typeof nText === "string" ? Number(nText) : 1;
  if (typeof modelId !== "string" || !Number.isInteger(n) || n < 1 || n > IMAGES_MAX) {
    return fail(400, {
      code: "gateway-body-invalid",
      message: `An edit needs a model and at most ${IMAGES_MAX} pictures (n).`,
    });
  }
  const pictures = [...form.getAll("image"), ...form.getAll("image[]")].filter(
    (item): item is File => typeof item !== "string",
  );
  let bytes = 0;
  for (const item of [...pictures, form.get("mask")]) {
    if (item !== null && typeof item !== "string") bytes += item.size;
  }
  if (pictures.length === 0 || pictures.length > 16 || bytes > EDIT_BODY_MAX) {
    return fail(400, {
      code: "gateway-body-invalid",
      message: "An edit needs 1–16 reference pictures.",
    });
  }
  const picked = pickModel(ctx, modelId, "image");
  if (!picked.ok) return refusal(picked, 404);
  const { model } = picked.value;
  const cost = picked.value.cost as ImageCost;
  const started = begin(ctx, auth, request, requestId, purpose, model, imageCredits(cost, n));
  if (!started.ok) return refusal(started, 503);
  const upstream = new FormData();
  upstream.set("model", model.upstreamModel);
  upstream.set("n", String(n));
  for (const field of EDIT_FIELDS) {
    const value = form.get(field);
    if (typeof value === "string") upstream.set(field, value.slice(0, 32_000));
  }
  const name = pictures.length > 1 ? "image[]" : "image";
  for (const picture of pictures) upstream.append(name, picture, picture.name || "image.png");
  const mask = form.get("mask");
  if (mask !== null && typeof mask !== "string")
    upstream.set("mask", mask, mask.name || "mask.png");
  return forward(ctx, started.value, model, cost, "/images/edits", upstream, n);
}
