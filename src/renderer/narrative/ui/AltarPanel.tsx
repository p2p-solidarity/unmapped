// The wish altar. Pick what you are willing to spend, say what you want, and the model decides
// what comes out — including whether it is cursed. Nothing is pre-written here.

import { errorLine, translate, useT } from "@renderer/i18n";
import { generateItem } from "@renderer/narrative/item";
import { persistProgress } from "@renderer/narrative/persist";
import { useSessionStore } from "@renderer/state/sessionStore";
import { useWorldStore } from "@renderer/state/worldStore";
import { Button, ErrorBlock, Surface, space, Text, zIndex } from "@renderer/ui";
import { errored, idle, loading, ready as readyState } from "@shared/result";
import type { ItemSpec, KarmaEntry } from "@shared/world";
import { useCallback, useState } from "react";
import { columnStyle, textareaStyle } from "./fields";

export const WISH_MAX = 200;

interface MaterialSlot {
  /** Stable across re-renders even though materials are a plain string list with duplicates. */
  key: string;
  name: string;
  index: number;
}

function materialSlots(materials: string[]): MaterialSlot[] {
  const seen = new Map<string, number>();
  return materials.map((name, index) => {
    const nth = (seen.get(name) ?? 0) + 1;
    seen.set(name, nth);
    return { key: `${name}#${nth}`, name, index };
  });
}

export function AltarPanel() {
  const t = useT();
  const open = useSessionStore((state) => state.altarOpen);
  const result = useSessionStore((state) => state.altarResult);
  const materials = useWorldStore((state) => state.inventory.materials);
  const [selected, setSelected] = useState<number[]>([]);
  const [wish, setWish] = useState("");

  const chosen = selected
    .map((index) => materials[index])
    .filter((material): material is string => material !== undefined);

  const submit = useCallback(async () => {
    const session = useSessionStore.getState();
    const world = useWorldStore.getState();
    if (world.genesis === null) {
      session.setAltarResult(
        errored({ code: "no-genesis", message: "This world has no covenant loaded." }),
      );
      return;
    }
    const offered = selected
      .map((index) => world.inventory.materials[index])
      .filter((material): material is string => material !== undefined);

    session.setAltarResult(loading());
    const generated = await generateItem({
      wish: wish.trim(),
      materials: offered,
      genesis: world.genesis,
      inventory: world.inventory,
      floor: world.floor,
    });
    if (!useSessionStore.getState().altarOpen) return;
    useSessionStore
      .getState()
      .setAltarResult(generated.ok ? readyState(generated.value.item) : errored(generated.error));
  }, [selected, wish]);

  const accept = useCallback(
    async (item: ItemSpec) => {
      const session = useSessionStore.getState();
      const world = useWorldStore.getState();
      const spent = selected
        .map((index) => world.inventory.materials[index])
        .filter((material): material is string => material !== undefined);

      world.addItem(item);
      if (spent.length > 0) world.consumeMaterials(spent);
      const entry: KarmaEntry = {
        at: new Date().toISOString(),
        floor: world.floor,
        npcId: null,
        choice: wish.trim(),
        action: "wish",
        effect: item.curse === null ? `received ${item.name}` : `received ${item.name} — cursed`,
      };
      world.appendKarma(entry);

      const written = await persistProgress();
      if (!written.ok) session.toast("danger", errorLine(written.error));
      else {
        session.toast(
          item.curse === null ? "success" : "danger",
          translate(item.curse === null ? "land.altarReceived" : "land.altarReceivedCursed", {
            name: item.name,
          }),
        );
      }

      setSelected([]);
      setWish("");
      session.closeAltar();
    },
    [selected, wish],
  );

  if (!open) return null;

  const busy = result.status === "loading";
  const item = result.status === "ready" ? result.value : null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: space.xl,
        zIndex: zIndex.overlay,
      }}
    >
      <Surface variant="overlay" padding="xl" style={{ width: "min(560px, 100%)" }}>
        <Text variant="titleLarge" as="h2">
          {t("land.altarTitle")}
        </Text>

        <div style={columnStyle}>
          <Text variant="label" tone="muted">
            {t("land.altarMaterials", { n: chosen.length })}
          </Text>
          {materials.length === 0 ? (
            <Text variant="caption" tone="dim">
              {t("land.altarEmpty")}
            </Text>
          ) : (
            materialSlots(materials).map((slot) => (
              <Button
                key={slot.key}
                fullWidth
                disabled={busy}
                variant={selected.includes(slot.index) ? "primary" : "secondary"}
                onClick={() =>
                  setSelected((current) =>
                    current.includes(slot.index)
                      ? current.filter((i) => i !== slot.index)
                      : [...current, slot.index],
                  )
                }
              >
                {slot.name}
              </Button>
            ))
          )}
        </div>

        <div style={columnStyle}>
          <Text variant="label" tone="muted">
            {t("land.altarWish")}
          </Text>
          <textarea
            value={wish}
            disabled={busy}
            maxLength={WISH_MAX}
            aria-label={t("land.altarWish")}
            onChange={(event) => setWish(event.target.value.slice(0, WISH_MAX))}
            style={textareaStyle}
          />
        </div>

        {busy ? (
          <Text variant="body" tone="accent">
            {t("land.altarDeciding")}
          </Text>
        ) : null}

        {result.status === "error" ? (
          <div style={columnStyle}>
            <ErrorBlock error={result.error} />
            <Button variant="primary" onClick={() => void submit()}>
              {t("common.retry")}
            </Button>
          </div>
        ) : null}

        {item !== null ? <ItemCard item={item} /> : null}

        <div style={{ display: "flex", gap: space.md }}>
          {item === null ? (
            <Button
              variant="primary"
              disabled={busy || wish.trim().length === 0}
              onClick={() => void submit()}
            >
              {t("land.wish")}
            </Button>
          ) : (
            <>
              <Button variant="primary" onClick={() => void accept(item)}>
                {t("land.accept")}
              </Button>
              <Button
                variant="destructive"
                onClick={() => useSessionStore.getState().setAltarResult(idle())}
              >
                {t("common.discard")}
              </Button>
            </>
          )}
          <Button
            variant="ghost"
            disabled={busy}
            onClick={() => useSessionStore.getState().closeAltar()}
          >
            {t("common.close")}
          </Button>
        </div>
      </Surface>
    </div>
  );
}

function ItemCard({ item }: { item: ItemSpec }) {
  const t = useT();
  return (
    <Surface variant="inset" padding="md">
      <Text variant="title">{item.name}</Text>
      <Text variant="caption" tone="muted">
        {`${t(`land.kind_${item.kind}`)} · ${t("land.power", { n: item.power })}`}
      </Text>
      <Text variant="body">{item.perk}</Text>
      {item.curse !== null ? (
        <Text variant="body" tone="danger">
          {item.curse}
        </Text>
      ) : null}
      <Text variant="caption" tone="dim">
        {item.flavor}
      </Text>
    </Surface>
  );
}
