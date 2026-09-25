// The visual level architect. Everything it edits is an unsaved DRAFT (the engine previews drafts
// translucently); "Apply to world" is the only thing that touches the save, and it does so through
// the DSL: serializeScene → parseScene → world.oui. A program that does not round-trip is reported,
// never half-applied (Rule 7 / Rule 9).

import { parseScene, serializeScene } from "@dsl/index";
import {
  PLATFORM_PRESETS,
  type Platform,
  toPlatformSpec,
  usePlatformStore,
  useSessionStore,
  useWorldStore,
} from "@renderer/state";
import {
  Button,
  colors,
  ErrorBlock,
  font,
  radius,
  Surface,
  space,
  Text,
  TextField,
  zIndex,
} from "@renderer/ui";
import { type AppError, ready, toError } from "@shared/result";
import { type SceneGraph, TILES, WORLD_FILES } from "@shared/world";
import { type ChangeEvent, type JSX, useCallback, useState } from "react";

const smallButton = { fontSize: font.size.caption, padding: `${space.xs}px ${space.sm}px` };

interface StepperProps {
  label: string;
  accent?: boolean;
  value: number;
  step: number;
  decimals?: number;
  onChange(next: number): void;
}

function Stepper({ label, accent = false, value, step, decimals = 1, onChange }: StepperProps) {
  return (
    <div>
      <Text variant="caption" tone={accent ? "accent" : "muted"}>
        {label}
      </Text>
      <div style={{ display: "flex", gap: 2, alignItems: "center" }}>
        <Button variant="secondary" onClick={() => onChange(value - step)} style={{ padding: 4 }}>
          -
        </Button>
        <Text
          variant="caption"
          mono
          tone={accent ? "accent" : "default"}
          style={{ flex: 1, textAlign: "center" }}
        >
          {value.toFixed(decimals)}
        </Text>
        <Button variant="secondary" onClick={() => onChange(value + step)} style={{ padding: 4 }}>
          +
        </Button>
      </div>
    </div>
  );
}

function DraftRow({
  draft,
  selected,
  onSelect,
}: {
  draft: Platform;
  selected: boolean;
  onSelect(): void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      style={{
        display: "flex",
        justifyContent: "space-between",
        padding: `${space.xs}px ${space.sm}px`,
        borderRadius: radius.sm,
        background: selected ? colors.accentSoft : "transparent",
        border: `1px solid ${selected ? colors.accent : "transparent"}`,
        color: selected ? colors.accent : colors.text,
        cursor: "pointer",
        textAlign: "left",
        fontFamily: font.family,
        fontSize: font.size.caption,
      }}
    >
      <span>{draft.name}</span>
      <span style={{ opacity: 0.7 }}>Y: {draft.y.toFixed(1)}m</span>
    </button>
  );
}

