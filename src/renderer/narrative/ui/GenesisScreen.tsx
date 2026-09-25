// New Game: three short steps (World → Acts → Details) in the same quiet shell as the title
// menu, then a forging overlay that reports the real pipeline phase.

import { GameShell } from "@renderer/app/shell/GameShell";
import { cycle, useKeys } from "@renderer/app/shell/useKeys";
import worldForgeArt from "@renderer/assets/generated/world-forge.png";
import { bakeStoryScenes, DEFAULT_RULES_SOURCE } from "@renderer/narrative/cartridge";
import { generateStoryOutline } from "@renderer/narrative/story";
import { Button, ErrorBlock, Text, TextField } from "@renderer/ui";
import type { InstanceMeta } from "@shared/cartridge";
import {
  type CartridgeBlueprint,
  materialPack,
  WORLD_MATERIAL_PACKS,
  type WorldMaterialId,
} from "@shared/forge";
import { GAMEPLAY_KIT_IDS, type GameplayKitId } from "@shared/gameplay";
import { errored, idle, type Loadable, loading } from "@shared/result";
import type { Genesis } from "@shared/world";
import { useCallback, useState } from "react";
import { textareaStyle } from "./fields";

export const INTENT_MAX = 320;

const STEPS = ["World", "Acts", "Details"] as const;
const ACTS = ["Act I", "Act II", "Act III"] as const;
const PHASES = ["Writing the story", "Building levels", "Stamping cartridge", "Starting run"];

const KIT_COPY: Record<GameplayKitId, { label: string; note: string }> = {
  "tps_exploration@1": { label: "Third Person", note: "探索、地標、垂直空間" },
  "fps_puzzle@1": { label: "First Person", note: "近距離觀察與機關" },
  "platformer_2_5d@1": { label: "2.5D Run", note: "平台節奏與側向構圖" },
  "topdown_puzzle@1": { label: "Top-Down", note: "盤面、路線與空間解謎" },
};

function randomSeed(): number {
  const buffer = new Uint32Array(1);
  crypto.getRandomValues(buffer);
  return buffer[0] ?? 0;
}

function slug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export interface GenesisScreenProps {
  onCreated(meta: InstanceMeta): void;
  onCancel(): void;
}

