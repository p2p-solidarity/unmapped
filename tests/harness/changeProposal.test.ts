import {
  approveChangeProposal,
  clearChangeProposals,
  createEffectProvider,
  effectScope,
} from "@renderer/harness/effectProvider";
import { useSessionStore } from "@renderer/state/sessionStore";
import { useWorldStore } from "@renderer/state/worldStore";
import { err, ok } from "@shared/result";
import type { WorldMeta } from "@shared/world";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const meta: WorldMeta = {
  id: "proposal-world",
  name: "Proposal world",
  archetype: "delve",
  createdAt: "2026-09-26T00:00:00.000Z",
  updatedAt: "2026-09-26T00:00:00.000Z",
  floor: 1,
  mutation: null,
  flags: {},
  mods: [],
};

beforeEach(() => {
  clearChangeProposals();
  useWorldStore.setState({
    origin: { kind: "instance", instanceId: "proposal-run" },
    meta,
    inventory: { items: [], materials: [] },
    karma: [],
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  useWorldStore.getState().unload();
  clearChangeProposals();
});

describe("change proposal ownership", () => {
  it("allows only save-owned effects to be approved during Play", () => {
    expect(effectScope({ kind: "set_flag", key: "gate", value: true })).toBe("save");
    expect(
      effectScope({
        kind: "mutate_world",
        skyColor: null,
        fogDensity: 0.1,
        biome: null,
      }),
    ).toBe("save");
    expect(
      effectScope({
        kind: "spawn_monster",
        monster: {
          id: "m",
          kind: "slime",
          x: 1,
          z: 1,
          level: 1,
          weakness: "light",
          size: 1,
          color: null,
        },
      }),
    ).toBe("workspace");
  });

  it("does not mutate the live save when approval persistence fails", async () => {
    const checkpoint = vi
      .fn()
      .mockResolvedValueOnce(err("disk-full", "The save could not be written."))
      .mockResolvedValueOnce(ok({ updatedAt: "2026-09-26T00:01:00.000Z" }));
    vi.stubGlobal("window", { seed: { instances: { checkpoint } } });

    const proposed = await createEffectProvider()({
      kind: "grant_materials",
      materials: ["moon-glass"],
    });
    expect(proposed.ok).toBe(true);
    const proposal = useSessionStore.getState().changeProposals[0];
    if (proposal === undefined) throw new Error("proposal was not queued");

    expect((await approveChangeProposal(proposal.proposalId)).ok).toBe(false);
    expect(useWorldStore.getState().inventory.materials).toEqual([]);
    expect(useSessionStore.getState().changeProposals).toHaveLength(1);

    expect((await approveChangeProposal(proposal.proposalId)).ok).toBe(true);
    expect(useWorldStore.getState().inventory.materials).toEqual(["moon-glass"]);
    expect(useSessionStore.getState().changeProposals).toHaveLength(0);
    expect(checkpoint).toHaveBeenCalledTimes(2);
  });

  it("narrates immediately: a toast is not durable state, so no proposal is filed", async () => {
    const provider = createEffectProvider();
    const outcome = await provider({ kind: "narrate", text: "The forge hums." });
    expect(outcome.ok).toBe(true);
    expect(useSessionStore.getState().changeProposals).toEqual([]);
    expect(useSessionStore.getState().toasts.at(-1)?.text).toBe("The forge hums.");
  });

  it("drops unapproved proposals when the player leaves Play and refuses a stale approval", async () => {
    const provider = createEffectProvider();
    useSessionStore.getState().setScreen("play");
    await provider({ kind: "grant_materials", materials: ["brass"] });
    const proposal = useSessionStore.getState().changeProposals[0];
    expect(proposal).toBeDefined();
    if (proposal === undefined) return;
    useSessionStore.getState().setScreen("worlds");
    expect(useSessionStore.getState().changeProposals).toEqual([]);
    const outcome = await approveChangeProposal(proposal.proposalId);
    expect(outcome.ok).toBe(false);
    expect(useWorldStore.getState().inventory.materials).toEqual([]);
  });
});
