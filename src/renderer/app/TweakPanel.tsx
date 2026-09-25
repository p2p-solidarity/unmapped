import { SandboxPreview } from "@renderer/engine/SandboxPreview";
import { ScenePreviewCanvas } from "@renderer/engine/ScenePreviewCanvas";
import { type Translate, useT } from "@renderer/i18n";
import { generateModProposal } from "@renderer/narrative/modProposal";
import { useLandStore, useSessionStore, useWorldStore } from "@renderer/state";
import { Button, colors, StatePanel, Surface, space, Text, TextField, zIndex } from "@renderer/ui";
import type { CartridgeManifest } from "@shared/cartridge";
import type { ModOperation, ModProposalPreview } from "@shared/mods";
import { errored, idle, type Loadable, loading } from "@shared/result";
import { type JSX, useEffect, useState } from "react";
import { PlaceMaker } from "./PlaceMaker";
import { openInstance } from "./useInstanceLoader";

/** One line per proposed operation; ids, kinds and numbers stay as the proposal wrote them. */
function operationLine(op: ModOperation, t: Translate): string {
  switch (op.type) {
    case "add_weapon":
      return t("hud.opWeapon", {
        name: op.weapon.name,
        damage: op.weapon.damage,
        range: op.weapon.range,
        cooldown: op.weapon.cooldownMs,
      });
    case "change_timing":
      return t("hud.opTiming", {
        from: op.change.from,
        to: op.change.to,
        resolution: op.change.resolution,
      });
    case "add_capability_module":
      return t("hud.opModule", { id: op.moduleId });
    case "scene_patch":
      return t("hud.opScene", {
        id: op.sceneId,
        changes: op.patch.operations
          .map((one) =>
            one.type === "add_monster"
              ? t("hud.opMonster", { kind: one.kind, level: one.level, x: one.x, z: one.z })
              : one.type.replace("_", " "),
          )
          .join(" · "),
      });
    case "asset_patch":
      return t("hud.opScene", { id: op.sceneId, changes: op.type });
  }
}

const IMPACT = {
  none: "hud.none",
  migration: "hud.impactMigration",
  new_instance: "hud.impactNewInstance",
} as const;

export function TweakPanel(): JSX.Element | null {
  const t = useT();
  const open = useSessionStore((state) => state.tweakOpen);
  const close = useSessionStore((state) => state.closeTweak);
  const origin = useWorldStore((state) => state.origin);
  const [wish, setWish] = useState("");
  const [preview, setPreview] = useState<Loadable<ModProposalPreview>>(idle());
  const [published, setPublished] = useState<CartridgeManifest | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [previewScene, setPreviewScene] = useState("");
  const [playtest, setPlaytest] = useState(false);
  const [mode, setMode] = useState<"rules" | "place">("rules");
  const openLand = useLandStore((state) => state.progress !== null);
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
      data-layer="tweak"
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
        <div style={{ display: "flex", gap: space.sm }}>
          <Button
            variant={mode === "rules" ? "primary" : "secondary"}
            onClick={() => setMode("rules")}
          >
            {t("hud.tweakRules")}
          </Button>
          <Button
            variant={mode === "place" ? "primary" : "secondary"}
            onClick={() => setMode("place")}
          >
            {t("hud.tweakPlace")}
          </Button>
        </div>
        <Text variant="title" as="h2">
          {t(mode === "rules" ? "hud.tweakRulesTitle" : "hud.tweakPlaceTitle")}
        </Text>
        <Text variant="caption" tone="dim">
          {t(mode === "rules" ? "hud.tweakRulesNote" : "hud.tweakPlaceNote")}
        </Text>
        {mode === "place" ? (
          <PlaceMaker canUse={openLand} />
        ) : origin?.kind !== "instance" ? (
          <Text variant="body">{t("hud.tweakNeedsCartridge")}</Text>
        ) : (
          <>
            <TextField
              label={t("hud.requestedChange")}
              value={wish}
              maxLength={2000}
              placeholder={t("hud.requestedPlaceholder")}
              onChange={(event) => setWish(event.target.value)}
            />
            <StatePanel
              state={preview}
              idleText={t("hud.noProposal")}
              loadingText={t("hud.preparingProposal")}
            >
              {(value) => (
                <>
                  <TextField
                    label={t("hud.newVersion")}
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
                        {operationLine(op, t)}
                      </Text>
                    ))}
                    {value.compatibility.reasons.map((reason) => (
                      <Text key={reason} variant="caption">
                        {reason}
                      </Text>
                    ))}
                    <Text variant="caption">
                      {t("hud.compatSummary", {
                        impact: t(IMPACT[value.compatibility.saveImpact]),
                        scenes: value.compatibility.affectedScenes.join(", ") || t("hud.none"),
                      })}
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
                    {t(playtest ? "hud.orbitPreview" : "hud.playtestChanges")}
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
            {published ? (
              <Text variant="body" tone="accent">
                {t("hud.publishedNote", { name: published.name, version: published.version })}
              </Text>
            ) : null}
          </>
        )}
        <div style={{ display: "flex", gap: space.sm, flexWrap: "wrap" }}>
          {mode === "place" ? null : (
            <>
              <Button
                variant="secondary"
                disabled={busy || !wish.trim() || origin?.kind !== "instance"}
                onClick={() => void ask()}
              >
                {t("hud.generateProposal")}
              </Button>
              <Button
                variant="primary"
                disabled={busy || preview.status !== "ready" || published !== null}
                onClick={() => void approve()}
              >
                {t("hud.approvePublish")}
              </Button>
              {published ? (
                <Button variant="primary" disabled={busy} onClick={() => void playRevision()}>
                  {t("hud.playNewVersion")}
                </Button>
              ) : null}
            </>
          )}
          <Button variant="ghost" disabled={busy} onClick={close}>
            {t("common.close")}
          </Button>
        </div>
      </Surface>
    </div>
  );
}
