import { approveChangeProposal, rejectChangeProposal } from "@renderer/harness/effectProvider";
import { useSessionStore } from "@renderer/state";
import { Button, Surface, space, Text, zIndex } from "@renderer/ui";
import { useState } from "react";

export function ChangeProposalPanel() {
  const proposal = useSessionStore((state) => state.changeProposals[0] ?? null);
  const toast = useSessionStore((state) => state.toast);
  const [busy, setBusy] = useState(false);
  if (proposal === null) return null;

  const approve = (): void => {
    if (!proposal.compatible) return;
    setBusy(true);
    void approveChangeProposal(proposal.proposalId).then((outcome) => {
      setBusy(false);
      toast(outcome.ok ? "success" : "danger", outcome.message);
    });
  };

  return (
    <div
      style={{ position: "absolute", right: space.xl, bottom: space.xl, zIndex: zIndex.overlay }}
    >
      <Surface variant="card" padding="lg" style={{ width: 420 }}>
        <Text variant="label" tone="accent">
          CHANGE PROPOSAL
        </Text>
        <Text>{proposal.preview}</Text>
        <Text variant="caption" tone="muted">
          {proposal.scope === "save"
            ? "Preview: only this instance's flags, inventory, or atmosphere save will change."
            : proposal.reasons.join(" ")}
        </Text>
        <div style={{ display: "flex", gap: space.sm }}>
          <Button variant="primary" disabled={busy || !proposal.compatible} onClick={approve}>
            Approve
          </Button>
          <Button
            variant="ghost"
            disabled={busy}
            onClick={() => rejectChangeProposal(proposal.proposalId)}
          >
            Reject
          </Button>
        </div>
      </Surface>
    </div>
  );
}