export function GenesisScreen({ onCreated, onCancel }: GenesisScreenProps) {
  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [cartridgeId, setCartridgeId] = useState("");
  const [author, setAuthor] = useState("");
  const [materialId, setMaterialId] = useState<WorldMaterialId>("clockwork_foundry");
  const [sceneKits, setSceneKits] = useState<[GameplayKitId, GameplayKitId, GameplayKitId]>([
    "tps_exploration@1",
    "fps_puzzle@1",
    "platformer_2_5d@1",
  ]);
  const [act, setAct] = useState(0);
  const [brief, setBrief] = useState("");
  const [status, setStatus] = useState<Loadable<InstanceMeta>>(idle());
  const [tokens, setTokens] = useState(0);
  const [phase, setPhase] = useState(0);

  const forge = useCallback(async () => {
    const pack = materialPack(materialId);
    const blueprint: CartridgeBlueprint = {
      materialId,
      visualDirection: pack.direction,
      assetPalette: [...pack.props],
      biomePalette: [...pack.biomes],
      sceneKits,
      gameplayBrief: brief.trim(),
    };
    setTokens(0);
    setStatus(loading());
    const createdAt = new Date().toISOString();
    const genesis: Genesis = {
      archetype: "quest",
      physics: "gentle",
      language: navigator.language,
      seed: randomSeed(),
      intent: (pack.direction + ". " + brief.trim()).trim(),
      createdAt,
    };
    setPhase(0);
    const story = await generateStoryOutline(
      { name: name.trim(), blueprint, language: navigator.language },
      () => setTokens((count) => count + 1),
    );
    if (!story.ok) return setStatus(errored(story.error));

    setPhase(1);
    const scenes = await bakeStoryScenes(genesis, blueprint, story.value, () =>
      setTokens((count) => count + 1),
    );
    if (!scenes.ok) return setStatus(errored(scenes.error));

    setPhase(2);
    const published = await window.seed.cartridges.publish({
      manifest: {
        formatVersion: 1,
        cartridgeId,
        version: "1.0.0",
        name: name.trim(),
        description: story.value.premise,
        author: author.trim(),
        createdAt,
        engineApiVersion: 1,
        saveSchemaVersion: 1,
        entrySceneId: story.value.scenes[0]?.id ?? "",
        story: story.value,
        scenes: story.value.scenes.map(({ id, title }) => ({ id, title })),
        requiredKits: [...new Set(story.value.scenes.map((scene) => scene.kit))],
        genesis,
        lineage: null,
      },
      rules: DEFAULT_RULES_SOURCE,
      scenes: scenes.value,
    });
    if (!published.ok) return setStatus(errored(published.error));

    setPhase(3);
    const instance = await window.seed.instances.create({
      cartridgeId: published.value.cartridgeId,
      version: published.value.version,
      name: published.value.name + " · Run 1",
    });
    if (!instance.ok) return setStatus(errored(instance.error));
    setStatus({ status: "ready", value: instance.value.instance.meta });
    onCreated(instance.value.instance.meta);
  }, [author, brief, cartridgeId, materialId, name, onCreated, sceneKits]);

  const busy = status.status === "loading";
  const canForge =
    name.trim() !== "" &&
    author.trim() !== "" &&
    /^[a-z0-9][a-z0-9-]{0,79}$/.test(cartridgeId) &&
    !busy;

  const setKit = (station: number, kit: GameplayKitId): void => {
    setSceneKits((current) => {
      const next = [...current] as [GameplayKitId, GameplayKitId, GameplayKitId];
      next[station] = kit;
      return next;
    });
  };

  const back = (): void => (step === 0 ? onCancel() : setStep(step - 1));
  const next = (): void => {
    if (step < STEPS.length - 1) setStep(step + 1);
    else if (canForge) void forge();
  };

  const materialIndex = WORLD_MATERIAL_PACKS.findIndex((pack) => pack.id === materialId);
  const pickMaterial = (delta: number): void => {
    const pack = WORLD_MATERIAL_PACKS[cycle(materialIndex, delta, WORLD_MATERIAL_PACKS.length)];
    if (pack !== undefined) setMaterialId(pack.id);
  };
  const pickKit = (delta: number): void => {
    const index = GAMEPLAY_KIT_IDS.indexOf(sceneKits[act] ?? GAMEPLAY_KIT_IDS[0]);
    const kit = GAMEPLAY_KIT_IDS[cycle(index, delta, GAMEPLAY_KIT_IDS.length)];
    if (kit !== undefined) setKit(act, kit);
  };

  useKeys(
    {
      Escape: back,
      Enter: next,
      ...(step === 0
        ? {
            ArrowLeft: () => pickMaterial(-1),
            ArrowRight: () => pickMaterial(1),
            ArrowUp: () => pickMaterial(-2),
            ArrowDown: () => pickMaterial(2),
          }
        : {}),
      ...(step === 1
        ? {
            ArrowLeft: () => setAct((index) => cycle(index, -1, ACTS.length)),
            ArrowRight: () => setAct((index) => cycle(index, 1, ACTS.length)),
            ArrowUp: () => pickKit(-1),
            ArrowDown: () => pickKit(1),
          }
        : {}),
    },
    !busy,
  );

  const last = step === STEPS.length - 1;

  return (
    <GameShell
      art={worldForgeArt}
      hints={[
        { keys: ["←", "→", "↑", "↓"], label: "Select" },
        { keys: ["Enter"], label: last ? "Forge" : "Next", onPress: busy ? undefined : next },
        { keys: ["Esc"], label: "Back", onPress: busy ? undefined : back },
      ]}
    >
      <div className="forge">
        <nav className="forge-steps" aria-label="Steps">
          {STEPS.map((label, index) => (
            <button
              key={label}
              type="button"
              className="forge-step"
              data-current={index === step}
              disabled={busy}
              onClick={() => setStep(index)}
            >
              {label}
            </button>
          ))}
        </nav>

        <div className="forge-body g-scroll g-enter" key={step}>
          {step === 0 ? (
            <div className="forge-grid forge-grid--materials">
              {WORLD_MATERIAL_PACKS.map((pack) => (
                <Button
                  key={pack.id}
                  variant="tile"
                  active={materialId === pack.id}
                  onClick={() => (materialId === pack.id ? next() : setMaterialId(pack.id))}
                >
                  <span className="tile-body">
                    <strong>{pack.name}</strong>
                    <small>{pack.tagline}</small>
                  </span>
                </Button>
              ))}
            </div>
          ) : null}

          {step === 1 ? (
            <div className="forge-grid forge-grid--acts">
              {ACTS.map((label, station) => (
                <div className="act-col" key={label}>
                  <h2 className="g-heading" style={act === station ? { color: "inherit" } : {}}>
                    {label}
                  </h2>
                  {GAMEPLAY_KIT_IDS.map((kit) => (
                    <Button
                      key={kit}
                      variant="tile"
                      active={sceneKits[station] === kit}
                      onClick={() => {
                        setAct(station);
                        setKit(station, kit);
                      }}
                    >
                      <span className="tile-body">
                        <strong>{KIT_COPY[kit].label}</strong>
                        <small>{KIT_COPY[kit].note}</small>
                      </span>
                    </Button>
                  ))}
                </div>
              ))}
            </div>
          ) : null}

          {step === 2 ? (
            <div className="forge-grid forge-grid--brief">
              <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <Text variant="caption" tone="dim">
                  What does the player do?
                </Text>
                <textarea
                  value={brief}
                  maxLength={INTENT_MAX}
                  onChange={(event) => setBrief(event.target.value.slice(0, INTENT_MAX))}
                  style={{ ...textareaStyle, minHeight: 200 }}
                />
                <span className="g-meta">
                  {brief.length} / {INTENT_MAX}
                </span>
              </label>
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <TextField
                  label="Title"
                  value={name}
                  maxLength={64}
                  autoFocus
                  onChange={(event) => {
                    setName(event.target.value);
                    setCartridgeId(slug(event.target.value));
                  }}
                />
                <TextField
                  label="Maker"
                  value={author}
                  maxLength={120}
                  onChange={(event) => setAuthor(event.target.value)}
                />
                <TextField
                  label="ID"
                  value={cartridgeId}
                  maxLength={80}
                  mono
                  onChange={(event) => setCartridgeId(slug(event.target.value))}
                />
              </div>
            </div>
          ) : null}
        </div>

        {status.status === "error" ? <ErrorBlock error={status.error} /> : null}
        <div className="forge-foot">
          <Button variant="ghost" disabled={busy} onClick={back}>
            {step === 0 ? "Cancel" : "Back"}
          </Button>
          <Button variant="primary" disabled={last ? !canForge : busy} onClick={next}>
            {last ? (status.status === "error" ? "Retry" : "Forge") : "Next"}
          </Button>
        </div>
      </div>

      {busy ? (
        <div className="forging" role="status" aria-live="polite">
          <Text variant="title">{PHASES[phase]}</Text>
          <div className="forging__bar">
            <i style={{ width: `${((phase + 1) / PHASES.length) * 100}%` }} />
          </div>
          <span className="g-meta">{tokens} chunks</span>
        </div>
      ) : null}
    </GameShell>
  );
}
