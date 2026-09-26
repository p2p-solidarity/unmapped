// Right after Build, when a lineage market is set up: the world is published, and the player may
// give it an ENS name here — the same line as Worlds → Cartridges, where the label is theirs to
// pick — before going in. Naming is optional and entering never waits for it.

import { useT } from "@renderer/i18n";
import { Button, StatePanel, Surface, space, Text } from "@renderer/ui";
import type { CartridgeManifest } from "@shared/cartridge";
import { errored, type Loadable, loading, ready } from "@shared/result";
import { type JSX, useEffect, useRef, useState } from "react";
import { AUTOFOCUS, useInitialFocus } from "../library/focus";
import { CartridgeEnsLine } from "../market/CartridgeEns";
import type { BuiltWorld } from "./useCreateController";

export function BuiltPanel({
  built,
  onEnter,
}: {
  built: BuiltWorld;
  onEnter(): void;
}): JSX.Element {
  const t = useT();
  const ref = useRef<HTMLDivElement>(null);
  const [manifest, setManifest] = useState<Loadable<CartridgeManifest>>(loading());
  useInitialFocus(ref, true);

  useEffect(() => {
    let alive = true;
    setManifest(loading());
    void window.seed.cartridges.read(built.cartridgeId, built.version).then((result) => {
      if (alive) setManifest(result.ok ? ready(result.value.manifest) : errored(result.error));
    });
    return () => {
      alive = false;
    };
  }, [built.cartridgeId, built.version]);

  return (
    <div ref={ref} style={{ display: "flex", flexDirection: "column", gap: space.md }}>
      <Text variant="label" tone="success">
        {t("create.builtHeading")}
      </Text>
      <Text variant="titleLarge" as="h2">
        {built.name}
      </Text>
      <Text tone="muted">{t("create.builtNote")}</Text>
      <div className="row-actions">
        <Button variant="primary" className={AUTOFOCUS} onClick={onEnter}>
          {t("create.enterWorld")}
        </Button>
      </div>
      <Surface variant="inset" padding="md" style={{ gap: space.sm }}>
        <Text variant="label" tone="muted">
          {t("create.builtNameHeading")}
        </Text>
        <StatePanel state={manifest} loadingText={t("create.builtReading")}>
          {(value) => <CartridgeEnsLine manifest={value} />}
        </StatePanel>
      </Surface>
    </div>
  );
}
