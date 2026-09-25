// The place the player wakes in, written when Create builds a world. It follows Settings → Model:
// with Apple on-device selected and its Foundation Models bridge available, the bridge writes a
// structured scene (main's SceneArtifactService); with anything else the chat model writes the
// Scene DSL through `generateProgram` and `originPrompt`. Both paths hold the scene to the same
// `originIssues` and give the model at most two repairs; neither ever falls back to a stock place.

import {
  type DslError,
  type NewWorldContext,
  originIssues,
  originPrompt,
  parseScene,
  sceneGrammar,
  serializeScene,
} from "@dsl";
import { dslError } from "@dsl/parse/program";
import { usageTag } from "@renderer/llm";
import { worldPropKinds } from "@shared/bible";
import type { WorldBible } from "@shared/cartridge";
import type { ContextWindow, InferenceConfig, ProviderKind } from "@shared/llm";
import { type AppError, fail, ok, type Result } from "@shared/result";
import type { GenerationEvent, ProviderId, SceneGenerationRequest } from "@shared/scene-generation";
import type { SceneGraph } from "@shared/world";
import { generateProgram, grammarForProvider } from "./pipeline";
import { MAX_REPAIRS } from "./program";
import { generateSceneArtifact } from "./sceneGeneration";

/** `apple-bridge`: Apple's structured scene path. `chat`: the selected chat model writes the DSL. */
export type OriginRoute = "apple-bridge" | "chat";

/** A floor's budget; on a small local context main lowers it, or refuses below 40 % of it. */
export const ORIGIN_MAX_TOKENS = 2200;
/** The chat route's user turn (Create's quote measures the same text). */
export const ORIGIN_USER =
  "Write the Scene program for the place the player wakes in. Output the program only.";
const ORIGIN_TEMPERATURE = 0.9;

const aborted = (): Result<never> =>
  fail({ code: "request-aborted", message: "World generation was cancelled." });

async function bridgeAvailable(): Promise<boolean> {
  const capabilities = await window.seed.inference.appleLocalCapabilities();
  return capabilities.ok && capabilities.value.available;
}

/** The bridge is used only when the player picked Apple on-device and this Mac can run it. */
export async function originRoute(config: InferenceConfig): Promise<OriginRoute> {
  return config.kind === "apple-fm" && (await bridgeAvailable()) ? "apple-bridge" : "chat";
}

export interface BuildReadiness {
  route: OriginRoute;
  kind: ProviderKind;
  model: string;
  /** The bible and the chapters always go through chat, so the chat model must answer. */
  reachable: boolean;
  latencyMs: number;
  context: ContextWindow | null;
}

/** Asks the provider the build will actually use; the Create screen shows the answer. */
export async function buildReadiness(): Promise<Result<BuildReadiness>> {
  const config = await window.seed.inference.getConfig();
  const [route, probe] = await Promise.all([originRoute(config), window.seed.inference.probe()]);
  if (!probe.ok) return probe;
  return ok({
    route,
    kind: config.kind,
    model: config.model,
    reachable: probe.value.reachable,
    latencyMs: probe.value.latencyMs,
    context: probe.value.context,
  });
}

export interface OriginInput {
  world: NewWorldContext;
  bible: WorldBible;
  onGenerationEvent?: (event: GenerationEvent) => void;
  signal?: AbortSignal;
}

export interface Origin {
  /** Canonical Scene source (`serializeScene`), whichever path wrote it. */
  source: string;
  graph: SceneGraph;
  route: OriginRoute;
}

function unfit(issues: ReturnType<typeof originIssues>): DslError {
  return dslError({
    code: "dsl-origin-unfit",
    message: `${issues.length} problem(s) make this place unfit to start in.`,
    hint: issues.map((issue) => `${issue.message} ${issue.hint ?? ""}`.trim()).join(" "),
    errors: issues,
  });
}

export async function generateOrigin(input: OriginInput): Promise<Result<Origin>> {
  const config = await window.seed.inference.getConfig();
  if (input.signal?.aborted === true) return aborted();
  const route = await originRoute(config);
  const written = route === "apple-bridge" ? await viaBridge(input) : await viaChat(config, input);
  if (!written.ok) return input.signal?.aborted ? aborted() : written;
  return ok({ source: serializeScene(written.value), graph: written.value, route });
}

