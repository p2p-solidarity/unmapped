// Where a chat goes (rev 6 phase 4, D2). One order, decided in main before every call, and shown in
// Settings → Model before any call is made:
//
//   1. local kinds (apple-fm, ollama, llamacpp, vllm) → this computer: no key, no gateway;
//   2. custom → the key saved for that exact URL, or none → direct. Never an .env key: a deliberate
//      Rule 6 exception, so an env secret never goes to a URL the renderer picked;
//   3. openai / openui-gateway → the saved key, else that provider's .env variable → own key, direct;
//   4. only when step 3 found no key, or the player selected `hosted`, and only when a gateway is
//      configured: the saved account token, else UNMAPPED_GATEWAY_KEY → the gateway, metered. The
//      model is the selected id when the gateway lists it, else the gateway's default chat model;
//   5. nothing → `no-api-key` with today's hint, plus the free allowance when a gateway exists.
//
// No step runs after a failure: an `auth` error at step 3 is never retried at step 4, a saved key
// that no longer reads is an error rather than a switch of payer, and `quota-exhausted` shows its
// ways out instead of rerouting. The player's own key always beats the allowance, `.env` keeps
// working forever, and a silent route change would change who pays and which model writes the world.
//
// The returned `config` is the one that actually runs: `runChat` passes it to both `streamChat` and
// the usage ledger (provider `hosted` for gateway calls).

import type { ChatRoute, InferenceConfig, KeyProvider, RouteView } from "@shared/llm";
import type { GatewayModel } from "@shared/quota";
import { type AppError, err, fail, ok, type Result } from "@shared/result";
import { gatewaySetting } from "./config";
import { signedOutError } from "./hostedErrors";
import { type EnvLike, type KeyRecord, resolveKey } from "./keys";

export interface ResolvedKey {
  key: string;
  source: "saved" | "env";
}

export interface Routed {
  route: ChatRoute;
  /** The effective config: what runs, where, with which model. */
  config: InferenceConfig;
  key: ResolvedKey | null;
  /** Hosted only: why. */
  via: "selected" | "no-own-key" | null;
}

export interface RouteDeps {
  env: EnvLike;
  /** The saved record for a provider (`keyStore.readKeyRecord`). */
  readSaved(provider: KeyProvider): Promise<Result<KeyRecord | null>>;
  /** The gateway's served models (`GET /v1/models`, public). */
  gatewayModels(base: string): Promise<Result<GatewayModel[]>>;
}

function noApiKey(config: InferenceConfig, gateway: boolean): AppError {
  return {
    code: "no-api-key",
    message: `The ${config.kind} provider needs an API key and none is set.`,
    hint: `Enter a key in Settings → Model (Cloud API), or add ${config.apiKeyEnv ?? "the key"} to .env${gateway ? " — or sign in (Settings → Advanced settings → Account) to use the free allowance" : ""}.`,
  };
}

/** The selected model when the gateway serves it for chat, else its default chat model. */
function pickModel(models: readonly GatewayModel[], wanted: string): Result<string> {
  const chat = models.filter((model) => model.kind === "chat");
  const chosen = chat.find((model) => model.id === wanted) ?? chat.find((model) => model.default);
  if (chosen === undefined) {
    return err(
      "gateway-model-unavailable",
      "The generation gateway serves no default chat model.",
      "The operator marks one chat model as default in upstreams.json; until then use your own key or a local model in Settings → Model.",
    );
  }
  return ok(chosen.id);
}

async function viaGateway(
  selected: InferenceConfig,
  gateway: string,
  via: "selected" | "no-own-key",
  deps: RouteDeps,
): Promise<Result<Routed>> {
  const target: InferenceConfig = {
    kind: "hosted",
    baseUrl: gateway,
    model: selected.model,
    apiKeyEnv: "UNMAPPED_GATEWAY_KEY",
    sidecar: null,
  };
  const token = resolveKey(target, await deps.readSaved("hosted"), deps.env);
  // An unreadable token with no .env one is a sign-in to redo, never someone else's key.
  if (!token.ok || token.value === null) {
    return fail(via === "no-own-key" ? noApiKey(selected, true) : signedOutError());
  }
  const models = await deps.gatewayModels(gateway);
  if (!models.ok) return models;
  const model = pickModel(models.value, selected.model);
  if (!model.ok) return model;
  return ok({ route: "hosted", config: { ...target, model: model.value }, key: token.value, via });
}

export async function routeFor(config: InferenceConfig, deps: RouteDeps): Promise<Result<Routed>> {
  const kind = config.kind;
  if (kind === "apple-fm" || kind === "ollama" || kind === "llamacpp" || kind === "vllm") {
    return ok({ route: "local", config, key: null, via: null });
  }
  if (kind === "custom") {
    const key = resolveKey(config, await deps.readSaved("custom"), deps.env);
    if (!key.ok) return key;
    return ok({ route: "direct", config, key: key.value, via: null });
  }
  const gateway = gatewaySetting(deps.env);
  if (kind === "hosted") {
    if (!gateway.ok) return gateway;
    if (gateway.value === null) {
      return err(
        "gateway-not-configured",
        "This build has no generation gateway configured.",
        "Set UNMAPPED_GATEWAY_URL in .env and restart, or choose your own key or a local model in Settings → Model.",
      );
    }
    return viaGateway(config, gateway.value, "selected", deps);
  }
  const own = resolveKey(config, await deps.readSaved(kind), deps.env);
  if (!own.ok) return own;
  if (own.value !== null) return ok({ route: "direct", config, key: own.value, via: null });
  if (!gateway.ok || gateway.value === null) return fail(noApiKey(config, false));
  return viaGateway(config, gateway.value, "no-own-key", deps);
}

/** What the renderer may know about a route: never the key, only where it comes from. */
export function routeView(
  config: InferenceConfig,
  env: EnvLike,
  routed: Result<Routed>,
): RouteView {
  const gateway = gatewaySetting(env);
  return {
    selected: { kind: config.kind, model: config.model },
    gateway: gateway.ok ? gateway.value : null,
    next: routed.ok
      ? {
          route: routed.value.route,
          kind: routed.value.config.kind,
          model: routed.value.config.model,
          via: routed.value.via,
          keySource: routed.value.key?.source ?? null,
        }
      : null,
    error: routed.ok ? null : routed.error,
  };
}
