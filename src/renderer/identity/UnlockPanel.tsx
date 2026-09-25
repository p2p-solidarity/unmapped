// Boot-time unlock. Two honest paths, no silent magic: a passkey (same key on every device that
// passkey reaches) or the OS keychain (this machine only). Errors surface with their hint.

import { useT } from "@renderer/i18n";
import { Button, ErrorBlock, Surface, space, Text } from "@renderer/ui";
import { errored, idle, type Loadable, loading, type Result, ready } from "@shared/result";
import { useCallback, useState } from "react";
import { addPasskeyWrapping, type UnlockedKey, unlock, unlockWithKeychain } from "./keys";
import { prfAvailability } from "./prf";

function maskCredential(credentialId: string): string {
  if (credentialId.length <= 12) return credentialId;
  return `${credentialId.slice(0, 6)}…${credentialId.slice(-4)}`;
}

export function UnlockPanel({ onUnlocked }: { onUnlocked(): void }) {
  const [state, setState] = useState<Loadable<UnlockedKey>>(idle());
  const [linkState, setLinkState] = useState<Loadable<string>>(idle());
  const passkeyAvailable = prfAvailability() === null;
  const t = useT();

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
        <Text variant="title">{t("identity.unlocking")}</Text>
        <Text variant="body" tone="muted">
          {t("identity.waitingAuthenticator")}
        </Text>
      </Surface>
    );
  }

  if (state.status === "error") {
    const keychainFirst = state.error.code === "prf-unsupported";
    return (
      <Surface padding="xl">
        <Text variant="title">{t("identity.unlockFailed")}</Text>
        <ErrorBlock error={state.error} />
        <div style={{ display: "flex", flexDirection: "column", gap: space.sm }}>
          <Button
            variant={keychainFirst ? "primary" : "secondary"}
            fullWidth
            onClick={withKeychain}
          >
            {t("identity.useKeychain")}
          </Button>
          {passkeyAvailable ? (
            <Button variant={keychainFirst ? "ghost" : "primary"} fullWidth onClick={withPasskey}>
              {t("identity.retryPasskey")}
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
        <Text variant="title">{t("identity.unlocked")}</Text>
        <Text variant="body" tone="muted">
          {method === "prf" ? t("identity.methodPrf") : t("identity.methodKeychain")}
        </Text>
        {credentialId === null ? (
          <Text variant="caption" tone="dim">
            {t("identity.keychainCaption")}
          </Text>
        ) : (
          <Text variant="caption" tone="dim" mono>
            {t("identity.credential", { id: maskCredential(credentialId) })}
          </Text>
        )}
        {passkeyAvailable ? (
          <Button
            variant="secondary"
            fullWidth
            disabled={linkState.status === "loading"}
            onClick={addPasskey}
          >
            {linkState.status === "loading"
              ? t("identity.waitingPasskey")
              : t("identity.addPasskey")}
          </Button>
        ) : null}
        {linkState.status === "ready" ? (
          <Text variant="caption" tone="muted" mono>
            {t("identity.addedCredential", { id: maskCredential(linkState.value) })}
          </Text>
        ) : linkState.status === "error" ? (
          <ErrorBlock error={linkState.error} />
        ) : null}
        <Button variant="primary" fullWidth onClick={onUnlocked} hotkey="↵">
          {t("identity.continue")}
        </Button>
      </Surface>
    );
  }

  return (
    <Surface padding="xl">
      <Text variant="title">{t("identity.unlockTitle")}</Text>
      {passkeyAvailable ? (
        <Text variant="caption" tone="muted">
          {t("identity.passkeyCaption")}
        </Text>
      ) : null}
      <Text variant="caption" tone="muted">
        {t("identity.keychainCaption")}
      </Text>
      <div style={{ display: "flex", flexDirection: "column", gap: space.sm }}>
        {passkeyAvailable ? (
          <Button variant="primary" fullWidth onClick={withPasskey}>
            {t("identity.unlockPasskey")}
          </Button>
        ) : null}
        <Button variant="secondary" fullWidth onClick={withKeychain}>
          {t("identity.useKeychain")}
        </Button>
      </div>
    </Surface>
  );
}
