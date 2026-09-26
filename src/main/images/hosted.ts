// The gateway's image endpoint (rev 6 phase 4, D2 step 4 for pictures, D4 key order step 3): when
// the device chose OpenAI but has no OpenAI key of its own, and a gateway is configured and this
// device has an account token (saved, else UNMAPPED_GATEWAY_KEY), the picture is drawn through
// `POST /v1/images/generations` (or `/v1/images/edits` with a reference) and metered against the
// allowance. Its model is the chosen one when the gateway lists it for images, else the gateway's
// default image model, and the picture carries that model's licence record from `/v1/models`.
//
// Like chat: X-Request-Id (the caller's id for this picture, else a fresh one) and X-Unmapped-Purpose
// `image`, no world scope, no silent retry; a refused token is forgotten so `.env`'s token is used
// next, and the allowance is read again after every call (the hooks main's account service sets).

import { randomUUID } from "node:crypto";
import { hostedError } from "@main/inference/hostedErrors";
import { type GatewayModel, PURPOSE_HEADER, REQUEST_ID_HEADER } from "@shared/quota";
import { err, ok, type Result } from "@shared/result";
import OpenAI, { APIConnectionError, APIError, APIUserAbortError, toFile } from "openai";
import { aborted, CONCEPT_SIDE, IMAGE_SIDE, type ImageProvider } from "./provider";

export interface HostedImageTarget {
  /** The gateway's `/v1` base. */
  base: string;
  token: { key: string; source: "saved" | "env" };
  model: GatewayModel;
}

export interface HostedImageHooks {
  /** After every hosted picture call, settled or not: the allowance changed. */
  settled(): void;
  /** The gateway refused this token (401): forget exactly that saved token. */
  refused(token: { key: string; source: "saved" | "env" }): Promise<void>;
}

let hooks: HostedImageHooks | null = null;

/** Set once by main's account service; null removes them. */
export function setHostedImageHooks(next: HostedImageHooks | null): void {
  hooks = next;
}

/** The chosen image model when the gateway serves it for images, else its default image model. */
export function hostedImageModel(
  models: readonly GatewayModel[],
  wanted: string,
): Result<GatewayModel> {
  const images = models.filter((model) => model.kind === "image");
  const chosen = images.find((model) => model.id === wanted) ?? images.find((m) => m.default);
  if (chosen === undefined) {
    return err(
      "gateway-model-unavailable",
      "The generation gateway serves no default image model.",
      "Enter your own OpenAI key in Settings → Model, or choose another image provider in Settings → Images.",
    );
  }
  return ok(chosen);
}

export function hostedImageProvider(
  target: HostedImageTarget,
  resize: (image: Uint8Array, side: number) => Uint8Array,
  quality: "low" | "medium" | "high",
): ImageProvider {
  const model = target.model.id;
  const licence = target.model.licence.id;
  return {
    id: "hosted",
    model,
    licence,
    locality: "hosted",
    endpoint: target.base,
    async generate(prompt, signal, options = {}) {
      if (signal.aborted) return aborted();
      const concept = options.kind === "concept";
      const shape = {
        model,
        prompt: prompt.slice(0, 4_000),
        size: "1024x1024",
        quality: options.quality ?? quality,
        background: concept ? ("opaque" as const) : ("transparent" as const),
        output_format: "png" as const,
        n: 1,
      };
      // The caller's picture id, so the gateway's line matches main's `[look]` / `[image]` line.
      const requestId = options.requestId ?? randomUUID();
      const headers = { [REQUEST_ID_HEADER]: requestId, [PURPOSE_HEADER]: "image" };
      const started = performance.now();
      try {
        // The token goes only to the configured gateway; a metered call is never retried silently.
        const client = new OpenAI({
          apiKey: target.token.key,
          baseURL: target.base,
          maxRetries: 0,
        });
        const response =
          options.reference === undefined
            ? await client.images.generate(shape, { signal, headers })
            : await client.images.edit(
                {
                  ...shape,
                  image: await toFile(Buffer.from(options.reference), "look.png", {
                    type: "image/png",
                  }),
                },
                { signal, headers },
              );
        if (signal.aborted) return aborted();
        const b64 = response.data?.[0]?.b64_json;
        if (b64 === undefined) return err("image-empty", "The gateway returned no image.");
        const png = resize(
          new Uint8Array(Buffer.from(b64, "base64")),
          concept ? CONCEPT_SIDE : IMAGE_SIDE,
        );
        return ok({
          png,
          provider: "hosted",
          model,
          licence,
          usedReference: options.reference !== undefined,
          elapsedMs: Math.round(performance.now() - started),
          inputTokens: response.usage?.input_tokens ?? null,
          outputTokens: response.usage?.output_tokens ?? null,
          call: options.reference === undefined ? "images.generate" : "images.edit",
        });
      } catch (error) {
        if (signal.aborted || error instanceof APIUserAbortError) return aborted();
        if (error instanceof APIConnectionError) {
          return err(
            "gateway-unreachable",
            `Could not reach the generation gateway at ${target.base}.`,
            "Check UNMAPPED_GATEWAY_URL in .env and that the gateway is running, then try again.",
          );
        }
        if (error instanceof APIError) {
          const mapped = hostedError(error);
          if (mapped.code === "account-signed-out") await hooks?.refused(target.token);
          return { ok: false, error: mapped };
        }
        return err(
          "image-failed",
          `Image generation through the gateway failed: ${error instanceof Error ? error.message : String(error)}`,
          "Try again; your own key or another image provider works meanwhile.",
        );
      } finally {
        hooks?.settled();
      }
    },
  };
}
