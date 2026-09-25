// Resolve a .eth name to its address and its `aether.seed` record, then (once the session is
// unlocked) fetch that seed and restore it as a world. Nothing is pre-filled: an empty input is
// empty, and a name with no aether.seed record says exactly that.

import { useSessionStore } from "@renderer/state";
import { Button, StatePanel, Surface, Text, TextField } from "@renderer/ui";
import { errored, idle, type Loadable, loading, ready } from "@shared/result";
import type { WorldMeta } from "@shared/world";
import { type ChangeEvent, useCallback, useState } from "react";
import { type EnsSeed, fetchRemoteSeed, resolveEnsSeed } from "./ens";
import { currentKey } from "./keys";
import { importEncryptedSeedBytes } from "./seedSync";

interface SeedResultProps {
  seed: EnsSeed;
  unlocked: boolean;
  busy: boolean;
  onRestore(seedUrl: string): void;
}

function SeedResult({ seed, unlocked, busy, onRestore }: SeedResultProps) {
  const seedUrl = seed.seedUrl;
  return (
    <Surface variant="inset" padding="md">
      <Text variant="label" tone="muted">
        address
      </Text>
      <Text variant="body" mono>
        {seed.address}
      </Text>
      {seedUrl === null ? (
        <Text variant="caption" tone="dim">
          This name has no aether.seed record.
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
            Fetch and restore
          </Button>
          {unlocked ? null : (
            <Text variant="caption" tone="dim">
              Unlock your saves first — the seed is encrypted with your key.
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
  const [lookup, setLookup] = useState<Loadable<EnsSeed>>(idle());
  const [restore, setRestore] = useState<Loadable<WorldMeta>>(idle());

  const onName = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    setName(event.target.value);
  }, []);

  const resolve = useCallback(async () => {
    setRestore(idle());
    setLookup(loading());
    const result = await resolveEnsSeed(name);
    setLookup(result.ok ? ready(result.value) : errored(result.error));
  }, [name]);

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
      useSessionStore.getState().toast("success", `Restored ${imported.value.name}`);
    })();
  }, []);

  return (
    <Surface padding="lg">
      <Text variant="title">Restore from ENS</Text>
      <TextField
        value={name}
        onChange={onName}
        placeholder="ENS name (.eth)"
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
        Resolve
      </Button>

      <StatePanel
        state={lookup}
        idleText="Enter an ENS name to look up its aether.seed record."
        loadingText="Asking mainnet…"
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
        <StatePanel state={restore} loadingText="Fetching and decrypting the seed…">
          {(meta) => (
            <Text variant="body" tone="success">
              Restored {meta.name} (floor {meta.floor}).
            </Text>
          )}
        </StatePanel>
      )}
    </Surface>
  );
}
