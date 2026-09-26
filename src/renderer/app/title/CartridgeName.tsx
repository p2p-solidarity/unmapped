// A world's ENS name. `CartridgeNameLine` is the lineage tree's name for one revision
// (`<label>.<root>`, market/CartridgeEns.tsx), shown first in a world's 更多 in My worlds: read
// live, named under a label the player picks or pointed at this revision with the player's passkey
// (the gas station pays), and put on the market once it is theirs. `EnsWorldCard` goes the other
// way, for Join a world: a name that points at a world → the exact revision → play it if that
// revision's hash is installed here, else ask for its `.cartridge` file.

import { useT } from "@renderer/i18n";
import { Button, Surface, Text } from "@renderer/ui";
import type { CartridgeManifest } from "@shared/cartridge";
import type { CartridgePointer } from "@shared/ensNames";
import type { JSX } from "react";
import { CartridgeEnsLine } from "../market/CartridgeEns";

export function CartridgeNameLine({ manifest }: { manifest: CartridgeManifest }) {
  return <CartridgeEnsLine manifest={manifest} />;
}

interface EnsWorldCardProps {
  name: string;
  pointer: CartridgePointer;
  cartridges: readonly CartridgeManifest[];
  busy: boolean;
  onPlay(manifest: CartridgeManifest): void;
  onImport(): void;
}

export function EnsWorldCard(props: EnsWorldCardProps): JSX.Element {
  const { name, pointer, cartridges, busy, onPlay, onImport } = props;
  const t = useT();
  const local = cartridges.find((manifest) => manifest.contentHash === pointer.contentHash);
  return (
    <Surface variant="inset" padding="md">
      <Text variant="body">{t("library.ensWorld", { name: local?.name ?? name })}</Text>
      {local === undefined ? (
        <>
          <Text variant="caption" tone="muted">
            {t("library.ensWorldMissing")}
          </Text>
          <span className="g-meta">{`${pointer.cartridgeId}@${pointer.version}`}</span>
          <div className="row-actions">
            <Button variant="secondary" disabled={busy} onClick={onImport}>
              {t("title.importCartridge")}
            </Button>
          </div>
        </>
      ) : (
        <div className="row-actions">
          <Button variant="primary" disabled={busy} onClick={() => onPlay(local)}>
            {t("library.playThisWorld")}
          </Button>
        </div>
      )}
    </Surface>
  );
}
