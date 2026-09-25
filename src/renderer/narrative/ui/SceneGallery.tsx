import { parseScene, serializeRules } from "@dsl";
import type { EditorFraming } from "@renderer/engine";
import { ScenePreviewCanvas } from "@renderer/engine/ScenePreviewCanvas";
import { Button, ErrorBlock, Surface, space, Text, TextField } from "@renderer/ui";
import type { CapabilityContext } from "@shared/capabilities";
import { rulesFor } from "@shared/forge";
import type { AppError } from "@shared/result";
import type { SceneCandidate, SceneGallerySlot, SceneGalleryState } from "@shared/scene-gallery";
import type { SceneGraph } from "@shared/world";
import { type JSX, useState } from "react";
import { SceneEditorStep } from "./SceneEditorStep";

export interface SceneGalleryProps {
  gallery: SceneGalleryState;
  contexts: CapabilityContext[];
  busySlotId: string | null;
  error: AppError | null;
  onAdd(): void;
  onGenerateAll(): void;
  onGenerate(slot: SceneGallerySlot): void;
  onSelect(slotId: string, candidateId: string): void;
  onDuplicate(slotId: string, candidateId: string): void;
  onRefine(slotId: string, candidateId: string, prompt: string): void;
  onContext(slotId: string, contextId: string): void;
  onMove(slotId: string, offset: number): void;
  onEntry(slotId: string): void;
  onEnding(slotId: string): void;
  onEdit(slotId: string, candidateId: string, graph: SceneGraph): void;
}

interface CandidateCardProps {
  slot: SceneGallerySlot;
  candidate: SceneCandidate;
  rules: string | null;
  busy: boolean;
  onSelect(): void;
  onDuplicate(): void;
  onRefine(prompt: string): void;
  onEdit(): void;
}

function CandidateCard(props: CandidateCardProps): JSX.Element {
  const [refining, setRefining] = useState(false);
  const [instruction, setInstruction] = useState("");
  const submit = (): void => {
    const prompt = instruction.trim();
    if (prompt.length === 0) return;
    props.onRefine(prompt);
    setInstruction("");
    setRefining(false);
  };

  return (
    <Surface
      variant="overlay"
      padding="sm"
      style={{ gap: space.sm, opacity: props.candidate.status === "stale" ? 0.55 : 1 }}
    >
      <Button
        variant="tile"
        active={props.slot.selectedCandidateId === props.candidate.candidateId}
        disabled={props.busy}
        onClick={props.onSelect}
        style={{ width: "100%", height: 180, padding: 0, overflow: "hidden" }}
      >
        {props.rules === null ? null : (
          <span style={{ display: "block", width: "100%", height: 176, pointerEvents: "auto" }}>
            <ScenePreviewCanvas
              sceneSource={props.candidate.sceneSource}
              rulesSource={props.rules}
            />
          </span>
        )}
      </Button>
      <Text variant="caption">
        {props.candidate.status === "stale" ? "需重新生成" : props.candidate.title}
      </Text>
      {refining ? (
        <div style={{ display: "grid", gap: space.xs }}>
          <TextField
            label="修改這個候選"
            value={instruction}
            disabled={props.busy}
            onChange={(event) => setInstruction(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") submit();
            }}
          />
          <div style={{ display: "flex", gap: space.xs }}>
            <Button
              variant="primary"
              disabled={props.busy || instruction.trim().length === 0}
              onClick={submit}
            >
              套用
            </Button>
            <Button variant="ghost" disabled={props.busy} onClick={() => setRefining(false)}>
              取消
            </Button>
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", gap: space.xs }}>
          <Button variant="chip" disabled={props.busy} onClick={props.onDuplicate}>
            複製
          </Button>
          <Button variant="chip" disabled={props.busy} onClick={() => setRefining(true)}>
            Refine
          </Button>
          <Button variant="chip" disabled={props.busy} onClick={props.onEdit}>
            視覺編輯
          </Button>
        </div>
      )}
    </Surface>
  );
}

