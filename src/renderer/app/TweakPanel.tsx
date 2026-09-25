import { SandboxPreview } from "@renderer/engine/SandboxPreview";
import { ScenePreviewCanvas } from "@renderer/engine/ScenePreviewCanvas";
import { generateModProposal } from "@renderer/narrative/modProposal";
import { useSessionStore, useWorldStore } from "@renderer/state";
import {
  Button,
  colors,
  ErrorBlock,
  StatePanel,
  Surface,
  space,
  Text,
  TextField,
  zIndex,
} from "@renderer/ui";
import type { CartridgeManifest } from "@shared/cartridge";
import type { ModProposalPreview } from "@shared/mods";
import { errored, idle, type Loadable, loading } from "@shared/result";
import { type JSX, useEffect, useState } from "react";
import { openInstance } from "./useInstanceLoader";

export function TweakPanel(): JSX.Element | null {
  const open = useSessionStore((state) => state.tweakOpen);
  const close = useSessionStore((state) => state.closeTweak);
  const origin = useWorldStore((state) => state.origin);
  const [wish, setWish] = useState("");
  const [preview, setPreview] = useState<Loadable<ModProposalPreview>>(idle());
  const [published, setPublished] = useState<CartridgeManifest | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [previewScene, setPreviewScene] = useState("");
  const [playtest, setPlaytest] = useState(false);
  useEffect(() => {
    if (!open) {
      setPreview(idle());
      setPublished(null);
    }
  }, [open]);
  if (!open) return null;
  const busy = publishing || preview.status === "loading";
  const ask = async (): Promise<void> => {
    if (origin?.kind !== "instance") return;
    setPublished(null);
    setPreview(loading());
    const base = await window.seed.instances.resolve(origin.instanceId);
    if (!base.ok) {
      setPreview(errored(base.error));
      return;
    }
    const proposal = await generateModProposal(base.value.cartridge, wish.trim());
    if (!proposal.ok) {
      setPreview(errored(proposal.error));
      return;
    }
    const result = await window.seed.mods.previewProposal(proposal.value);
    if (result.ok) {
      setPreview({ status: "ready", value: result.value });
      setPreviewScene(Object.keys(result.value.revision.scenes)[0] ?? "");
    } else setPreview(errored(result.error));
  };
  const approve = async (): Promise<void> => {
    if (preview.status !== "ready") return;
    setPublishing(true);
    const result = await window.seed.mods.publishProposal(preview.value.proposal);
    setPublishing(false);
    if (result.ok) setPublished(result.value);
    else setPreview(errored(result.error));
  };
  const playRevision = async (): Promise<void> => {
    if (!published) return;
    setPublishing(true);
    const created = await window.seed.instances.create({
      cartridgeId: published.cartridgeId,
      version: published.version,
      name: `${published.name} · ${published.version}`,
    });
    setPublishing(false);
    if (!created.ok) {
      setPreview(errored(created.error));
      return;
    }
    close();
    await openInstance(created.value.instance.meta.instanceId);
  };
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        background: colors.bgOverlay,
        backdropFilter: "blur(10px)",
        zIndex: zIndex.overlay,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: space.lg,
      }}
    >
      <Surface
        variant="card"
        padding="lg"
        style={{
          maxWidth: 880,
          width: "100%",
          maxHeight: "95vh",
          overflowY: "auto",
          gap: space.md,
        }}
      >
        <Text variant="title" as="h2">
          Create a mod revision
        </Text>
        <Text variant="caption" tone="dim">
          Describe a weapon, timing or scene change. Review the proposal, then publish a new
          cartridge version. Your current run stays on its original version.
        </Text>
        {origin?.kind !== "instance" ? (
          <Text variant="body">Open a published v2 cartridge to create a mod revision.</Text>
        ) : (
          <>
            <TextField
              label="Requested change"
              value={wish}
              maxLength={2000}
              placeholder="Add a gun / change the timing to revolver"
              onChange={(event) => setWish(event.target.value)}
            />
            <StatePanel
              state={preview}
              idleText="No proposal yet."
              loadingText="Preparing and checking the proposal…"
            >
              {(value) => (
                <>
                  <TextField
                    label="New version"
                    value={value.proposal.targetVersion ?? value.revision.manifest.version}
                    onChange={(event) =>
                      setPreview({
                        status: "ready",
                        value: {
                          ...value,
                          proposal: { ...value.proposal, targetVersion: event.target.value },
                        },
                      })
                    }
                  />
                  <Surface variant="inset" padding="md" style={{ gap: space.xs }}>
                    {value.proposal.operations.map((op) => (
                      <Text key={JSON.stringify(op)} variant="body">
                        {op.type === "add_weapon"
                          ? `Add ${op.weapon.name} · ${op.weapon.damage} damage · ${op.weapon.range} range · ${op.weapon.cooldownMs} ms cooldown`
                          : op.type === "change_timing"
                            ? `Timing: ${op.change.from} → ${op.change.to} · ${op.change.resolution}`
                            : op.type === "add_capability_module"
                              ? `Module: ${op.moduleId}@${op.version}`
                              : `Scene ${op.sceneId}: ${op.type}`}
                      </Text>
                    ))}
                    {value.compatibility.reasons.map((reason) => (
                      <Text key={reason} variant="caption">
                        {reason}
                      </Text>
                    ))}
                    <Text variant="caption">
                      Save: {value.compatibility.saveImpact}. Network: new matching version
                      required. Affected scenes:{" "}
                      {value.compatibility.affectedScenes.join(", ") || "none"}.
                    </Text>
                  </Surface>
                  <div style={{ display: "flex", gap: space.xs, flexWrap: "wrap" }}>
                    {Object.keys(value.revision.scenes).map((id) => (
                      <Button
                        key={id}
                        variant={previewScene === id ? "primary" : "secondary"}
                        onClick={() => setPreviewScene(id)}
                      >
                        {id}
                      </Button>
                    ))}
                  </div>
                  <Button variant="secondary" onClick={() => setPlaytest((value) => !value)}>
                    {playtest ? "Orbit preview" : "Playtest changes"}
                  </Button>
                  <div style={{ height: 320, minHeight: 320 }}>
                    {playtest ? (
                      <SandboxPreview
                        sceneSource={value.revision.scenes[previewScene] ?? ""}
                        rulesSource={value.revision.rules}
                      />
                    ) : (
                      <ScenePreviewCanvas
                        sceneSource={value.revision.scenes[previewScene] ?? ""}
                        rulesSource={value.revision.rules}
                      />
                    )}
                  </div>
                </>
              )}
            </StatePanel>
            {preview.status === "error" ? <ErrorBlock error={preview.error} /> : null}
            {published ? (
              <Text variant="body" tone="accent">
                Published {published.name} {published.version}. The original cartridge and save are
                unchanged.
              </Text>
            ) : null}
          </>
        )}
        <div style={{ display: "flex", gap: space.sm, flexWrap: "wrap" }}>
          <Button
            variant="secondary"
            disabled={busy || !wish.trim() || origin?.kind !== "instance"}
            onClick={() => void ask()}
          >
            Generate proposal
          </Button>
          <Button
            variant="primary"
            disabled={busy || preview.status !== "ready" || published !== null}
            onClick={() => void approve()}
          >
            Approve & publish revision
          </Button>
          {published ? (
            <Button variant="primary" disabled={busy} onClick={() => void playRevision()}>
              Play new version
            </Button>
          ) : null}
          <Button variant="ghost" disabled={busy} onClick={close}>
            Close
          </Button>
        </div>
      </Surface>
    </div>
  );
}
