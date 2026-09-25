// Optional on-chain provenance for saved AI worlds (Rule 13). With no ledger configured the list
// says so once, plainly; with one, every world shows what the ledger says about it — or, when the
// lookup failed, the error and its hint (never a guessed "not on chain"). Registering names the
// world by id + version; main reads its hash and parent from disk before anything is sent.

import { errorLine, useT } from "@renderer/i18n";
import { Button, Text } from "@renderer/ui";
import type { LedgerConfig, LedgerRevision } from "@shared/chain";
import { fromResult, type Loadable, loading } from "@shared/result";
import type { WorkManifest } from "@shared/works";
import { type JSX, useEffect, useState } from "react";

export interface Provenance {
  /** null while main answers; `config()` itself cannot fail. */
  config: LedgerConfig | null;
  known: Record<string, Loadable<LedgerRevision | null>>;
  note: string | null;
  /** Content hash awaiting a confirming second click. */
  asked: string | null;
  register: (work: WorkManifest) => Promise<void>;
}

export function useProvenance(works: WorkManifest[]): Provenance {
  const t = useT();
  const [config, setConfig] = useState<LedgerConfig | null>(null);
  const [known, setKnown] = useState<Record<string, Loadable<LedgerRevision | null>>>({});
  const [note, setNote] = useState<string | null>(null);
  const [asked, setAsked] = useState<string | null>(null);
  const hashes = works.map((work) => work.contentHash).join(",");

  useEffect(() => {
    void window.seed.chain.config().then(setConfig);
  }, []);

  useEffect(() => {
    if (config?.readable !== true || hashes === "") return;
    let live = true;
    const list = hashes.split(",");
    setKnown(Object.fromEntries(list.map((hash) => [hash, loading()])));
    void Promise.all(
      list.map(async (hash) => [hash, fromResult(await window.seed.chain.lookup(hash))] as const),
    ).then((rows) => {
      if (live) setKnown(Object.fromEntries(rows));
    });
    return () => {
      live = false;
    };
  }, [config?.readable, hashes]);

  const register = async (work: WorkManifest): Promise<void> => {
    // Sending this costs gas, so the first click only asks.
    if (asked !== work.contentHash) {
      setAsked(work.contentHash);
      setNote(t("works.registerAsk", { title: work.title }));
      return;
    }
    setAsked(null);
    setNote(t("works.registering", { title: work.title }));
    const result = await window.seed.chain.publish({
      subject: { kind: "world", workId: work.workId, version: work.version },
      uri: "",
    });
    if (!result.ok) {
      setNote(errorLine(result.error));
      return;
    }
    setNote(t("works.registered", { tx: result.value.txHash }));
    const fresh = await window.seed.chain.lookup(work.contentHash);
    setKnown((current) => ({ ...current, [work.contentHash]: fromResult(fresh) }));
  };

  return { config, known, note, register, asked };
}

/** One plain line under "Saved worlds" when this machine has no ledger; nothing otherwise. */
export function LedgerNotice({ config }: { config: LedgerConfig | null }): JSX.Element | null {
  const t = useT();
  if (config === null || config.readable) return null;
  return (
    <Text variant="caption" tone="dim">
      {t("works.noLedger")}
    </Text>
  );
}

/** What the ledger says about one world; nothing when no ledger is set up (LedgerNotice says so). */
export function ProvenanceLine({
  provenance,
  work,
}: {
  provenance: Provenance;
  work: WorkManifest;
}): JSX.Element | null {
  const t = useT();
  if (provenance.config?.readable !== true) return null;
  const state = provenance.known[work.contentHash] ?? loading();
  if (state.status === "idle" || state.status === "loading") {
    return (
      <Text variant="caption" tone="dim">
        {t("works.checkingChain")}
      </Text>
    );
  }
  if (state.status === "error") {
    return (
      <Text variant="caption" tone="danger">
        {errorLine(state.error)}
      </Text>
    );
  }
  return state.value === null ? (
    <Text variant="caption" tone="dim">
      {t("works.notOnChain")}
    </Text>
  ) : (
    <Text variant="caption" tone="success">
      {t("works.onChain", { author: state.value.author.slice(0, 10) })}
    </Text>
  );
}

/** Offered only on a keyed machine, and only once the ledger has answered "not on chain". */
export function RegisterButton({
  provenance,
  work,
}: {
  provenance: Provenance;
  work: WorkManifest;
}): JSX.Element | null {
  const t = useT();
  const state = provenance.known[work.contentHash];
  if (provenance.config?.writable !== true || state?.status !== "ready" || state.value !== null) {
    return null;
  }
  const asking = provenance.asked === work.contentHash;
  return (
    <Button variant="chip" active={asking} onClick={() => void provenance.register(work)}>
      {asking ? t("works.confirmGas") : t("works.registerOnChain")}
    </Button>
  );
}