export function SceneGallery(props: SceneGalleryProps): JSX.Element {
  const [editing, setEditing] = useState<{
    slotId: string;
    candidateId: string;
    graph: SceneGraph;
    framing: EditorFraming;
  } | null>(null);
  const readyContexts = props.contexts.filter((context) => context.profile !== null);

  if (editing !== null) {
    return (
      <div style={{ display: "flex", flexDirection: "column", minHeight: 620, gap: space.sm }}>
        <div style={{ display: "flex", alignItems: "center", gap: space.sm }}>
          <Text variant="label" tone="accent">
            視覺編輯場景
          </Text>
          <Text variant="caption" tone="dim">
            點擊放置，右鍵或 Alt+點擊刪除。儲存後會回到候選廊。
          </Text>
          <div style={{ marginLeft: "auto", display: "flex", gap: space.xs }}>
            <Button variant="ghost" onClick={() => setEditing(null)}>
              取消
            </Button>
            <Button
              variant="primary"
              onClick={() => {
                props.onEdit(editing.slotId, editing.candidateId, editing.graph);
                setEditing(null);
              }}
            >
              儲存候選
            </Button>
          </div>
        </div>
        <SceneEditorStep
          graph={editing.graph}
          framing={editing.framing}
          onChange={(graph) => setEditing({ ...editing, graph })}
        />
      </div>
    );
  }

  return (
    <div className="g-scroll" style={{ display: "grid", gap: space.md }}>
      <div style={{ display: "flex", gap: space.sm, alignItems: "center", flexWrap: "wrap" }}>
        <Text variant="body">每一幕明確選一個 capability context。只有選中的候選會進入卡帶。</Text>
        <Button
          variant="primary"
          disabled={props.busySlotId !== null || readyContexts.length === 0}
          onClick={props.onAdd}
        >
          新增場景
        </Button>
        <Button
          variant="secondary"
          disabled={props.busySlotId !== null || props.gallery.slots.length === 0}
          onClick={props.onGenerateAll}
        >
          {props.busySlotId === "all" ? "全部生成中…" : "🎲 重生全部"}
        </Button>
      </div>
      {props.error === null ? null : <ErrorBlock error={props.error} />}
      {props.gallery.slots.map((slot, index) => {
        const context = props.contexts.find((one) => one.contextId === slot.contextId);
        const rules =
          context?.profile === null || context === undefined
            ? null
            : serializeRules(rulesFor(context.profile));
        const busy = props.busySlotId !== null;
        return (
          <Surface key={slot.slotId} variant="card" padding="md" style={{ gap: space.sm }}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: space.sm, alignItems: "center" }}>
              <Text variant="label">
                {index + 1}. {slot.title}
              </Text>
              <Button
                variant="chip"
                disabled={busy || index === 0}
                onClick={() => props.onMove(slot.slotId, -1)}
              >
                ↑
              </Button>
              <Button
                variant="chip"
                disabled={busy || index === props.gallery.slots.length - 1}
                onClick={() => props.onMove(slot.slotId, 1)}
              >
                ↓
              </Button>
              <Button
                variant="chip"
                active={props.gallery.entrySlotId === slot.slotId}
                disabled={busy}
                onClick={() => props.onEntry(slot.slotId)}
              >
                入口
              </Button>
              <Button
                variant="chip"
                active={props.gallery.endingSlotIds.includes(slot.slotId)}
                disabled={busy}
                onClick={() => props.onEnding(slot.slotId)}
              >
                結局
              </Button>
              <Button
                variant="ghost"
                disabled={busy || context?.profile == null}
                onClick={() => props.onGenerate(slot)}
              >
                {props.busySlotId === slot.slotId
                  ? "生成中…"
                  : slot.candidates.length === 0
                    ? "生成候選"
                    : "🎲 重生這幕"}
              </Button>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: space.xs, alignItems: "center" }}>
              <Text variant="caption" tone="dim">
                玩法情境
              </Text>
              {readyContexts.map((one) => (
                <Button
                  key={one.contextId}
                  variant="chip"
                  active={slot.contextId === one.contextId}
                  disabled={busy}
                  onClick={() => props.onContext(slot.slotId, one.contextId)}
                >
                  {one.sourceModes.length > 0 ? one.sourceModes.join(" + ") : one.contextId}
                </Button>
              ))}
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(3, minmax(220px, 1fr))",
                gap: space.sm,
              }}
            >
              {slot.candidates.map((candidate) => (
                <CandidateCard
                  key={candidate.candidateId}
                  slot={slot}
                  candidate={candidate}
                  rules={rules}
                  busy={busy}
                  onSelect={() => props.onSelect(slot.slotId, candidate.candidateId)}
                  onDuplicate={() => props.onDuplicate(slot.slotId, candidate.candidateId)}
                  onRefine={(prompt) => props.onRefine(slot.slotId, candidate.candidateId, prompt)}
                  onEdit={() => {
                    const parsed = parseScene(candidate.sceneSource);
                    if (!parsed.ok || context?.profile == null) return;
                    const camera = context.profile.entries.find(
                      (entry) => entry.key === "camera",
                    )?.value;
                    const framing: EditorFraming =
                      camera === "side" ? "side" : camera === "top_down" ? "top" : "orbit";
                    setEditing({
                      slotId: slot.slotId,
                      candidateId: candidate.candidateId,
                      graph: parsed.value,
                      framing,
                    });
                  }}
                />
              ))}
            </div>
          </Surface>
        );
      })}
    </div>
  );
}
