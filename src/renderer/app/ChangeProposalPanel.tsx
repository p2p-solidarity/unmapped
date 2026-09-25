import { approveChangeProposal, rejectChangeProposal } from "@renderer/harness/effectProvider";
import { type Translate, useT } from "@renderer/i18n";
import { useSessionStore } from "@renderer/state";
import { Button, Surface, space, Text, zIndex } from "@renderer/ui";
import type { GameEffect } from "@shared/effects";
import { useState } from "react";

/**
 * The player's line for a proposal. `proposal.preview` is the English line the model is answered
 * with, so the panel words the same effect in the UI language instead.
 */
function previewLine(effect: GameEffect, t: Translate): string {
  switch (effect.kind) {
    case "set_flag":
      return t("hud.previewFlag", { key: effect.key, value: String(effect.value) });
    case "mutate_world":
      return t("hud.previewAtmosphere");
    case "grant_materials":
      return t("hud.previewAddMaterials", { list: effect.materials.join(", ") });
    case "consume_materials":
      return t("hud.previewConsume", { list: effect.materials.join(", ") });
    case "grant_item":
      return t("hud.previewAddItem", { name: effect.item.name });
    default:
      return t("hud.previewStructural", { kind: effect.kind });
  }
}

export function ChangeProposalPanel() {
  const proposal = useSessionStore((state) => state.changeProposals[0] ?? null);
  const toast = useSessionStore((state) => state.toast);
  const [busy, setBusy] = useState(false);
  const t = useT();
  if (proposal === null) return null;
  const line = previewLine(proposal.effect, t);

  const approve = (): void => {
    if (!proposal.compatible) return;
    setBusy(true);
    void approveChangeProposal(proposal.proposalId).then((outcome) => {
      setBusy(false);
      // A failure's reason is the outcome the model reads (English), shown as the detail.
      if (outcome.ok) toast("success", t("hud.proposalApplied", { change: line }));
      else toast("danger", t("hud.proposalNotApplied", { reason: outcome.message }));
    });
  };

  return (
    <div
      style={{ position: "absolute", right: space.xl, bottom: space.xl, zIndex: zIndex.overlay }}
    >
      <Surface variant="card" padding="lg" style={{ width: 420 }}>
        <Text variant="label" tone="accent">
          {t("hud.proposalLabel")}
        </Text>
        <Text>{line}</Text>
        <Text variant="caption" tone="muted">
          {proposal.scope === "save" ? t("hud.proposalSaveNote") : t("hud.proposalStructural")}
        </Text>
        <div style={{ display: "flex", gap: space.sm }}>
          <Button variant="primary" disabled={busy || !proposal.compatible} onClick={approve}>
            {t("hud.approve")}
          </Button>
          <Button
            variant="ghost"
            disabled={busy}
            onClick={() => rejectChangeProposal(proposal.proposalId)}
          >
            {t("hud.reject")}
          </Button>
        </div>
      </Surface>
    </div>
  );
}
