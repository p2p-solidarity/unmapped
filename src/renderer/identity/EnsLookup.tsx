// Resolve an ENS name to its address and its `aether.seed` record, then (once the session is
// unlocked) fetch that seed and restore it as a world. Nothing is pre-filled: an empty input is
// empty, and a name with no aether.seed record says exactly that. The network (ENSv2 on Sepolia, or
// mainnet) is a per-device preference.

import { translate, useT } from "@renderer/i18n";
import { useSessionStore } from "@renderer/state";
import { Button, StatePanel, Surface, space, Text, TextField } from "@renderer/ui";
import { errored, idle, type Loadable, loading, ready } from "@shared/result";
import type { WorldMeta } from "@shared/world";
import { type ChangeEvent, useCallback, useState } from "react";
import {
  DEFAULT_ENS_NETWORK,
  ENS_NETWORKS,
  type EnsNetwork,
  type EnsSeed,
  fetchRemoteSeed,
  resolveEnsSeed,
} from "./ens";
import { currentKey } from "./keys";
import { importEncryptedSeedBytes } from "./seedSync";

const NETWORK_STORAGE_KEY = "aether.ensNetwork";

function loadNetwork(): EnsNetwork {
  try {
    const stored = localStorage.getItem(NETWORK_STORAGE_KEY);
    if (stored !== null && (ENS_NETWORKS as readonly string[]).includes(stored)) {
      return stored as EnsNetwork;
    }
  } catch {
    // Storage disabled: use the default for this session.
  }
  return DEFAULT_ENS_NETWORK;
}

function saveNetwork(network: EnsNetwork): void {
  try {
    localStorage.setItem(NETWORK_STORAGE_KEY, network);
  } catch {
    // Storage disabled: the choice lasts until the window closes.
  }
}

const NETWORK_LABEL = {
  sepolia: "identity.ensNetworkSepolia",
  mainnet: "identity.ensNetworkMainnet",
} as const satisfies Record<EnsNetwork, string>;

interface SeedResultProps {
  seed: EnsSeed;
  unlocked: boolean;
  busy: boolean;
  onRestore(seedUrl: string): void;
}

function SeedResult({ seed, unlocked, busy, onRestore }: SeedResultProps) {
  const seedUrl = seed.seedUrl;
  const t = useT();
  return (
    <Surface variant="inset" padding="md">
      <Text variant="label" tone="muted">
        {t("identity.ensAddress")}
      </Text>
      {seed.address === null ? (
        <Text variant="caption" tone="dim">
          {t("identity.ensNoAddress")}
        </Text>
      ) : (
        <Text variant="body" mono>
          {seed.address}
        </Text>
      )}
      {seedUrl === null ? (
        <Text variant="caption" tone="dim">
          {t("identity.ensNoSeed")}
        </Text>
      ) : (
        <>
          <Text variant="label" tone="muted">
            aether.seed
          </Text>
          <Text variant="caption" mono tone="muted">
            {seedUrl}
          </Text>
          <Button
            variant="secondary"
            fullWidth
            disabled={!unlocked || busy}
            onClick={() => onRestore(seedUrl)}
          >
            {t("identity.ensFetchRestore")}
          </Button>
          {unlocked ? null : (
            <Text variant="caption" tone="dim">
              {t("identity.ensUnlockFirst")}
            </Text>
          )}
        </>
      )}
    </Surface>
  );
}

export function EnsLookup() {
  const unlock = useSessionStore((s) => s.unlock);
  const [name, setName] = useState("");
  const [network, setNetwork] = useState<EnsNetwork>(loadNetwork);
  const [lookup, setLookup] = useState<Loadable<EnsSeed>>(idle());
  const [restore, setRestore] = useState<Loadable<WorldMeta>>(idle());
  const t = useT();

  const onName = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    setName(event.target.value);
  }, []);

  const pickNetwork = useCallback((next: EnsNetwork) => {
    saveNetwork(next);
    setNetwork(next);
    setLookup(idle());
    setRestore(idle());
  }, []);

  const resolve = useCallback(async () => {
    setRestore(idle());
    setLookup(loading());
    const result = await resolveEnsSeed(name, network);
    setLookup(result.ok ? ready(result.value) : errored(result.error));
  }, [name, network]);

  const fetchAndRestore = useCallback((seedUrl: string) => {
    const key = currentKey();
    if (key === null) {
      setRestore(
        errored({
          code: "locked",
          message: "No save key in this session.",
          hint: "Unlock with your passkey or the OS keychain first.",
        }),
      );
      return;
    }
    setRestore(loading());
    void (async () => {
      const bytes = await fetchRemoteSeed(seedUrl);
      if (!bytes.ok) {
        setRestore(errored(bytes.error));
        return;
      }
      const imported = await importEncryptedSeedBytes(bytes.value, key);
      if (!imported.ok) {
        setRestore(errored(imported.error));
        return;
      }
      setRestore(ready(imported.value));
      useSessionStore
        .getState()
        .toast("success", translate("identity.restored", { name: imported.value.name }));
    })();
  }, []);

  return (
    <Surface padding="lg">
      <Text variant="title">{t("identity.ensTitle")}</Text>
      <div style={{ display: "flex", gap: space.sm, flexWrap: "wrap" }}>
        {ENS_NETWORKS.map((option) => (
          <Button
            key={option}
            variant="chip"
            active={option === network}
            disabled={lookup.status === "loading"}
            onClick={() => pickNetwork(option)}
          >
            {t(NETWORK_LABEL[option])}
          </Button>
        ))}
      </div>
      <Text variant="caption" tone="dim">
        {t(network === "sepolia" ? "identity.ensSepoliaNote" : "identity.ensMainnetNote")}
      </Text>
      <TextField
        value={name}
        onChange={onName}
        placeholder={t("identity.ensPlaceholder")}
        spellCheck={false}
        autoCapitalize="none"
        autoCorrect="off"
        mono
      />
      <Button
        variant="primary"
        fullWidth
        disabled={name.trim().length === 0 || lookup.status === "loading"}
        onClick={() => void resolve()}
      >
        {t("identity.ensResolve")}
      </Button>

      <StatePanel
        state={lookup}
        idleText={t("identity.ensIdle")}
        loadingText={t("identity.ensLoading", { network: t(NETWORK_LABEL[network]) })}
      >
        {(seed) => (
          <SeedResult
            seed={seed}
            unlocked={unlock !== null}
            busy={restore.status === "loading"}
            onRestore={fetchAndRestore}
          />
        )}
      </StatePanel>

      {restore.status === "idle" ? null : (
        <StatePanel state={restore} loadingText={t("identity.ensRestoring")}>
          {(meta) => (
            <Text variant="body" tone="success">
              {t("identity.restoredFloor", { name: meta.name, floor: meta.floor })}
            </Text>
          )}
        </StatePanel>
      )}
    </Surface>
  );
}