// ── Chat: the selected model writes the Scene DSL ────────────────────────────────────────────

function providerIdFor(kind: ProviderKind): ProviderId {
  return kind === "llamacpp" ? "llamacpp" : "openai-compatible";
}

async function viaChat(config: InferenceConfig, input: OriginInput): Promise<Result<SceneGraph>> {
  const requestId = crypto.randomUUID();
  const providerId = providerIdFor(config.kind);
  let attempt = 0;
  // Parsing and the origin checks are one step, so an unfit place is repaired like a typo.
  const parse = (source: string): Result<SceneGraph, DslError> => {
    attempt += 1;
    const parsed = parseScene(source);
    if (!parsed.ok) return reportRepair(parsed);
    const issues = originIssues(parsed.value, worldPropKinds(input.bible));
    return issues.length === 0 ? parsed : reportRepair({ ok: false, error: unfit(issues) });
  };
  const reportRepair = <E extends AppError>(failed: { ok: false; error: E }) => {
    if (attempt <= MAX_REPAIRS) {
      input.onGenerationEvent?.({
        type: "progress",
        requestId,
        providerId,
        phase: "repair",
        message: `Repairing the starting place (${attempt}/${MAX_REPAIRS})…`,
      });
    }
    return failed;
  };
  const program = await generateProgram<SceneGraph>({
    system: originPrompt(input.world, input.bible),
    user: ORIGIN_USER,
    purpose: "scene",
    task: "origin",
    language: input.world.language,
    parse,
    grammar: grammarForProvider(sceneGrammar()),
    maxTokens: ORIGIN_MAX_TOKENS,
    temperature: ORIGIN_TEMPERATURE,
    ...(input.signal === undefined ? {} : { signal: input.signal }),
  });
  return program.ok ? ok(program.value.graph) : program;
}

// ── Apple on-device: the bridge's structured scene path ──────────────────────────────────────

async function viaBridge(input: OriginInput): Promise<Result<SceneGraph>> {
  const { world, bible, onGenerationEvent, signal } = input;
  const initialBrief = [
    `Create the open, walkable place where the player wakes in this world: ${world.intent.trim()}`,
    `World core: ${bible.core}`,
    `Visual style: ${bible.style}`,
    "Choose the biome, the ground and the props that fit the world's Look above, on a 12 to 24 tile floor of grass, stone, sand, snow or wood.",
    "Place 1 to 3 residents, one sun light, and no exits, monsters, treasure, triggers, or platforms.",
    "Keep the centre tile empty and every floor edge open.",
  ].join("\n");
  let origin = await generateSceneArtifact(
    sceneRequest("new-room", initialBrief, world.language, null),
    onGenerationEvent,
    signal,
  );
  if (!origin.ok) return origin;
  const props = worldPropKinds(bible);
  let issues = originIssues(origin.value.graph, props);
  for (let repair = 0; issues.length > 0 && repair < MAX_REPAIRS; repair += 1) {
    const diagnostics = issues
      .map((issue) => `${issue.message}${issue.hint === undefined ? "" : ` (${issue.hint})`}`)
      .join("\n")
      .slice(0, 1_400);
    origin = await generateSceneArtifact(
      sceneRequest(
        "repair-room",
        `Repair the current origin scene so it is safe and open for play. Fix every issue:\n${diagnostics}`,
        world.language,
        origin.value.source,
      ),
      onGenerationEvent,
      signal,
    );
    if (!origin.ok) return origin;
    issues = originIssues(origin.value.graph, props);
  }
  return issues.length > 0 ? fail(unfit(issues)) : ok(origin.value.graph);
}

function sceneRequest(
  purpose: "new-room" | "repair-room",
  brief: string,
  language: string,
  currentSceneSource: string | null,
): SceneGenerationRequest {
  return {
    intent: {
      requestId: crypto.randomUUID(),
      purpose,
      brief: brief.slice(0, 2_000),
      language,
      sceneId: "origin",
    },
    state: {
      worldPlan: null,
      currentSceneSource,
      flags: {},
      inventory: [],
      assetCatalog: [],
      capabilityProfile: { entries: [] },
    },
    maxRepairAttempts: 2,
    usage: usageTag("origin"),
  };
}