function Properties({ draft }: { draft: Platform }): JSX.Element {
  const updateDraft = usePlatformStore((state) => state.updateDraft);
  const deleteDraft = usePlatformStore((state) => state.deleteDraft);
  const patch = useCallback(
    (next: Partial<Platform>) => updateDraft(draft.id, next),
    [draft.id, updateDraft],
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: space.sm }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <Text variant="label" tone="accent">
          PROPERTIES: {draft.name}
        </Text>
        <Button variant="destructive" onClick={() => deleteDraft(draft.id)} style={smallButton}>
          Delete
        </Button>
      </div>

      <TextField
        label="Name"
        value={draft.name}
        onChange={(event: ChangeEvent<HTMLInputElement>) => patch({ name: event.target.value })}
      />

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: space.xs }}>
        <Stepper label="X (Left/Right)" value={draft.x} step={1} onChange={(x) => patch({ x })} />
        <Stepper
          label="Y (Elevation)"
          accent
          value={draft.y}
          step={0.5}
          onChange={(y) => patch({ y })}
        />
        <Stepper label="Z (Fwd/Back)" value={draft.z} step={1} onChange={(z) => patch({ z })} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: space.xs }}>
        <Stepper
          label="Width"
          value={draft.width}
          step={1}
          decimals={0}
          onChange={(width) => patch({ width })}
        />
        <Stepper
          label="Depth"
          value={draft.depth}
          step={1}
          decimals={0}
          onChange={(depth) => patch({ depth })}
        />
        <Stepper
          label="Height"
          value={draft.height}
          step={0.2}
          onChange={(height) => patch({ height })}
        />
      </div>

      <div>
        <Text variant="caption" tone="muted">
          Material / Tile
        </Text>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 4 }}>
          {TILES.map((tile) => (
            <Button
              key={tile}
              variant={draft.tile === tile ? "primary" : "secondary"}
              onClick={() => patch({ tile })}
              style={{ fontSize: font.size.caption, padding: `2px ${space.sm}px` }}
            >
              {tile}
            </Button>
          ))}
        </div>
      </div>

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: space.sm,
          background: draft.isBounce ? colors.dangerSoft : colors.bg,
          border: `1px solid ${draft.isBounce ? colors.danger : colors.surfaceBorder}`,
          borderRadius: radius.md,
        }}
      >
        <div>
          <Text variant="label" tone={draft.isBounce ? "danger" : "muted"}>
            Jump Booster Pad
          </Text>
          <Text variant="caption" tone="dim">
            Super bounces player upwards when landed on
          </Text>
        </div>
        <Button
          variant={draft.isBounce ? "destructive" : "secondary"}
          onClick={() => patch({ isBounce: !draft.isBounce })}
        >
          {draft.isBounce ? "ACTIVE" : "OFF"}
        </Button>
      </div>
    </div>
  );
}

/** serializeScene → parseScene. The bake is only accepted when the program round-trips. */
function bake(
  graph: SceneGraph,
  drafts: Platform[],
): { source: string; graph: SceneGraph } | AppError {
  const next: SceneGraph = { ...graph, platforms: drafts.map(toPlatformSpec) };
  let source: string;
  try {
    source = serializeScene(next);
  } catch (cause) {
    const error = toError(cause, "serialize-failed");
    return { ...error, hint: "The editor could not write these platforms as OpenUI Lang." };
  }
  const parsed = parseScene(source);
  // DslError extends AppError, so the ErrorBlock shows its code/message/hint verbatim.
  if (!parsed.ok) return parsed.error;
  return { source, graph: parsed.value };
}

