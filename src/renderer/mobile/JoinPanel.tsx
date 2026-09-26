// Joining from an invite link on a phone (rev 6 phase 4, D7): paste the link, give the name the
// world will know you by, join. The link's secret is used once by `world.join` and never kept.

import { useT } from "@renderer/i18n";
import { Button, ErrorBlock, Surface, Text, TextField } from "@renderer/ui";
import { errored, idle, type Loadable, loading } from "@shared/result";
import { type JSX, useState } from "react";

export function JoinPanel({ onJoined }: { onJoined: (worldId: string) => void }): JSX.Element {
  const t = useT();
  const [link, setLink] = useState("");
  const [name, setName] = useState("");
  const [state, setState] = useState<Loadable<null>>(idle());

  const join = async (): Promise<void> => {
    setState(loading());
    const joined = await window.seed.world.join(link, name);
    if (!joined.ok) {
      setState(errored(joined.error));
      return;
    }
    setState(idle());
    setLink("");
    // Ask the browser to keep this site's data when space runs low (plan D7's storage risk).
    void navigator.storage?.persist?.().catch(() => false);
    onJoined(joined.value.worldId);
  };

  const busy = state.status === "loading";
  return (
    <Surface variant="card" padding="lg">
      <Text variant="title" as="h2">
        {t("mobile.joinTitle")}
      </Text>
      <Text variant="body" tone="muted">
        {t("mobile.joinLead")}
      </Text>
      <TextField
        label={t("mobile.inviteLabel")}
        mono
        rows={3}
        value={link}
        spellCheck={false}
        autoCapitalize="off"
        onChange={(event) => setLink(event.target.value)}
      />
      <TextField
        label={t("mobile.nameLabel")}
        value={name}
        maxLength={60}
        onChange={(event) => setName(event.target.value)}
      />
      <Button
        variant="primary"
        fullWidth
        disabled={busy || link.trim() === "" || name.trim() === ""}
        onClick={() => void join()}
      >
        {busy ? t("mobile.joining") : t("mobile.joinAction")}
      </Button>
      {state.status === "error" ? <ErrorBlock error={state.error} /> : null}
    </Surface>
  );
}
