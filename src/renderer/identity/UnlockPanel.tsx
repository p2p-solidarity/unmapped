// Boot-time unlock. Two honest paths, no silent magic: a passkey (same key on every device that
// passkey reaches) or the OS keychain (this machine only). Errors surface with their hint.

import { Button, ErrorBlock, Surface, space, Text } from "@renderer/ui";
import { errored, idle, type Loadable, loading, type Result, ready } from "@shared/result";
import { useCallback, useState } from "react";
import { addPasskeyWrapping, type UnlockedKey, unlock, unlockWithKeychain } from "./keys";
import { prfAvailability } from "./prf";

const PASSKEY_CAPTION =
  "Passkey PRF: when this runtime supports WebAuthn PRF, the key is derived from the passkey itself.";
const KEYCHAIN_CAPTION =
  "OS keychain: the key is stored by this operating system and never leaves this machine.";

function maskCredential(credentialId: string): string {
  if (credentialId.length <= 12) return credentialId;
  return `${credentialId.slice(0, 6)}…${credentialId.slice(-4)}`;
}

export function UnlockPanel({ onUnlocked }: { onUnlocked(): void }) {
  const [state, setState] = useState<Loadable<UnlockedKey>>(idle());
  const [linkState, setLinkState] = useState<Loadable<string>>(idle());
  const passkeyAvailable = prfAvailability() === null;

  const run = useCallback(async (attempt: () => Promise<Result<UnlockedKey>>) => {
    setState(loading());
    const result = await attempt();
    setState(result.ok ? ready(result.value) : errored(result.error));
  }, []);

  const withPasskey = useCallback(() => void run(unlock), [run]);
  const withKeychain = useCallback(() => void run(unlockWithKeychain), [run]);
  const addPasskey = useCallback(() => {
    setLinkState(loading());
    void addPasskeyWrapping().then((result) => {
      setLinkState(result.ok ? ready(result.value) : errored(result.error));
    });
  }, []);

  if (state.status === "loading") {
    return (
      <Surface padding="xl">
        <Text variant="title">Unlocking</Text>
        <Text variant="body" tone="muted">
          Waiting for the authenticator…
        </Text>
      </Surface>
    );
  }

  if (state.status === "error") {
    const keychainFirst = state.error.code === "prf-unsupported";
    return (
      <Surface padding="xl">
        <Text variant="title">Unlock failed</Text>
        <ErrorBlock error={state.error} />
        <div style={{ display: "flex", flexDirection: "column", gap: space.sm }}>
          <Button
            variant={keychainFirst ? "primary" : "secondary"}
            fullWidth
            onClick={withKeychain}
          >
            Use OS keychain instead
          </Button>
          {passkeyAvailable ? (
            <Button variant={keychainFirst ? "ghost" : "primary"} fullWidth onClick={withPasskey}>
              Try the passkey again
            </Button>
          ) : null}
        </div>
      </Surface>
    );
  }

  if (state.status === "ready") {
    const { method, credentialId } = state.value;
    return (
      <Surface padding="xl">
        <Text variant="title">Saves unlocked</Text>
        <Text variant="body" tone="muted">
          {method === "prf" ? "Passkey (WebAuthn PRF)" : "OS keychain"}
        </Text>
        {credentialId === null ? (
          <Text variant="caption" tone="dim">
            {KEYCHAIN_CAPTION}
          </Text>
        ) : (
          <Text variant="caption" tone="dim" mono>
            credential {maskCredential(credentialId)}
          </Text>
        )}
        {passkeyAvailable ? (
          <Button
            variant="secondary"
            fullWidth
            disabled={linkState.status === "loading"}
            onClick={addPasskey}
          >
            {linkState.status === "loading" ? "Waiting for passkey…" : "Add another passkey"}
          </Button>
        ) : null}
        {linkState.status === "ready" ? (
          <Text variant="caption" tone="muted" mono>
            Added credential {maskCredential(linkState.value)}
          </Text>
        ) : linkState.status === "error" ? (
          <ErrorBlock error={linkState.error} />
        ) : null}
        <Button variant="primary" fullWidth onClick={onUnlocked} hotkey="↵">
          Continue
        </Button>
      </Surface>
    );
  }

  return (
    <Surface padding="xl">
      <Text variant="title">Unlock your saves</Text>
      {passkeyAvailable ? (
        <Text variant="caption" tone="muted">
          {PASSKEY_CAPTION}
        </Text>
      ) : null}
      <Text variant="caption" tone="muted">
        {KEYCHAIN_CAPTION}
      </Text>
      <div style={{ display: "flex", flexDirection: "column", gap: space.sm }}>
        {passkeyAvailable ? (
          <Button variant="primary" fullWidth onClick={withPasskey}>
            Unlock with passkey
          </Button>
        ) : null}
        <Button variant="secondary" fullWidth onClick={withKeychain}>
          Use OS keychain instead
        </Button>
      </div>
    </Surface>
  );
}