export function PlatformEditorModal(): JSX.Element | null {
  const editorOpen = usePlatformStore((state) => state.editorOpen);
  const toggleEditor = usePlatformStore((state) => state.toggleEditor);
  const drafts = usePlatformStore((state) => state.drafts);
  const selectedId = usePlatformStore((state) => state.selectedId);
  const select = usePlatformStore((state) => state.select);
  const addDraft = usePlatformStore((state) => state.addDraft);
  const loadFromScene = usePlatformStore((state) => state.loadFromScene);
  const clearDrafts = usePlatformStore((state) => state.clearDrafts);
  const scene = useWorldStore((state) => state.scene);
  // Only a legacy world owns a writable world.oui; a cartridge instance's scene is immutable.
  const worldId = useWorldStore((state) =>
    state.origin?.kind === "legacy" ? state.origin.worldId : null,
  );
  const immutable = useWorldStore((state) => state.origin?.kind === "instance");
  const toast = useSessionStore((state) => state.toast);
  const [error, setError] = useState<AppError | null>(null);

  const graph = scene.status === "ready" ? scene.value : null;

  const load = useCallback(() => {
    if (graph === null) return;
    setError(null);
    loadFromScene(graph.platforms);
  }, [graph, loadFromScene]);

  const apply = useCallback(() => {
    if (immutable) {
      setError({
        code: "cartridge-immutable",
        message: "This scene is a published cartridge revision; drafts stay session-only.",
        hint: "Remix the cartridge from the library to bake platforms into its scenes.",
      });
      return;
    }
    if (graph === null || worldId === null) {
      toast("danger", "No parsed world is loaded, so nothing was applied.");
      return;
    }
    const baked = bake(graph, drafts);
    if (!("source" in baked)) {
      setError(baked);
      return;
    }
    setError(null);
    useWorldStore.getState().setScene(baked.source, ready(baked.graph));
    void (async () => {
      const written = await window.seed.worlds.write(worldId, WORLD_FILES.scene, baked.source);
      if (!written.ok) {
        toast("danger", `world.oui could not be saved: ${written.error.message}`);
        return;
      }
      toast("success", `${drafts.length} platform(s) baked into world.oui`);
      clearDrafts();
    })();
  }, [clearDrafts, drafts, graph, immutable, toast, worldId]);

  if (!editorOpen) return null;

  const selected = drafts.find((draft) => draft.id === selectedId) ?? drafts[0] ?? null;

  return (
    <div
      style={{
        position: "absolute",
        top: 60,
        right: 20,
        bottom: 70,
        width: 380,
        zIndex: zIndex.overlay,
        display: "flex",
        flexDirection: "column",
      }}
    >
      <Surface
        variant="card"
        padding="md"
        style={{
          flex: 1,
          overflowY: "auto",
          gap: space.md,
          border: `1px solid ${colors.accent}`,
          boxShadow: `0 0 24px ${colors.accentSoft}, 0 12px 36px rgba(0,0,0,0.8)`,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <Text variant="title" as="h2">
              PLATFORM EDITOR
            </Text>
            <Text variant="caption" tone="accent">
              THE SEED · LEVEL ARCHITECT
            </Text>
          </div>
          <Button variant="ghost" onClick={() => toggleEditor(false)}>
            Close
          </Button>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: space.xs }}>
          <Text variant="label" tone="muted">
            SPAWN PRESET
          </Text>
          <div style={{ display: "flex", flexWrap: "wrap", gap: space.xs }}>
            {PLATFORM_PRESETS.map((preset) => (
              <Button
                key={preset.name}
                variant="secondary"
                onClick={() => addDraft(preset)}
                style={smallButton}
              >
                + {preset.name}
              </Button>
            ))}
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: space.xs }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <Text variant="label" tone="muted">
              DRAFTS ({drafts.length})
            </Text>
            <Button variant="primary" onClick={() => addDraft()} style={smallButton}>
              + Custom
            </Button>
          </div>

          <div
            style={{
              maxHeight: 120,
              overflowY: "auto",
              display: "flex",
              flexDirection: "column",
              gap: 4,
              border: `1px solid ${colors.surfaceBorder}`,
              borderRadius: radius.md,
              padding: space.xs,
              background: colors.bg,
            }}
          >
            {drafts.length === 0 ? (
              <Text variant="caption" tone="dim">
                No drafts yet — spawn a preset or load the platforms already in this floor.
              </Text>
            ) : (
              drafts.map((draft) => (
                <DraftRow
                  key={draft.id}
                  draft={draft}
                  selected={draft.id === selected?.id}
                  onSelect={() => select(draft.id)}
                />
              ))
            )}
          </div>
        </div>

        {selected === null ? null : <Properties draft={selected} />}

        <div style={{ display: "flex", flexWrap: "wrap", gap: space.xs }}>
          <Button variant="primary" onClick={apply} disabled={graph === null || worldId === null}>
            Apply to world
          </Button>
          <Button variant="secondary" onClick={load} disabled={graph === null} style={smallButton}>
            Load from world
          </Button>
          <Button
            variant="ghost"
            onClick={() => {
              setError(null);
              clearDrafts();
            }}
            disabled={drafts.length === 0}
            style={smallButton}
          >
            Discard drafts
          </Button>
        </div>

        <Text variant="caption" tone="dim">
          Drafts are previews only — they live in this session, not in the world. "Apply to world"
          bakes them into world.oui; "Discard drafts" throws them away.
        </Text>

        {error === null ? null : <ErrorBlock error={error} />}
      </Surface>
    </div>
  );
}
